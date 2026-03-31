# TRUCO Sh!

> *Energía para ser vos*

A fully playable Argentine Truco card game — single HTML file, zero dependencies, runs in any browser. Casino-themed with animated waves, cream playing cards, and a trash-talking "loco" bot opponent.

---

## Play Now

Open `truco.html` in any modern browser. No server, no install, no build step.

---

## Game Rules

Truco is the most popular card game in Argentina, played with a 40-card Spanish deck (suits: Espadas, Bastos, Copas, Oros; values: 1–7, 10–12). Two players are dealt 3 cards each and play best-of-3 tricks per hand. First to 30 points wins.

### Card Hierarchy (strongest → weakest)

```
1♠ Espadas (Macho) > 1♣ Bastos (Hembra) > 7♠ Espadas > 7♦ Oros
> all 3s > all 2s > 1♥ Copas = 1♦ Oros > 12s > 11s > 10s
> 7♥ Copas = 7♣ Bastos > 6s > 5s > 4s
```

### Envido

Called in the first trick only. Score = sum of the two highest same-suit cards + 20 (figuras count as 0). Escalation chain: **Envido** (2 pts) → **Envido** (4 pts) → **Real Envido** (7 pts) → **Falta Envido** (remaining to 30).

### Truco

Raises the hand stake. Chain: **Truco** (2 pts) → **Retruco** (3 pts) → **Vale Cuatro** (4 pts). Opponent can accept (*Quiero*), reject (*No Quiero*, caller takes previous level), or re-raise.

### Parda (tie)

Cards of equal rank are a parda. The *mano* (first player) has advantage on ties.

---

## Controls

| Action | How |
|--------|-----|
| Play a card | Click it |
| Call envido | **ENVIDO** button (first trick only) |
| Call / escalate truco | **TRUCO** button (auto-escalates to Retruco, Vale Cuatro) |
| Fold the hand | **MAZO** button |
| Trash-talk | Type in the chat input |

---

## The Bot

The bot has a *loco* (crazy) personality — calls Truco with mediocre hands, bluffs envido aggressively, escalates to Retruco and Falta Envido often, and rarely backs down. It also responds to your chat messages with Argentine truco banter.

---

## Features

- Complete Argentine Truco rules (sin flor variant)
- Aggressive bluffing AI
- Casino aesthetic: gold/silver/burgundy, Georgia serif typography
- Cream playing cards with rich suit colors
- Animated canvas wave background
- CRT scanlines + vignette overlay
- Card deal and play animations
- Speech bubbles for all calls and responses
- In-game event log + interactive chat
- Table announcements for trick/hand results and scoring
- Fully responsive, single-file, zero dependencies

---

## Project Files

| File | Description |
|------|-------------|
| `truco.html` | The game — all HTML + CSS + JS in one file |
| `truco-vanilla.html` | Earlier vanilla HTML version |
| `truco-vanilla.jsx` | Earlier React version |
| `GAME_PLAN.md` | Full design document including roadmap |
| `QA_REPORT.md` | QA report with 16 bugs found and fixed |
| `multiplayer/` | Online multiplayer server + client |
| `CONVERSATION_LOG.md` | Full development log |

---

## Roadmap

This is **Phase 1** of a larger vision inspired by Balatro:

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Single-player vs bot, full Truco rules, casino UI | ✅ Done |
| 2 | Multiplayer — Socket.io, rooms, lobby, 2v2 + señas | ✅ Done |
| 3 | Roguelike layer — run structure, relics, shop, boss fights | Planned |
| 4 | SH! Extreme edition — branded theme, exclusive relics + modes | Planned |

---

## Multiplayer Setup

The `multiplayer/` folder contains the full online multiplayer system.

### Quick Start

```bash
cd multiplayer/server
npm install
npm start
```

Then open `http://localhost:3000` in your browser. Create an account, make a room, and share the URL with a friend.

### Architecture

- **Server:** Node.js + Express + Socket.io + SQLite (sql.js)
- **Auth:** Email/password signup, JWT tokens
- **Game engine:** Server-authoritative — all game logic runs on the server
- **Modes:** 1v1, 2v2 (with señas), Spectator mode
- **Client:** Single HTML file with casino theme, served by the server

### Project Structure

```
multiplayer/
├── server/
│   ├── index.js            # Express + Socket.io entry point
│   ├── .env                # Config (PORT, JWT_SECRET, DB_PATH)
│   ├── package.json
│   ├── auth/auth.js        # Signup, login, JWT middleware
│   ├── db/database.js      # SQLite via sql.js
│   ├── game/truco-engine.js # Full Truco rules (ported from truco.html)
│   ├── rooms/room-manager.js # Lobby, rooms, matchmaking
│   └── socket/socket-handler.js # Real-time event handling
└── client/
    └── index.html          # Full multiplayer client (auth + lobby + game)
```

---

## Tech Stack

**Single-player:** Pure HTML + CSS + JavaScript. No frameworks, no libraries, no build tools.

**Multiplayer:** Node.js, Express, Socket.io, sql.js (SQLite), bcryptjs, JWT.

---

## Credits

Built by Federico with Claude.

---

*"¿Querés truco? Dale nomas."*
