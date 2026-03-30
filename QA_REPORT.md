# TRUCO QA REPORT

**Date:** March 27, 2026
**File tested:** `truco.html`
**Tests run:** 152 | **Passed:** 132 | **Failed:** 20
**Unique bugs found:** 16

---

## CRITICAL BUGS (Game-breaking)

### 1. Bot response card logic is inverted
**Location:** `botChooseResponseCard()` ~line 1322
**Issue:** `compareCards(card, playerCard) === -1` checks for cards that LOSE, not win. The bot always plays its worst card when responding.
**Fix:** Change `=== -1` to `=== 1`.

### 2. Bot hand strength evaluation is inverted
**Location:** `botEvaluateHandStrength()` ~line 1334
**Issue:** `getCardHierarchy(card) > 8` gives higher strength to WORSE cards (hierarchy index 0 = best, 15 = worst). The bot thinks 4s and 5s are strong and Anchos are weak.
**Impact:** Bot calls truco with bad hands, accepts truco with bad hands, and makes wrong decisions consistently.
**Fix:** Flip the comparison to `getCardHierarchy(card) < 8`.

### 3. Envido awards wrong points
**Location:** `respondEnvido()` ~line 1383
**Issue:** Awards `envidoLevel` (which is `1`) instead of `2` points for Envido quiero. Per Argentine Truco rules, Envido = 2 points.
**Fix:** Use a proper point mapping: `{1: 2, 2: 2, 3: 3, 4: falta}` or set envidoLevel to the actual point value.

### 4. Envido scoring incorrect with 3 same-suit cards including figuras
**Location:** `calculateEnvidoScore()` ~line 942
**Issue:** Sorts cards by raw value (`b.value - a.value`) instead of by envido value. When 3 cards of the same suit include figuras (10/11/12), the function picks the two highest raw values (e.g., 12 and 11) instead of the two highest envido values (e.g., 7 and 6).
**Example:** Hand `[7♦, 6♦, 10♦]` → code returns 27 (0+7+20), correct answer is 33 (7+6+20).
**Example:** Hand `[5♥, 12♥, 11♥]` → code returns 20 (0+0+20), correct answer is 25 (5+0+20).
**Fix:** Sort by `getEnvidoValue()` instead of raw value: `suits[suit].sort((a, b) => getEnvidoValue(b) - getEnvidoValue(a))`.

---

## MODERATE BUGS (Gameplay issues)

### 5. Card hierarchy: equal-rank cards treated as different ranks
**Location:** `CARD_HIERARCHY` ~lines 841-847
**Issue:** Ace of Copas (rank 6) and Ace of Oros (rank 7) have different ranks, but per Argentine Truco rules they should be EQUAL. Same for 7 de Copas (rank 11) and 7 de Bastos (rank 12).
**Fix:** Give them the same index, or modify `getCardHierarchy` to return the same rank for these pairs.

### 6. No early termination after 2 tricks won
**Location:** `resolveRound()` ~line 1079
**Issue:** The hand always plays all 3 rounds even if one player already won 2 tricks. Wastes time and can affect strategy.
**Fix:** After incrementing `currentRound`, check if either player has 2 wins and call `finishHand()` early.

### 7. Bot cheats on envido decisions
**Location:** `respondBotEnvido()` ~line 1359
**Issue:** Bot calculates and sees the player's exact envido score before deciding to accept. In real Truco, you don't know the opponent's score.
**Fix:** Bot should decide based only on its own score and a probability model.

### 8. Bot mutates its own hand via in-place sort
**Location:** `botChooseLeadCard()` / `botChooseResponseCard()` ~lines 1309, 1321
**Issue:** `hand.sort()` mutates `gameState.botHand` directly, potentially causing display and logic issues as the card order changes.
**Fix:** Use `[...hand].sort()` to sort a copy.

### 9. Mazo button never disabled
**Location:** `renderButtons()` ~line 1682
**Issue:** `mazoBtn.disabled = false` always. Player can fold during envido/truco decision overlays, which shouldn't be allowed.
**Fix:** Disable mazo during `envido_decision` and `truco_decision` turnPhases.

---

## MINOR BUGS / MISSING FEATURES

### 10. Envido escalation chain not implemented
**Expected:** Envido (2pts) → Envido (2pts) → Real Envido (3pts) → Falta Envido (remaining to 30)
**Actual:** Only a single Envido call is supported, no escalation.

### 11. Truco escalation not implemented
**Expected:** Truco (2pts) → Retruco (3pts) → Vale Cuatro (4pts)
**Actual:** Only initial Truco call, no retruco or vale cuatro options for player or bot.

### 12. Flor system not implemented
**Expected:** Flor (3 same suit) = 3pts, Contraflor, Contraflor al Resto
**Actual:** No flor detection or scoring exists.

### 13. Bot never folds
**Issue:** No bot mazo logic — the bot never goes to mazo regardless of hand quality.

### 14. Bot envido calling is too conservative
**Issue:** Bot only calls envido when score ≥ 30 AND it's behind in game score. In practice, the bot almost never calls envido.

---

## WHAT WORKS CORRECTLY

- Card deck: 40 cards, correct suits, correct values, no 8s/9s
- Card hierarchy: 14 of 16 rank tiers are correct (all except the Copas/Oros equal-rank pairs)
- Envido scoring: correct for 2 same-suit cards and no-match hands
- Envido tie goes to mano
- Hand winner determination with pardas (all 10 scenarios tested correctly)
- Mano rotation after each hand
- Game ends at 30 points
- Truco pointsAtStake mechanism
- Truco blocked while envido is available
- Mazo awards correct points and rotates mano
- Dealing 3 cards per player from shuffled deck
- Turn indicator logic

---

## PRIORITY FIX ORDER

1. **botChooseResponseCard** — inverted comparison (bot is broken)
2. **botEvaluateHandStrength** — inverted logic (bot decisions all wrong)
3. **calculateEnvidoScore** — sort by envido value not raw value
4. **respondEnvido** — award 2 points, not 1
5. **CARD_HIERARCHY** — equal ranks for Copas/Oros aces and 7s
6. **Early termination** — end hand when 2 tricks won
7. **Bot sort mutation** — use spread operator
8. **Mazo button** — disable during overlays
9. **Bot envido cheating** — don't peek at player score
