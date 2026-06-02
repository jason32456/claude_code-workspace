// Pure money-math helpers. No I/O, no framework — unit-tested in finance.test.ts.
// All amounts are in whole currency units (e.g. dollars) as numbers.

export type TxnType = "income" | "expense";

export interface Txn {
  type: TxnType;
  amount: number;
  date: string | Date;
  categoryId?: string | null;
}

export interface Summary {
  income: number;
  expense: number;
  net: number;
  savingsRate: number; // fraction 0..1 of income kept; 0 when no income
}

/** Round to cents to avoid floating-point drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Month key like "2026-06" in local time. */
export function monthKey(date: string | Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Totals for income, expense, net, and savings rate over the given transactions. */
export function summarize(txns: Txn[]): Summary {
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.type === "income") income += t.amount;
    else expense += t.amount;
  }
  income = round2(income);
  expense = round2(expense);
  const net = round2(income - expense);
  const savingsRate = income > 0 ? net / income : 0;
  return { income, expense, net, savingsRate };
}

/** Sum expense amounts per category id for transactions in a given month. */
export function spendByCategoryForMonth(
  txns: Txn[],
  month: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txns) {
    if (t.type !== "expense") continue;
    if (monthKey(t.date) !== month) continue;
    const key = t.categoryId ?? "uncategorized";
    out[key] = round2((out[key] ?? 0) + t.amount);
  }
  return out;
}

export interface BudgetStatus {
  categoryId: string;
  budget: number;
  spent: number;
  remaining: number;
  percent: number; // 0..>1
  over: boolean;
}

/** Compare per-category spend against its monthly budget. */
export function budgetStatus(
  spent: number,
  budget: number,
  categoryId: string,
): BudgetStatus {
  const safeSpent = round2(spent);
  const remaining = round2(budget - safeSpent);
  const percent = budget > 0 ? safeSpent / budget : safeSpent > 0 ? Infinity : 0;
  return {
    categoryId,
    budget: round2(budget),
    spent: safeSpent,
    remaining,
    percent,
    over: safeSpent > budget,
  };
}

/**
 * Split an amount equally among n members, distributing rounding remainder
 * (in cents) to the first members so the shares always sum exactly to total.
 * Returns an array of n share amounts.
 */
export function equalShares(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  let remainder = cents - base * n; // 0..n-1 extra cents
  const shares: number[] = [];
  for (let i = 0; i < n; i++) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder--;
    shares.push((base + extra) / 100);
  }
  return shares;
}

export interface Bill {
  amount: number;
  paidByMemberId: string;
  shares: { memberId: string; amount: number }[];
}

/**
 * Net balance per member across all bills.
 * Positive => the member is owed money; negative => the member owes money.
 */
export function memberBalances(bills: Bill[]): Record<string, number> {
  const bal: Record<string, number> = {};
  const add = (id: string, delta: number) => {
    bal[id] = round2((bal[id] ?? 0) + delta);
  };
  for (const bill of bills) {
    add(bill.paidByMemberId, bill.amount); // they fronted the money
    for (const s of bill.shares) add(s.memberId, -s.amount); // they owe their share
  }
  return bal;
}

export interface Settlement {
  from: string; // member who pays
  to: string; // member who receives
  amount: number;
}

/**
 * Greedy minimal settlement: match the biggest debtor to the biggest creditor
 * repeatedly. Produces a small set of transfers that clears all balances.
 */
export function settle(balances: Record<string, number>): Settlement[] {
  const debtors: { id: string; amt: number }[] = [];
  const creditors: { id: string; amt: number }[] = [];
  for (const [id, amt] of Object.entries(balances)) {
    if (amt < -0.005) debtors.push({ id, amt: -amt });
    else if (amt > 0.005) creditors.push({ id, amt });
  }
  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = round2(Math.min(debtors[i].amt, creditors[j].amt));
    if (pay > 0) {
      settlements.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    }
    debtors[i].amt = round2(debtors[i].amt - pay);
    creditors[j].amt = round2(creditors[j].amt - pay);
    if (debtors[i].amt <= 0.005) i++;
    if (creditors[j].amt <= 0.005) j++;
  }
  return settlements;
}
