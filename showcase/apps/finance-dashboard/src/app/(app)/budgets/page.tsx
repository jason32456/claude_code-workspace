import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { money, percent } from "@/lib/format";
import { budgetStatus, monthKey, spendByCategoryForMonth } from "@/lib/finance";
import { createCategory, updateBudget, deleteCategory } from "./actions";

export default async function BudgetsPage() {
  const userId = await requireUserId();
  const month = monthKey(new Date());

  const [categories, txns] = await Promise.all([
    prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      where: { userId, type: "expense" },
      select: { amount: true, date: true, categoryId: true, type: true },
    }),
  ]);

  const spend = spendByCategoryForMonth(
    txns.map((t) => ({ ...t, type: "expense" as const })),
    month,
  );
  const expenseCats = categories.filter((c) => c.type === "expense");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Budgets</h1>
        <p className="text-sm text-slate-500">
          Monthly budgets for {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.
        </p>
      </div>

      <div className="space-y-3">
        {expenseCats.length === 0 && (
          <div className="card text-sm text-slate-500">No expense categories yet — add one below.</div>
        )}
        {expenseCats.map((c) => {
          const spent = spend[c.id] ?? 0;
          const budget = c.monthlyBudget ?? 0;
          const status = budgetStatus(spent, budget, c.id);
          const barPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : spent > 0 ? 100 : 0;
          return (
            <div key={c.id} className="card">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </span>
                <span className="text-sm text-slate-500">
                  {money(spent)} {budget > 0 ? `of ${money(budget)}` : "(no budget set)"}
                </span>
              </div>

              {budget > 0 && (
                <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${status.over ? "bg-red-500" : "bg-indigo-500"}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-sm">
                  {budget > 0 ? (
                    status.over ? (
                      <span className="font-medium text-red-600">
                        Over by {money(Math.abs(status.remaining))} ({percent(status.percent)})
                      </span>
                    ) : (
                      <span className="text-slate-600">
                        {money(status.remaining)} left · {percent(status.percent)} used
                      </span>
                    )
                  ) : (
                    <span className="text-slate-400">Set a budget to track progress</span>
                  )}
                </div>

                <form action={updateBudget} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <span className="text-sm text-slate-400">$</span>
                  <input
                    name="monthlyBudget"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={c.monthlyBudget ?? ""}
                    placeholder="0"
                    className="input w-28 py-1"
                  />
                  <button type="submit" className="btn-ghost py-1">
                    Save
                  </button>
                  <button
                    formAction={deleteCategory}
                    type="submit"
                    className="text-xs text-slate-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Add a category</h2>
        <form action={createCategory} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="col-span-2 sm:col-span-1">
            <label className="label">Name</label>
            <input name="name" className="input" placeholder="e.g. Gym" required />
          </div>
          <div>
            <label className="label">Type</label>
            <select name="type" className="input" defaultValue="expense">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div>
            <label className="label">Color</label>
            <input name="color" type="color" defaultValue="#6366f1" className="input h-[38px] p-1" />
          </div>
          <div>
            <label className="label">Budget</label>
            <input name="monthlyBudget" type="number" min="0" step="1" className="input" placeholder="optional" />
          </div>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <button type="submit" className="btn w-full">
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
