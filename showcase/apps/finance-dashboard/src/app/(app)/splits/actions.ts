"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { equalShares } from "@/lib/finance";

/** Confirm the group belongs to the current user; returns its id or throws. */
async function ownGroup(userId: string, groupId: string): Promise<string> {
  const g = await prisma.group.findFirst({ where: { id: groupId, ownerUserId: userId } });
  if (!g) throw new Error("Group not found");
  return g.id;
}

export async function createGroup(formData: FormData) {
  const userId = await requireUserId();
  const name = z.string().trim().min(1).parse(formData.get("name"));
  // Seed with members from a comma-separated list, if provided.
  const memberNames = String(formData.get("members") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await prisma.group.create({
    data: {
      ownerUserId: userId,
      name,
      members: memberNames.length ? { create: memberNames.map((n) => ({ name: n })) } : undefined,
    },
  });
  revalidatePath("/splits");
}

export async function addMember(formData: FormData) {
  const userId = await requireUserId();
  const groupId = await ownGroup(userId, String(formData.get("groupId")));
  const name = z.string().trim().min(1).parse(formData.get("name"));
  await prisma.groupMember.create({ data: { groupId, name } });
  revalidatePath("/splits");
}

export async function createBill(formData: FormData) {
  const userId = await requireUserId();
  const groupId = await ownGroup(userId, String(formData.get("groupId")));
  const description = z.string().trim().min(1).parse(formData.get("description"));
  const amount = z.coerce.number().positive().parse(formData.get("amount"));
  const paidByMemberId = z.string().min(1).parse(formData.get("paidByMemberId"));
  // Members sharing the bill (checkbox list). Default to everyone if none picked.
  let participantIds = formData.getAll("participants").map(String).filter(Boolean);

  const members = await prisma.groupMember.findMany({ where: { groupId } });
  const validIds = new Set(members.map((m) => m.id));
  participantIds = participantIds.filter((id) => validIds.has(id));
  if (participantIds.length === 0) participantIds = members.map((m) => m.id);
  if (participantIds.length === 0) throw new Error("Add members before creating a bill");
  if (!validIds.has(paidByMemberId)) throw new Error("Payer must be a group member");

  const shares = equalShares(amount, participantIds.length);

  await prisma.sharedBill.create({
    data: {
      groupId,
      description,
      amount,
      paidByMemberId,
      shares: {
        create: participantIds.map((memberId, i) => ({ memberId, amount: shares[i] })),
      },
    },
  });
  revalidatePath("/splits");
}

export async function deleteBill(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id"));
  const bill = await prisma.sharedBill.findUnique({ where: { id }, include: { group: true } });
  if (bill && bill.group.ownerUserId === userId) {
    await prisma.sharedBill.delete({ where: { id } });
  }
  revalidatePath("/splits");
}

export async function deleteGroup(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id"));
  await prisma.group.deleteMany({ where: { id, ownerUserId: userId } });
  revalidatePath("/splits");
}
