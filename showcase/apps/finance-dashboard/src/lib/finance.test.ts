import { describe, it, expect } from "vitest";
import {
  summarize,
  spendByCategoryForMonth,
  budgetStatus,
  equalShares,
  memberBalances,
  settle,
  round2,
} from "./finance";

describe("summarize", () => {
  it("computes income, expense, net and savings rate", () => {
    const s = summarize([
      { type: "income", amount: 1000, date: "2026-06-01" },
      { type: "expense", amount: 250, date: "2026-06-02" },
      { type: "expense", amount: 150, date: "2026-06-03" },
    ]);
    expect(s.income).toBe(1000);
    expect(s.expense).toBe(400);
    expect(s.net).toBe(600);
    expect(s.savingsRate).toBeCloseTo(0.6);
  });

  it("savings rate is 0 with no income", () => {
    expect(summarize([{ type: "expense", amount: 50, date: "2026-06-01" }]).savingsRate).toBe(0);
  });
});

describe("spendByCategoryForMonth", () => {
  const txns = [
    { type: "expense" as const, amount: 30, date: "2026-06-01", categoryId: "food" },
    { type: "expense" as const, amount: 20, date: "2026-06-15", categoryId: "food" },
    { type: "expense" as const, amount: 99, date: "2026-05-30", categoryId: "food" }, // other month
    { type: "income" as const, amount: 500, date: "2026-06-01", categoryId: "salary" },
    { type: "expense" as const, amount: 10, date: "2026-06-10", categoryId: null },
  ];
  it("sums only expenses in the target month, grouped by category", () => {
    const map = spendByCategoryForMonth(txns, "2026-06");
    expect(map.food).toBe(50);
    expect(map.uncategorized).toBe(10);
    expect(map.salary).toBeUndefined();
  });
});

describe("budgetStatus", () => {
  it("flags over-budget", () => {
    const s = budgetStatus(120, 100, "food");
    expect(s.over).toBe(true);
    expect(s.remaining).toBe(-20);
    expect(s.percent).toBeCloseTo(1.2);
  });
  it("handles under-budget", () => {
    const s = budgetStatus(40, 100, "food");
    expect(s.over).toBe(false);
    expect(s.remaining).toBe(60);
    expect(s.percent).toBeCloseTo(0.4);
  });
});

describe("equalShares", () => {
  it("splits evenly when divisible", () => {
    expect(equalShares(100, 4)).toEqual([25, 25, 25, 25]);
  });
  it("distributes rounding remainder so shares sum exactly to total", () => {
    const shares = equalShares(100, 3);
    expect(shares).toEqual([33.34, 33.33, 33.33]);
    expect(round2(shares.reduce((a, b) => a + b, 0))).toBe(100);
  });
  it("handles a tricky cent split", () => {
    const shares = equalShares(0.1, 3);
    expect(round2(shares.reduce((a, b) => a + b, 0))).toBe(0.1);
  });
});

describe("memberBalances + settle", () => {
  it("computes net balances and minimal settlements", () => {
    // Alice paid 90 for a dinner split 3 ways (30 each).
    const bills = [
      {
        amount: 90,
        paidByMemberId: "alice",
        shares: [
          { memberId: "alice", amount: 30 },
          { memberId: "bob", amount: 30 },
          { memberId: "carol", amount: 30 },
        ],
      },
    ];
    const bal = memberBalances(bills);
    expect(bal.alice).toBe(60); // fronted 90, owes 30
    expect(bal.bob).toBe(-30);
    expect(bal.carol).toBe(-30);

    const s = settle(bal);
    // bob and carol each pay alice 30
    const total = s.reduce((a, x) => a + x.amount, 0);
    expect(round2(total)).toBe(60);
    expect(s.every((x) => x.to === "alice")).toBe(true);
  });

  it("settlements clear all balances", () => {
    const bills = [
      { amount: 60, paidByMemberId: "a", shares: [
        { memberId: "a", amount: 20 }, { memberId: "b", amount: 20 }, { memberId: "c", amount: 20 } ] },
      { amount: 30, paidByMemberId: "b", shares: [
        { memberId: "a", amount: 15 }, { memberId: "b", amount: 15 } ] },
    ];
    const bal = memberBalances(bills);
    const s = settle(bal);
    // Apply settlements and confirm everyone nets to ~0.
    const after = { ...bal };
    for (const t of s) {
      after[t.from] = round2((after[t.from] ?? 0) + t.amount);
      after[t.to] = round2((after[t.to] ?? 0) - t.amount);
    }
    for (const v of Object.values(after)) expect(Math.abs(v)).toBeLessThan(0.01);
  });
});
