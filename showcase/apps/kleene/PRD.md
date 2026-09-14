# Kleene — Product Requirements Document

## One line

A regular-expression engine that shows its work: it compiles a pattern through
every stage a real engine uses, races the two matching strategies against each
other, and **decides** whether two patterns denote the same language.

## Why this exists

Regular expressions are the most widely used formal system in software and the
least understood. Three specific misconceptions are worth attacking directly:

1. **"A regex is a string-matching rule."** It is a finite automaton. The
   pattern is surface syntax for a machine, and that machine can be built,
   drawn, and minimized.
2. **"Regex performance is about the pattern being complicated."** It is about
   which *engine* runs it. The same pattern on the same input takes 400 steps
   or 400,000 depending only on the matching strategy. This is what ReDoS
   actually is, and it is measurable rather than folkloric.
3. **"Two regexes are equivalent if they look similar."** Language equivalence
   for regular languages is *decidable*. `(a|b)*` and `(a*b*)*` are the same
   language; `(ab)*a` and `a(ba)*` are too. Whether two patterns agree is a
   question with a proof, not an opinion.

Kleene is built around the third point, because it is the one no amount of
experimentation gives you. Testing a regex against strings samples its
language; the product-automaton construction settles it.

## Scope — the supported language, and why it stops where it does

Supported: literals, `.`, escapes (`\d \w \s \D \W \S \n \t \r \f \v \0` and
escaped metacharacters), character classes `[a-z]` / `[^a-z]` with ranges and
class escapes, concatenation, alternation `|`, `*`, `+`, `?`, bounded repeats
`{n}` `{n,}` `{n,m}`, lazy quantifiers (`*?`, `+?`, `??`, `{n,m}?`), grouping
`(...)` and `(?:...)`, and the anchors `^` and `$`.

**Deliberately excluded: backreferences and lookaround.** This is the app's
thesis rather than a shortcut. `(a+)\1` is not a regular language — no finite
automaton recognizes it — so a pattern containing a backreference cannot be
compiled to a DFA, cannot be minimized, and cannot be decided for equivalence.
Lookaround is regular in principle but is not expressible in the single-pass
construction used here. Both are exactly the features that force an engine into
the backtracking corner where the exponential blowup lives. Rejecting them with
an explanation is more useful than supporting them badly.

Matching semantics are **whole-string**: a pattern matches a subject if it
matches all of it. This is the semantics under which automaton equivalence is
meaningful. `^` and `$` are therefore satisfied at the string boundaries and
are no-ops in the automaton; they remain real assertions in the backtracking
engine, where they are observable in the step trace.

## The three modes

### 1. Compile — the pipeline, stage by stage

A pattern is carried through five artifacts, all rendered and all cross-linked:

| Stage | Construction | What it shows |
|---|---|---|
| Tokens | Hand-written lexer | Escapes and classes resolved to character sets |
| AST | Recursive descent, precedence alternation < concatenation < postfix | The parse, as a tree |
| ε-NFA | Thompson construction | One fragment per AST node; linear in pattern size |
| DFA | Subset construction over an alphabet partition | Determinized; possibly exponential, and honest about it |
| Minimal DFA | Hopcroft partition refinement | The canonical machine for the language |

Selecting an AST node highlights the NFA states that node produced, because
Thompson's construction is compositional and every state has an originating
node. This is the link that makes "the pattern *is* the machine" concrete.

**Alphabet partitioning.** The DFA alphabet is not Unicode. Every character set
appearing in the pattern is used to partition the code-point space into the
coarsest set of disjoint classes such that each set in the pattern is a union
of classes (plus one class for every character mentioned nowhere). Transitions
are labelled with the class, so `[a-z]` is one edge and not twenty-six.

### 2. Race — two engines, one pattern

The same pattern is compiled to one bytecode program and run by two machines:

- **Backtracking VM** — explicit continuation stack, tries alternatives in
  order, unwinds on failure. The semantics of PCRE, Python `re`, JavaScript
  `RegExp`. Steppable and scrubbable because the stack is data, not recursion.
- **Thompson simulation** — advances every reachable position in lockstep, one
  subject character at a time. Never revisits a (position, instruction) pair,
  so it is linear in the product of pattern and subject length.

Both report instruction counts. On `(a|a)*` against twenty `a`s followed by an
`X`, the two counters differ by three orders of magnitude, and adding one more
`a` doubles one of them and not the other. The screenshot is the argument.

A step budget bounds the backtracking engine so a pathological pattern reports
honestly instead of hanging the page.

### 3. Equivalence — the decision procedure

Two patterns in, one verdict out:

1. Compile both to minimal DFAs over a **shared** alphabet partition derived
   from both patterns together (this is required for the product to be sound).
2. Build the product automaton over reachable state pairs.
3. BFS from the start pair, looking for a pair whose accept flags disagree.
4. **No such pair reachable → the languages are equal**, and that is a proof,
   not a sample.
5. **Such a pair found → the languages differ**, and the BFS tree gives the
   *shortest* string accepted by one and rejected by the other, which is
   printed along with which side accepts it.

Worked examples ship as presets: `(a|b)*` vs `(a*b*)*` (equal), `(ab)*a` vs
`a(ba)*` (equal), `a{2,3}` vs `aa|aaa` (equal), `[0-9]+` vs `\d\d*` (equal),
and near-misses that differ on exactly one short string.

## Non-goals

- Not a regex tester — no find-all, no replace, no capture-group extraction UI.
- Not a teaching course — no lessons, no quizzes, no progress tracking.
- Not a general graph editor — the automata are rendered, not authored.

## Constraints

- Static site. No build step, no CDN, no network at runtime, no dependencies.
- Vanilla JS, ES modules, SVG for graphs.
- Deterministic: same input, same output, same picture. No animation timing in
  the rendered state, so screenshots are reproducible.
- Honest limits: a declared cap on DFA states and on repeat expansion, surfaced
  in the UI when hit rather than silently truncating.

## Success criteria

- A wrong equivalence verdict is the only unacceptable failure. The product
  construction is checked against a fixture suite of known-equal and
  known-different pattern pairs, run in-page from a self-test.
- The ReDoS demonstration must show a three-order-of-magnitude gap without the
  page freezing.
- The minimal DFA for `(a|b)*abb` must have exactly 4 states, matching the
  textbook result.
