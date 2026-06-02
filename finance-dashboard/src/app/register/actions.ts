"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Categories every new account starts with, so the app is usable immediately.
const DEFAULT_CATEGORIES: { name: string; type: "income" | "expense"; color: string; monthlyBudget?: number }[] = [
  { name: "Salary", type: "income", color: "#16a34a" },
  { name: "Other Income", type: "income", color: "#0ea5e9" },
  { name: "Groceries", type: "expense", color: "#f97316", monthlyBudget: 500 },
  { name: "Rent", type: "expense", color: "#ef4444", monthlyBudget: 1500 },
  { name: "Dining Out", type: "expense", color: "#a855f7", monthlyBudget: 200 },
  { name: "Transport", type: "expense", color: "#eab308", monthlyBudget: 150 },
  { name: "Utilities", type: "expense", color: "#06b6d4", monthlyBudget: 250 },
  { name: "Entertainment", type: "expense", color: "#ec4899", monthlyBudget: 120 },
];

export async function registerUser(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists" };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash,
      categories: { create: DEFAULT_CATEGORIES },
    },
  });

  // signIn redirects on success; it throws a redirect error which Next handles.
  await signIn("credentials", {
    email,
    password: parsed.data.password,
    redirectTo: "/dashboard",
  });
  return {};
}
