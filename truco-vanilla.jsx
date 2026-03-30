import { useState, useEffect, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════
   TRUCO ROGUELIKE — Stage 1: Vanilla Core
   Full Argentine Truco · Balatro Aesthetics · Bot Opponent
   ═══════════════════════════════════════════════════════════════ */

// ─── CONSTANTS ────────────────────────────────────────────────

const SUITS = {
  espadas: { name: "Espadas", symbol: "⚔", color: "#66aaff", bg: "#1a2a4a" },
  bastos: { name: "Bastos", symbol: "♣", color: "#66dd88", bg: "#1a3a2a" },
  copas: { name: "Copas", symbol: "♥", color: "#ff6688", bg: "#3a1a2a" },
  oros: { name: "Oros", symbol: "◆", color: "#ffcc44", bg: "#3a2a1a" },
};

const VALUES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const DISPLAY_NAMES = { 10: "Sota", 11: "Caballo", 12: "Rey" };

// Card hierarchy: lower rank = more powerful
function getCardRank(card) {
  const { value, suit } = card;
  if (value === 1 && suit === "espadas") return 1;
  if (value === 1 && suit === "bastos") return 2;
  if (value === 7 && suit === "espadas") return 3;
  if (value === 7 && suit === "oros") return 4;
  if (value === 3) return 5;
  if (value === 2) return 6;
  if (value === 1 && (suit === "copas" || suit === "oros")) return 7;
  if (value === 12) return 8;
  if (value === 11) return 9;
  if (value === 10) return 10;
  if (value === 7 && (suit === "copas" || suit === "bastos")) return 11;
  if (value === 6) return 12;
  if (value === 5) return 13;
  if (value === 4) return 14;
  return 15;
}

function getEnvidoValue(value) {
  return value >= 10 ? 0 : value;
}

function calculateEnvido(hand) {
  let best = 0;
  // Check pairs of same suit
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (hand[i].suit === hand[j].suit) {
        const score = getEnvidoValue(hand[i].value) + getEnvidoValue(hand[j].value) + 20;
        best = Math.max(best, score);
      }
    }
    // Also check single card
    best = Math.max(best, getEnvidoValue(hand[i].value));
  }
  // Check triplet (all 3 same suit) - use best pair
  if (hand[0].suit === hand[1].suit && hand[1].suit === hand[2].suit) {
    const vals = hand.map(c => getEnvidoValue(c.value)).sort((a, b) => b - a);
    best = Math.max(best, vals[0] + vals[1] + 20);
  }
  return best;
}

function compareCards(a, b) {
  const rankA = getCardRank(a);
  const rankB = getCardRank(b);
  if (rankA < rankB) return -1; // a wins
  if (rankA > rankB) return 1;  // b wins
  return 0; // tie
}

function createDeck() {
  const deck = [];
  for (const suit of Object.keys(SUITS)) {
    for (const value of VALUES) {
      deck.push({
        id: `${value}_${suit}`,
        value,
        suit,
        rank: getCardRank({ value, suit }),
        displayName: DISPLAY_NAMES[value] || String(value),
      });
    }
  }
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardLabel(card) {
  return `${card.displayName} de ${SUITS[card.suit].name}`;
}

// ─── ENVIDO SCORING ───────────────────────────────────────────

// Envido call chain tracking
// Each call: { type, addedValue }
// quiero value = sum of all addedValues
// no quiero value = sum of all except last, minimum 1
const ENVIDO_CALLS = {
  envido: { label: "Envido", value: 2 },
  real_envido: { label: "Real Envido", value: 3 },
  falta_envido: { label: "Falta Envido", value: 0 }, // dynamic
};

function getEnvidoQuieroValue(calls, playerScore, botScore, faltaTarget = 30) {
  let total = 0;
  for (const call of calls) {
    if (call.type === "falta_envido") {
      // Falta envido: points needed for the LOSING player to reach target
      const loserScore = Math.min(playerScore, botScore);
      total = faltaTarget - loserScore;
    } else {
      total += ENVIDO_CALLS[call.type].value;
    }
  }
  return total;
}

function getEnvidoNoQuieroValue(calls) {
  if (calls.length <= 1) return 1;
  // Sum all except the last call
  let total = 0;
  for (let i = 0; i < calls.length - 1; i++) {
    total += ENVIDO_CALLS[calls[i].type]?.value || 0;
  }
  return Math.max(total, 1);
}

// ─── TRUCO SCORING ────────────────────────────────────────────

const TRUCO_LEVELS = {
  1: { label: "—", quiero: 1, noQuiero: 1 },
  2: { label: "Truco", quiero: 2, noQuiero: 1 },
  3: { label: "Retruco", quiero: 3, noQuiero: 2 },
  4: { label: "Vale Cuatro", quiero: 4, noQuiero: 3 },
};

// ─── BOT AI (Normal Difficulty) ───────────────────────────────

function botShouldCallEnvido(hand, botScore, playerScore) {
  const envido = calculateEnvido(hand);
  if (envido >= 31) return 0.9;
  if (envido >= 28) return 0.65;
  if (envido >= 25) return 0.35;
  if (envido >= 20) return 0.1;
  return 0;
}

function botShouldCallTruco(hand, cardsPlayed, trucoLevel) {
  const remaining = hand.filter(c => !cardsPlayed.includes(c.id));
  const avgRank = remaining.reduce((s, c) => s + c.rank, 0) / (remaining.length || 1);
  const bestRank = Math.min(...remaining.map(c => c.rank));
  if (trucoLevel >= 3 && bestRank > 4) return 0;
  if (bestRank <= 2) return 0.7;
  if (bestRank <= 4 && avgRank <= 7) return 0.45;
  if (avgRank <= 6) return 0.25;
  return 0.05;
}

function botRespondEnvido(hand, calls, botScore, playerScore) {
  const envido = calculateEnvido(hand);
  const quieroVal = getEnvidoQuieroValue(calls, playerScore, botScore);
  if (envido >= 30) return "quiero";
  if (envido >= 27 && quieroVal <= 4) return "quiero";
  if (envido >= 25 && quieroVal <= 2) return "quiero";
  // Sometimes raise
  if (envido >= 31 && calls.length === 1 && Math.random() > 0.5) return "raise_real";
  if (envido >= 28 && Math.random() > 0.75) return "raise_envido";
  if (envido < 23) return "no_quiero";
  return Math.random() > 0.4 ? "quiero" : "no_quiero";
}

function botRespondTruco(hand, cardsPlayed, trucoLevel) {
  const remaining = hand.filter(c => !cardsPlayed.includes(c.id));
  const bestRank = Math.min(...remaining.map(c => c.rank));
  const avgRank = remaining.reduce((s, c) => s + c.rank, 0) / (remaining.length || 1);
  // Accept thresholds
  if (trucoLevel === 2) {
    if (bestRank <= 4) return Math.random() > 0.15 ? "quiero" : "raise";
    if (avgRank <= 7) return "quiero";
    return Math.random() > 0.6 ? "quiero" : "no_quiero";
  }
  if (trucoLevel === 3) {
    if (bestRank <= 3) return Math.random() > 0.3 ? "quiero" : "raise";
    if (bestRank <= 5 && avgRank <= 6) return "quiero";
    return Math.random() > 0.7 ? "quiero" : "no_quiero";
  }
  if (trucoLevel === 4) {
    if (bestRank <= 2) return "quiero";
    if (bestRank <= 4 && avgRank <= 5) return "quiero";
    return "no_quiero";
  }
  return "quiero";
}

function botChooseCard(hand, cardsPlayed, trickCards, trickNumber, isFirst) {
  const remaining = hand.filter(c => !cardsPlayed.includes(c.id));
  if (remaining.length === 0) return null;
  if (remaining.length === 1) return remaining[0];

  const sorted = [...remaining].sort((a, b) => a.rank - b.rank);

  if (isFirst) {
    // Going first: play middle card to test
    if (trickNumber === 0) return sorted[Math.floor(sorted.length / 2)];
    // Later tricks: play strongest
    return sorted[0];
  } else {
    // Responding: try to win with cheapest card possible
    const opponentCard = trickCards[0];
    const winners = sorted.filter(c => compareCards(c, opponentCard) < 0);
    if (winners.length > 0) {
      // Play weakest winning card
      return winners[winners.length - 1];
    }
    // Can't win: play weakest card
    return sorted[sorted.length - 1];
  }
}

// ─── STYLES ───────────────────────────────────────────────────

const CSS = `
  @keyframes dealIn {
    from { transform: translateY(-200px) scale(0.5) rotateY(180deg); opacity: 0; }
    to { transform: translateY(0) scale(1) rotateY(0deg); opacity: 1; }
  }
  @keyframes playCard {
    from { transform: scale(1.1); }
    to { transform: scale(1); }
  }
  @keyframes slideUp {
    from { transform: translateY(30px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  @keyframes glow {
    0%, 100% { box-shadow: 0 0 15px rgba(102,170,255,0.3); }
    50% { box-shadow: 0 0 30px rgba(102,170,255,0.6); }
  }
  @keyframes callFlash {
    0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
    50% { transform: scale(1.15) rotate(2deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes scoreUp {
    0% { transform: scale(1); }
    40% { transform: scale(1.6); color: #ffcc44; }
    100% { transform: scale(1); }
  }
  @keyframes shimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-6px); }
  }
  @keyframes scanline {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes trickWin {
    0% { box-shadow: 0 0 0 rgba(255,204,68,0); }
    50% { box-shadow: 0 0 40px rgba(255,204,68,0.8); }
    100% { box-shadow: 0 0 15px rgba(255,204,68,0.3); }
  }
  @keyframes particleFloat {
    0% { transform: translateY(0) scale(1); opacity: 1; }
    100% { transform: translateY(-120px) scale(0); opacity: 0; }
  }
`;

// ─── COMPONENTS ───────────────────────────────────────────────

function TrucoCard({ card, faceDown, onClick, disabled, played, small, isNew, winning }) {
  const suitInfo = card ? SUITS[card.suit] : null;
  const cardStyle = {
    width: small ? 60 : 85,
    height: small ? 88 : 125,
    borderRadius: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled || faceDown || played ? "default" : "pointer",
    transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
    position: "relative",
    overflow: "hidden",
    fontSize: small ? 12 : 16,
    userSelect: "none",
    animation: isNew ? "dealIn 0.5s ease-out" : played ? "playCard 0.3s ease-out" : "none",
    border: `2px solid ${faceDown ? "#334" : winning ? "#ffcc44" : suitInfo?.color + "66"}`,
    background: faceDown
      ? "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%)"
      : `linear-gradient(160deg, #0f0f1e 0%, ${suitInfo?.bg || "#111"} 60%, #0f0f1e 100%)`,
    boxShadow: winning
      ? "0 0 25px rgba(255,204,68,0.6), 0 4px 20px rgba(0,0,0,0.5)"
      : disabled
      ? "0 2px 8px rgba(0,0,0,0.3)"
      : "0 4px 15px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
    opacity: disabled && !faceDown ? 0.5 : 1,
    transform: "translateY(0px)",
  };

  const hoverStyle = !disabled && !faceDown && !played
    ? { transform: "translateY(-12px) scale(1.06)", boxShadow: `0 8px 30px ${suitInfo?.color}44, 0 0 20px ${suitInfo?.color}33` }
    : {};

  const [hover, setHover] = useState(false);

  if (faceDown) {
    return (
      <div style={{ ...cardStyle, ...(hover ? {} : {}) }}>
        {/* Card back pattern */}
        <div style={{
          position: "absolute", inset: 6, borderRadius: 6,
          border: "1.5px solid #334466",
          background: "repeating-linear-gradient(45deg, transparent, transparent 4px, #1a2a4a22 4px, #1a2a4a22 8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ fontSize: small ? 18 : 26, opacity: 0.4 }}>✦</div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ ...cardStyle, ...(hover ? hoverStyle : {}) }}
      onClick={() => !disabled && onClick?.(card)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Shimmer overlay */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 8,
        background: hover
          ? `linear-gradient(110deg, transparent 30%, ${suitInfo?.color}11 45%, ${suitInfo?.color}22 50%, ${suitInfo?.color}11 55%, transparent 70%)`
          : "none",
        backgroundSize: "200% 100%",
        animation: hover ? "shimmer 1.5s infinite" : "none",
        pointerEvents: "none",
      }} />
      {/* Top left */}
      <div style={{
        position: "absolute", top: small ? 4 : 6, left: small ? 5 : 8,
        fontWeight: 800, color: suitInfo?.color, fontSize: small ? 11 : 15,
        textShadow: `0 0 8px ${suitInfo?.color}66`,
        lineHeight: 1,
      }}>
        {card.displayName}
        <div style={{ fontSize: small ? 10 : 13, marginTop: 1 }}>{suitInfo?.symbol}</div>
      </div>
      {/* Center suit */}
      <div style={{
        fontSize: small ? 24 : 36,
        color: suitInfo?.color,
        textShadow: `0 0 15px ${suitInfo?.color}44`,
        filter: `drop-shadow(0 0 6px ${suitInfo?.color}33)`,
        marginTop: small ? 6 : 4,
      }}>
        {suitInfo?.symbol}
      </div>
      {/* Bottom right */}
      <div style={{
        position: "absolute", bottom: small ? 4 : 6, right: small ? 5 : 8,
        fontWeight: 800, color: suitInfo?.color, fontSize: small ? 11 : 15,
        textShadow: `0 0 8px ${suitInfo?.color}66`,
        transform: "rotate(180deg)", lineHeight: 1,
      }}>
        {card.displayName}
        <div style={{ fontSize: small ? 10 : 13, marginTop: 1 }}>{suitInfo?.symbol}</div>
      </div>
    </div>
  );
}

function CallBubble({ text, type, side }) {
  const colors = {
    envido: { bg: "#1a3a1a", border: "#44cc88", text: "#66ffaa" },
    truco: { bg: "#3a1a1a", border: "#cc4444", text: "#ff6666" },
    accept: { bg: "#1a2a3a", border: "#4488cc", text: "#66aaff" },
    reject: { bg: "#2a1a1a", border: "#884444", text: "#aa6666" },
    info: { bg: "#2a2a1a", border: "#aaaa44", text: "#dddd66" },
  };
  const c = colors[type] || colors.info;
  return (
    <div style={{
      padding: "8px 18px", borderRadius: 12, fontSize: 15, fontWeight: 700,
      background: c.bg, border: `2px solid ${c.border}`, color: c.text,
      animation: "callFlash 0.4s ease-out", textAlign: "center",
      textTransform: "uppercase", letterSpacing: 2,
      boxShadow: `0 0 20px ${c.border}44, inset 0 0 20px ${c.border}11`,
      textShadow: `0 0 10px ${c.text}44`,
    }}>
      {text}
    </div>
  );
}

function Particle({ x, color }) {
  return (
    <div style={{
      position: "absolute", left: x, bottom: 0,
      width: 6, height: 6, borderRadius: "50%",
      background: color, animation: "particleFloat 1s ease-out forwards",
      boxShadow: `0 0 8px ${color}`,
    }} />
  );
}

// ─── MAIN GAME ────────────────────────────────────────────────

const INITIAL_STATE = {
  phase: "menu", // menu, dealing, playing, envido_call, truco_call, envido_reveal, hand_over, game_over
  deck: [],
  playerHand: [],
  botHand: [],
  playerPlayed: [], // card IDs played
  botPlayed: [],
  tricks: [], // [{playerCard, botCard, winner}]
  currentTrickCards: { player: null, bot: null },
  mano: "player", // who goes first
  turnToPlay: "player",
  scores: { player: 0, bot: 0 },
  trucoLevel: 1, // 1=normal, 2=truco, 3=retruco, 4=vale cuatro
  trucoCaller: null, // who last raised truco
  trucoRespondTo: null,
  envidoCalls: [],
  envidoCaller: null,
  envidoResolved: false,
  canCallEnvido: true,
  message: null,
  messageType: "info",
  callBubbles: [], // {text, type, side, id}
  handNumber: 0,
  lastEnvidoScores: null,
  animatingScore: null,
  mazo: null, // who folded
};

export default function TrucoGame() {
  const [state, setState] = useState(INITIAL_STATE);
  const timerRef = useRef(null);
  const turnTimerRef = useRef(null);

  // Inject CSS
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Helper: update state
  const update = useCallback((changes) => {
    setState(prev => ({ ...prev, ...changes }));
  }, []);

  // Helper: add call bubble
  const addBubble = useCallback((text, type, side) => {
    const id = Date.now() + Math.random();
    setState(prev => ({
      ...prev,
      callBubbles: [...prev.callBubbles, { text, type, side, id }],
    }));
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        callBubbles: prev.callBubbles.filter(b => b.id !== id),
      }));
    }, 2500);
  }, []);

  // ─── DEAL ─────────────────────────────────────────

  const dealHand = useCallback(() => {
    const deck = shuffle(createDeck());
    const playerHand = deck.slice(0, 3);
    const botHand = deck.slice(3, 6);
    setState(prev => ({
      ...INITIAL_STATE,
      phase: "playing",
      deck,
      playerHand,
      botHand,
      mano: prev.phase === "menu" ? "player" : (prev.mano === "player" ? "bot" : "player"),
      turnToPlay: prev.phase === "menu" ? "player" : (prev.mano === "player" ? "bot" : "player"),
      scores: prev.phase === "menu" ? { player: 0, bot: 0 } : prev.scores,
      handNumber: prev.handNumber + 1,
    }));
  }, []);

  // ─── DETERMINE TRICK WINNER ───────────────────────

  const resolveTrick = useCallback((playerCard, botCard, tricks, mano) => {
    const cmp = compareCards(playerCard, botCard);
    let winner;
    if (cmp < 0) winner = "player";
    else if (cmp > 0) winner = "bot";
    else {
      // Tie: in first trick, mano wins. Otherwise, whoever won first trick wins.
      if (tricks.length === 0) winner = mano;
      else {
        const firstWinner = tricks[0].winner;
        winner = firstWinner === "tie" ? mano : firstWinner;
      }
    }
    return { playerCard, botCard, winner };
  }, []);

  // ─── CHECK HAND WINNER ────────────────────────────

  const checkHandWinner = useCallback((tricks) => {
    if (tricks.length < 2) return null;
    const pWins = tricks.filter(t => t.winner === "player").length;
    const bWins = tricks.filter(t => t.winner === "bot").length;
    if (pWins >= 2) return "player";
    if (bWins >= 2) return "bot";
    if (tricks.length === 3) {
      // All 3 played, look at first trick winner for ties
      if (pWins === bWins) return tricks[0].winner;
      return pWins > bWins ? "player" : "bot";
    }
    return null;
  }, []);

  // ─── SCORE HAND ───────────────────────────────────

  const scoreHand = useCallback((winner, trucoLevel, prevScores) => {
    const points = TRUCO_LEVELS[trucoLevel].quiero;
    return {
      ...prevScores,
      [winner]: prevScores[winner] + points,
    };
  }, []);

  // ─── PLAY CARD ────────────────────────────────────

  const playCard = useCallback((card) => {
    setState(prev => {
      if (prev.phase !== "playing" || prev.turnToPlay !== "player") return prev;
      if (prev.currentTrickCards.player) return prev; // already played this trick

      // After first card played, envido can still be called by opponent only
      const cardsPlayedCount = prev.playerPlayed.length;
      const canCallEnvido = cardsPlayedCount === 0 && !prev.envidoResolved;

      return {
        ...prev,
        currentTrickCards: { ...prev.currentTrickCards, player: card },
        playerPlayed: [...prev.playerPlayed, card.id],
        canCallEnvido,
        turnToPlay: prev.currentTrickCards.bot ? "resolve" : "bot",
      };
    });
  }, []);

  // ─── BOT TURN ─────────────────────────────────────

  useEffect(() => {
    if (state.phase !== "playing") return;
    if (state.turnToPlay !== "bot") return;

    const timeout = setTimeout(() => {
      setState(prev => {
        // Bot might call envido or truco before playing
        if (prev.canCallEnvido && !prev.envidoResolved && prev.playerPlayed.length <= 1) {
          const prob = botShouldCallEnvido(prev.botHand, prev.scores.bot, prev.scores.player);
          if (Math.random() < prob) {
            return {
              ...prev,
              phase: "envido_call",
              envidoCalls: [{ type: "envido", by: "bot" }],
              envidoCaller: "bot",
              callBubbles: [...prev.callBubbles, {
                text: "Envido!", type: "envido", side: "bot", id: Date.now()
              }],
            };
          }
        }

        // Bot might call truco
        if (prev.trucoLevel < 4 && prev.trucoCaller !== "bot") {
          const prob = botShouldCallTruco(prev.botHand, prev.botPlayed, prev.trucoLevel);
          if (Math.random() < prob && prev.trucoLevel < 2) {
            return {
              ...prev,
              phase: "truco_call",
              trucoRespondTo: prev.trucoLevel + 1,
              trucoCaller: "bot",
              callBubbles: [...prev.callBubbles, {
                text: TRUCO_LEVELS[prev.trucoLevel + 1].label + "!",
                type: "truco", side: "bot", id: Date.now()
              }],
            };
          }
        }

        // Play a card
        const card = botChooseCard(
          prev.botHand, prev.botPlayed,
          prev.currentTrickCards.player ? [prev.currentTrickCards.player] : [],
          prev.tricks.length,
          prev.mano === "bot" && !prev.currentTrickCards.player
        );
        if (!card) return prev;

        const canCallEnvido = prev.botPlayed.length === 0 && !prev.envidoResolved;

        return {
          ...prev,
          currentTrickCards: { ...prev.currentTrickCards, bot: card },
          botPlayed: [...prev.botPlayed, card.id],
          canCallEnvido,
          turnToPlay: prev.currentTrickCards.player ? "resolve" : "player",
        };
      });
    }, 800 + Math.random() * 600);

    return () => clearTimeout(timeout);
  }, [state.phase, state.turnToPlay]);

  // ─── RESOLVE TRICK ────────────────────────────────

  useEffect(() => {
    if (state.turnToPlay !== "resolve") return;
    if (!state.currentTrickCards.player || !state.currentTrickCards.bot) return;

    const timeout = setTimeout(() => {
      setState(prev => {
        const trick = resolveTrick(
          prev.currentTrickCards.player,
          prev.currentTrickCards.bot,
          prev.tricks,
          prev.mano
        );
        const newTricks = [...prev.tricks, trick];
        const handWinner = checkHandWinner(newTricks);

        if (handWinner) {
          const newScores = scoreHand(handWinner, prev.trucoLevel, prev.scores);
          const gameOver = newScores.player >= 30 || newScores.bot >= 30;
          return {
            ...prev,
            tricks: newTricks,
            currentTrickCards: { player: null, bot: null },
            phase: gameOver ? "game_over" : "hand_over",
            scores: newScores,
            message: handWinner === "player" ? "Ganaste la mano!" : "Bot gana la mano",
            messageType: handWinner === "player" ? "accept" : "reject",
            animatingScore: handWinner,
          };
        }

        // Next trick
        const nextTurn = trick.winner === "tie" ? prev.mano : trick.winner;
        return {
          ...prev,
          tricks: newTricks,
          currentTrickCards: { player: null, bot: null },
          turnToPlay: nextTurn,
          canCallEnvido: prev.playerPlayed.length <= 1 && !prev.envidoResolved,
        };
      });
    }, 1000);

    return () => clearTimeout(timeout);
  }, [state.turnToPlay, state.currentTrickCards, resolveTrick, checkHandWinner, scoreHand]);

  // ─── AUTO-DEAL AFTER HAND OVER ────────────────────

  useEffect(() => {
    if (state.phase === "hand_over") {
      const timeout = setTimeout(dealHand, 2000);
      return () => clearTimeout(timeout);
    }
  }, [state.phase, dealHand]);

  // ─── ENVIDO HANDLING ──────────────────────────────

  const callEnvido = useCallback((type) => {
    setState(prev => {
      const newCall = { type, by: "player" };
      const newCalls = [...prev.envidoCalls, newCall];
      return {
        ...prev,
        phase: "envido_call",
        envidoCalls: newCalls,
        envidoCaller: "player",
      };
    });
    addBubble(ENVIDO_CALLS[type]?.label || "Envido!", "envido", "player");
  }, [addBubble]);

  // Bot responds to envido
  useEffect(() => {
    if (state.phase !== "envido_call" || state.envidoCaller !== "player") return;

    const timeout = setTimeout(() => {
      setState(prev => {
        const response = botRespondEnvido(
          prev.botHand, prev.envidoCalls, prev.scores.bot, prev.scores.player
        );

        if (response === "quiero") {
          // Resolve envido
          const playerEnvido = calculateEnvido(prev.playerHand);
          const botEnvido = calculateEnvido(prev.botHand);
          const points = getEnvidoQuieroValue(prev.envidoCalls, prev.scores.player, prev.scores.bot);
          const winner = playerEnvido >= botEnvido ? "player" : "bot";
          const newScores = { ...prev.scores, [winner]: prev.scores[winner] + points };
          const gameOver = newScores.player >= 30 || newScores.bot >= 30;

          return {
            ...prev,
            phase: gameOver ? "game_over" : "envido_reveal",
            envidoResolved: true,
            canCallEnvido: false,
            scores: newScores,
            lastEnvidoScores: { player: playerEnvido, bot: botEnvido, points, winner },
            animatingScore: winner,
            callBubbles: [...prev.callBubbles, {
              text: "Quiero!", type: "accept", side: "bot", id: Date.now()
            }],
          };
        } else if (response === "no_quiero") {
          const points = getEnvidoNoQuieroValue(prev.envidoCalls);
          const newScores = { ...prev.scores, player: prev.scores.player + points };
          const gameOver = newScores.player >= 30;
          return {
            ...prev,
            phase: gameOver ? "game_over" : "playing",
            envidoResolved: true,
            canCallEnvido: false,
            scores: newScores,
            turnToPlay: prev.currentTrickCards.player ? "bot" : (prev.currentTrickCards.bot ? "player" : prev.mano),
            callBubbles: [...prev.callBubbles, {
              text: "No quiero", type: "reject", side: "bot", id: Date.now()
            }],
            animatingScore: "player",
          };
        } else if (response === "raise_envido") {
          return {
            ...prev,
            envidoCalls: [...prev.envidoCalls, { type: "envido", by: "bot" }],
            envidoCaller: "bot",
            callBubbles: [...prev.callBubbles, {
              text: "Envido!", type: "envido", side: "bot", id: Date.now()
            }],
          };
        } else if (response === "raise_real") {
          return {
            ...prev,
            envidoCalls: [...prev.envidoCalls, { type: "real_envido", by: "bot" }],
            envidoCaller: "bot",
            callBubbles: [...prev.callBubbles, {
              text: "Real Envido!", type: "envido", side: "bot", id: Date.now()
            }],
          };
        }
        return prev;
      });
    }, 1000);

    return () => clearTimeout(timeout);
  }, [state.phase, state.envidoCaller]);

  // Player responds to envido
  const respondEnvido = useCallback((response) => {
    setState(prev => {
      if (response === "quiero") {
        const playerEnvido = calculateEnvido(prev.playerHand);
        const botEnvido = calculateEnvido(prev.botHand);
        const points = getEnvidoQuieroValue(prev.envidoCalls, prev.scores.player, prev.scores.bot);
        const winner = botEnvido > playerEnvido ? "bot" : "player"; // Bot called, ties go to mano
        const actualWinner = playerEnvido === botEnvido ? prev.mano : winner;
        const newScores = { ...prev.scores, [actualWinner]: prev.scores[actualWinner] + points };
        const gameOver = newScores.player >= 30 || newScores.bot >= 30;

        return {
          ...prev,
          phase: gameOver ? "game_over" : "envido_reveal",
          envidoResolved: true,
          canCallEnvido: false,
          scores: newScores,
          lastEnvidoScores: { player: playerEnvido, bot: botEnvido, points, winner: actualWinner },
          animatingScore: actualWinner,
          callBubbles: [...prev.callBubbles, {
            text: "Quiero!", type: "accept", side: "player", id: Date.now()
          }],
        };
      } else if (response === "no_quiero") {
        const points = getEnvidoNoQuieroValue(prev.envidoCalls);
        const newScores = { ...prev.scores, bot: prev.scores.bot + points };
        const gameOver = newScores.bot >= 30;
        return {
          ...prev,
          phase: gameOver ? "game_over" : "playing",
          envidoResolved: true,
          canCallEnvido: false,
          scores: newScores,
          turnToPlay: prev.currentTrickCards.player ? "bot" : (prev.currentTrickCards.bot ? "player" : prev.mano),
          callBubbles: [...prev.callBubbles, {
            text: "No quiero", type: "reject", side: "player", id: Date.now()
          }],
          animatingScore: "bot",
        };
      } else if (response === "envido") {
        return {
          ...prev,
          envidoCalls: [...prev.envidoCalls, { type: "envido", by: "player" }],
          envidoCaller: "player",
          callBubbles: [...prev.callBubbles, {
            text: "Envido!", type: "envido", side: "player", id: Date.now()
          }],
        };
      } else if (response === "real_envido") {
        return {
          ...prev,
          envidoCalls: [...prev.envidoCalls, { type: "real_envido", by: "player" }],
          envidoCaller: "player",
          callBubbles: [...prev.callBubbles, {
            text: "Real Envido!", type: "envido", side: "player", id: Date.now()
          }],
        };
      } else if (response === "falta_envido") {
        return {
          ...prev,
          envidoCalls: [...prev.envidoCalls, { type: "falta_envido", by: "player" }],
          envidoCaller: "player",
          callBubbles: [...prev.callBubbles, {
            text: "Falta Envido!", type: "envido", side: "player", id: Date.now()
          }],
        };
      }
      return prev;
    });
  }, []);

  // Auto-continue after envido reveal
  useEffect(() => {
    if (state.phase === "envido_reveal") {
      const timeout = setTimeout(() => {
        setState(prev => ({
          ...prev,
          phase: "playing",
          lastEnvidoScores: null,
          turnToPlay: prev.currentTrickCards.player ? "bot" : (prev.currentTrickCards.bot ? "player" : prev.mano),
        }));
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [state.phase]);

  // ─── TRUCO HANDLING ───────────────────────────────

  const callTruco = useCallback(() => {
    setState(prev => {
      const nextLevel = prev.trucoLevel + 1;
      if (nextLevel > 4) return prev;
      return {
        ...prev,
        phase: "truco_call",
        trucoRespondTo: nextLevel,
        trucoCaller: "player",
      };
    });
    const nextLevel = state.trucoLevel + 1;
    if (nextLevel <= 4) {
      addBubble(TRUCO_LEVELS[nextLevel].label + "!", "truco", "player");
    }
  }, [state.trucoLevel, addBubble]);

  // Bot responds to truco
  useEffect(() => {
    if (state.phase !== "truco_call" || state.trucoCaller !== "player") return;

    const timeout = setTimeout(() => {
      setState(prev => {
        const resp = botRespondTruco(prev.botHand, prev.botPlayed, prev.trucoRespondTo);
        if (resp === "quiero") {
          return {
            ...prev,
            phase: "playing",
            trucoLevel: prev.trucoRespondTo,
            trucoRespondTo: null,
            callBubbles: [...prev.callBubbles, {
              text: "Quiero!", type: "accept", side: "bot", id: Date.now()
            }],
          };
        } else if (resp === "raise" && prev.trucoRespondTo < 4) {
          const raiseLevel = prev.trucoRespondTo + 1;
          return {
            ...prev,
            trucoLevel: prev.trucoRespondTo,
            trucoRespondTo: raiseLevel,
            trucoCaller: "bot",
            callBubbles: [...prev.callBubbles, {
              text: TRUCO_LEVELS[raiseLevel].label + "!",
              type: "truco", side: "bot", id: Date.now()
            }],
          };
        } else {
          // No quiero
          const points = TRUCO_LEVELS[prev.trucoRespondTo].noQuiero;
          const newScores = { ...prev.scores, player: prev.scores.player + points };
          const gameOver = newScores.player >= 30;
          return {
            ...prev,
            phase: gameOver ? "game_over" : "hand_over",
            scores: newScores,
            trucoRespondTo: null,
            message: "Bot no quiso",
            messageType: "accept",
            animatingScore: "player",
            callBubbles: [...prev.callBubbles, {
              text: "No quiero", type: "reject", side: "bot", id: Date.now()
            }],
          };
        }
      });
    }, 1000);

    return () => clearTimeout(timeout);
  }, [state.phase, state.trucoCaller]);

  // Player responds to truco
  const respondTruco = useCallback((response) => {
    setState(prev => {
      if (response === "quiero") {
        return {
          ...prev,
          phase: "playing",
          trucoLevel: prev.trucoRespondTo,
          trucoRespondTo: null,
          turnToPlay: prev.currentTrickCards.player ? "bot" : (prev.currentTrickCards.bot ? "player" : prev.turnToPlay),
          callBubbles: [...prev.callBubbles, {
            text: "Quiero!", type: "accept", side: "player", id: Date.now()
          }],
        };
      } else if (response === "raise" && prev.trucoRespondTo < 4) {
        const raiseLevel = prev.trucoRespondTo + 1;
        addBubble(TRUCO_LEVELS[raiseLevel].label + "!", "truco", "player");
        return {
          ...prev,
          trucoLevel: prev.trucoRespondTo,
          trucoRespondTo: raiseLevel,
          trucoCaller: "player",
        };
      } else {
        // No quiero
        const points = TRUCO_LEVELS[prev.trucoRespondTo].noQuiero;
        const newScores = { ...prev.scores, bot: prev.scores.bot + points };
        const gameOver = newScores.bot >= 30;
        return {
          ...prev,
          phase: gameOver ? "game_over" : "hand_over",
          scores: newScores,
          trucoRespondTo: null,
          message: "Rechazaste el truco",
          messageType: "reject",
          animatingScore: "bot",
          callBubbles: [...prev.callBubbles, {
            text: "No quiero", type: "reject", side: "player", id: Date.now()
          }],
        };
      }
    });
  }, [addBubble]);

  // ─── MAZO (FOLD) ──────────────────────────────────

  const goToMazo = useCallback(() => {
    setState(prev => {
      const points = TRUCO_LEVELS[prev.trucoLevel].quiero;
      const newScores = { ...prev.scores, bot: prev.scores.bot + points };
      const gameOver = newScores.bot >= 30;
      return {
        ...prev,
        phase: gameOver ? "game_over" : "hand_over",
        scores: newScores,
        mazo: "player",
        message: "Te fuiste al mazo",
        messageType: "reject",
        animatingScore: "bot",
      };
    });
    addBubble("Me voy al mazo", "reject", "player");
  }, [addBubble]);

  // ─── RENDER ───────────────────────────────────────

  const playerEnvido = state.playerHand.length ? calculateEnvido(state.playerHand) : 0;
  const canAct = state.phase === "playing" && state.turnToPlay === "player" && !state.currentTrickCards.player;
  const playerRemainingCards = state.playerHand.filter(c => !state.playerPlayed.includes(c.id));
  const botRemainingCards = state.botHand.filter(c => !state.botPlayed.includes(c.id));

  // Determine available envido raises
  const envidoCount = state.envidoCalls.filter(c => c.type === "envido").length;
  const hasRealEnvido = state.envidoCalls.some(c => c.type === "real_envido");
  const hasFaltaEnvido = state.envidoCalls.some(c => c.type === "falta_envido");

  // ─── MENU SCREEN ──────────────────────────────────

  if (state.phase === "menu") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 30,
        background: "linear-gradient(180deg, #050510 0%, #0a0a2a 40%, #0d0d1a 100%)",
        color: "#fff", fontFamily: "'Inter', system-ui, sans-serif",
        position: "relative", overflow: "hidden",
      }}>
        {/* Background particles */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: 0.3 }}>
          {[...Array(30)].map((_, i) => (
            <div key={i} style={{
              position: "absolute",
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: 2, height: 2, borderRadius: "50%",
              background: ["#66aaff", "#ffcc44", "#ff6688", "#66dd88"][i % 4],
              animation: `float ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }} />
          ))}
        </div>

        <div style={{
          fontSize: 56, fontWeight: 900, letterSpacing: -2,
          background: "linear-gradient(135deg, #66aaff, #ffcc44, #ff6688)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          textShadow: "none", filter: "drop-shadow(0 0 30px rgba(102,170,255,0.3))",
        }}>
          TRUCO
        </div>
        <div style={{
          fontSize: 16, letterSpacing: 6, textTransform: "uppercase",
          color: "#667", marginTop: -20,
        }}>
          Roguelike
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          {[
            { suit: "espadas", v: 1 }, { suit: "bastos", v: 1 },
            { suit: "oros", v: 7 }, { suit: "copas", v: 12 }
          ].map((c, i) => (
            <div key={i} style={{
              animation: `float ${2.5 + i * 0.3}s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`,
            }}>
              <TrucoCard
                card={{ ...c, id: `menu_${i}`, displayName: DISPLAY_NAMES[c.v] || String(c.v), rank: 0 }}
                small
              />
            </div>
          ))}
        </div>

        <button
          onClick={dealHand}
          style={{
            padding: "16px 48px", fontSize: 18, fontWeight: 700,
            background: "linear-gradient(135deg, #1a2a4a, #2a3a5a)",
            border: "2px solid #4488cc", borderRadius: 12, color: "#88bbff",
            cursor: "pointer", letterSpacing: 2, textTransform: "uppercase",
            boxShadow: "0 0 25px rgba(68,136,204,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
            transition: "all 0.2s",
            marginTop: 20,
          }}
          onMouseEnter={e => {
            e.target.style.transform = "scale(1.05)";
            e.target.style.boxShadow = "0 0 40px rgba(68,136,204,0.5)";
          }}
          onMouseLeave={e => {
            e.target.style.transform = "scale(1)";
            e.target.style.boxShadow = "0 0 25px rgba(68,136,204,0.3)";
          }}
        >
          Jugar
        </button>

        <div style={{ fontSize: 13, color: "#445", marginTop: 10 }}>
          1 vs 1 · Truco Argentino · 30 puntos
        </div>
      </div>
    );
  }

  // ─── GAME OVER SCREEN ─────────────────────────────

  if (state.phase === "game_over") {
    const winner = state.scores.player >= 30 ? "player" : "bot";
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 24,
        background: winner === "player"
          ? "linear-gradient(180deg, #050510 0%, #0a1a0a 50%, #0d0d1a 100%)"
          : "linear-gradient(180deg, #050510 0%, #1a0a0a 50%, #0d0d1a 100%)",
        color: "#fff", fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <div style={{
          fontSize: 48, fontWeight: 900,
          color: winner === "player" ? "#66ffaa" : "#ff6666",
          textShadow: `0 0 30px ${winner === "player" ? "rgba(102,255,170,0.4)" : "rgba(255,102,102,0.4)"}`,
          animation: "callFlash 0.6s ease-out",
        }}>
          {winner === "player" ? "¡GANASTE!" : "PERDISTE"}
        </div>
        <div style={{
          fontSize: 22, color: "#999",
          display: "flex", gap: 20, alignItems: "center",
        }}>
          <span style={{ color: "#66aaff" }}>Vos: {state.scores.player}</span>
          <span style={{ color: "#555" }}>—</span>
          <span style={{ color: "#ff6666" }}>Bot: {state.scores.bot}</span>
        </div>
        <div style={{ fontSize: 14, color: "#556" }}>
          {state.handNumber} manos jugadas
        </div>
        <button
          onClick={() => setState(INITIAL_STATE)}
          style={{
            padding: "14px 40px", fontSize: 16, fontWeight: 700,
            background: "linear-gradient(135deg, #1a2a4a, #2a3a5a)",
            border: "2px solid #4488cc", borderRadius: 12, color: "#88bbff",
            cursor: "pointer", letterSpacing: 2, textTransform: "uppercase",
            boxShadow: "0 0 20px rgba(68,136,204,0.3)",
            transition: "all 0.2s", marginTop: 10,
          }}
          onMouseEnter={e => { e.target.style.transform = "scale(1.05)"; }}
          onMouseLeave={e => { e.target.style.transform = "scale(1)"; }}
        >
          Jugar de nuevo
        </button>
      </div>
    );
  }

  // ─── GAME BOARD ───────────────────────────────────

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      background: "linear-gradient(180deg, #050510 0%, #0a0a2a 30%, #0d0d1a 100%)",
      color: "#fff", fontFamily: "'Inter', system-ui, sans-serif",
      position: "relative", overflow: "hidden", userSelect: "none",
    }}>
      {/* CRT scanline effect */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 100,
        background: "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
      }} />

      {/* Background particles */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: 0.15 }}>
        {[...Array(20)].map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
            width: 2, height: 2, borderRadius: "50%",
            background: ["#66aaff", "#ffcc44", "#ff6688"][i % 3],
            animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 3}s`,
          }} />
        ))}
      </div>

      {/* ── HEADER / SCORES ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 24px", position: "relative", zIndex: 10,
      }}>
        {/* Player score */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            padding: "8px 16px", borderRadius: 10,
            background: "linear-gradient(135deg, #0a1a2a, #1a2a3a)",
            border: "1px solid #334",
            boxShadow: state.animatingScore === "player" ? "0 0 20px rgba(102,170,255,0.5)" : "none",
          }}>
            <div style={{ fontSize: 11, color: "#667", textTransform: "uppercase", letterSpacing: 1 }}>
              Vos {state.mano === "player" ? "(mano)" : ""}
            </div>
            <div style={{
              fontSize: 28, fontWeight: 900, color: "#66aaff",
              textShadow: "0 0 10px rgba(102,170,255,0.3)",
              animation: state.animatingScore === "player" ? "scoreUp 0.5s ease-out" : "none",
            }}>
              {state.scores.player}
            </div>
          </div>
          {playerEnvido > 0 && state.phase !== "menu" && (
            <div style={{
              fontSize: 11, color: "#556", padding: "4px 8px",
              background: "#111", borderRadius: 6,
            }}>
              Envido: {playerEnvido}
            </div>
          )}
        </div>

        {/* Center info */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#445", letterSpacing: 2, textTransform: "uppercase" }}>
            Mano #{state.handNumber}
          </div>
          {state.trucoLevel > 1 && (
            <div style={{
              fontSize: 14, fontWeight: 700, marginTop: 4,
              color: "#ff6666", textShadow: "0 0 10px rgba(255,66,66,0.3)",
              animation: "pulse 2s infinite",
            }}>
              {TRUCO_LEVELS[state.trucoLevel].label} ({TRUCO_LEVELS[state.trucoLevel].quiero} pts)
            </div>
          )}
        </div>

        {/* Bot score */}
        <div style={{
          padding: "8px 16px", borderRadius: 10,
          background: "linear-gradient(135deg, #1a0a0a, #2a1a1a)",
          border: "1px solid #433",
          boxShadow: state.animatingScore === "bot" ? "0 0 20px rgba(255,102,102,0.5)" : "none",
        }}>
          <div style={{ fontSize: 11, color: "#665", textTransform: "uppercase", letterSpacing: 1 }}>
            Bot {state.mano === "bot" ? "(mano)" : ""}
          </div>
          <div style={{
            fontSize: 28, fontWeight: 900, color: "#ff6666",
            textShadow: "0 0 10px rgba(255,102,102,0.3)",
            animation: state.animatingScore === "bot" ? "scoreUp 0.5s ease-out" : "none",
          }}>
            {state.scores.bot}
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div style={{
        margin: "0 24px", height: 4, borderRadius: 2,
        background: "#111", position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0, height: "100%",
          width: `${(state.scores.player / 30) * 100}%`,
          background: "linear-gradient(90deg, #2244aa, #66aaff)",
          borderRadius: 2, transition: "width 0.5s ease-out",
        }} />
        <div style={{
          position: "absolute", right: 0, top: 0, height: "100%",
          width: `${(state.scores.bot / 30) * 100}%`,
          background: "linear-gradient(90deg, #ff6666, #aa2244)",
          borderRadius: 2, transition: "width 0.5s ease-out",
        }} />
        {/* 15 point marker */}
        <div style={{
          position: "absolute", left: "50%", top: -2, width: 1, height: 8,
          background: "#ffcc44", opacity: 0.5,
        }} />
      </div>

      {/* ── BOT HAND ── */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 8,
        padding: "16px 0 8px", position: "relative", zIndex: 5,
      }}>
        {botRemainingCards.map((card, i) => (
          <div key={card.id} style={{ animation: `dealIn 0.4s ease-out ${i * 0.1}s both` }}>
            <TrucoCard card={card} faceDown small />
          </div>
        ))}
        {/* Bot call bubbles */}
        {state.callBubbles.filter(b => b.side === "bot").map(b => (
          <div key={b.id} style={{ position: "absolute", top: -10, zIndex: 20 }}>
            <CallBubble text={b.text} type={b.type} />
          </div>
        ))}
      </div>

      {/* ── TABLE AREA ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        position: "relative", minHeight: 280,
      }}>
        {/* Table felt */}
        <div style={{
          position: "absolute", inset: "10px 40px", borderRadius: 20,
          background: "linear-gradient(180deg, #0a1a0d 0%, #0d1f12 50%, #0a1a0d 100%)",
          border: "2px solid #1a3a1f",
          boxShadow: "inset 0 0 60px rgba(0,0,0,0.5), 0 0 30px rgba(0,0,0,0.3)",
        }} />

        {/* Tricks display */}
        <div style={{
          display: "flex", gap: 30, position: "relative", zIndex: 5,
          alignItems: "center",
        }}>
          {/* Previous tricks */}
          {state.tricks.map((trick, i) => (
            <div key={i} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              opacity: 0.7, animation: "fadeIn 0.3s ease-out",
            }}>
              <div style={{ fontSize: 9, color: "#556", textTransform: "uppercase", letterSpacing: 1 }}>
                {i + 1}ª
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <TrucoCard card={trick.botCard} small
                  winning={trick.winner === "bot"} />
                <TrucoCard card={trick.playerCard} small
                  winning={trick.winner === "player"} />
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700,
                color: trick.winner === "player" ? "#66aaff" : trick.winner === "bot" ? "#ff6666" : "#ffcc44",
              }}>
                {trick.winner === "player" ? "Vos" : trick.winner === "bot" ? "Bot" : "Parda"}
              </div>
            </div>
          ))}

          {/* Current trick */}
          {(state.currentTrickCards.player || state.currentTrickCards.bot) && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              animation: "slideUp 0.3s ease-out",
            }}>
              <div style={{ fontSize: 9, color: "#667", textTransform: "uppercase", letterSpacing: 1 }}>
                {state.tricks.length + 1}ª
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {state.currentTrickCards.bot ? (
                  <TrucoCard card={state.currentTrickCards.bot} small played />
                ) : (
                  <div style={{
                    width: 60, height: 88, borderRadius: 10,
                    border: "2px dashed #223", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: "#334",
                  }}>Bot</div>
                )}
                {state.currentTrickCards.player ? (
                  <TrucoCard card={state.currentTrickCards.player} small played />
                ) : (
                  <div style={{
                    width: 60, height: 88, borderRadius: 10,
                    border: "2px dashed #223", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: "#334",
                  }}>Vos</div>
                )}
              </div>
            </div>
          )}

          {/* Empty table message */}
          {!state.currentTrickCards.player && !state.currentTrickCards.bot && state.tricks.length === 0 && (
            <div style={{
              color: "#334", fontSize: 14, fontStyle: "italic",
              position: "relative", zIndex: 5,
            }}>
              {state.turnToPlay === "player" ? "Tu turno — jugá una carta" : "Turno del bot..."}
            </div>
          )}
        </div>

        {/* Envido reveal overlay */}
        {state.phase === "envido_reveal" && state.lastEnvidoScores && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 20,
            background: "rgba(0,0,0,0.6)", borderRadius: 20,
            animation: "fadeIn 0.3s ease-out",
          }}>
            <div style={{
              background: "linear-gradient(135deg, #0a1a2a, #1a2a3a)",
              border: "2px solid #4488cc", borderRadius: 16, padding: "20px 36px",
              textAlign: "center", animation: "callFlash 0.5s ease-out",
            }}>
              <div style={{ fontSize: 13, color: "#667", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>
                Envido
              </div>
              <div style={{ display: "flex", gap: 30, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "#66aaff" }}>
                    {state.lastEnvidoScores.player}
                  </div>
                  <div style={{ fontSize: 11, color: "#556" }}>Vos</div>
                </div>
                <div style={{ fontSize: 14, color: "#445" }}>vs</div>
                <div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "#ff6666" }}>
                    {state.lastEnvidoScores.bot}
                  </div>
                  <div style={{ fontSize: 11, color: "#556" }}>Bot</div>
                </div>
              </div>
              <div style={{
                marginTop: 12, fontSize: 14, fontWeight: 700,
                color: state.lastEnvidoScores.winner === "player" ? "#66ffaa" : "#ff6666",
              }}>
                {state.lastEnvidoScores.winner === "player" ? "¡Ganaste" : "Bot gana"} +{state.lastEnvidoScores.points}
              </div>
            </div>
          </div>
        )}

        {/* Hand over message */}
        {state.phase === "hand_over" && state.message && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 20,
            background: "rgba(0,0,0,0.5)", borderRadius: 20,
            animation: "fadeIn 0.3s ease-out",
          }}>
            <div style={{
              fontSize: 24, fontWeight: 800,
              color: state.messageType === "accept" ? "#66ffaa" : "#ff6666",
              textShadow: `0 0 20px ${state.messageType === "accept" ? "rgba(102,255,170,0.4)" : "rgba(255,102,102,0.4)"}`,
              animation: "callFlash 0.5s ease-out",
            }}>
              {state.message}
            </div>
          </div>
        )}
      </div>

      {/* ── ACTION BUTTONS ── */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 8,
        padding: "8px 0", position: "relative", zIndex: 10,
      }}>
        {/* Envido call (only when allowed) */}
        {state.phase === "playing" && canAct && state.canCallEnvido && !state.envidoResolved && (
          <button
            onClick={() => callEnvido("envido")}
            style={{
              padding: "8px 18px", fontSize: 13, fontWeight: 700,
              background: "linear-gradient(135deg, #0a2a1a, #1a3a2a)",
              border: "1.5px solid #44cc88", borderRadius: 8, color: "#66ffaa",
              cursor: "pointer", textTransform: "uppercase", letterSpacing: 1,
              boxShadow: "0 0 15px rgba(68,204,136,0.2)",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.target.style.boxShadow = "0 0 25px rgba(68,204,136,0.4)"; }}
            onMouseLeave={e => { e.target.style.boxShadow = "0 0 15px rgba(68,204,136,0.2)"; }}
          >
            Envido
          </button>
        )}

        {/* Truco call */}
        {state.phase === "playing" && canAct && state.trucoLevel < 4 && state.trucoCaller !== "player" && (
          <button
            onClick={callTruco}
            style={{
              padding: "8px 18px", fontSize: 13, fontWeight: 700,
              background: "linear-gradient(135deg, #2a0a0a, #3a1a1a)",
              border: "1.5px solid #cc4444", borderRadius: 8, color: "#ff6666",
              cursor: "pointer", textTransform: "uppercase", letterSpacing: 1,
              boxShadow: "0 0 15px rgba(204,68,68,0.2)",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.target.style.boxShadow = "0 0 25px rgba(204,68,68,0.4)"; }}
            onMouseLeave={e => { e.target.style.boxShadow = "0 0 15px rgba(204,68,68,0.2)"; }}
          >
            {state.trucoLevel === 1 ? "Truco" : state.trucoLevel === 2 ? "Retruco" : "Vale Cuatro"}
          </button>
        )}

        {/* Mazo (fold) */}
        {state.phase === "playing" && canAct && (
          <button
            onClick={goToMazo}
            style={{
              padding: "8px 14px", fontSize: 12, fontWeight: 600,
              background: "transparent",
              border: "1px solid #333", borderRadius: 8, color: "#556",
              cursor: "pointer", letterSpacing: 1,
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.target.style.color = "#888"; e.target.style.borderColor = "#555"; }}
            onMouseLeave={e => { e.target.style.color = "#556"; e.target.style.borderColor = "#333"; }}
          >
            Mazo
          </button>
        )}

        {/* Envido response (when bot called envido) */}
        {state.phase === "envido_call" && state.envidoCaller === "bot" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={() => respondEnvido("quiero")}
              style={{
                padding: "10px 20px", fontSize: 14, fontWeight: 700,
                background: "linear-gradient(135deg, #0a2a1a, #1a3a2a)",
                border: "2px solid #44cc88", borderRadius: 10, color: "#66ffaa",
                cursor: "pointer", textTransform: "uppercase",
                boxShadow: "0 0 20px rgba(68,204,136,0.3)",
              }}
            >
              Quiero
            </button>
            <button
              onClick={() => respondEnvido("no_quiero")}
              style={{
                padding: "10px 20px", fontSize: 14, fontWeight: 700,
                background: "linear-gradient(135deg, #2a0a0a, #3a1a1a)",
                border: "2px solid #884444", borderRadius: 10, color: "#aa6666",
                cursor: "pointer", textTransform: "uppercase",
              }}
            >
              No Quiero
            </button>
            {/* Raise options */}
            {envidoCount < 2 && !hasRealEnvido && !hasFaltaEnvido && (
              <button
                onClick={() => respondEnvido("envido")}
                style={{
                  padding: "10px 16px", fontSize: 12, fontWeight: 700,
                  background: "linear-gradient(135deg, #0a1a2a, #1a2a3a)",
                  border: "1.5px solid #4488cc", borderRadius: 10, color: "#66aaff",
                  cursor: "pointer", textTransform: "uppercase",
                }}
              >
                Envido
              </button>
            )}
            {!hasRealEnvido && !hasFaltaEnvido && (
              <button
                onClick={() => respondEnvido("real_envido")}
                style={{
                  padding: "10px 16px", fontSize: 12, fontWeight: 700,
                  background: "linear-gradient(135deg, #1a1a0a, #2a2a1a)",
                  border: "1.5px solid #aaaa44", borderRadius: 10, color: "#dddd66",
                  cursor: "pointer", textTransform: "uppercase",
                }}
              >
                Real Envido
              </button>
            )}
            {!hasFaltaEnvido && (
              <button
                onClick={() => respondEnvido("falta_envido")}
                style={{
                  padding: "10px 16px", fontSize: 12, fontWeight: 700,
                  background: "linear-gradient(135deg, #2a1a0a, #3a2a1a)",
                  border: "1.5px solid #cc8844", borderRadius: 10, color: "#ffaa66",
                  cursor: "pointer", textTransform: "uppercase",
                }}
              >
                Falta Envido
              </button>
            )}
          </div>
        )}

        {/* Truco response */}
        {state.phase === "truco_call" && state.trucoCaller === "bot" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => respondTruco("quiero")}
              style={{
                padding: "10px 24px", fontSize: 14, fontWeight: 700,
                background: "linear-gradient(135deg, #0a2a1a, #1a3a2a)",
                border: "2px solid #44cc88", borderRadius: 10, color: "#66ffaa",
                cursor: "pointer", textTransform: "uppercase",
                boxShadow: "0 0 20px rgba(68,204,136,0.3)",
              }}
            >
              Quiero
            </button>
            <button
              onClick={() => respondTruco("no_quiero")}
              style={{
                padding: "10px 24px", fontSize: 14, fontWeight: 700,
                background: "linear-gradient(135deg, #2a0a0a, #3a1a1a)",
                border: "2px solid #884444", borderRadius: 10, color: "#aa6666",
                cursor: "pointer", textTransform: "uppercase",
              }}
            >
              No Quiero
            </button>
            {state.trucoRespondTo < 4 && (
              <button
                onClick={() => respondTruco("raise")}
                style={{
                  padding: "10px 20px", fontSize: 13, fontWeight: 700,
                  background: "linear-gradient(135deg, #2a0a1a, #3a1a2a)",
                  border: "1.5px solid #cc44aa", borderRadius: 10, color: "#ff66cc",
                  cursor: "pointer", textTransform: "uppercase",
                }}
              >
                {TRUCO_LEVELS[state.trucoRespondTo + 1]?.label || "Subir"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── PLAYER HAND ── */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 12,
        padding: "12px 0 24px", position: "relative", zIndex: 10,
      }}>
        {playerRemainingCards.map((card, i) => (
          <div key={card.id} style={{
            animation: `dealIn 0.5s ease-out ${i * 0.12}s both`,
          }}>
            <TrucoCard
              card={card}
              onClick={playCard}
              disabled={!canAct}
              isNew={state.tricks.length === 0 && !state.currentTrickCards.player}
            />
          </div>
        ))}
        {/* Player call bubbles */}
        {state.callBubbles.filter(b => b.side === "player").map(b => (
          <div key={b.id} style={{ position: "absolute", top: -40, zIndex: 20 }}>
            <CallBubble text={b.text} type={b.type} />
          </div>
        ))}
      </div>

      {/* Turn indicator */}
      {state.phase === "playing" && (
        <div style={{
          position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
          fontSize: 11, color: "#445", letterSpacing: 1,
        }}>
          {state.turnToPlay === "player" && !state.currentTrickCards.player
            ? "▲ TU TURNO" : state.turnToPlay === "bot" ? "◆ BOT PIENSA..." : ""}
        </div>
      )}
    </div>
  );
}
