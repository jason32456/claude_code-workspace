# Heard — Product Requirements

## One line

Tell it what you're cooking and when you want to eat. Heard works backwards from
serving time, schedules your hands, burners and ovens as the scarce things they
are, and then calls out each step in a live cook mode so every dish lands hot
at the same moment.

## Why this app

The hardest part of cooking a big meal is timing it, not any one recipe. Getting
a roast, potatoes, Yorkshire puddings, greens and gravy onto the table at once is
a scheduling problem. Cooks solve it on the back of an envelope, and it often
goes wrong.

Existing multi-dish timers (Chef's Multi-Dish Timer, Dinner Ninja, MealTime,
Cooking Time) mostly do *subtraction*: start time = serve time − cook time.
That breaks on exactly the cases that make a meal hard:

1. **You only have two hands.** Three dishes that each need ten minutes of
   chopping at 17:40 cannot all be chopped at 17:40.
2. **An oven has one temperature.** The roast wants 180 °C and the Yorkshires
   want 220 °C. They cannot share the oven, and switching it costs preheat time.
3. **Burners and rack space run out.** Four pans, three burners.
4. **Not everything can wait.** Pasta can't sit for 20 minutes. A roast *should*
   rest for 20 minutes. Each step's output has a hold window.

Heard treats the meal as a small resource-constrained project-scheduling
problem (RCPSP) with hold windows and sequence-dependent oven set-ups. It then
schedules it properly and shows its work.

Inspiration within this repo: **Evens** (exact math with a visible
explanation, share-by-URL), **Placecard** (constraint solving for a real-life
event), **Docket** (a timeline/board UI). Heard is none of those: it plans
time, not money or seats.

## Users and jobs

- **The host** cooking Sunday lunch, Thanksgiving or a dinner party: "When do I
  start, and what am I doing at 16:45?"
- **The weeknight cook**: "If I start now, when can we eat?"
- **Two people cooking together**: "Who does what?" (cooks are separate lanes.)

## Core concepts

| Concept | Meaning |
|---|---|
| **Kitchen** | Cooks (1–4), burners (1–8), ovens (0–3, each with rack slots) |
| **Dish** | A named, coloured chain of steps |
| **Step** | Label, duration, hands-on minutes, equipment (none / burner / oven at °C, slots), predecessors, hold window |
| **Hands-on** | Minutes of a cook's attention at the *start* of the step (whole step if active) |
| **Hold** | How long this step's output may wait before the next step starts (for a dish's last step, before serving) |
| **Preheat** | Ovens heat at ~12 °C/min and cool at ~5 °C/min. Every change of oven temperature needs that gap |

## Functional requirements

### Planner
- F1. Pick a serve time (default: next round half hour, at least the plan length ahead).
- F2. Kitchen settings: cooks, burners, ovens with slots per oven.
- F3. Menu editor: add/remove/rename dishes, edit steps inline (duration,
  hands-on, equipment, temperature, slots, hold, depends-on).
- F4. Preset menus: Sunday Roast, Thanksgiving, Weeknight Pasta, Dinner Party, Brunch.
- F5. **Scheduler**: a reverse serial schedule-generation scheme (as-late-as-possible
  from serve time) on a one-minute grid, run over several hundred seeded,
  perturbed priority orders, keeping the best score. The score is, in order:
  hold violations, distance of each dish's finish from serving, total span,
  oven temperature changes and the cook's context switches. Deterministic for
  the same input.
- F6. Hard constraints never broken: precedence, cook capacity (hands-on
  minutes), burner count, oven slots, one temperature per oven at a time,
  preheat/cool gap between temperatures.
- F7. Soft constraints reported: a hold window that couldn't be met says by how
  much, and why (which resource was full, when).

### Views
- F8. **Timeline (Gantt)**: one lane per dish with step bars. Solid = hands-on,
  hatched = passive. Below that, resource lanes: each cook, burner use, and
  every oven's temperature strip with preheat ramps. A now-line, hover details,
  and a serve marker.
- F9. **Run sheet**: a chronological list of clock times and actions,
  e.g. "15:52 Preheat Oven 1 to 180 °C". Printable.
- F10. **What would help**: re-run the scheduler with +1 cook, +1 burner,
  +1 oven, +1 slot, and rank them by minutes saved and violations fixed.
- F11. **Plan stats**: start time, span, hands-on minutes, longest idle gap, hold issues.

### Cook mode
- F12. Full-screen live mode: big clock, "Now" cards with countdowns, an
  "Up next" queue, and the minutes until serving.
- F13. Each step start is *called*: a chime (Web Audio) plus an optional spoken
  call (speechSynthesis), "Fire the gravy". The cook taps **Heard** to
  acknowledge, as on a restaurant line.
- F14. **Running late +5**: shifts everything not yet started (and the serve time) by 5 min.
- F15. Screen wake lock where supported. A demo speed (×1 / ×10 / ×60) so it can be shown quickly.

### Persistence and sharing
- F16. Autosave to localStorage. Works with storage blocked.
- F17. Share the whole menu and kitchen as a deflate-compressed URL hash (no server).

## Non-functional
- Static site, no build, no CDN, no dependencies. Vanilla ES modules.
- Plans a 40-step menu in under 300 ms on a laptop.
- Light and dark themes, phone layout ≥ 360 px wide, keyboard reachable.
- A headless bench (`node scripts/bench.mjs`) checks every hard constraint on
  every preset and on random menus, plus determinism, codec round trip, hold
  satisfaction on the feasible presets, and that "what would help" never
  recommends a change that makes the plan worse.

## Out of scope
- Recipe import from URLs, nutrition, shopping lists, multi-device sync.

## Success
- Sunday Roast with one oven yields a plan where the roast comes out, rests,
  and the oven climbs to 220 °C for the Yorkshires, with no hold violations.
- Thanksgiving on one oven and one cook reports its bottleneck and names the
  resource that fixes it.
