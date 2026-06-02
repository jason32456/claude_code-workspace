"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

const categorySchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["income", "expense"]),
  color: z.string().trim().min(1).default("#6366f1"),
  monthlyBudget: z.coerce.number().nonnegative().optional(),
});

export async function createCategory(formData: FormData) {
  const userId = await requireUserId();
  const raw = categorySchema.parse({
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color") || "#6366f1",
    monthlyBudget: formData.get("monthlyBudget") || undefined,
  });
  await prisma.category.create({
    data: {
      userId,
      name: raw.name,
      type: raw.type,
      color: raw.color,
      monthlyBudget: raw.type === "expense" ? raw.monthlyBudget ?? null : null,
    },
  });
  revalidatePath("/budgets");
  revalidatePath("/transactions");
}

export async function updateBudget(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id"));
  const value = formData.get("monthlyBudget");
  const budget = value === "" || value == null ? null : Math.max(0, Number(value));
  await prisma.category.updateMany({
    where: { id, userId, type: "expense" },
    data: { monthlyBudget: budget },
  });
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
}

export async function deleteCategory(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id"));
  // Transactions keep their history; their categoryId is set null via the schema relation.
  await prisma.category.deleteMany({ where: { id, userId } });
  revalidatePath("/budgets");
  revalidatePath("/transactions");
}
