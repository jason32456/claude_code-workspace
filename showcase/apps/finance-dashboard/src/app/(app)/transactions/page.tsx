import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { money, shortDate } from "@/lib/format";
import { TransactionForm } from "./transaction-form";
import { deleteTransaction } from "./actions";

export default async function TransactionsPage() {
  const userId = await requireUserId();
  const [categories, transactions] = await Promise.all([
    prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      include: { category: true },
      take: 200,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-sm text-slate-500">Log income and expenses.</p>
      </div>

      <div className="card">
        <TransactionForm categories={categories} />
      </div>

      <div className="card overflow-hidden p-0">
        {transactions.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No transactions yet. Add your first one above.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{shortDate(t.date)}</td>
                  <td className="px-4 py-3">
                    {t.category ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: t.category.color }}
                        />
                        {t.category.name}
                      </span>
                    ) : (
                      <span className="text-slate-400">Uncategorized</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{t.note || "—"}</td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      t.type === "income" ? "text-green-600" : "text-slate-900"
                    }`}
                  >
                    {t.type === "income" ? "+" : "−"}
                    {money(t.amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteTransaction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="text-xs text-slate-400 hover:text-red-600" type="submit">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
