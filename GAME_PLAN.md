# TRUCO ROGUELIKE — Game Architecture Plan

## Overview

A **Balatro-inspired roguelike card game** built on **full Argentine Truco rules**, with real-time multiplayer, lobby system, bot opponents, and two visual themes: **Vanilla** (classic dark/neon) and **SH! Extreme** (branded energy drink edition).

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React (single-page app) | Component-based UI, great for card animations |
| **Styling** | CSS3 with custom properties | Balatro-style glow effects, card physics, transitions |
| **Backend** | Node.js + Express | Lightweight, JS everywhere |
| **Real-time** | Socket.io | Bi-directional events for card plays, calls, chat |
| **Bot AI** | Server-side JS | Configurable difficulty, señas simulation |
| **State** | Server-authoritative | Prevents cheating, syncs all clients |
| **Font** | PP Neue Montreal (SH! version) / Inter (Vanilla) | Brand compliance |

---

## Stage 1: Vanilla Core (Single-Player vs Bot)

### 1A — Truco Rules Engine (`truco-engine.js`)

Full Argentine Truco implementation:

**Card System:**
- Spanish deck (40 cards): 1-7, 10-12 in Espadas, Bastos, Copas, Oros
- Full card hierarchy (Ancho de Espadas > Ancho de Bastos > 7 de Espadas > 7 de Oros > all 3s > all 2s > all 1s gold/cups > all 12s > all 11s > all 10s > 7 cups/clubs > 6s > 5s > 4s)
- Envido value calculation (same suit → sum last digits + 20, different suits → highest single card)

**Game Calls:**
- **Envido chain**: Envido (2pts) → Envido (2pts) → Real Envido (3pts) → Falta Envido (remaining to 30)
- **Truco chain**: Truco (2pts) → Retruco (3pts) → Vale Cuatro (4pts)
- **Flor** (3 cards same suit): Flor (3pts), Contraflor, Contraflor al Resto
- Quiero / No Quiero responses
- Mazo (folding)

**Game Flow:**
- Deal 3 cards each
- Mano (first player) rotates each hand
- Play to 30 points (or 15 in "sin flor" variant)
- Track who is "pie" and who is "mano"

**Señas System (2v2):**
- Visual signals between partners for card communication
- AI partners that can read/send señas

### 1B — Balatro-Style UI

**Visual Identity (Vanilla):**
- Deep dark background (#0a0a1a) with subtle star/particle field
- Cards with glossy holographic sheen effect (CSS gradients + animations)
- Neon glow accents (cyan, magenta, gold)
- Smooth card dealing/playing animations (CSS transforms + transitions)
- Score counter with satisfying number-roll animations
- CRT scanline overlay option for retro feel

**Layout:**
```
┌──────────────────────────────────────────┐
│  [Score: You 12 | Them 8]    [Round 3]   │
│                                          │
│         ┌───┐  ┌───┐  ┌───┐             │
│         │ ? │  │ ? │  │ ? │  ← Opponent  │
│         └───┘  └───┘  └───┘             │
│                                          │
│    ┌───────── TABLE ─────────┐           │
│    │   played cards here     │           │
│    └─────────────────────────┘           │
│                                          │
│    [ENVIDO] [TRUCO] [MAZO]  ← Actions   │
│                                          │
│         ┌───┐  ┌───┐  ┌───┐             │
│         │ 1♠│  │ 7♦│  │12♣│  ← Your hand│
│         └───┘  └───┘  └───┘             │
└──────────────────────────────────────────┘
```

**Card Design:**
- Spanish suit icons (Espadas, Bastos, Copas, Oros) as SVG
- Card face with parchment/aged texture
- Hover: card lifts up with glow + shadow
- Play: card flies to table with physics-based easing
- Winning card: gold pulse effect

**Call UI:**
- Envido/Truco buttons with neon glow
- When opponent calls: dramatic full-screen overlay with call text
- "Quiero" / "No Quiero" buttons appear with urgency animation
- Accepted: screen flash + escalation sound cue visual
- Rejected: points fly to winner's score

---

## Stage 2: Multiplayer Infrastructure

### 2A — Server Architecture

```
Client (React) ←→ Socket.io ←→ Game Server (Node.js)
                                    ├── Room Manager
                                    ├── Game Engine (per room)
                                    ├── Bot Manager
                                    └── Matchmaking Queue
```

**Room System:**
- Create room → get room code (6 chars)
- Join room by code
- Quick match (auto-matchmaking by skill)
- Each room has: game state, player slots, spectator slots

### 2B — Lobby / Waiting Room

**Lobby Screen:**
- Active rooms list with player count, mode (1v1/2v2), status
- "Create Game" button → choose mode, set name, optional password
- "Quick Match" button → auto-queue
- Player profile card (name, avatar, stats)
- Chat in lobby

**Waiting Room:**
- Shows seated players (with empty chair animations for open slots)
- "Add Bot" button for empty slots
- Bot difficulty selector (Pichi / Normal / Crack / Tramposo)
- Ready check system
- Countdown when all ready
- Host can kick / change settings

### 2C — Bot AI System

**Difficulty Levels:**

| Level | Envido | Truco | Card Play | Señas |
|-------|--------|-------|-----------|-------|
| **Pichi** | Calls randomly | Bluffs badly | Plays highest card | Ignores |
| **Normal** | Basic strategy | Sometimes bluffs | Decent ordering | Basic reading |
| **Crack** | Optimal calls | Smart bluffs | Perfect ordering | Reads & sends |
| **Tramposo** | Knows your cards | Perfect bluffs | Exploitative | Fake señas |

### 2D — Network Protocol

Key Socket.io events:
```
// Lobby
join_lobby → lobby_state
create_room → room_created
join_room → room_state
add_bot → bot_added

// Game
play_card → card_played (broadcast)
call_envido → envido_called
call_truco → truco_called
respond_call → call_response
show_points → points_shown
round_end → round_result
game_end → game_result
```

---

## Stage 3: Roguelike Layer

### 3A — Run Structure

```
RUN START
  │
  ├── Stage 1: "El Barrio" (3 hands vs easy bots)
  │     └── SHOP → buy relics, upgrade cards
  │
  ├── Stage 2: "La Cancha" (3 hands vs medium bots)
  │     └── SHOP
  │
  ├── Stage 3: "El Club" (3 hands vs hard bots)
  │     └── SHOP
  │
  ├── BOSS: "El Referí" (special rules hand)
  │     └── BOSS REWARD (rare relic)
  │
  ├── Stage 4-6: Harder opponents, modified rules
  │     └── SHOPS between each
  │
  ├── FINAL BOSS: "De Paul" (legendary difficulty)
  │
  └── RUN COMPLETE → Unlock rewards
```

### 3B — Relics (Balatro-style Jokers)

**Common Relics:**
- 🍯 **Miel Silvestre** — Envido worth +2 points
- ⚔️ **Espada Vieja** — Your Ancho de Espadas wins ties
- 🎭 **Máscara del Mentiroso** — Opponent can't see your first play
- 📢 **Megáfono** — Truco calls start at Retruco

**Rare Relics:**
- 🔮 **Bola de Cristal** — See one opponent card each hand
- 🃏 **Comodín Gaucho** — One wild card per round (becomes any card)
- 🌟 **Estrella de Mano** — Always be mano (go first)

**Legendary Relics:**
- 👑 **Corona del Truco** — Vale Cuatro worth 5 instead of 4
- 🔥 **Flor Eterna** — Auto-flor with any 3 cards
- 💀 **Muerte Súbita** — Each hand is all-or-nothing

### 3C — Card Upgrades

Between rounds, you can modify your deck:
- **Enhance** a card: add +1 envido value
- **Promote** a card: move it one rank higher in hierarchy
- **Curse** an opponent's card: random card in their deck is weakened
- **Forge**: combine two cards into a special fusion card

### 3D — Shop System

```
┌─────────────── SHOP ─────────────────┐
│                                       │
│  💰 Gold: 47                          │
│                                       │
│  ┌─────┐  ┌─────┐  ┌─────┐          │
│  │Relic│  │Relic│  │Relic│  Relics   │
│  │ $15 │  │ $20 │  │ $35 │          │
│  └─────┘  └─────┘  └─────┘          │
│                                       │
│  ┌─────┐  ┌─────┐                    │
│  │Card │  │Card │  Card upgrades     │
│  │ $10 │  │ $12 │                    │
│  └─────┘  └─────┘                    │
│                                       │
│  [REROLL $5]         [NEXT ROUND →]  │
└───────────────────────────────────────┘
```

### 3E — Meta-Progression (across runs)

- **Unlock** new relics for the pool
- **Card backs** collection
- **Table felt** colors/patterns
- **Titles** (El Pibe, El Crack, El Campeón, etc.)
- **Statistics** dashboard (win rate, best envido, longest streak)

---

## Stage 4: SH! Extreme Version

### 4A — Visual Overhaul

**Color Swap:**
| Vanilla | SH! Extreme |
|---------|-------------|
| #0a0a1a (dark blue) | #1D1D1B (Pure Black) |
| Cyan/Magenta neon | #F7AF1C (Honey) glow |
| Inter font | PP Neue Montreal (-0.02em tracking) |
| Star particles | Hexagon particles |

**SH! Design Elements:**
- Hexagonal card frames instead of rounded rectangles
- Honeycomb pattern background (subtle, animated)
- (Sh!)™ logo in corner (WHITE variant on dark bg)
- Honey drip animations on score changes
- Card glow in Honey color (#F7AF1C)
- Table felt with hexagonal texture

### 4B — SH! Exclusive Gameplay

**SH! Relics (brand-themed):**
- ⚡ **Sh! Energy Boost** — Play 2 cards in one turn (once per round)
- 🐝 **Panal de Miel** — Honeycomb shield: block one opponent truco call
- 🏟️ **Camiseta de De Paul** — Channel #7's luck: redraw one card
- 🔇 **Shhhhh!** — Silence opponent's envido call (once per run)
- 🍯 **Miel Dorada** — Gold earnings doubled this stage

**SH! Game Modes:**
- **Turbo Truco** — 15-second turn timer, faster pace
- **Depende de Vos** — Choose your opponent's handicap
- **Honey Rush** — Collect honey tokens, spend for power-ups mid-hand
- **Extreme Blitz** — First to 15, no flor, pure aggression

### 4C — SH! UI Extras

- Animated SH! can on the table
- Honey-gold card trail effects
- Victory screen: SH! branded celebration with hexagon confetti
- (Sh!) Depende de vos watermark on winning screen
- Sound design: energetic, bass-heavy (implied, visual cues for now)

---

## File Structure

```
truco-roguelike/
├── server/
│   ├── index.js              — Express + Socket.io server
│   ├── truco-engine.js       — Full Truco rules engine
│   ├── room-manager.js       — Room creation/management
│   ├── bot-ai.js             — Bot player logic
│   ├── matchmaking.js        — Queue + skill matching
│   └── roguelike/
│       ├── run-manager.js    — Run progression
│       ├── relics.js         — All relic definitions
│       ├── shop.js           — Shop generation
│       └── bosses.js         — Boss encounters
│
├── client/
│   ├── index.html            — Entry point
│   ├── app.jsx               — Main React app
│   ├── components/
│   │   ├── Card.jsx          — Card component with animations
│   │   ├── Hand.jsx          — Player hand
│   │   ├── Table.jsx         — Play area
│   │   ├── ScoreBoard.jsx    — Score display
│   │   ├── CallOverlay.jsx   — Envido/Truco call UI
│   │   ├── Lobby.jsx         — Game lobby
│   │   ├── WaitingRoom.jsx   — Pre-game room
│   │   ├── Shop.jsx          — Between-round shop
│   │   ├── RelicBar.jsx      — Active relics display
│   │   ├── RunMap.jsx        — Roguelike progression map
│   │   └── GameOver.jsx      — End screen
│   ├── styles/
│   │   ├── vanilla.css       — Vanilla theme
│   │   └── sh-extreme.css    — SH! branded theme
│   └── assets/
│       ├── cards/            — Card face SVGs
│       └── fonts/            — PP Neue Montreal (SH! ver)
│
├── package.json
└── README.md
```

---

## Build Order

### Phase 1: Playable Prototype (THIS SESSION)
1. ✅ Truco rules engine with full card hierarchy
2. ✅ Single-player vs bot (Normal difficulty)
3. ✅ Balatro-style UI with card animations
4. ✅ Envido + Truco calling system
5. ✅ Score tracking to 30

### Phase 2: Multiplayer
6. Socket.io server setup
7. Room creation + joining
8. Lobby UI
9. Waiting room with bot fill
10. 2v2 mode with señas

### Phase 3: Roguelike
11. Run structure + stage progression
12. Relic system
13. Shop between rounds
14. Boss encounters
15. Meta-progression + unlocks

### Phase 4: SH! Extreme
16. Theme swap (colors, fonts, hexagons)
17. SH! exclusive relics
18. SH! game modes
19. Polish + branding
20. Final testing

---

## Argentine Truco Quick Reference

**Card Hierarchy (highest → lowest):**
1. Ancho de Espadas (1♠)
2. Ancho de Bastos (1♣)
3. Siete de Espadas (7♠)
4. Siete de Oros (7♦)
5. All 3s
6. All 2s
7. Aces of Copas & Oros
8. All 12s (Reyes)
9. All 11s (Caballos)
10. All 10s (Sotas)
11. 7s of Copas & Bastos
12. All 6s
13. All 5s
14. All 4s

**Envido Scoring:**
- Two cards same suit: sum last digits + 20
- No match: highest single card's last digit
- Example: 5♠ + 7♠ = 5+7+20 = 32
- Example: 2♠ + 4♦ = max(2,4) = 4

**Point Values:**
- Game plays to 30 (15 in short mode)
- "Buenas" = 15 points (halfway mark, triggers special rules in some variants)
