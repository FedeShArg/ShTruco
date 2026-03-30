# ShTruco — Conversation Log

Full development log of the Truco Sh! card game, built through iterative conversation.

---

## Session 1: Understanding the Project

**User:** "Can you look into this project and understand what it is about"

**Claude:** Analyzed the existing codebase — a single-file HTML Argentine Truco card game with a Spanish deck (40 cards), card hierarchy system, Envido/Truco calling mechanics, and a bot AI opponent. Identified the core architecture: `CARD_HIERARCHY`, `gameState`, `dealHand()`, `playCard()`, `resolveRound()`, and rendering functions all in one `truco.html` file.

---

## Session 2: Full QA — Testing All Rules

**User:** "Yeah I need a full QA can you try to do everything that is related to the rules at least 4 times, try it out yourself first"

**Claude:** Wrote 152 automated test cases (`truco-qa-tests.js`) covering:

- Card hierarchy (40 cards, proper ordering, tie handling)
- Envido scoring (same-suit pairs, figuras worth 0, highest card alone)
- Trick resolution (compare cards, parda/tie detection)
- Hand winner determination (2-of-3 tricks, parda edge cases)
- Bot AI (card selection, hand strength evaluation)

### Bugs Found (16 total):

| # | Bug | Severity |
|---|-----|----------|
| 1 | **botChooseResponseCard inverted comparison** — used `=== -1` (finds losing cards) instead of `=== 1` | Critical |
| 2 | **botEvaluateHandStrength inverted** — gave high score to weak cards (`hierarchy > 8 ? 1 : 0.5`) | Critical |
| 3 | **calculateEnvidoScore wrong sort** — sorted by raw card value instead of envido value, so [7,6,10] picked 10+7=27 instead of 7+6=33 | Critical |
| 4 | **Envido awarded 1 point instead of 2** — used `envidoLevel` (1) instead of proper points map | Major |
| 5 | **Card hierarchy: Ace Copas ≠ Ace Oros** — they should tie (same rank) but had different indices | Major |
| 6 | **No early termination** — played all 3 rounds even when winner was clear after 2 | Major |
| 7 | **Bot-leads flow broken** — when bot won a trick and should lead next, it called resolveRound with null player card | Critical |
| 8 | **Bot mutated hand array** — `hand.sort()` mutated `gameState.botHand` directly | Major |
| 9 | **Mazo button never disabled** — always enabled even during decision phases | Minor |
| 10 | **Bot cheated on envido** — could see player's score before deciding | Major |
| 11-16 | Various edge cases in parda resolution, envido chain, truco escalation | Mixed |

---

## Session 3: Bug Fixes — Critical First

**User:** "Start with those, continue with the rest of the different parts"

**Claude:** Fixed all 16 bugs systematically:

- **Card hierarchy:** Added explicit `rank` field to `CARD_HIERARCHY` entries. Aces of Copas and Oros now share rank 6. 7s of Copas and Bastos share rank 10.
- **Bot AI:** Fixed `botChooseResponseCard` to use `compareCards(card, playerCard) === 1`, added tiered strength evaluation (rank≤4→1.0, rank≤8→0.7, rank≤10→0.4, else→0.2), used `[...hand].sort()` to avoid mutation.
- **Envido:** Fixed `calculateEnvidoScore` sort to use `getEnvidoValue()`, created `ENVIDO_POINTS` map `{1:2, 2:4, 3:7, 4:'falta'}`, fixed bot to only evaluate its own hand.
- **Game flow:** Split `botPlayCard` into lead vs respond paths, added early termination checks in `resolveRound`, disabled mazo during decision phases.
- **Implemented full systems:** Envido chain (Envido→Envido→Real Envido→Falta Envido), Truco chain (Truco→Retruco→Vale Cuatro), speech bubble animations, event log/chat system.

Wrote 26 verification tests — 25 passed, 1 false failure (test expectation was wrong, not the code).

---

## Session 4: Bigger Cards with Proper Layout

**User:** "Increase the size of the cards and don't invert the numbers, put them in the sides just like the regular cards"

**Claude:** Resized cards to 120×175px. Created corner-based layout using `.card-corner-tl` (top-left) and `.card-corner-br` (bottom-right) with value + suit symbol. Large suit symbol in `.card-center`. Bottom-right is NOT inverted — same orientation as top-left, like Spanish playing cards.

---

## Session 5: Loco Bot Personality

**User:** "No me canta retruco ni falta envido, haz que el bot sea un loco y te cante cada tanto esas"

**Claude:** Made the bot aggressively crazy:

**Envido (checkBotEnvidoCall):**
- Score 25+: always calls envido
- Score 20+: 75% chance
- Score 15+: 40% chance
- Bluff: 12% even with bad hand
- Can start directly with Real Envido or Falta Envido

**Envido Response (respondBotEnvido):**
- Score 30+: 50% chance to go Falta Envido
- Score 27-29: 60% chance to escalate
- Bluff escalation: 15% with weak hands

**Truco (checkBotTrucoCall):**
- Strength 0.7+: 90% calls
- Strength 0.5+: 65% calls
- Strength 0.35+: 35% bluff
- Weak hand: 12% bluff

**Truco Response (respondBotTruco):**
- Strength 0.6+: accepts + 70% re-raises to Retruco/Vale Cuatro
- Strength 0.4+: accepts + 40% re-raises
- Strength 0.25+: 60% accepts anyway
- Very weak: 20% bluff-accepts

---

## Session 6: Layout Stability + Card Animations

**Claude (continuation):**

**Fixed layout shifting** — all zones (bot hand, table felt, action buttons, player hand, turn indicator) given fixed heights with `min-height` and `flex-shrink: 0`.

**Added animations:**
- `cardDeal` — player cards slide up from below with bounce and slight rotation, staggered by 0.15s each
- `botCardDeal` — bot cards slide down from above
- `roundCardAppear` — cards played to table appear with zoom + 3D rotation
- `cardPlayToTable` — card flies from hand to table

---

## Session 7: Table Announcements

**User:** "Agrega un aviso de ganaste en el campo de juego, lo mismo para el bot y que avise cuando sumo en la ronda"

**Claude:** Added:
- **Trick announcements** — "¡GANASTE!" (gold), "BOT GANA" (silver), "PARDA" (yellow) overlaid on the table felt with dark backdrop, fade-in/fade-out animation
- **Hand winner** — "¡MANO TUYA!" or "BOT GANA MANO" with point count
- **Points badge** — floating "+N" that rises and fades on the table for both truco and envido scoring
- Reorganized table layout: tricks stacked vertically on left, current round cards centered, all fitting within the felt

---

## Session 8: Layout — Everything Inside the Felt

**User:** "Has que todo eso que mostrar entre en el verde del campo de juego"

**Claude:** Restructured the table from vertical to horizontal (`flex-direction: row`). Tricks display as a compact vertical column on the left. Current round cards centered. Round cards shrunk to 85×120px. Trick-pairs are horizontal rows (label + mini cards + result). All fits within the 280px fixed-height felt.

---

## Session 9: CRT Effect + Trippy Background

**User:** "Can you add a CRT background effect and a trippy moving background"

**Claude:** Added:
- **CRT overlay** — scanlines (repeating gradient every 3px), subtle flicker animation, vignette (dark edges), color fringing on text
- **Trippy background** — layered radial gradients that shift/rotate, 4 large blurred "blobs" floating across the screen at different speeds, extra floating particles

---

## Session 10: Casino Aesthetic Overhaul

**User:** "Can you change the aesthetic so it is much more casino like"

**Claude:** Complete visual redesign:

| Element | Before | After |
|---------|--------|-------|
| Font | Courier New (monospace) | Georgia (serif) |
| Background | Neon blue/dark | Black + burgundy waves |
| Player color | Neon blue (#66aaff) | Gold (#d4a843) |
| Bot color | Neon pink (#ff6688) | Silver (#c0c0c0) |
| Cards | Dark blue backgrounds | Cream/ivory (#f5f0e0) |
| Card suits | Neon colors | Deep rich tones (navy, forest, crimson, amber) |
| Card backs | Dark grey + gold trim | Burgundy (#8b1c30) + gold "Sh!" |
| Table felt | Basic green | Rich casino green + deep shadows |
| Buttons | Neon bordered | Gold/burgundy with glass backgrounds |
| Overlays | Dark blue glass | Dark mahogany glass + gold borders |
| Score bars | Neon gradients | Gold and silver gradients |

Replaced ALL neon color references across CSS, inline styles, and JavaScript.

---

## Session 11: Black Background + Visible Waves

**User:** "Make the background black but have some waves moving in the background, make them noticeable"

**Claude:** Replaced CSS blob system with a canvas-based wave animation engine:
- Pure black (`#000000`) background
- 8 sine waves rendered in real-time via `<canvas>` + `requestAnimationFrame`
- Waves in gold, burgundy, emerald, and silver tones
- Each wave has a visible stroke line + soft color fill below
- Different speeds, amplitudes, and frequencies so they ripple and cross
- Waves flow continuously in both directions

---

## Session 12: Branding

**User:** "En vez que diga roguelike que diga Truco Sh! y debajo Energia para ser vos"

**Claude:** Updated menu screen title to "TRUCO Sh!" and subtitle to "Energia para ser vos".

---

## Session 13: Player Chat Box

**User:** "Podes agregar un chatbox para que pueda chatear justo abajo de lo que dice partida"

**Claude:** Added interactive chat below the game log:
- Text input field with gold-accented styling
- Send button (►) or Enter key to send
- Player messages appear as "Vos: ..." in gold
- Bot auto-replies with random Argentine truco trash talk (18 phrases):
  - "¿Querés truco? Dale nomás."
  - "Te falta calle, pibe."
  - "Yo con un 4 de copas te gano."
  - "Seguí jugando así que me conviene."
  - etc.
- Bot reply appears after 0.6-1.6s delay with speech bubble

---

## Technical Architecture

### Single File: `truco.html` (~2800 lines)

**CSS (~1100 lines):** Casino theme, card layouts, animations, CRT effects, overlays, chat styling

**HTML (~200 lines):** Menu screen, game screen (header, score bars, bot hand, table felt, action buttons, player hand, turn indicator, chat), call overlays (envido, truco, envido reveal), game over screen

**JavaScript (~1500 lines):**
- Game constants (suits, deck, hierarchy, envido/truco points)
- Game state management
- Card dealing, playing, round resolution
- Hand winner determination with parda logic
- Envido system (call, escalate, respond, reveal)
- Truco system (call, escalate, respond)
- Bot AI (hand strength, card selection, aggressive "loco" personality)
- Rendering (scores, hands, table, buttons, turn indicator)
- Animations (deal, play, announcements, speech bubbles)
- Chat system (game log + player chat with bot replies)
- Canvas wave background animation

### Key Game Rules Implemented
- Spanish deck: 40 cards (1-7, 10-12 in 4 suits)
- Card hierarchy with proper tie handling (rank field)
- Envido chain: Envido(2) → Envido(4) → Real Envido(7) → Falta Envido(remaining to 30)
- Truco chain: Truco(2) → Retruco(3) → Vale Cuatro(4)
- First to 30 points wins
- Mano advantage on ties
- Parda resolution across all 3 rounds
- "Sin flor" variant (Flor not implemented)
