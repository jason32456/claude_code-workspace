# Evens — Product Requirements

## One line

A group expense splitter that settles a trip, a flat or a dinner in the fewest
possible bank transfers, and can show you exactly why you owe what you owe.

## Why this app

Splitting costs is a problem everyone has, and the usual tools have two weak
spots this app targets:

1. **Settlement is usually greedy.** Most apps match the biggest debtor with the
   biggest creditor until everyone is square. That is fast, and it is often one
   or two transfers worse than it needs to be. The true minimum is a set-partition
   problem: with *n* people whose balances are not zero, the fewest transfers is
   *n − k*, where *k* is the largest number of disjoint groups whose balances each
   sum to zero. Finding *k* is NP-hard in general, but a subset DP over 2ⁿ masks
   solves it exactly for any realistic group (up to ~20 people with a non-zero
   balance). Evens runs all three plans (naive, greedy, optimal) side by side so
   you can see the saving.
2. **Rounding drifts.** Splitting €100 three ways and rounding each share gives
   €99.99 or €100.01. Evens stores every amount in integer minor units (cents,
   or yen with no decimals) and allocates with the largest-remainder method, so
   the shares of an expense always add up to exactly what was paid and every
   group's balances sum to zero.

The fun part is the **debt graph**. People sit on a ring, and every "who owes
whom" edge is drawn as an arrow with its thickness scaled to the amount. Press
*Settle* and the tangle animates into the minimal plan.

## Users and jobs

- *Trip organiser:* "Six of us, eleven days, three currencies. Who pays whom at
  the end, with as few transfers as possible?"
- *Flatmate:* "Rent is split by room size, utilities equally, and I paid the
  internet bill. What's the balance this month?"
- *Dinner guest:* "I only had a salad. Itemise the receipt and spread the tax and
  tip in proportion."
- *Sceptic:* "Why do I owe €43.20?" → a per-person ledger that adds up to the
  cent.

## Features

### Groups
- Several groups, each with a name, a base currency and its members. Saved in
  `localStorage` (and the app works fine if storage is blocked).
- A demo group ("Lisbon trip") is created on the first run, so the app is never
  empty.
- Rename and delete groups and members. A member who still appears in an expense
  can't be removed until that expense is changed.

### Expenses
Each expense has a title, a date, an amount, a currency, a category and one or
more **payers** (with exact amounts when there's more than one). The split can
be done five ways:

| Mode | Input | Allocation |
|---|---|---|
| Equal | tick the participants | largest remainder over equal weights |
| Shares | integer or decimal weights per person (e.g. 2 for a couple) | largest remainder over the weights |
| Percent | percentages, which must total 100 | largest remainder over the percentages |
| Exact | an amount per person, which must total the expense | taken as entered and validated |
| Itemised | receipt lines, each with a price and the people who shared it, plus tax and tip | lines split equally among their sharers, then tax and tip spread in proportion to each person's subtotal |

- **Payments** ("Ana paid Ben back €20") are expenses of kind `transfer`. They
  move balances without counting as spending.
- **Currencies:** an expense in a foreign currency stores its own rate to the
  base currency, which the user enters. There is no network call. The amount is
  converted to base minor units once, with the rounding done in one place, and
  the original amount is kept for display.

### Balances
- Net balance per person = what they paid − what they consumed (+ transfers
  sent − transfers received), in base minor units. The balances always sum to
  zero, and the bench checks this.
- Totals per person: what they paid and what they consumed. A spending breakdown
  by category is shown as a bar.

### Settle up
- **Naive:** one transfer per (debtor, payer) pair in each expense, merged per
  pair. This is roughly what you'd do with no app.
- **Greedy:** repeatedly match the largest debtor with the largest creditor.
- **Optimal:** the fewest transfers, using the subset DP:
  `dp[mask] = max number of zero-sum groups that partition mask`, which is
  computed in O(2ⁿ·n) with the "add one element" recurrence over the masks whose
  sum is zero. The partition is rebuilt from the DP, and each zero-sum group is
  settled greedily *inside* the group (a group of size *m* needs exactly *m − 1*
  transfers). Every transfer goes straight from a debtor to a creditor, so nobody
  passes money along and the total moved is always exactly what is owed. Above
  20 people with non-zero balances it falls back to greedy and says so.
- Each transfer can be **marked as paid**, which records a `transfer` expense,
  so the plan goes away once everyone is square.
- **Round to** 1 / 5 / 10 units is an optional display mode for cash. Whatever
  the rounding leaves over is shown as such and never hidden.

### Explain
Pick a person to see their ledger: every expense they're in, what they paid,
their share and how that share was worked out (for example "2 of 7 shares",
"items: Salad €9.50 + 23% of tax/tip"). It ends with a running total that
matches their balance exactly.

### Share and export
- **Share link:** the whole group is serialised to JSON, compressed with
  `CompressionStream('deflate-raw')` where it's available, base64url-encoded and
  put in the URL hash (`#g=`). Opening the link imports the group as a copy.
  Nothing is sent to a server.
- **Copy summary:** a plain-text settlement ("Ben → Ana €42.10") to paste into a
  chat.
- **JSON export / import** as a backup.

## Non-goals
- No accounts, no backend and no live FX rates. The app must stay a static site
  that works offline (CLAUDE.md rule 7).
- No receipt OCR.

## Tech
- Vanilla JS ES modules, no dependencies and no build step. The core
  (`money.js`, `split.js`, `settle.js`, `ledger.js`, `codec.js`) is pure and has
  no DOM access, so it can be tested in Node.
- SVG for the debt graph, with animated paths done by interpolating between the
  two edge sets.
- Responsive layout: two columns on a desktop, tabs on a phone.

## Acceptance (headless bench, `node scripts/bench.mjs`)
1. On 2,000 random expenses in every split mode, the allocations sum exactly to
   the amount.
2. On 300 random groups, the balances sum to zero.
3. The optimal transfer count equals a brute-force minimum (found by exhaustive
   search over partitions) on 300 random groups of up to 8 people.
4. Optimal ≤ greedy ≤ naive on every random group, and at least one known case
   where optimal beats greedy.
5. Applying any plan zeroes every balance.
6. The codec round-trips every random group bit for bit.
7. The demo group's settlement is stable (snapshot).

## Success
The demo trip opens with a tangled graph. *Settle* reduces 14 naive transfers to
a handful, the greedy count is visibly beaten, and every number on screen can
be traced back to the cent from the Explain tab.
