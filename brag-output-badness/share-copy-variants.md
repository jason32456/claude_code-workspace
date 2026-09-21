# Share copy variants

## One-liner
Every browser breaks paragraphs greedily. I implemented the algorithm that
doesn't — and let TeX grade it: 423 lines, identical.

## Short (for a post)
Your browser breaks paragraphs one line at a time, taking the longest line that
fits and never reconsidering. TeX solves the whole paragraph at once as a
shortest path. I built that in a tab and used TeX itself as the oracle —
`\tracingparagraphs` reports every breakpoint it considered and why, so a
disagreement is a bug rather than an opinion. 423 lines identical, 5,986 words
hyphenated the same, 387 widths exact to 1/65536 of a point. It also reports
where it loses.

## The bug that makes the point
TeX caught four bugs I could never have seen, because each one produced a
paragraph that looked completely fine. My favourite: the last line was being
charged 10100 demerits for a forced break that TeX charges nothing for
(`artificial_demerits`, tex.web §851, printed in the trace as `d=*`). The
paragraph it produced was perfectly reasonable — just not the one TeX produces.

## For a typography audience
cmr10 metrics parsed from the binary TFM, TeX's own `store_scaled` conversion,
181 kern pairs, the f-ligature table, Liang hyphenation over Knuth's own
`hyphen.tex`, and the glue drawn at its true width so you can see a badness of
146 before you read the number.

## For an algorithms audience
Shortest path over a box/glue/penalty graph with active-node pruning by fitness
class. Checked two ways: against TeX's trace on 423 lines, and against
exhaustive search over 21,630 enumerated breakings — because a paragraph always
looks plausible, and a mis-pruned active list gives you one that's merely good
rather than optimal.
