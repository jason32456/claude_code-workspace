import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { money, percent } from "@/lib/format";
import { monthKey, spendByCategoryForMonth, summarize } from "@/lib/finance";
import {
  CategoryPie,
  IncomeExpenseBar,
  NetTrendLine,
  type CategorySlice,
  type MonthlyPoint,
} from "./charts";

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(monthKey(m));
  }
  return out;
}

export default async function DashboardPage() {
  const userId = await requireUserId();
  const month = monthKey(new Date());

  const [categories, txns] = await Promise.all([
    prisma.category.findMany({ where: { userId } }),
    prisma.transaction.findMany({
      where: { userId },
      select: { type: true, amount: true, date: true, categoryId: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const typed = txns.map((t) => ({
    type: t.type as "income" | "expense",
    amount: t.amount,
    date: t.date,
    categoryId: t.categoryId,
  }));

  // This month's headline numbers.
  const thisMonth = typed.filter((t) => monthKey(t.date) === month);
  const summary = summarize(thisMonth);

  // Pie: spend by category this month.
  const spend = spendByCategoryForMonth(typed, month);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const pie: CategorySlice[] = Object.entries(spend)
    .map(([id, value]) => {
      const c = catById.get(id);
      return { name: c?.name ?? "Uncategorized", value, color: c?.color ?? "#94a3b8" };
    })
    .sort((a, b) => b.value - a.value);

  // Monthly bars + net line over the last 6 months.
  const months = lastNMonths(6);
  const monthly: MonthlyPoint[] = months.map((m) => {
    const s = summarize(typed.filter((t) => monthKey(t.date) === m));
    const [, mm] = m.split("-");
    const label = new Date(2000, Number(mm) - 1, 1).toLocaleDateString("en-US", { month: "short" });
    return { month: label, income: s.income, expense: s.expense, net: s.net };
  });

  const empty = txns.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} overview
          </p>
        </div>
        <Link href="/transactions" className="btn">
          + Add transaction
        </Link>
      </div>

      {empty && (
        <div className="card bg-indigo-50 text-sm text-indigo-900">
          Welcome! Your account comes with starter categories. Head to{" "}
          <Link href="/transactions" className="font-semibold underline">
            Transactions
          </Link>{" "}
          to log your first income and expense.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Income (mo)" value={money(summary.income)} tone="green" />
        <Stat label="Expenses (mo)" value={money(summary.expense)} tone="red" />
        <Stat label="Net (mo)" value={money(summary.net)} tone={summary.net >= 0 ? "green" : "red"} />
        <Stat label="Savings rate" value={percent(summary.savingsRate)} tone="indigo" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-semibold">Spending by category</h2>
          <CategoryPie data={pie} />
        </div>
        <div className="card">
          <h2 className="mb-2 font-semibold">Income vs. expenses</h2>
          <IncomeExpenseBar data={monthly} />
        </div>
        <div className="card lg:col-span-2">
          <h2 className="mb-2 font-semibold">Net cash flow trend</h2>
          <NetTrendLine data={monthly} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "indigo";
}) {
  const color =
    tone === "green" ? "text-green-600" : tone === "red" ? "text-red-600" : "text-indigo-600";
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
