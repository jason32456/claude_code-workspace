"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

const txnSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  note: z.string().optional().default(""),
});

export async function createTransaction(formData: FormData) {
  const userId = await requireUserId();
  const parsed = txnSchema.parse({
    type: formData.get("type"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    categoryId: formData.get("categoryId") || null,
    note: formData.get("note") ?? "",
  });

  await prisma.transaction.create({
    data: {
      userId,
      type: parsed.type,
      amount: parsed.amount,
      date: new Date(parsed.date),
      note: parsed.note ?? "",
      categoryId: parsed.categoryId || null,
    },
  });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
}

export async function deleteTransaction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id"));
  // Scope the delete to the owner so users can't touch others' rows.
  await prisma.transaction.deleteMany({ where: { id, userId } });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
}
