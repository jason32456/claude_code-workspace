import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { money, shortDate } from "@/lib/format";
import { memberBalances, settle, type Bill } from "@/lib/finance";
import { BillForm } from "./bill-form";
import { createGroup, addMember, deleteBill, deleteGroup } from "./actions";

export default async function SplitsPage() {
  const userId = await requireUserId();
  const groups = await prisma.group.findMany({
    where: { ownerUserId: userId },
    orderBy: { createdAt: "asc" },
    include: {
      members: { orderBy: { name: "asc" } },
      bills: {
        orderBy: { date: "desc" },
        include: { shares: true, paidBy: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bill Splitting</h1>
        <p className="text-sm text-slate-500">
          Track shared expenses and see who owes whom.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">New group</h2>
        <form action={createGroup} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input name="name" className="input" placeholder="Group name (e.g. Roommates)" required />
          <input name="members" className="input sm:col-span-1" placeholder="Members, comma-separated" />
          <button type="submit" className="btn">
            Create group
          </button>
        </form>
      </div>

      {groups.length === 0 && (
        <div className="card text-sm text-slate-500">No groups yet. Create one above to get started.</div>
      )}

      {groups.map((g) => {
        const nameById = new Map(g.members.map((m) => [m.id, m.name]));
        const bills: Bill[] = g.bills.map((b) => ({
          amount: b.amount,
          paidByMemberId: b.paidByMemberId,
          shares: b.shares.map((s) => ({ memberId: s.memberId, amount: s.amount })),
        }));
        const balances = memberBalances(bills);
        const settlements = settle(balances);
        const totalSpent = g.bills.reduce((a, b) => a + b.amount, 0);

        return (
          <div key={g.id} className="card space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{g.name}</h2>
                <p className="text-sm text-slate-500">
                  {g.members.length} member{g.members.length === 1 ? "" : "s"} · {money(totalSpent)} total
                </p>
              </div>
              <form action={deleteGroup}>
                <input type="hidden" name="id" value={g.id} />
                <button className="text-xs text-slate-400 hover:text-red-600" type="submit">
                  Delete group
                </button>
              </form>
            </div>

            {/* Members */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-600">Members</h3>
              <div className="flex flex-wrap items-center gap-2">
                {g.members.map((m) => (
                  <span key={m.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                    {m.name}
                  </span>
                ))}
                <form action={addMember} className="flex items-center gap-2">
                  <input type="hidden" name="groupId" value={g.id} />
                  <input name="name" className="input w-36 py-1" placeholder="Add member" />
                  <button type="submit" className="btn-ghost py-1">
                    Add
                  </button>
                </form>
              </div>
            </div>

            {/* Settlement summary */}
            <div className="rounded-lg bg-slate-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-600">Who owes whom</h3>
              {settlements.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {g.bills.length === 0 ? "No bills yet." : "All settled up 🎉"}
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {settlements.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="font-medium text-red-600">{nameById.get(s.from) ?? "?"}</span>
                      <span className="text-slate-400">pays</span>
                      <span className="font-medium text-green-600">{nameById.get(s.to) ?? "?"}</span>
                      <span className="ml-auto font-semibold">{money(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Add bill */}
            {g.members.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-600">Add a shared bill</h3>
                <BillForm groupId={g.id} members={g.members} />
              </div>
            )}

            {/* Bills list */}
            {g.bills.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-600">Bills</h3>
                <ul className="divide-y divide-slate-100">
                  {g.bills.map((b) => (
                    <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <span className="font-medium">{b.description}</span>
                        <span className="text-slate-400">
                          {" "}
                          · paid by {b.paidBy.name} · {shortDate(b.date)} · split {b.shares.length} ways
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{money(b.amount)}</span>
                        <form action={deleteBill}>
                          <input type="hidden" name="id" value={b.id} />
                          <button className="text-xs text-slate-400 hover:text-red-600" type="submit">
                            Delete
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
