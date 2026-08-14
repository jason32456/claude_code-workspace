# Capsa — Product Requirements Document

## Overview

Capsa (also known as Big Two, Deuces, 鋤大弟, Capsa Banting) is a four-player
shedding card game. The whole deck is dealt out, the holder of 3♦ leads, and
players race to empty their hand by beating the previous play with a stronger
combination of the same size. First hand to zero wins.

This build is a browser implementation with **cross-device online rooms** and
**AI opponents**, designed portrait-first for phones and expanded — not merely
stretched — for desktop.

## Goals

1. **Correct rules.** The combination ranking is the game. Every comparison —
   suit-broken singles, straight-flush bombs, four-of-a-kind — must be exactly
   right, and the same code must judge it on client and server.
2. **Playable in 5 seconds.** Landing on the page and pressing one button should
   put you in a game against bots. No account, no tutorial gate. Solo play never
   waits for anything; the lobby exists only for online rooms, where waiting for
   friends is the point.
3. **Real multiplayer, no realtime server.** Four humans on four phones sharing
   a room code, running entirely on Vercel serverless functions.
4. **Genuinely good on a phone.** Not a desktop layout that survives at 390px —
   a layout designed for one thumb, with the desktop version as the variant.
5. **Never stalls.** A player who closes their tab must not freeze the other
   three.

## Non-goals

- Per-person accounts, persistent profiles, ELO, or cross-session history. The
  sign-in is a shared gate into the game, not an identity system.
- Chat (a fixed set of emotes instead — no moderation surface).
- Spectators.
- Money, wagering, or anything resembling it.

## Rules specification

This is the normative section. The engine implements exactly this.

### Deck and ordering

Standard 52 cards, no jokers. Dealt 13 each to 4 seats.

**Rank order (low → high):**
`3 4 5 6 7 8 9 10 J Q K A 2`

Note 2 is the highest rank and 3 the lowest — this is the defining quirk of the
game.

**Suit order (low → high):**
`♦ ♣ ♥ ♠`

Every card is therefore totally ordered: no two cards ever tie. A card's value
is `rankIndex * 4 + suitIndex`, giving 0 (3♦) through 51 (2♠).

### Legal combinations

| Size | Combination | Notes |
|---|---|---|
| 1 | Single | any card |
| 2 | Pair | two cards of equal rank |
| 3 | Triple | three cards of equal rank |
| 5 | Straight | five consecutive ranks |
| 5 | Flush | five cards of one suit |
| 5 | Full House | triple + pair |
| 5 | Four of a Kind | quad + any fifth card |
| 5 | Straight Flush | consecutive *and* single-suited |

Four-card plays are not legal. A bare quad must be played as a five-card hand
with a kicker.

### Straight construction

Straights use the sequence `3 4 5 6 7 8 9 10 J Q K A`. **The 2 is never part of
a straight**, and aces are high only — `A-2-3-4-5` and `10-J-Q-K-A-2` are not
straights. The lowest straight is `3-4-5-6-7`; the highest is `10-J-Q-K-A`.

This is a deliberate simplification of a rule that varies by region. It is
stated in the in-game rules sheet so no player is surprised.

### Five-card hand ranking

Categories rank: `Straight < Flush < Full House < Four of a Kind < Straight Flush`.

A higher category always beats a lower one. Within a category:

- **Straight** — compare the highest card (rank, then suit).
- **Flush** — compare the suit first, then the highest rank within it. (A ♠ flush
  beats every ♥ flush.)
- **Full House** — compare the rank of the triple. The pair is irrelevant.
- **Four of a Kind** — compare the rank of the quad. The kicker is irrelevant.
- **Straight Flush** — compare the highest card.

### Turn flow

- The holder of **3♦** leads the first trick and **must include 3♦** in that play.
- Play proceeds clockwise. On your turn you either **beat the current play** or
  **pass**.
- A beating play must have the **same number of cards** and be strictly stronger.
  A pair can never be beaten by a triple, a single never by a five-card hand.
- Once three consecutive players pass, the trick closes. The player who made the
  last play leads the next trick with **any legal combination**.
- Passing is binding for the current trick only; you re-enter on the next.
- A player who empties their hand ends the game immediately.

### Score tracking

Each finished hand appends `{hand, winner, deltas, left}` to the room's history,
so the tracker can show more than a running total: totals sorted best-first, and
a hand-by-hand breakdown. **New game** clears scores and history and deals
again on the same seats — host-only online, and refused mid-hand.

### Motion

Motion is used to answer questions the player would otherwise have to work out:
where a card came from (plays fly in from the seat that played them), what just
changed (score bump, badge fade-in), whose turn it is (the active seat's ring
breathes), and that a trick is over (the pile lifts away instead of vanishing).
Everything is decorative and everything is disabled under
`prefers-reduced-motion`.

### Scoring

Each losing player scores penalty points equal to the cards left in hand,
multiplied by a hand-size penalty:

| Cards remaining | Multiplier |
|---|---|
| 1–7 | ×1 |
| 8–9 | ×2 |
| 10–12 | ×3 |
| 13 (never played) | ×4 |

The winner scores the negative sum of everyone else's penalties, so each hand is
zero-sum. Lower total is better across a match.

## Multiplayer architecture

### Constraint

Vercel serverless functions cannot hold open WebSocket connections. Capsa is
turn-based with think-times measured in seconds, so it does not need them.

### Model

- **Server-authoritative.** The room's full game state lives in Upstash Redis
  under `capsa:room:<CODE>` with a 2-hour TTL, refreshed on every write. Clients
  send *intents* (`play these cards`, `pass`); the server re-validates against
  the same engine module the client uses and rejects anything illegal.
- **Hidden information stays hidden.** The state sent to each client is redacted
  per-seat: you receive your own 13 cards and only *counts* for everyone else.
  A cheating client cannot read opponents' hands because they were never sent.
- **Transport is adaptive polling.** `GET /api/capsa/state` returns immediately
  with a monotonic `version`. Clients poll at ~900 ms when a turn is live, 2.5 s
  in the lobby, and stop entirely when the tab is hidden.
- **Writes are compare-and-set.** Every mutation runs a Redis Lua script that
  writes only if the version is unchanged, retrying on conflict. Two players
  acting on the same tick cannot corrupt the room.

### The gate

The game sits behind a shared sign-in with two roles, player and admin. This is
deliberately **not** per-person accounts: everyone shares one player credential,
and identity within a game still comes from the display name a person types when
they join a room. The admin role exists only to change those credentials.

The important design constraint is that **a static client cannot authenticate
itself** — its JavaScript is readable by anyone it is served to. So the gate is
enforced server-side: `login` issues a session token, and every room endpoint
refuses to answer without one. The login screen is a convenience for honest
users; the 401 is the actual control.

Consequences accepted:

- Passwords are stored as PBKDF2-SHA256 digests (120k rounds, per-record salt),
  compared in constant time, rate-limited per IP, with an identical error for a
  wrong username and a wrong password so the form is not a username oracle.
- Credentials live in the store, not in code, so an admin can change them at
  runtime and a redeploy does not reset them. Defaults are seeded once into an
  empty store and can be overridden by environment variable so the published
  ones need never be live.
- Solo play is not protected and cannot be, since it never contacts a server.
  Nothing is at stake in it. With no API present the app says so plainly and
  offers solo play rather than pretending to authenticate.

### The lobby

An online room opens in a `lobby` phase and deals nothing until the **host** —
the player who created it, seat 0 — presses Start. Players who join take the
empty seats; whatever is still empty at the moment the host starts is filled
with bots at a difficulty the host picks.

Start and next-hand are **host-only, enforced on the server**. Hiding the button
would not be enough: any client could call the endpoint.

Host is not permanent. If the host leaves, the role migrates to another human in
the room, because a lobby nobody can start is a dead room. If a human leaves
during a lobby their seat simply returns to empty; if they leave mid-hand a bot
takes over instead, since those cards still have to be played.

### Bots and the stall problem

Empty seats are filled by bots. Bots are advanced **lazily inside whatever
request happens to arrive**: if the current seat is a bot and its think-timer has
elapsed, the request handler plays its move before responding. No background
worker, no cron, no host-client dependency — a bot cannot stall because there is
nobody left to run it.

The same mechanism covers disconnects. Each human's poll updates a heartbeat; if
a seat goes 25 s without one it is marked **away**, and the bot policy takes its
turns until it comes back. The remaining players keep playing.

### Graceful degradation

The client probes `/api/capsa/health` on load. If there is no API — the app is
being served from `python -m http.server`, or from a static host with no
functions — online mode is disabled with an explanation and **solo vs. bots
remains fully playable**. This is what keeps `showcase/` hostable on its own, as
CLAUDE.md requires.

## Bot AI

Three difficulties, sharing one hand-evaluation core:

- **Casual** — plays its lowest legal combination; passes when it cannot beat.
- **Sharp** *(default)* — decomposes its hand into a near-optimal set of
  combinations, then plays the cheapest one that preserves that decomposition.
  Holds 2s and bombs for endgame control, and refuses to break a pair to win a
  trick it does not need.
- **Ruthless** — Sharp, plus opponent card-counting: tracks every card played,
  knows when its remaining singles are unbeatable, and dumps its hand in the
  right order. Will burn a bomb to stop a player on their last 1–2 cards.

All three respect a 600–1400 ms randomized think-time so play feels human.

## Interface

### Mobile (portrait, primary)

- Opponents as a compact row of avatars along the top: name, card count, a
  "passed" dimmer, and a turn ring.
- Table centre shows the trick as a pile: every play made in the current trick
  stays visible, cascading up-left as it is buried so each one keeps its rank
  corner readable, with the live play on top. The pile is swept when the trick
  closes.
- Your hand fans across the bottom, overlapped so 13 cards fit at 390 px.
  Tapping a card lifts it; tapping again drops it.
- A sticky action bar sits above the safe-area inset: **Pass**, **Play** (labelled
  with what the selection would make — "Play Full House"), and **Sort**.
- Invalid selections disable **Play** and say why ("needs 5 cards", "flush is too
  low") rather than silently failing.

### Desktop

- The felt becomes a real table: opponents at left, top and right of the play
  area.
- Cards render larger with hover-lift, and the hand is a single unoverlapped row.
- Keyboard: `Enter` play, `Space` pass, `S` sort, `H` hint, `1–9/0` toggle cards.
- Hint highlights the lowest legal play — the single most useful affordance for a
  new player learning the combination ranking.

### Shared

- Cards are drawn in CSS/SVG, not images: crisp at any density, no asset loading.
- Reduced-motion honoured; all animation is decorative.
- Colour-blind-safe suits — ♦/♥ red-orange, ♣/♠ near-black, each with a distinct
  glyph, never colour alone.

## Success criteria

- [ ] Full 4-player hand playable end to end against bots with no illegal move accepted.
- [ ] Two browsers joining one room code stay in sync within ~1 s.
- [ ] Closing a tab mid-game does not stall the other players.
- [ ] Usable one-handed at 390×844; uses the space at 1440×900.
- [ ] Loads and plays solo with the API entirely absent.
- [ ] Zero runtime dependencies, zero build step, zero network calls to third parties.
