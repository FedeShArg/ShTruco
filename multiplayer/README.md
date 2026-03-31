# ShTruco — Multiplayer Argentine Truco

Multiplayer Argentine Truco card game built for **Shhhhhh! Energy Drink**. Real-time gameplay with Node.js, Express, and Socket.io. Single HTML client with no build step.

## How to Run

```bash
cd server
npm install
node index.js
```

Server starts on `http://localhost:3000` by default.

## Project Structure

```
multiplayer/
├── client/
│   ├── index.html            # Entire frontend (HTML + CSS + JS, ~3400 lines)
│   ├── pack-transparente.png # Sh! Energy Drink lata image (watermarks)
│   ├── lobby-music.mp3       # Background music for lobby
│   └── game-music.mp3        # Background music for in-game
├── server/
│   ├── index.js              # Express + Socket.io entry point
│   ├── package.json          # Dependencies
│   ├── .env                  # Environment variables
│   ├── auth/
│   │   └── auth.js           # JWT authentication
│   ├── db/
│   │   └── database.js       # SQLite (sql.js) user database
│   ├── game/
│   │   └── truco-engine.js   # Server-authoritative game engine
│   ├── rooms/
│   │   └── room-manager.js   # Room creation, joining, lifecycle
│   └── socket/
│       └── socket-handler.js # All Socket.io event handlers + lobby bots
```

## Tech Stack

- **Backend**: Node.js, Express 5, Socket.io 4
- **Frontend**: Vanilla HTML/CSS/JS (single file, no framework)
- **Database**: sql.js (SQLite in-memory with file persistence)
- **Auth**: JWT + bcryptjs
- **Real-time**: WebSockets via Socket.io

## Game Features

### Core Gameplay
- Full Argentine Truco rules with Spanish 40-card deck
- 1v1 and 2v2 game modes
- Envido (envido, real envido, falta envido) with proper point calculation
- Truco escalation (truco, re-truco, vale cuatro)
- Server-authoritative engine — all game logic validated server-side
- Flor detection and scoring

### Scoring System
- Fósforo (matchstick) visual counter: izquierda(1), arriba(2), derecha(3), abajo(4), diagonal(5)
- Score bar at top of game screen
- First to 30 points wins (15 in malas, 15 in buenas)

### Lobby System
- Public and private rooms
- Real-time lobby chat
- 12 AI lobby bots that chat, trash-talk, and create rooms to make the lobby feel alive
- Bot rooms auto-close after 60-120 seconds if nobody joins

### UI/UX
- Black + gold branding (Sh! Energy Drink theme)
- Animated golden particle canvas background
- Raining lata watermarks (18 cans, 15% opacity, CSS animation)
- Background music with mute toggle (lobby track + game track)
- Mobile-responsive layout with collapsible chat
- Fingerprint-based DOM rendering to prevent card jump animations
- Fixed-height layout sections to prevent table shifting
- Card deal animations (subtle, no bouncing)

## Architecture Notes

### Client Rendering
The client uses a fingerprint system to avoid unnecessary DOM rebuilds. When game state updates arrive, the table and hand areas compute a JSON fingerprint of the relevant data. The DOM only rebuilds if the fingerprint changed. This prevents cards from re-animating when unrelated UI updates occur (like announcements appearing).

### Layout Stability
All game screen sections use fixed heights with `flex-shrink: 0; flex-grow: 0`:
- Opponent area: 100px
- Table felt: 280px (fixed, not flex-growing)
- Action buttons: 42px
- Player hand row: 125px
- Turn indicator: 25px

This prevents the playing field from shifting when cards are played or announcements appear.

### Envido Mid-Round Fix
When envido is called after one player has already played a card, the engine correctly assigns the turn to the player who hasn't played yet (rather than resetting to the lead player). A guard in `playCard()` prevents any player from overwriting their already-played card.

### Cache Busting
Express static files are served with `{ etag: false, maxAge: 0 }` to prevent stale CSS/JS during development.

## Key Bugs Fixed

1. **Envido mid-round card loss** — First card played got lost when envido interrupted the round. Fixed turn assignment in `respondEnvido()` and added card-overwrite guard in `playCard()`.
2. **Cards jumping on announcements** — DOM was rebuilding the entire table on every state update. Fixed with fingerprint-based rendering that only rebuilds when card data actually changes.
3. **Table area shifting** — Flex children were growing/shrinking dynamically. Fixed with explicit fixed heights and `flex-shrink: 0` on all game layout sections.
4. **Cards cut off at bottom** — Card deal animation started at `translateY(120px)` pushing cards below the viewport. Changed to `translateY(-40px)` coming from above.
5. **Browser caching stale files** — Added cache-busting headers to Express static middleware.

## Lobby Bots

The server spawns 12 fake players that create atmosphere in the lobby:

- They post trash-talk messages every 8-25 seconds
- They create game rooms every 45-90 seconds (max 2 bot rooms at a time)
- Rooms auto-close if no real player joins within 60-120 seconds
- ~50 unique Argentine slang phrases rotating randomly

## Environment Variables

Create `server/.env`:

```
JWT_SECRET=your_secret_here
PORT=3000
```

## Dependencies

| Package | Purpose |
|---------|---------|
| express | HTTP server + static files |
| socket.io | Real-time WebSocket communication |
| sql.js | SQLite database (no native binaries) |
| bcryptjs | Password hashing |
| jsonwebtoken | JWT auth tokens |
| uuid | Unique room/game IDs |
| cors | Cross-origin support |
| dotenv | Environment variable loading |
