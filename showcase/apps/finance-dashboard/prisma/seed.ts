// Optional demo data. Run with: npm run db:seed
// Creates a demo user (demo@example.com / password123) with sample transactions,
// budgets, and a bill-splitting group.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { equalShares } from "../src/lib/finance";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@example.com";
  await prisma.user.deleteMany({ where: { email } });

  const passwordHash = await bcrypt.hash("password123", 10);
  const user = await prisma.user.create({
    data: { name: "Demo User", email, passwordHash },
  });

  const cats = await Promise.all(
    [
      { name: "Salary", type: "income", color: "#16a34a" },
      { name: "Groceries", type: "expense", color: "#f97316", monthlyBudget: 500 },
      { name: "Rent", type: "expense", color: "#ef4444", monthlyBudget: 1500 },
      { name: "Dining Out", type: "expense", color: "#a855f7", monthlyBudget: 200 },
      { name: "Transport", type: "expense", color: "#eab308", monthlyBudget: 150 },
    ].map((c) => prisma.category.create({ data: { ...c, userId: user.id } })),
  );
  const byName = (n: string) => cats.find((c) => c.name === n)!;

  const now = new Date();
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), 1 + offset);
  const samples: { type: "income" | "expense"; amount: number; cat: string; d: number; note?: string }[] = [
    { type: "income", amount: 4200, cat: "Salary", d: 0, note: "Monthly pay" },
    { type: "expense", amount: 1500, cat: "Rent", d: 1 },
    { type: "expense", amount: 82.45, cat: "Groceries", d: 3 },
    { type: "expense", amount: 64.1, cat: "Groceries", d: 11 },
    { type: "expense", amount: 120.0, cat: "Groceries", d: 19 },
    { type: "expense", amount: 240.0, cat: "Dining Out", d: 6, note: "Birthday dinner (over budget!)" },
    { type: "expense", amount: 45.0, cat: "Transport", d: 8 },
    { type: "expense", amount: 60.0, cat: "Transport", d: 22 },
  ];
  await prisma.transaction.createMany({
    data: samples.map((s) => ({
      userId: user.id,
      type: s.type,
      amount: s.amount,
      categoryId: byName(s.cat).id,
      date: day(s.d),
      note: s.note ?? "",
    })),
  });

  // Bill-splitting group with a couple of shared bills.
  const group = await prisma.group.create({
    data: {
      ownerUserId: user.id,
      name: "Roommates",
      members: { create: [{ name: "Demo" }, { name: "Sam" }, { name: "Riley" }] },
    },
    include: { members: true },
  });
  const ids = group.members.map((m) => m.id);

  const mkBill = async (desc: string, amount: number, payerIdx: number) => {
    const shares = equalShares(amount, ids.length);
    await prisma.sharedBill.create({
      data: {
        groupId: group.id,
        description: desc,
        amount,
        paidByMemberId: ids[payerIdx],
        date: day(5),
        shares: { create: ids.map((memberId, i) => ({ memberId, amount: shares[i] })) },
      },
    });
  };
  await mkBill("Groceries run", 90, 0);
  await mkBill("Internet bill", 75, 1);

  console.log("Seeded demo user: demo@example.com / password123");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
