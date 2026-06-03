"use client";

import { createBill } from "./actions";

type Member = { id: string; name: string };

export function BillForm({ groupId, members }: { groupId: string; members: Member[] }) {
  return (
    <form action={createBill} className="space-y-3">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-2">
          <label className="label">Description</label>
          <input name="description" className="input" placeholder="e.g. Dinner" required />
        </div>
        <div>
          <label className="label">Amount</label>
          <input name="amount" type="number" step="0.01" min="0.01" className="input" placeholder="0.00" required />
        </div>
        <div>
          <label className="label">Paid by</label>
          <select name="paidByMemberId" className="input" required>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Split between</label>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <label
              key={m.id}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <input type="checkbox" name="participants" value={m.id} defaultChecked />
              {m.name}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">Leave all checked to split evenly across everyone.</p>
      </div>

      <button type="submit" className="btn">
        Add bill
      </button>
    </form>
  );
}
