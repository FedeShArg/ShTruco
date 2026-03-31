// Room/Lobby Manager
const { v4: uuidv4 } = require('uuid');
const { createGameState, dealHand } = require('../game/truco-engine');

const rooms = new Map();
const playerRooms = new Map(); // playerId -> roomId

// Bot personality names
const BOT_NAMES = [
    'El Loco', 'La Gringa', 'Tito Mazo', 'Doña Falta',
    'Pepe Truco', 'La Flor', 'El Gaucho', 'Mate Amargo',
    'El Rengo', 'Cacho Picante',
];

function createRoom(hostId, hostUsername, options = {}) {
    const roomId = uuidv4().slice(0, 8);
    const room = {
        id: roomId,
        name: options.name || `Sala de ${hostUsername}`,
        host: hostId,
        mode: options.mode || '1v1', // '1v1' or '2v2'
        maxPlayers: options.mode === '2v2' ? 4 : 2,
        players: [{
            id: hostId,
            username: hostUsername,
            team: 0,
            ready: false,
        }],
        spectators: [],
        status: 'waiting', // waiting, playing, finished
        gameState: null,
        isPrivate: options.isPrivate || false,
        password: options.password || null,
        createdAt: Date.now(),
        timeLimit: options.timeLimit || 0, // 0, 5, or 10 minutes
        isBot: false,
        botPlayers: [], // bot player ids in this room
    };

    rooms.set(roomId, room);
    playerRooms.set(hostId, roomId);
    return room;
}

// ============================================================================
// BOT ROOMS — always available in lobby
// ============================================================================

const BOT_ROOM_CONFIGS = [
    // 1v1 bot rooms
    { id: 'bot-loco-5', name: '⚡ El Loco (5 min)', botName: 'El Loco', mode: '1v1', timeLimit: 5 },
    { id: 'bot-gaucho-10', name: '🧉 El Gaucho (10 min)', botName: 'El Gaucho', mode: '1v1', timeLimit: 10 },
    { id: 'bot-gringa-0', name: '🃏 La Gringa (sin tiempo)', botName: 'La Gringa', mode: '1v1', timeLimit: 0 },
    { id: 'bot-mazo-5', name: '⚡ Tito Mazo (5 min)', botName: 'Tito Mazo', mode: '1v1', timeLimit: 5 },
    // 2v2 bot rooms — human + bot partner vs 2 bots
    {
        id: 'bot-2v2-barrio-10',
        name: '🏘️ La Mesa del Barrio (2v2 · 10 min)',
        mode: '2v2',
        timeLimit: 10,
        bots: [
            { name: 'Mate Amargo', team: 0 },   // your partner
            { name: 'Doña Falta', team: 1 },     // opponent
            { name: 'Pepe Truco', team: 1 },     // opponent
        ],
    },
    {
        id: 'bot-2v2-almacen-0',
        name: '🍷 El Almacén de Don Julio (2v2 · sin tiempo)',
        mode: '2v2',
        timeLimit: 0,
        bots: [
            { name: 'La Flor', team: 0 },        // your partner
            { name: 'El Rengo', team: 1 },        // opponent
            { name: 'Cacho Picante', team: 1 },   // opponent
        ],
    },
];

function ensureBotRooms() {
    for (const cfg of BOT_ROOM_CONFIGS) {
        if (!rooms.has(cfg.id)) {
            createBotRoom(cfg);
        } else {
            // If room finished, recreate it
            const existing = rooms.get(cfg.id);
            if (existing.status === 'finished') {
                // Clean up player mappings
                for (const p of existing.players) {
                    playerRooms.delete(p.id);
                }
                rooms.delete(cfg.id);
                createBotRoom(cfg);
            }
        }
    }
}

function createBotRoom(cfg) {
    const botPlayers = [];
    const players = [];

    if (cfg.bots) {
        // 2v2 multi-bot room
        for (const bot of cfg.bots) {
            const botId = `bot-${cfg.id}-${bot.name.replace(/\s+/g, '-').toLowerCase()}`;
            botPlayers.push(botId);
            players.push({
                id: botId,
                username: bot.name,
                team: bot.team,
                ready: true,
                isBot: true,
            });
        }
    } else {
        // 1v1 single-bot room
        const botId = `bot-${cfg.id}`;
        botPlayers.push(botId);
        players.push({
            id: botId,
            username: cfg.botName,
            team: 1,
            ready: true,
            isBot: true,
        });
    }

    const room = {
        id: cfg.id,
        name: cfg.name,
        host: botPlayers[0],
        mode: cfg.mode,
        maxPlayers: cfg.mode === '2v2' ? 4 : 2,
        players,
        spectators: [],
        status: 'waiting',
        gameState: null,
        isPrivate: false,
        password: null,
        createdAt: Date.now(),
        timeLimit: cfg.timeLimit,
        isBot: true,
        botPlayers,
    };
    rooms.set(cfg.id, room);
    return room;
}

// Ensure bot rooms exist on startup
ensureBotRooms();

function joinRoom(roomId, playerId, username, password = null) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Room not found' };
    if (room.status !== 'waiting') return { error: 'Game already in progress' };
    if (room.players.length >= room.maxPlayers) return { error: 'Room is full' };
    if (room.password && room.password !== password) return { error: 'Wrong password' };

    // Check if already in room
    if (room.players.find(p => p.id === playerId)) return { error: 'Already in room' };

    // Leave current room if in one
    leaveRoom(playerId);

    // Auto-assign team
    let team;
    const team0Count = room.players.filter(p => p.team === 0).length;
    const team1Count = room.players.filter(p => p.team === 1).length;
    if (room.mode === '1v1') {
        team = team0Count === 0 ? 0 : 1;
    } else {
        team = team0Count <= team1Count ? 0 : 1;
    }

    room.players.push({
        id: playerId,
        username,
        team,
        ready: false,
    });

    playerRooms.set(playerId, roomId);
    return { room };
}

function spectateRoom(roomId, playerId, username) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Room not found' };

    // Leave current room if in one
    leaveRoom(playerId);

    room.spectators.push({ id: playerId, username });
    playerRooms.set(playerId, roomId);
    return { room };
}

function leaveRoom(playerId) {
    const roomId = playerRooms.get(playerId);
    if (!roomId) return null;

    const room = rooms.get(roomId);
    if (!room) {
        playerRooms.delete(playerId);
        return null;
    }

    // Remove from players
    room.players = room.players.filter(p => p.id !== playerId);
    // Remove from spectators
    room.spectators = room.spectators.filter(s => s.id !== playerId);

    playerRooms.delete(playerId);

    // If room is empty, delete it
    if (room.players.length === 0 && room.spectators.length === 0) {
        rooms.delete(roomId);
        return { roomDeleted: true, roomId };
    }

    // If host left, transfer to next player
    if (room.host === playerId && room.players.length > 0) {
        room.host = room.players[0].id;
    }

    return { room };
}

function setReady(roomId, playerId, ready) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Room not found' };

    const player = room.players.find(p => p.id === playerId);
    if (!player) return { error: 'Not in room' };

    player.ready = ready;

    // Check if all players ready and room is full
    const allReady = room.players.length === room.maxPlayers &&
                     room.players.every(p => p.ready);

    return { room, allReady };
}

function startGame(roomId) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Room not found' };
    if (room.players.length < room.maxPlayers) return { error: 'Not enough players' };

    room.status = 'playing';

    const gameState = createGameState(room.mode, { timeLimit: room.timeLimit || 0 });
    gameState.startedAt = Date.now();

    // Set up players in game state — alternate teams for proper seating
    // Seating order: team0-p1, team1-p1, team0-p2, team1-p2
    const team0Players = room.players.filter(p => p.team === 0);
    const team1Players = room.players.filter(p => p.team === 1);
    const seated = [];
    const maxPerTeam = Math.max(team0Players.length, team1Players.length);
    for (let i = 0; i < maxPerTeam; i++) {
        if (team0Players[i]) seated.push(team0Players[i]);
        if (team1Players[i]) seated.push(team1Players[i]);
    }

    for (const p of seated) {
        gameState.players.push({
            id: p.id,
            username: p.username,
            team: p.team,
            hand: [],
            envidoScore: 0,
            isBot: p.isBot || false,
        });
    }

    room.gameState = gameState;

    // Deal first hand
    const dealResult = dealHand(gameState);

    return { room, gameState, dealResult };
}

function isBotPlayer(room, playerId) {
    return room.botPlayers && room.botPlayers.includes(playerId);
}

function resetBotRoom(roomId) {
    const cfg = BOT_ROOM_CONFIGS.find(c => c.id === roomId);
    if (!cfg) return;
    const old = rooms.get(roomId);
    if (old) {
        for (const p of old.players) {
            if (!old.botPlayers.includes(p.id)) {
                playerRooms.delete(p.id);
            }
        }
    }
    rooms.delete(roomId);
    createBotRoom(cfg);
}

function switchTeam(roomId, playerId) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Room not found' };
    if (room.mode !== '2v2') return { error: 'Team switch only for 2v2' };

    const player = room.players.find(p => p.id === playerId);
    if (!player) return { error: 'Not in room' };

    const newTeam = 1 - player.team;
    const teamCount = room.players.filter(p => p.team === newTeam).length;
    if (teamCount >= 2) return { error: 'Team is full' };

    player.team = newTeam;
    return { room };
}

function getPublicRooms() {
    ensureBotRooms(); // Make sure bot rooms always exist
    const publicRooms = [];
    for (const [id, room] of rooms) {
        if (!room.isPrivate) {
            publicRooms.push({
                id: room.id,
                name: room.name,
                mode: room.mode,
                players: room.players.map(p => ({
                    username: p.username, team: p.team, ready: p.ready, isBot: p.isBot || false
                })),
                spectators: room.spectators.length,
                maxPlayers: room.maxPlayers,
                status: room.status,
                host: room.players.find(p => p.id === room.host)?.username || '???',
                timeLimit: room.timeLimit || 0,
                isBot: room.isBot || false,
            });
        }
    }
    // Sort: bot rooms first, then by creation time
    publicRooms.sort((a, b) => {
        if (a.isBot && !b.isBot) return -1;
        if (!a.isBot && b.isBot) return 1;
        return 0;
    });
    return publicRooms;
}

function getRoom(roomId) {
    return rooms.get(roomId);
}

function getPlayerRoom(playerId) {
    const roomId = playerRooms.get(playerId);
    return roomId ? rooms.get(roomId) : null;
}

module.exports = {
    createRoom, joinRoom, spectateRoom, leaveRoom,
    setReady, startGame, switchTeam,
    getPublicRooms, getRoom, getPlayerRoom,
    isBotPlayer, resetBotRoom, ensureBotRooms, BOT_ROOM_CONFIGS,
};
