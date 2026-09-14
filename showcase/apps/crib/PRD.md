# Crib — Product Requirements Document

## One line

An Enigma machine you can break: encipher a message, throw the key away, guess
one word of the plaintext, and watch a Turing bombe recover the key from a
search space of 158,962,555,217,826,360,000 by testing only 1,054,560 positions.

## Why this exists

Enigma simulators are everywhere and they teach nothing. They let you turn
rotors and watch lamps light, which is the least interesting fact about the
machine. The interesting facts are all on the other side:

1. **The plugboard looks like the hard part and is actually free information.**
   The plugboard multiplies the keyspace by 150 trillion. The bombe does not
   search it. The diagonal board encodes one structural fact — steckering is an
   involution, so A↔G implies G↔A — as physical wiring, which turns a single
   assumed plug into a wave of consequences that either survives or contradicts
   itself. A 10²⁰ keyspace collapses to 10⁶ tests because of a symmetry, not
   because of speed.

2. **The machine's one guarantee is what kills it.** The reflector means no
   letter ever enciphers to itself. That single property invalidates roughly two
   thirds of all crib alignments before a single rotor is turned. The design
   feature that made Enigma feel secure is the hole.

3. **The bombe's power is topology, not throughput.** Two cribs of identical
   length can differ by three orders of magnitude in how many false stops they
   produce, and the difference is the *cycle rank* of the menu graph — edges
   minus vertices plus components. Each independent loop divides the false-stop
   count by roughly 26. This is predictable before the search runs, and the app
   predicts it and then measures it.

Point 3 is the thesis, because it is the one nobody expects: the machine that
broke Enigma was not fast, it was well-posed.

## Scope

**In scope.** Enigma I / Wehrmacht service machine: rotors I–V in any of the 60
orderings of three, reflectors B and C, Ringstellung, Grundstellung, and a
plugboard of up to 13 pairs. Crib alignment with the self-encipherment filter.
Menu construction with automatic scrambler selection. A bombe with a diagonal
board, running all 60 rotor orders × 17,576 core positions. Stop ranking by
index of coincidence and log-weighted German letter statistics.

**Out of scope, deliberately.** The Kriegsmarine M4 (four rotors, thin
reflectors) and the Abwehr G machines. Not because they are hard, but because
adding rotors changes nothing about the argument and quadruples the search.
The Uhr box and the plugboard-rewiring variants are likewise out.

**What the app refuses, and says why.** The bombe recovers *rotor order* and
*core position*. It does not recover the Ringstellung. The right-hand rotor's
ring setting is pinned only by where the middle rotor's turnover must have
occurred, so for a message shorter than the gap to a turnover it is **genuinely
underdetermined** — a family of ring/position pairs produce identical
ciphertext. The app reports the family rather than picking a member and
pretending. This is the same move Kleene makes in refusing backreferences: the
limit is the lesson.

## The three modes

### 1. Machine — the cipher, and the invariant that dooms it

The rotor stack drawn as three letter rings with live windows, the plugboard as
a 26-socket bank, and an exploded wiring diagram. A keypress traces one
luminous path — plugboard → right → middle → left → reflector → back through
all three → plugboard → lamp — with the return leg in a second colour so
reciprocity is visible rather than asserted.

Two measurements run continuously in the corner:

- `self-encipherments: 0 in N keypresses` — an accumulating count that never
  moves. The whole attack rests on this, so it is shown as a measurement.
- `middle-rotor period: 650` — not 676, because of the double step.

A **Step 26×** control walks the stepping mechanism so the double-step anomaly
happens in front of you, with the irregular tick highlighted.

### 2. Crib — where the search is won or lost

Ciphertext in a monospace band; a draggable crib block beneath it. Every
alignment is scored live:

- Positions where the crib would require a letter to encipher to itself grey
  out, with the offending column circled. This is the free two-thirds.
- Surviving alignments build a **menu**: a graph whose vertices are letters and
  whose edges are (plain, cipher) pairs tagged with the scrambler offset at
  which they were observed.
- Cycles are picked out in a hot colour, and a readout reports
  `edges · vertices · components · closures · predicted false stops ≈ 26^(E−V+C) … `

Dragging the crib one column changes the loop count and the predicted stop
count jumps by orders of magnitude. That interaction is the product.

Scrambler selection is an optimisation, not a given: a bombe has twelve
scramblers and a menu may have more edges than that. The app chooses a
connected sub-menu maximising cycle rank within the budget, and names the test
register as the letter appearing in the most constraints.

### 3. Bombe — the search, and why it stops

The diagonal board rendered as a 26×26 lattice with wires lighting and dying as
the closure propagates. A speed control steps one implication at a time so a
dead hypothesis can be read off rather than guessed at. A three-drum odometer
carries the position; the rotor-order queue sits beneath it.

Stops accumulate in a ranked list. Each expands to deduced stecker pairs, the
completed plugboard, and the opening of the decrypt. One of them is not
gibberish.

## Correctness — how the app proves itself

Being wrong here is *invisible*: a subtly incorrect Enigma is still a
self-consistent reciprocal cipher. It enciphers, it deciphers, the bombe finds
stops, plaintext comes out, and every screen looks right while the machine is
not Enigma. So correctness cannot be inferred from the app working. It is
checked explicitly, in-page:

| Check | What it pins down |
|---|---|
| Rotors I II III, reflector B, rings AAA, ground AAA, `AAAAA` → `BDZGO` | the whole substitution path and offset algebra |
| Encipher(Encipher(x)) = x for random settings | reciprocity |
| No fixed point in the substitution at every position | the reflector property the attack needs |
| Middle-rotor period is 650, not 676 | the double step |
| Turnover indices over 26³ keypresses match the expected irregular sequence | stepping, exactly |
| Round-trip: encipher with a random key, discard it, run the bombe, compare recovered key to the discarded one | the entire pipeline, end to end |

The last row is the one that matters. The app generates its own ground truth,
hides it from the solver, and grades itself — which is how a static page with
no corpus and no network produces a proof rather than a demonstration.

## Constraints

Static, self-contained, no build step, no backend, no asset files. Vanilla ES
modules plus one Web Worker for the search. Rotor wirings are 26-character
string constants; stop ranking uses index of coincidence and a letter-frequency
table, both a handful of numbers, rather than a shipped corpus. Runs offline
from `python -m http.server`.

## Performance

The naive search rebuilds each scrambler's 26-element permutation from rotor
wirings at every offset at every position — some 330M permutation builds, which
freezes the tab for minutes. Instead:

- the right rotor's contribution cycles with period 26, so its 26 conjugated
  permutations are precomputed once per rotor order;
- advancing one position composes a 26-element permutation rather than
  rebuilding it;
- closure is a BFS over (letter, menu-node) pairs in a typed-array bitset, with
  early termination the moment all 26 test-register wires light;
- it all runs in a Web Worker with a deterministic progress model, so the
  odometer is honest and the UI stays responsive while a million positions pass.

## Acceptance criteria

1. Loads and runs offline from a bare static server, no console errors.
2. The in-page self-test panel passes every row in the table above.
3. A round-trip break succeeds: random key → ciphertext → bombe → same key.
4. Dragging the crib visibly changes closures and the predicted stop count.
5. At least four screenshots embedded in `README.md`.
6. Registered in `showcase/data/projects.js` and the root `README.md` table.
