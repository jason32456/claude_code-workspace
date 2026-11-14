# Hatful — PRD

A name-drawing app for Secret Santa, gift swaps, book exchanges or "who reviews
whose work": everyone gives to exactly one other person. It runs with no server
and no accounts. Unlike the many existing generators, it can show that the draw
is fair, and it tells you when your own rules give the secret away.

## 1. Research: what exists and what is missing

Surveyed November 2026: GiftList, Elfster, DrawNames, secretsantahat.com,
secretsantagenerator.online, wishes.app, Grasshopper. They all do the basics
(names, couple exclusions, one private link per person). What none of them do:

| Gap | Why it matters | Hatful's answer |
|---|---|---|
| "Fair randomized algorithm" is asserted, never shown | The common implementations (shuffle and retry a slot, greedy pick from who is left) are measurably biased once there are exclusions | Draw **uniformly** from the set of all valid draws by counting them with a bitmask DP, and show the count |
| No one tells you that your rules leak | With 2 couples + 1 single, some pairings are certain or near certain; anyone who knows the rules can work them out | Exact **probability matrix** for every giver→receiver pair, a secrecy score in bits, and leak warnings |
| Impossible rule sets just fail ("try again") | The organiser has no idea which rule to drop | Name the **Hall violator**: "Ann, Carl and Dee can only give to Bob and Eve" |
| Needs a server, an account or an email | Privacy, ads, and the site may be gone next year | Each person's result travels inside their own link, AES-GCM encrypted, optionally behind a PIN |
| No proof that all links came from one draw | An organiser could quietly re-roll one person | A short **seal** on every slip, and an "open the hat" file that reproduces the draw from its seed |

Algorithm references: Tristan Mahr, "Secret Santa is a graph traversal problem";
Merlini et al., "Efficient generation of random derangements" (arXiv 1809.04571);
Hall's marriage theorem; Ryser/bitmask DP for the permanent; Held–Karp for
Hamiltonian cycles.

## 2. Users and jobs

- **Organiser**: types names, marks households, bans a few pairs, draws, sends
  links (or passes one phone round the room). Wants to stay surprised too.
- **Participant**: opens a link, pulls a slip from the hat, sees one name, a
  hint, the budget and the date. Nothing to install or sign up for.
- **After the party**: organiser opens the hat so everyone can see the loops.

## 3. Scope

### Must have
1. People editor: 3–30 people, names unique (case-insensitive), optional
   household (people in one household never draw each other), optional hint
   ("size M, likes tea") shown to whoever draws them. Paste a list to add many.
2. Rules: directed bans (A must not give to B) edited by clicking cells of an
   n×n matrix; three modes — `any` (any valid assignment), `noswap` (no A↔B
   pairs), `loop` (one single cycle through everyone).
3. Live analysis on every edit: number of valid draws, method used, the
   probability matrix as a heat map in the same grid, secrecy score, leak
   warnings, and when infeasible the Hall violator highlighted in the grid.
4. Draw: seeded, uniform, reproducible. Draw animation (slips drop into a hat).
5. Hand out: per person Copy link / native Share / "sent" tick; optional PIN
   per event (same PIN rule for all: each person's own PIN shown next to their
   link); pass-the-phone mode (hold to reveal, release to hide, next person).
6. Blind organiser: the assignment is never rendered on the organiser page
   until "Open the hat" is confirmed.
7. Reveal page (`reveal.html#<ticket>`): hat, tap to draw, slip unfolds with the
   name, hint, budget, date and seal. PIN prompt when needed. Clear error for a
   damaged link.
8. Open the hat: loops diagram (SVG) + table, export the envelope JSON, verify
   an envelope (re-run draw from seed, recompute seal).
9. "Avoid last year": import an envelope and add its pairs as bans.
10. Persistence in `localStorage`; first run loads a demo group; light and dark.
11. Headless bench `scripts/bench.mjs` (see §7).

### Won't have
Email/SMS sending, accounts, a backend, wishlists that participants edit, QR
codes, groups above 30.

## 4. Data model

```js
event = {
  id, title, date /* 'YYYY-MM-DD' | '' */, budget /* free text */, note,
  mode: 'any' | 'noswap' | 'loop',
  people: [{ id, name, group /* string | null */, hint }],
  bans:   [{ from, to }],            // person ids, directed
  usePin: boolean,
  draw: null | { seed, assignment: { [giverId]: receiverId }, seal, pins: { [id]: '4821' }, sent: { [id]: true }, opened: boolean, at }
}
```

Any edit to people, bans or mode clears `draw` (after a confirm if one exists).

## 5. Engine (pure ES modules in `src/`, no DOM, runs in Node 22)

The UI imports only `engine.js`, `links.js`, `seal.js`, `rng.js`.

### `rng.js`
- `makeRng(seed: string) → { next(): number in [0,1), int(n): 0..n-1, shuffle(arr) }`
  — cyrb128 hash of the seed into sfc32. Deterministic across platforms.
- `randomSeed() → string` — 128 bits from `crypto.getRandomValues`, hex.

### `engine.js`
```js
analyse(event) → {
  n, ids, names,
  allowed,          // boolean[n][n]; allowed[i][j] = giver i may give to j
  feasible,         // boolean
  method,           // 'exact' | 'float' | 'sampled'
  total,            // number of valid draws, or null when method === 'sampled'
  totalEstimate,    // number | null (sampled / noswap estimate)
  marginals,        // number[n][n]; P(i gives to j); each row sums to 1 when feasible
  hall,             // null | { givers: id[], receivers: id[] }  (|receivers| < |givers|)
  leaks,            // [{ kind: 'forced' | 'likely', from, to, p }]  forced: p ≥ 0.999, likely: p ≥ 0.5
  secrecy,          // { bits, maxBits, weakest }  min row entropy; maxBits = log2(n-1)
  ms
}
draw(event, seed) → { assignment: { [giverId]: receiverId }, seed, method, attempts }
                    // throws Error with .code === 'INFEASIBLE'
cyclesOf(assignment) → id[][]
isValid(event, assignment) → boolean   // permutation, no self, households, bans, mode
```

`allowed[i][j]` is false when `i === j`, same non-null household, or a ban.
Internally a row is a 32-bit mask (`>>> 0` everywhere; n ≤ 30).

**Mode `any`.**
- *Count.* Givers are taken in index order. `f[mask]` = ways for the first
  `popcount(mask)` givers to use exactly receiver set `mask`. `b[mask]` = ways
  for the remaining givers to fill the complement. `total = f[full]`.
- *Marginals.* `N(k→j) = Σ f[mask]·b[mask | 1<<j]` over masks with
  `popcount = k`, `j ∉ mask`, `allowed[k][j]`. Divide by `total`.
- *Sample.* Walk givers 0..n-1; from `mask`, choose `j` with probability
  `b[mask | 1<<j] / b[mask]`. This is exactly uniform.
- *Tiers.* n ≤ 18: `Float64Array` holds exact integers (18! < 2⁵³) → `exact`.
  19 ≤ n ≤ 22: same tables, values are floats → `float`. n > 22 → `sampled`.
- *Sampled tier.* Rejection: uniform random permutation, accept if valid, up to
  20,000 tries (uniform when it succeeds). If that fails: find a perfect
  matching by augmenting paths, then run a Markov chain of 4,000·n random
  2-receiver swaps and 3-rotations that keep validity. Marginals from 3,000
  samples (rejection) or from the chain. `totalEstimate = n! × acceptance` when
  rejection works, else null.

**Mode `noswap`.** Sample with the `any` sampler and reject draws containing a
2-cycle (still uniform over the restricted set; cap 5,000 tries, then
INFEASIBLE). Feasibility for analysis: at least one of 2,000 samples passes.
Marginals from the accepted samples; `totalEstimate = total × acceptance`;
method is reported as `sampled`.

**Mode `loop`.** Held–Karp count of Hamiltonian cycles through vertex 0:
`h[mask][last]` = ways to start at 0, visit exactly `mask`, end at `last`.
Exact for n ≤ 16; sample by walking backwards through the table. Marginals by
the forward/backward product, or (simpler, acceptable) from 4,000 exact
samples. n > 16: rejection from random cyclic orders (20,000 tries), `sampled`.

**Hall violator.** When no perfect matching exists: build a maximum matching
(augmenting paths), start from an unmatched giver, collect every giver
reachable by alternating paths (S) and their neighbours N(S). Then
`|N(S)| < |S|`; return ids. For `loop`/`noswap` that are infeasible although a
matching exists, `hall` is null and the UI says so in words.

**Determinism.** `draw(event, seed)` uses only `makeRng(seed)`; same inputs →
same assignment, in the browser and in Node.

### `seal.js`
`sealOf(event, assignment, seed) → Promise<'XXXX-XXXX'>` — SHA-256 over a
canonical JSON of `{ people ids+names sorted by id, bans sorted, mode, seed,
assignment sorted by giver }`, first 40 bits as 8 Crockford base32 characters.

### `links.js`
```js
makeTicket(payload, pin?) → Promise<string>     // goes after '#' in the URL
openTicket(ticket, pin?)  → Promise<payload>    // throws .code 'NEED_PIN' | 'BAD_PIN' | 'BAD_TICKET'
ticketNeedsPin(ticket)    → boolean
makeEnvelope(event) / readEnvelope(json) → validated export object { v:1, kind:'hatful-envelope', event, draw }
```
`payload = { t: title, g: giverName, r: receiverName, h: hint, b: budget, d: date, n: note, s: seal }`.
Ticket: `h1.<k|p>.<key-or-salt>.<iv>.<ciphertext>`, all base64url. AES-GCM 128.
Without a PIN the random key rides in the ticket (keeps the name out of plain
base64 and out of link previews). With a PIN the key is PBKDF2-SHA256, 120,000
iterations, 16-byte salt. Use `globalThis.crypto.subtle` only (works in Node 22
and in secure contexts).

## 6. UI

Two pages share `tokens.css` (already written — use those variables, do not
redefine colours).

### `index.html` + `style.css` + `src/app.js` (+ helpers) — organiser
Header: wordmark, event title (editable), theme toggle, ⋯ menu (new event,
load demo, import envelope, reset). A three-step bar: **People → Rules → Hat**.

- **People**: rows of name + household chip (pick/create; each household gets a
  colour) + hint; add row, paste-many dialog, remove. Event date, budget, note.
- **Rules**: mode segmented control with one-line explanations. The matrix:
  givers down, receivers across, sticky headers, household colour ticks. A cell
  is one of: self (hatched), household (locked, tinted), banned (✕, click to
  unban), allowed (heat-filled by probability, % on hover/focus and always
  shown when n ≤ 10; click to ban). Keyboard: arrow keys move, Space toggles.
  Side panel: big count ("14,833 possible draws"), method badge, secrecy meter
  (bits of max), leak list in plain words ("Ann gives to Bob in every possible
  draw"), infeasible banner with the Hall sentence and those rows/columns
  outlined, "Avoid last year" import.
- **Hat**: before drawing — Draw button (disabled when infeasible), PIN switch.
  Drawing — ~1.5 s animation of name slips dropping into an SVG hat. After —
  seal, a hand-out list (name, PIN if any, Copy link, Share, sent tick,
  progress "5 of 8 sent"), Pass the phone, Redraw (confirm), Open the hat
  (confirm → loops diagram + table + Export envelope + Verify).
- Pass the phone: full-screen; "Hand the phone to Ann" → press and hold to see
  the name → release hides → Next. Never shows two names at once.
- Loops diagram: each cycle laid out on its own circle with arrowheads, names
  on nodes, household colours.

### `reveal.html` + `reveal.css` + `src/reveal.js` — participant
Centered hat scene. States: loading → (PIN form) → "Hi Ann, your slip is in the
hat" with the hat wobbling → tap/Enter: slip rises, unfolds, name written in
`--hand` font, confetti burst (canvas, respects `prefers-reduced-motion`) →
details card (hint, budget, date with days-to-go, note, seal with a line
explaining "everyone's seal should match") → Hide / Show again. No ticket:
friendly explainer linking to `./`. Bad ticket: error state. The page title and
any meta must never contain the receiver's name.

### Quality bar
Works at 360 px wide and 1440 px. All controls keyboard reachable with visible
focus; matrix cells have `aria-label`s ("Ann to Bob, 25 percent, allowed").
No CDN, no build step, no dependencies. No `innerHTML` with user text
(names are user input: use `textContent`).

## 7. Bench (`node scripts/bench.mjs`, exit code 1 on any failure)

1. Count equals brute-force enumeration for 300 random rule sets, n = 3..8.
2. Unrestricted counts equal derangement numbers D(n) for n = 3..18.
3. Marginal rows and columns sum to 1; marginals equal brute force for n ≤ 7.
4. Sampler uniformity: a 5-person case with couples, 200,000 draws, χ² against
   uniform over all valid draws passes at p > 0.001; and the same test **fails**
   for a naive "shuffle, each giver takes first allowed remaining" sampler
   (included in the bench as the foil), with both χ² values printed.
5. Loop mode: count equals brute force for n ≤ 8; every sample is one n-cycle.
6. Noswap: no sample contains a 2-cycle; uniform by χ² on a small case.
7. Hall: for 200 random infeasible sets the returned sets satisfy
   |N(S)| < |S| and N(S) really is the neighbourhood of S.
8. Sampled tier (n = 26, 13 couples): 200 draws all valid.
9. Determinism: same seed → same assignment; different seeds differ.
10. Tickets: round trip with and without PIN; wrong PIN → BAD_PIN; a flipped
    character → BAD_TICKET; ticket text does not contain the receiver's name in
    base64. Seal changes when one assignment pair changes.
11. Timing: analyse() for n = 18 under 1.5 s, printed.

## 8. How to build it properly

1. **Engine first, with the bench.** Nothing in `src/engine.js` may touch the
   DOM. Write brute force enumeration in the bench, not in the engine, and get
   items 1–9 green before any UI exists.
2. **Then the two pages in parallel**, against the real engine. They share only
   `tokens.css` and the engine modules; neither edits the other's files.
3. **Integration pass**: run the bench, click through both pages in Chromium at
   1440 px and 390 px with the console open, fix every error and overflow.
4. **Pitfalls to avoid**
   - JS bitwise ops are signed 32-bit: use `>>> 0`, and `1 << j` only for j < 31.
   - Tables are indexed by mask only; allocate `2ⁿ` once and reuse.
   - Do not "fix" infeasible rules silently, and do not fall back to a biased
     sampler without changing `method`.
   - Web Crypto needs a secure context; `localhost` counts, `file://` does not.
   - Keep the receiver's name out of the DOM until the slip is pulled, and out
     of `document.title`, history state and `localStorage` on the reveal page.
   - Re-analysing on every keystroke is fine up to n = 18; debounce 150 ms and
     skip analysis while a name field is being typed in.
5. **Docs and registration** (per repo `CLAUDE.md`): README with screenshots,
   entry in `showcase/data/projects.js`, row in the root README, own Vercel
   project `hatful` with Root Directory `showcase/apps/hatful`.

## 9. Acceptance

Bench passes. Demo group (8 people, 2 couples, one ban) analyses instantly,
draws, produces 8 links that each open to the right name; a PIN-protected link
refuses a wrong PIN; an impossible rule set names the people responsible;
opening the hat shows loops and the exported envelope verifies.
