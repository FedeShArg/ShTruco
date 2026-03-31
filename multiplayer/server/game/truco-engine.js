// ============================================================================
// TRUCO GAME ENGINE — Server-side authoritative game logic
// Ported from truco.html single-player version
// ============================================================================

const SUITS = {
    ESPADAS: 'espadas',
    BASTOS: 'bastos',
    COPAS: 'copas',
    OROS: 'oros'
};

const CARD_VALUES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

const CARD_HIERARCHY = [
    { value: 1, suit: SUITS.ESPADAS, rank: 0 },      // Macho
    { value: 1, suit: SUITS.BASTOS, rank: 1 },        // Hembra
    { value: 7, suit: SUITS.ESPADAS, rank: 2 },       // Siete Bravo
    { value: 7, suit: SUITS.OROS, rank: 3 },
    { value: 3, suit: null, rank: 4 },                 // All 3s
    { value: 2, suit: null, rank: 5 },                 // All 2s
    { value: 1, suit: SUITS.COPAS, rank: 6 },
    { value: 1, suit: SUITS.OROS, rank: 6 },
    { value: 12, suit: null, rank: 7 },
    { value: 11, suit: null, rank: 8 },
    { value: 10, suit: null, rank: 9 },
    { value: 7, suit: SUITS.COPAS, rank: 10 },
    { value: 7, suit: SUITS.BASTOS, rank: 10 },
    { value: 6, suit: null, rank: 11 },
    { value: 5, suit: null, rank: 12 },
    { value: 4, suit: null, rank: 13 }
];

const ENVIDO_POINTS = { 1: 2, 2: 4, 3: 7, 4: 'falta' };
const TRUCO_NAMES = { 1: 'Truco', 2: 'Retruco', 3: 'Vale Cuatro' };
const TRUCO_STAKES = { 0: 1, 1: 2, 2: 3, 3: 4 };

function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function createDeck() {
    const deck = [];
    for (const suit of Object.values(SUITS)) {
        for (const value of CARD_VALUES) {
            deck.push({ value, suit });
        }
    }
    return shuffle(deck);
}

function getCardHierarchy(card) {
    for (let i = 0; i < CARD_HIERARCHY.length; i++) {
        const h = CARD_HIERARCHY[i];
        if (h.suit === null && h.value === card.value) return h.rank;
        if (h.suit === card.suit && h.value === card.value) return h.rank;
    }
    return 999;
}

function compareCards(card1, card2) {
    const h1 = getCardHierarchy(card1);
    const h2 = getCardHierarchy(card2);
    if (h1 < h2) return 1;
    if (h2 < h1) return -1;
    return 0;
}

function getEnvidoValue(card) {
    if (card.value >= 10) return 0;
    return card.value;
}

function calculateEnvidoScore(hand) {
    if (hand.length === 0) return 0;
    const suits = {};
    for (const card of hand) {
        if (!suits[card.suit]) suits[card.suit] = [];
        suits[card.suit].push(card);
    }
    for (const suit in suits) {
        if (suits[suit].length >= 2) {
            const sorted = [...suits[suit]].sort((a, b) => getEnvidoValue(b) - getEnvidoValue(a));
            return getEnvidoValue(sorted[0]) + getEnvidoValue(sorted[1]) + 20;
        }
    }
    let max = 0;
    for (const card of hand) {
        max = Math.max(max, getEnvidoValue(card));
    }
    return max;
}

function determineHandWinner(tricks, mano) {
    let playerWins = tricks.filter(t => t.winner === 0).length;
    let botWins = tricks.filter(t => t.winner === 1).length;

    // Handle parda logic
    for (let i = 0; i < tricks.length; i++) {
        if (tricks[i].winner === 2) {
            if (i === 0 && tricks.length > 1 && tricks[1].winner !== 2) {
                // First parda, second decides
                if (tricks[1].winner === 0) playerWins++;
                else botWins++;
            } else if (i === 1 && tricks[0].winner !== 2) {
                // Second parda, first round winner wins
                if (tricks[0].winner === 0) playerWins++;
                else botWins++;
            } else if (i === 2 || (i === 0 && tricks.length > 1 && tricks[1].winner === 2)) {
                // Third parda or first two pardas — mano wins
                if (mano === 0) playerWins++;
                else botWins++;
            }
        }
    }

    if (playerWins > botWins) return 0;
    if (botWins > playerWins) return 1;
    return mano; // Tie: mano wins
}

// ============================================================================
// GAME STATE FACTORY
// ============================================================================

function createGameState(mode = '1v1', options = {}) {
    return {
        mode, // '1v1' or '2v2'
        players: [], // [{id, username, socketId, team, hand, envidoScore}]
        spectators: [],
        scores: [0, 0], // team scores (1v1: player0=team0, player1=team1)
        handNumber: 0,
        mano: 0, // index into players array
        deck: [],
        tricks: [],
        currentRound: 0,
        currentRoundCards: {}, // {playerId: card}
        currentTurnPlayer: null, // playerId whose turn it is
        leadPlayer: null, // who led this round

        envidoCalled: false,
        envidoLevel: 0,
        envidoAccepted: false,
        envidoLastCaller: null,
        envidoResponder: null,

        trucoCalled: false,
        trucoLevel: 0,
        trucoAccepted: false,
        trucoLastCaller: null,
        trucoResponder: null,
        pointsAtStake: 1,

        phase: 'waiting', // waiting, playing, envido_decision, truco_decision, finished
        firstTrickDone: false,
        maxScore: 30,

        // Timer
        timeLimit: options.timeLimit || 0, // 0 = no limit, 5 or 10 = minutes
        startedAt: null, // Date.now() when game started
        timerExpired: false,

        chat: [],
        events: [],
    };
}

// ============================================================================
// BOT AI — "El Loco" personality (aggressive)
// ============================================================================

function botEvaluateHandStrength(hand) {
    if (!hand || hand.length === 0) return 0;
    let totalRank = 0;
    for (const card of hand) {
        const rank = getCardHierarchy(card);
        // Convert rank 0-13 to strength 0-1 (lower rank = stronger)
        totalRank += (13 - rank) / 13;
    }
    return totalRank / hand.length;
}

function botChooseCardIndex(hand, opponentCard) {
    if (!hand || hand.length === 0) return -1;

    if (opponentCard) {
        // Responding: try to win with weakest winning card
        const oppRank = getCardHierarchy(opponentCard);
        let bestWinIdx = -1;
        let bestWinRank = -1;

        for (let i = 0; i < hand.length; i++) {
            const r = getCardHierarchy(hand[i]);
            if (r < oppRank) {
                // This card wins
                if (bestWinIdx === -1 || r > bestWinRank) {
                    bestWinIdx = i;
                    bestWinRank = r;
                }
            }
        }
        if (bestWinIdx !== -1) return bestWinIdx;

        // Can't win — throw weakest
        let worstIdx = 0;
        let worstRank = getCardHierarchy(hand[0]);
        for (let i = 1; i < hand.length; i++) {
            const r = getCardHierarchy(hand[i]);
            if (r > worstRank) { worstIdx = i; worstRank = r; }
        }
        return worstIdx;
    } else {
        // Leading: play strongest card
        let bestIdx = 0;
        let bestRank = getCardHierarchy(hand[0]);
        for (let i = 1; i < hand.length; i++) {
            const r = getCardHierarchy(hand[i]);
            if (r < bestRank) { bestIdx = i; bestRank = r; }
        }
        return bestIdx;
    }
}

function botShouldCallEnvido(envidoScore) {
    if (envidoScore >= 30) return Math.random() < 0.95;
    if (envidoScore >= 27) return Math.random() < 0.80;
    if (envidoScore >= 24) return Math.random() < 0.50;
    if (envidoScore >= 20) return Math.random() < 0.25;
    return Math.random() < 0.08; // Bluff
}

function botShouldAcceptEnvido(envidoScore) {
    if (envidoScore >= 27) return true;
    if (envidoScore >= 24) return Math.random() < 0.80;
    if (envidoScore >= 20) return Math.random() < 0.50;
    return Math.random() < 0.15;
}

function botShouldCallTruco(handStrength) {
    if (handStrength >= 0.7) return Math.random() < 0.90;
    if (handStrength >= 0.5) return Math.random() < 0.65;
    if (handStrength >= 0.35) return Math.random() < 0.35;
    return Math.random() < 0.12; // Bluff loco
}

function botShouldAcceptTruco(handStrength) {
    if (handStrength >= 0.6) return true;
    if (handStrength >= 0.4) return Math.random() < 0.70;
    if (handStrength >= 0.25) return Math.random() < 0.50;
    return Math.random() < 0.20; // Bluff accept
}

function botShouldRaiseTruco(handStrength) {
    if (handStrength >= 0.7) return Math.random() < 0.70;
    if (handStrength >= 0.5) return Math.random() < 0.40;
    return Math.random() < 0.10;
}

function dealHand(state) {
    state.handNumber++;
    state.deck = createDeck();
    state.tricks = [];
    state.currentRound = 0;
    state.currentRoundCards = {};
    state.currentTurnPlayer = null;
    state.leadPlayer = null;

    state.envidoCalled = false;
    state.envidoLevel = 0;
    state.envidoAccepted = false;
    state.envidoLastCaller = null;
    state.envidoResponder = null;

    state.trucoCalled = false;
    state.trucoLevel = 0;
    state.trucoAccepted = false;
    state.trucoLastCaller = null;
    state.trucoResponder = null;
    state.pointsAtStake = 1;
    state.firstTrickDone = false;
    state.phase = 'playing';

    // Deal 3 cards to each player
    for (const player of state.players) {
        player.hand = [];
        for (let i = 0; i < 3; i++) {
            player.hand.push(state.deck.pop());
        }
        player.envidoScore = calculateEnvidoScore(player.hand);
    }

    // Mano player goes first
    state.currentTurnPlayer = state.players[state.mano].id;
    state.leadPlayer = state.players[state.mano].id;

    return {
        type: 'hand_dealt',
        handNumber: state.handNumber,
        mano: state.players[state.mano].id,
        manoUsername: state.players[state.mano].username,
    };
}

function getPlayerTeam(state, playerId) {
    const p = state.players.find(p => p.id === playerId);
    return p ? p.team : -1;
}

function getTeamPlayers(state, team) {
    return state.players.filter(p => p.team === team);
}

function getOpponentTeam(state, playerId) {
    const myTeam = getPlayerTeam(state, playerId);
    return myTeam === 0 ? 1 : 0;
}

// ============================================================================
// PLAY CARD
// ============================================================================

function playCard(state, playerId, cardIndex) {
    if (state.phase !== 'playing') return { error: 'Not in playing phase' };
    if (state.currentTurnPlayer !== playerId) return { error: 'Not your turn' };

    const player = state.players.find(p => p.id === playerId);
    if (!player) return { error: 'Player not found' };
    if (cardIndex < 0 || cardIndex >= player.hand.length) return { error: 'Invalid card index' };

    // Guard: prevent overwriting a card already played this round
    if (state.currentRoundCards[playerId] !== undefined) {
        return { error: 'You already played a card this round' };
    }

    const card = player.hand[cardIndex];
    player.hand.splice(cardIndex, 1);
    state.currentRoundCards[playerId] = card;

    const event = {
        type: 'card_played',
        playerId,
        username: player.username,
        card, // Server sends card face-up after play
    };

    // Check if all active players in this round have played
    const activePlayers = getActiveRoundPlayers(state);
    const allPlayed = activePlayers.every(p => state.currentRoundCards[p.id] !== undefined);

    if (allPlayed) {
        // Resolve round
        return resolveRound(state, event);
    } else {
        // Next player's turn
        state.currentTurnPlayer = getNextPlayer(state, playerId);
        event.nextTurn = state.currentTurnPlayer;
        return event;
    }
}

function getActiveRoundPlayers(state) {
    // In 1v1: both players. In 2v2: one from each team plays per trick
    if (state.mode === '1v1') {
        return state.players;
    }
    // 2v2: for now simplified — all 4 play, but tricks are team-based
    // Actually in 2v2 truco, each player plays their own cards but teams share score
    return state.players;
}

function getNextPlayer(state, currentPlayerId) {
    const idx = state.players.findIndex(p => p.id === currentPlayerId);
    // In 1v1, just the other player
    if (state.mode === '1v1') {
        return state.players[1 - idx].id;
    }
    // In 2v2, rotate: 0 -> 1 -> 2 -> 3 (alternating teams)
    // Seating: [team0-p1, team1-p1, team0-p2, team1-p2]
    const next = (idx + 1) % state.players.length;
    return state.players[next].id;
}

function resolveRound(state, playEvent) {
    // Collect cards per team and find best card for each
    const team0Players = state.players.filter(p => p.team === 0);
    const team1Players = state.players.filter(p => p.team === 1);

    // Find best card on each team
    let bestCard0 = null, bestPlayer0 = null;
    for (const p of team0Players) {
        const c = state.currentRoundCards[p.id];
        if (c && (!bestCard0 || compareCards(c, bestCard0) === 1)) {
            bestCard0 = c;
            bestPlayer0 = p;
        }
    }
    let bestCard1 = null, bestPlayer1 = null;
    for (const p of team1Players) {
        const c = state.currentRoundCards[p.id];
        if (c && (!bestCard1 || compareCards(c, bestCard1) === 1)) {
            bestCard1 = c;
            bestPlayer1 = p;
        }
    }

    const result = compareCards(bestCard0, bestCard1);
    // result: 1 = team0 wins, -1 = team1 wins, 0 = tie
    const trickWinner = result === 0 ? 2 : (result === 1 ? 0 : 1);

    // Store all cards played this round
    const allCards = { ...state.currentRoundCards };
    state.tricks.push({
        cards: allCards,
        winner: trickWinner, // 0 = team0, 1 = team1, 2 = parda
    });

    state.currentRound++;
    state.currentRoundCards = {};
    if (state.currentRound === 1) state.firstTrickDone = true;

    // Check for early termination
    const team0Wins = state.tricks.filter(t => t.winner === 0).length;
    const team1Wins = state.tricks.filter(t => t.winner === 1).length;
    const earlyWin = team0Wins >= 2 || team1Wins >= 2;
    const pardaEarlyWin = state.tricks.length >= 2 &&
        state.tricks[0].winner === 2 && state.tricks[1].winner !== 2;

    const roundLabel = ['1ra', '2da', '3ra'][state.currentRound - 1];
    const roundResult = {
        type: 'round_resolved',
        playEvent,
        round: state.currentRound,
        roundLabel,
        trickWinner,
        cards: allCards,
    };

    if (state.currentRound >= 3 || earlyWin || pardaEarlyWin) {
        // Hand is over
        const handResult = finishHand(state);
        roundResult.handResult = handResult;
        return roundResult;
    }

    // Determine who leads next round
    if (trickWinner === 2) {
        // Parda: mano leads
        state.currentTurnPlayer = state.players[state.mano].id;
        state.leadPlayer = state.players[state.mano].id;
    } else {
        // Winning team's best card player leads (or first player on winning team)
        const winningPlayer = trickWinner === 0 ? bestPlayer0 : bestPlayer1;
        state.currentTurnPlayer = winningPlayer ? winningPlayer.id : state.players[state.mano].id;
        state.leadPlayer = state.currentTurnPlayer;
    }
    roundResult.nextTurn = state.currentTurnPlayer;

    return roundResult;
}

function finishHand(state) {
    const winner = determineHandWinner(state.tricks, state.mano);
    const points = state.pointsAtStake;

    state.scores[winner] += points;

    const result = {
        type: 'hand_finished',
        winner,
        winnerTeam: winner,
        points,
        scores: [...state.scores],
    };

    // Check game over
    if (state.scores[winner] >= state.maxScore) {
        state.phase = 'finished';
        result.gameOver = true;
        result.gameWinner = winner;
        return result;
    }

    // Rotate mano
    state.mano = (state.mano + 1) % state.players.length;
    if (state.mode === '1v1') {
        state.mano = 1 - state.mano < 0 ? 0 : 1 - (state.mano - 1);
        // Simplified: just alternate
        state.mano = state.handNumber % 2;
    }

    return result;
}

// ============================================================================
// ENVIDO
// ============================================================================

function callEnvido(state, playerId, level) {
    // level: 'envido', 'real_envido', 'falta_envido'
    if (state.firstTrickDone) return { error: 'Envido can only be called in first trick' };
    if (state.envidoAccepted) return { error: 'Envido already resolved' };

    const player = state.players.find(p => p.id === playerId);
    if (!player) return { error: 'Player not found' };

    // Can't call envido on yourself
    if (state.envidoLastCaller === playerId) return { error: 'Cannot raise your own envido' };

    let newLevel = state.envidoLevel;
    if (level === 'envido') {
        if (state.envidoLevel >= 2) return { error: 'Max envido reached, use real or falta' };
        newLevel = state.envidoLevel + 1;
    } else if (level === 'real_envido') {
        if (state.envidoLevel >= 3) return { error: 'Already at real envido or higher' };
        newLevel = 3;
    } else if (level === 'falta_envido') {
        newLevel = 4;
    }

    state.envidoCalled = true;
    state.envidoLevel = newLevel;
    state.envidoLastCaller = playerId;
    state.phase = 'envido_decision';

    // The other player(s) must respond
    const opponentTeam = getOpponentTeam(state, playerId);
    const responders = getTeamPlayers(state, opponentTeam);
    if (!responders || responders.length === 0) return { error: 'No opponents found' };
    state.envidoResponder = responders[0].id;

    const levelName = level === 'envido' ? 'Envido' :
                      level === 'real_envido' ? 'Real Envido' : 'Falta Envido';

    return {
        type: 'envido_called',
        playerId,
        username: player.username,
        level: newLevel,
        levelName,
        responderId: state.envidoResponder,
    };
}

function respondEnvido(state, playerId, accept) {
    if (state.phase !== 'envido_decision') return { error: 'No envido pending' };
    if (state.envidoResponder !== playerId) return { error: 'Not your turn to respond' };

    const player = state.players.find(p => p.id === playerId);

    if (accept) {
        state.envidoAccepted = true;
        state.phase = 'playing';

        // Calculate scores and determine winner
        const scores = {};
        for (const p of state.players) {
            scores[p.id] = { score: p.envidoScore, username: p.username, team: p.team };
        }

        // Find winner by team
        let team0Best = 0, team1Best = 0;
        for (const p of state.players) {
            if (p.team === 0) team0Best = Math.max(team0Best, p.envidoScore);
            else team1Best = Math.max(team1Best, p.envidoScore);
        }

        let envidoWinner;
        if (team0Best > team1Best) envidoWinner = 0;
        else if (team1Best > team0Best) envidoWinner = 1;
        else envidoWinner = state.mano < state.players.length / 2 ? 0 : 1; // Mano wins ties

        // Calculate points
        let envidoPoints;
        if (state.envidoLevel === 4) {
            // Falta envido: remaining points to win
            const loserScore = state.scores[1 - envidoWinner];
            envidoPoints = state.maxScore - loserScore;
        } else {
            envidoPoints = ENVIDO_POINTS[state.envidoLevel] || 2;
        }

        state.scores[envidoWinner] += envidoPoints;

        // After envido resolves, turn goes to whoever HASN'T played a card yet.
        // If one player played before envido was called, the other must play next.
        const playersWhoPlayed = Object.keys(state.currentRoundCards);
        if (playersWhoPlayed.length > 0) {
            // Someone already played — give turn to the one who hasn't
            const notPlayed = state.players.find(p => !state.currentRoundCards[p.id]);
            state.currentTurnPlayer = notPlayed ? notPlayed.id : state.leadPlayer;
        } else {
            state.currentTurnPlayer = state.leadPlayer;
        }

        return {
            type: 'envido_resolved',
            accepted: true,
            scores,
            envidoWinner,
            envidoPoints,
            gameScores: [...state.scores],
            gameOver: state.scores[envidoWinner] >= state.maxScore,
        };
    } else {
        // Rejected — caller gets previous level points
        state.phase = 'playing';
        const callerTeam = getOpponentTeam(state, playerId);
        const rejectPoints = state.envidoLevel <= 1 ? 1 : ENVIDO_POINTS[state.envidoLevel - 1] || 1;
        state.scores[callerTeam] += rejectPoints;

        // After envido resolves, turn goes to whoever HASN'T played a card yet.
        const playersWhoPlayed = Object.keys(state.currentRoundCards);
        if (playersWhoPlayed.length > 0) {
            const notPlayed = state.players.find(p => !state.currentRoundCards[p.id]);
            state.currentTurnPlayer = notPlayed ? notPlayed.id : state.leadPlayer;
        } else {
            state.currentTurnPlayer = state.leadPlayer;
        }

        return {
            type: 'envido_resolved',
            accepted: false,
            rejectPoints,
            winnerTeam: callerTeam,
            gameScores: [...state.scores],
            gameOver: state.scores[callerTeam] >= state.maxScore,
        };
    }
}

// ============================================================================
// TRUCO
// ============================================================================

function callTruco(state, playerId) {
    if (state.phase === 'envido_decision') return { error: 'Resolve envido first' };
    if (state.trucoLastCaller === playerId) return { error: 'Cannot raise your own truco' };
    if (state.trucoLevel >= 3) return { error: 'Already at Vale Cuatro' };

    const player = state.players.find(p => p.id === playerId);
    if (!player) return { error: 'Player not found' };

    state.trucoLevel++;
    state.trucoCalled = true;
    state.trucoLastCaller = playerId;
    state.phase = 'truco_decision';

    const opponentTeam = getOpponentTeam(state, playerId);
    const responders = getTeamPlayers(state, opponentTeam);
    if (!responders || responders.length === 0) {
        state.trucoLevel--;
        return { error: 'No opponents found' };
    }
    state.trucoResponder = responders[0].id;

    return {
        type: 'truco_called',
        playerId,
        username: player.username,
        level: state.trucoLevel,
        levelName: TRUCO_NAMES[state.trucoLevel],
        responderId: state.trucoResponder,
    };
}

function respondTruco(state, playerId, response) {
    // response: 'accept', 'reject', 'raise'
    if (state.phase !== 'truco_decision') return { error: 'No truco pending' };
    if (state.trucoResponder !== playerId) return { error: 'Not your turn to respond' };

    const player = state.players.find(p => p.id === playerId);

    if (response === 'accept') {
        state.trucoAccepted = true;
        state.pointsAtStake = TRUCO_STAKES[state.trucoLevel];
        state.phase = 'playing';

        // After truco resolves, turn goes to whoever HASN'T played a card yet
        const playersWhoPlayed = Object.keys(state.currentRoundCards);
        if (playersWhoPlayed.length > 0) {
            const notPlayed = state.players.find(p => !state.currentRoundCards[p.id]);
            state.currentTurnPlayer = notPlayed ? notPlayed.id : (state.leadPlayer || state.players[state.mano].id);
        } else {
            state.currentTurnPlayer = state.leadPlayer || state.players[state.mano].id;
        }

        return {
            type: 'truco_resolved',
            accepted: true,
            level: state.trucoLevel,
            pointsAtStake: state.pointsAtStake,
            nextTurn: state.currentTurnPlayer,
        };
    } else if (response === 'reject') {
        // Caller wins previous stake
        const callerTeam = getOpponentTeam(state, playerId);
        const pts = TRUCO_STAKES[state.trucoLevel - 1] || 1;
        state.scores[callerTeam] += pts;
        state.phase = 'playing';

        return {
            type: 'truco_resolved',
            accepted: false,
            winnerTeam: callerTeam,
            points: pts,
            gameScores: [...state.scores],
            gameOver: state.scores[callerTeam] >= state.maxScore,
            handOver: true,
        };
    } else if (response === 'raise') {
        // Re-raise
        if (state.trucoLevel >= 3) return { error: 'Already at max level' };
        return callTruco(state, playerId);
    }
}

// ============================================================================
// MAZO (fold)
// ============================================================================

function goToMazo(state, playerId) {
    if (state.phase === 'finished') return { error: 'Game is over' };

    const player = state.players.find(p => p.id === playerId);
    if (!player) return { error: 'Player not found' };

    const opponentTeam = getOpponentTeam(state, playerId);
    const pts = state.pointsAtStake;
    state.scores[opponentTeam] += pts;

    return {
        type: 'mazo',
        playerId,
        username: player.username,
        winnerTeam: opponentTeam,
        points: pts,
        gameScores: [...state.scores],
        gameOver: state.scores[opponentTeam] >= state.maxScore,
        handOver: true,
    };
}

module.exports = {
    SUITS, CARD_VALUES, CARD_HIERARCHY, ENVIDO_POINTS, TRUCO_NAMES, TRUCO_STAKES,
    createDeck, compareCards, calculateEnvidoScore, getCardHierarchy, getEnvidoValue,
    createGameState, dealHand, playCard, callEnvido, respondEnvido,
    callTruco, respondTruco, goToMazo, determineHandWinner,
    getPlayerTeam, getOpponentTeam, getTeamPlayers,
    // Bot AI
    botEvaluateHandStrength, botChooseCardIndex,
    botShouldCallEnvido, botShouldAcceptEnvido,
    botShouldCallTruco, botShouldAcceptTruco, botShouldRaiseTruco,
};
