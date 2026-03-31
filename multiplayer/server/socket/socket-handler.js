// Socket.io event handler
const { verifyToken } = require('../auth/auth');
const roomManager = require('../rooms/room-manager');
const engine = require('../game/truco-engine');
const { run, get } = require('../db/database');

const onlinePlayers = new Map(); // socketId -> { id, username }
const gameTimers = new Map(); // roomId -> intervalId

// Bot chat phrases
const BOT_PHRASES = [
    '¡Dale nomas!', 'Vamos a ver...', '¡Epa!', 'Te voy a ganar, pibe',
    'Esto es truco, no poker', '¡Qué cartas!', 'Acá mando yo',
    'Jugá tranquilo...', '¡Sos pollo!', 'Me sobran cartas',
    '¡Vamo arriba!', 'Mirá vos...', '¡Qué partida!',
];

function setupSocketHandlers(io) {
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication required'));

        const user = verifyToken(token);
        if (!user) return next(new Error('Invalid token'));

        socket.user = user;
        next();
    });

    io.on('connection', (socket) => {
        const user = socket.user;
        onlinePlayers.set(socket.id, { id: user.id, username: user.username });
        console.log(`${user.username} connected`);

        // Send online count
        io.emit('online_count', onlinePlayers.size);

        // ---- LOBBY ----

        // Join lobby channel
        socket.join('lobby');

        socket.on('get_rooms', () => {
            socket.emit('rooms_list', roomManager.getPublicRooms());
        });

        socket.on('lobby_chat', (msg) => {
            if (!msg || typeof msg !== 'string') return;
            io.to('lobby').emit('lobby_chat', {
                username: user.username,
                message: msg.slice(0, 200),
                timestamp: Date.now(),
            });
        });

        socket.on('create_room', (options) => {
            const room = roomManager.createRoom(user.id, user.username, options || {});
            socket.leave('lobby');
            socket.join(room.id);
            socket.emit('room_joined', sanitizeRoom(room, user.id));
            io.emit('rooms_list', roomManager.getPublicRooms());
        });

        socket.on('join_room', ({ roomId, password }) => {
            const result = roomManager.joinRoom(roomId, user.id, user.username, password);
            if (result.error) {
                socket.emit('error_msg', result.error);
                return;
            }
            socket.leave('lobby');
            socket.join(roomId);
            socket.emit('room_joined', sanitizeRoom(result.room, user.id));
            io.to(roomId).emit('room_updated', sanitizeRoom(result.room));
            io.emit('rooms_list', roomManager.getPublicRooms());

            // Auto-start bot rooms when a human joins
            if (result.room.isBot && result.room.players.length >= result.room.maxPlayers) {
                setTimeout(() => {
                    const startResult = roomManager.startGame(roomId);
                    if (!startResult.error) {
                        emitGameStart(io, startResult.room, startResult.gameState, startResult.dealResult);
                    }
                }, 1000);
            }
        });

        socket.on('spectate_room', ({ roomId }) => {
            const result = roomManager.spectateRoom(roomId, user.id, user.username);
            if (result.error) {
                socket.emit('error_msg', result.error);
                return;
            }
            socket.join(roomId);
            socket.emit('spectating', sanitizeRoom(result.room, user.id));
            io.to(roomId).emit('room_updated', sanitizeRoom(result.room));
        });

        socket.on('leave_room', () => {
            handleLeaveRoom(socket, io, user);
        });

        socket.on('set_ready', (ready) => {
            const room = roomManager.getPlayerRoom(user.id);
            if (!room) return;

            const result = roomManager.setReady(room.id, user.id, ready);
            if (result.error) {
                socket.emit('error_msg', result.error);
                return;
            }

            io.to(room.id).emit('room_updated', sanitizeRoom(result.room));

            // Auto-start when all ready
            if (result.allReady) {
                const startResult = roomManager.startGame(room.id);
                if (startResult.error) {
                    io.to(room.id).emit('error_msg', startResult.error);
                    return;
                }
                emitGameStart(io, startResult.room, startResult.gameState, startResult.dealResult);
            }
        });

        socket.on('switch_team', () => {
            const room = roomManager.getPlayerRoom(user.id);
            if (!room) return;
            const result = roomManager.switchTeam(room.id, user.id);
            if (result.error) {
                socket.emit('error_msg', result.error);
                return;
            }
            io.to(room.id).emit('room_updated', sanitizeRoom(result.room));
        });

        // ---- GAME ACTIONS ----

        socket.on('play_card', ({ cardIndex }) => {
            const room = roomManager.getPlayerRoom(user.id);
            if (!room || !room.gameState) return;

            const result = engine.playCard(room.gameState, user.id, cardIndex);
            if (result.error) {
                socket.emit('error_msg', result.error);
                return;
            }

            emitGameEvent(io, room, result);

            // If hand finished, deal next or end game
            if (result.handResult) {
                handleHandResult(io, room, result.handResult);
            } else {
                // Schedule bot action if it's now the bot's turn
                scheduleBotAction(io, room);
            }
        });

        socket.on('call_envido', ({ level }) => {
            const room = roomManager.getPlayerRoom(user.id);
            if (!room || !room.gameState) return;

            const result = engine.callEnvido(room.gameState, user.id, level);
            if (result.error) {
                socket.emit('error_msg', result.error);
                return;
            }
            emitGameEvent(io, room, result);
            // Bot needs to respond to envido
            scheduleBotAction(io, room);
        });

        socket.on('respond_envido', ({ accept }) => {
            const room = roomManager.getPlayerRoom(user.id);
            if (!room || !room.gameState) return;

            const result = engine.respondEnvido(room.gameState, user.id, accept);
            if (result.error) {
                socket.emit('error_msg', result.error);
                return;
            }
            result.responderUsername = user.username;
            emitGameEvent(io, room, result);

            if (result.gameOver) {
                handleGameOver(io, room, result);
            } else {
                // Bot may need to play next
                scheduleBotAction(io, room);
            }
        });

        socket.on('call_truco', () => {
            const room = roomManager.getPlayerRoom(user.id);
            if (!room || !room.gameState) return;

            const result = engine.callTruco(room.gameState, user.id);
            if (result.error) {
                socket.emit('error_msg', result.error);
                return;
            }
            emitGameEvent(io, room, result);
            // Bot needs to respond to truco
            scheduleBotAction(io, room);
        });

        socket.on('respond_truco', ({ response }) => {
            const room = roomManager.getPlayerRoom(user.id);
            if (!room || !room.gameState) return;

            const result = engine.respondTruco(room.gameState, user.id, response);
            if (result.error) {
                socket.emit('error_msg', result.error);
                return;
            }
            result.responderUsername = user.username;
            emitGameEvent(io, room, result);

            if (result.handOver) {
                handleHandResult(io, room, result);
            } else {
                // Bot may need to play next
                scheduleBotAction(io, room);
            }
        });

        socket.on('go_mazo', () => {
            const room = roomManager.getPlayerRoom(user.id);
            if (!room || !room.gameState) return;

            const result = engine.goToMazo(room.gameState, user.id);
            if (result.error) {
                socket.emit('error_msg', result.error);
                return;
            }
            emitGameEvent(io, room, result);
            handleHandResult(io, room, result);
        });

        // ---- CHAT ----

        socket.on('chat_message', (msg) => {
            const room = roomManager.getPlayerRoom(user.id);
            if (!room) return;
            io.to(room.id).emit('chat_message', {
                username: user.username,
                message: msg.slice(0, 200), // limit length
                timestamp: Date.now(),
            });
        });

        // ---- SEÑAS (2v2 only) ----

        socket.on('send_sena', ({ sena }) => {
            const room = roomManager.getPlayerRoom(user.id);
            if (!room || room.mode !== '2v2' || !room.gameState) return;

            const myTeam = engine.getPlayerTeam(room.gameState, user.id);
            const teammates = engine.getTeamPlayers(room.gameState, myTeam)
                .filter(p => p.id !== user.id);

            // Send seña only to teammate
            for (const teammate of teammates) {
                const teamSocket = findSocketByUserId(io, teammate.id);
                if (teamSocket) {
                    teamSocket.emit('sena_received', {
                        from: user.username,
                        sena,
                    });
                }
            }
        });

        // ---- DISCONNECT ----

        socket.on('disconnect', () => {
            onlinePlayers.delete(socket.id);
            handleLeaveRoom(socket, io, user);
            io.emit('online_count', onlinePlayers.size);
            console.log(`${user.username} disconnected`);
        });
    });
}

function handleLeaveRoom(socket, io, user) {
    const room = roomManager.getPlayerRoom(user.id);
    if (!room) return;

    const roomId = room.id;
    const result = roomManager.leaveRoom(user.id);
    socket.leave(roomId);
    socket.join('lobby');

    if (result && !result.roomDeleted) {
        io.to(roomId).emit('room_updated', sanitizeRoom(result.room));
        io.to(roomId).emit('player_left', { username: user.username });

        // If game was in progress, the remaining player wins
        if (result.room && result.room.status === 'playing' && result.room.gameState) {
            const gs = result.room.gameState;
            const remainingPlayer = gs.players.find(p => p.id !== user.id);
            if (remainingPlayer) {
                gs.phase = 'finished';
                io.to(roomId).emit('game_event', {
                    type: 'opponent_disconnected',
                    winner: remainingPlayer.username,
                });
            }
            result.room.status = 'finished';
        }
    }

    io.emit('rooms_list', roomManager.getPublicRooms());
}

function emitGameStart(io, room, gameState, dealResult) {
    // Send personalized state to each player
    for (const player of gameState.players) {
        const sock = findSocketByUserId(io, player.id);
        if (sock) {
            // In 2v2, include bot partner's hand so the human can see their ally's cards
            const partnerHands = {};
            if (gameState.mode === '2v2') {
                for (const p of gameState.players) {
                    if (p.id !== player.id && p.team === player.team && p.isBot) {
                        partnerHands[p.id] = p.hand;
                    }
                }
            }

            sock.emit('game_start', {
                mode: gameState.mode,
                players: gameState.players.map(p => ({
                    id: p.id,
                    username: p.username,
                    team: p.team,
                    cardCount: p.hand.length,
                    isBot: p.isBot || false,
                })),
                yourHand: player.hand,
                yourTeam: player.team,
                partnerHands,
                scores: gameState.scores,
                mano: dealResult.mano,
                manoUsername: dealResult.manoUsername,
                handNumber: dealResult.handNumber,
                currentTurn: gameState.currentTurnPlayer,
                timeLimit: gameState.timeLimit || 0,
            });
        }
    }

    // Spectators see no hands
    for (const spec of room.spectators) {
        const sock = findSocketByUserId(io, spec.id);
        if (sock) {
            sock.emit('game_start', {
                mode: gameState.mode,
                players: gameState.players.map(p => ({
                    id: p.id,
                    username: p.username,
                    team: p.team,
                    cardCount: p.hand.length,
                })),
                yourHand: null,
                spectating: true,
                scores: gameState.scores,
                mano: dealResult.mano,
                manoUsername: dealResult.manoUsername,
                handNumber: dealResult.handNumber,
                currentTurn: gameState.currentTurnPlayer,
            });
        }
    }

    io.to(room.id).emit('room_updated', sanitizeRoom(room));

    // Start timer if time-limited
    startGameTimer(io, room);

    // If it's a bot's turn, schedule bot action
    scheduleBotAction(io, room);
}

function emitGameEvent(io, room, event) {
    // Send game events to all in room
    io.to(room.id).emit('game_event', event);

    // Send updated hands/phase/turn after state-changing events
    if (event.type === 'round_resolved' || event.type === 'card_played' ||
        event.type === 'envido_called' || event.type === 'envido_resolved' ||
        event.type === 'truco_called' || event.type === 'truco_resolved') {
        for (const player of room.gameState.players) {
            const sock = findSocketByUserId(io, player.id);
            if (sock) {
                // Include bot partner's hand in 2v2
                const partnerHands = {};
                if (room.gameState.mode === '2v2') {
                    for (const p of room.gameState.players) {
                        if (p.id !== player.id && p.team === player.team && p.isBot) {
                            partnerHands[p.id] = p.hand;
                        }
                    }
                }
                sock.emit('hand_update', {
                    yourHand: player.hand,
                    currentTurn: room.gameState.currentTurnPlayer,
                    phase: room.gameState.phase,
                    partnerHands,
                });
            }
        }
    }
}

function handleHandResult(io, room, result) {
    io.to(room.id).emit('game_event', result);

    if (result.gameOver) {
        handleGameOver(io, room, result);
        return;
    }

    // Deal next hand after delay
    setTimeout(() => {
        if (room.gameState && room.gameState.phase !== 'finished') {
            const dealResult = engine.dealHand(room.gameState);
            emitNewHand(io, room, dealResult);
            // Schedule bot action for new hand
            scheduleBotAction(io, room);
        }
    }, 3000);
}

function emitNewHand(io, room, dealResult) {
    for (const player of room.gameState.players) {
        const sock = findSocketByUserId(io, player.id);
        if (sock) {
            // Include bot partner's hand in 2v2
            const partnerHands = {};
            if (room.gameState.mode === '2v2') {
                for (const p of room.gameState.players) {
                    if (p.id !== player.id && p.team === player.team && p.isBot) {
                        partnerHands[p.id] = p.hand;
                    }
                }
            }

            sock.emit('new_hand', {
                yourHand: player.hand,
                partnerHands,
                handNumber: dealResult.handNumber,
                mano: dealResult.mano,
                manoUsername: dealResult.manoUsername,
                scores: room.gameState.scores,
                currentTurn: room.gameState.currentTurnPlayer,
            });
        }
    }

    // Spectators
    for (const spec of room.spectators) {
        const sock = findSocketByUserId(io, spec.id);
        if (sock) {
            sock.emit('new_hand', {
                yourHand: null,
                spectating: true,
                handNumber: dealResult.handNumber,
                mano: dealResult.mano,
                manoUsername: dealResult.manoUsername,
                scores: room.gameState.scores,
                currentTurn: room.gameState.currentTurnPlayer,
            });
        }
    }
}

function handleGameOver(io, room, result) {
    room.status = 'finished';
    room.gameState.phase = 'finished';

    const winnerTeam = result.gameWinner !== undefined ? result.gameWinner : result.winnerTeam;
    const winners = room.gameState.players.filter(p => p.team === winnerTeam);
    const losers = room.gameState.players.filter(p => p.team !== winnerTeam);

    // Update stats
    for (const w of winners) {
        run('UPDATE users SET wins = wins + 1, elo = elo + 25 WHERE id = ?', [w.id]);
    }
    for (const l of losers) {
        run('UPDATE users SET losses = losses + 1, elo = MAX(0, elo - 20) WHERE id = ?', [l.id]);
    }

    io.to(room.id).emit('game_over', {
        winnerTeam,
        winners: winners.map(w => w.username),
        losers: losers.map(l => l.username),
        finalScores: room.gameState.scores,
    });

    // Clear timer if exists
    if (gameTimers.has(room.id)) {
        clearInterval(gameTimers.get(room.id));
        gameTimers.delete(room.id);
    }

    // Recreate bot room after a delay
    if (room.isBot) {
        setTimeout(() => {
            roomManager.resetBotRoom(room.id);
            io.emit('rooms_list', roomManager.getPublicRooms());
        }, 5000);
    }
}

// ============================================================================
// BOT AI — plays automatically when it's the bot's turn
// ============================================================================

function scheduleBotAction(io, room) {
    if (!room || !room.gameState || room.gameState.phase === 'finished') return;

    const gs = room.gameState;

    // Determine which bot needs to act based on the current game phase
    let actingBot = null;

    if (gs.phase === 'envido_decision') {
        // The envido responder needs to act
        actingBot = gs.players.find(p => p.id === gs.envidoResponder && p.isBot);
    } else if (gs.phase === 'truco_decision') {
        // The truco responder needs to act
        actingBot = gs.players.find(p => p.id === gs.trucoResponder && p.isBot);
    } else if (gs.phase === 'playing') {
        // The current turn player needs to act
        actingBot = gs.players.find(p => p.id === gs.currentTurnPlayer && p.isBot);
    }

    if (!actingBot) return;

    const botId = actingBot.id;
    const delay = 800 + Math.random() * 1200;

    setTimeout(() => {
        // Re-check state is still valid (use room.gameState, not stale gs)
        const currentGs = room.gameState;
        if (!currentGs || currentGs.phase === 'finished') return;

        const bot = currentGs.players.find(p => p.id === botId);
        if (!bot || !bot.isBot) return;

        // ---- ENVIDO RESPONSE ----
        if (currentGs.phase === 'envido_decision' && currentGs.envidoResponder === botId) {
            const accept = engine.botShouldAcceptEnvido(bot.envidoScore);
            const result = engine.respondEnvido(currentGs, botId, accept);
            if (!result.error) {
                result.responderUsername = bot.username;
                botChat(io, room, accept ? '¡Quiero!' : 'No quiero...');
                emitGameEvent(io, room, result);
                if (result.gameOver) {
                    handleGameOver(io, room, result);
                } else {
                    scheduleBotAction(io, room);
                }
            }
            return;
        }

        // ---- TRUCO RESPONSE ----
        if (currentGs.phase === 'truco_decision' && currentGs.trucoResponder === botId) {
            const strength = engine.botEvaluateHandStrength(bot.hand);
            let response;
            if (engine.botShouldRaiseTruco(strength) && currentGs.trucoLevel < 3) {
                response = 'raise';
                const nextName = currentGs.trucoLevel === 1 ? '¡Retruco!' : '¡Vale Cuatro!';
                botChat(io, room, nextName);
            } else if (engine.botShouldAcceptTruco(strength)) {
                response = 'accept';
                botChat(io, room, '¡Quiero!');
            } else {
                response = 'reject';
                botChat(io, room, 'No quiero...');
            }
            const result = engine.respondTruco(currentGs, botId, response);
            if (!result.error) {
                result.responderUsername = bot.username;
                emitGameEvent(io, room, result);
                if (result.handOver) {
                    handleHandResult(io, room, result);
                } else {
                    scheduleBotAction(io, room);
                }
            }
            return;
        }

        // ---- PLAYING PHASE ----
        if (currentGs.phase === 'playing' && currentGs.currentTurnPlayer === botId) {
            // Check if bot should call envido (first trick only)
            if (!currentGs.firstTrickDone && !currentGs.envidoCalled && currentGs.tricks.length === 0) {
                if (engine.botShouldCallEnvido(bot.envidoScore)) {
                    const envidoLevel = bot.envidoScore >= 30 ? 'falta_envido' :
                                        bot.envidoScore >= 27 ? 'real_envido' : 'envido';
                    const result = engine.callEnvido(currentGs, botId, envidoLevel);
                    if (!result.error) {
                        const name = envidoLevel === 'envido' ? '¡Envido!' :
                                     envidoLevel === 'real_envido' ? '¡Real Envido!' : '¡Falta Envido!';
                        botChat(io, room, name);
                        emitGameEvent(io, room, result);
                        // Schedule the responder (might be another bot or human)
                        scheduleBotAction(io, room);
                        return;
                    }
                }
            }

            // Check if bot should call truco
            const strength = engine.botEvaluateHandStrength(bot.hand);
            if (!currentGs.trucoCalled && currentGs.trucoLevel < 3 && currentGs.trucoLastCaller !== botId) {
                if (engine.botShouldCallTruco(strength)) {
                    const result = engine.callTruco(currentGs, botId);
                    if (!result.error) {
                        botChat(io, room, `¡${result.levelName}!`);
                        emitGameEvent(io, room, result);
                        // Schedule the responder (might be another bot or human)
                        scheduleBotAction(io, room);
                        return;
                    }
                }
            }

            // Play a card — find an opponent's card on the table to respond to
            const opponentTeam = bot.team === 0 ? 1 : 0;
            const opponentCards = currentGs.players
                .filter(p => p.team === opponentTeam)
                .map(p => currentGs.currentRoundCards[p.id])
                .filter(Boolean);
            const opponentCard = opponentCards.length > 0 ? opponentCards[0] : null;

            const cardIndex = engine.botChooseCardIndex(bot.hand, opponentCard);

            if (cardIndex >= 0 && cardIndex < bot.hand.length) {
                const result = engine.playCard(currentGs, botId, cardIndex);
                if (!result.error) {
                    emitGameEvent(io, room, result);
                    if (result.handResult) {
                        handleHandResult(io, room, result.handResult);
                    } else {
                        scheduleBotAction(io, room);
                    }
                }
            }
        }
    }, delay);
}

function botChat(io, room, msg) {
    io.to(room.id).emit('chat_message', {
        username: room.botPlayers ? getBotUsername(room) : 'Bot',
        message: msg,
        timestamp: Date.now(),
        isBot: true,
    });
    // Occasionally add a random flavor phrase
    if (Math.random() < 0.3) {
        setTimeout(() => {
            const phrase = BOT_PHRASES[Math.floor(Math.random() * BOT_PHRASES.length)];
            io.to(room.id).emit('chat_message', {
                username: getBotUsername(room),
                message: phrase,
                timestamp: Date.now(),
                isBot: true,
            });
        }, 500 + Math.random() * 1000);
    }
}

function getBotUsername(room) {
    if (room.botPlayers && room.botPlayers.length > 0) {
        const botPlayer = room.gameState?.players.find(p => p.isBot);
        return botPlayer ? botPlayer.username : 'Bot';
    }
    return 'Bot';
}

// ============================================================================
// TIMER MANAGEMENT
// ============================================================================

function startGameTimer(io, room) {
    if (!room.timeLimit || room.timeLimit <= 0) return;

    const timerId = setInterval(() => {
        if (!room.gameState || room.gameState.phase === 'finished') {
            clearInterval(timerId);
            gameTimers.delete(room.id);
            return;
        }

        const elapsed = (Date.now() - room.gameState.startedAt) / 1000 / 60; // minutes
        const remaining = Math.max(0, room.timeLimit - elapsed);

        // Broadcast time remaining
        io.to(room.id).emit('timer_update', {
            remaining: Math.ceil(remaining * 60), // seconds
            timeLimit: room.timeLimit,
        });

        // Time's up
        if (remaining <= 0) {
            clearInterval(timerId);
            gameTimers.delete(room.id);
            room.gameState.timerExpired = true;

            // Whoever has more points wins
            const gs = room.gameState;
            let winner;
            if (gs.scores[0] > gs.scores[1]) winner = 0;
            else if (gs.scores[1] > gs.scores[0]) winner = 1;
            else winner = gs.mano; // Tie: mano wins

            gs.phase = 'finished';
            room.status = 'finished';

            io.to(room.id).emit('game_event', {
                type: 'time_up',
                winnerTeam: winner,
                finalScores: [...gs.scores],
            });

            const result = {
                gameOver: true,
                gameWinner: winner,
            };
            handleGameOver(io, room, result);
        }
    }, 1000);

    gameTimers.set(room.id, timerId);
}

function findSocketByUserId(io, userId) {
    for (const [socketId, data] of onlinePlayers) {
        if (data.id === userId) {
            return io.sockets.sockets.get(socketId);
        }
    }
    return null;
}

function sanitizeRoom(room, forPlayerId = null) {
    return {
        id: room.id,
        name: room.name,
        mode: room.mode,
        maxPlayers: room.maxPlayers,
        host: room.host,
        status: room.status,
        timeLimit: room.timeLimit || 0,
        isBot: room.isBot || false,
        players: room.players.map(p => ({
            id: p.id,
            username: p.username,
            team: p.team,
            ready: p.ready,
            isYou: p.id === forPlayerId,
            isBot: p.isBot || false,
        })),
        spectators: room.spectators.map(s => ({ username: s.username })),
    };
}

// ============================================================================
// LOBBY BOTS — 10 fake users that chat and create rooms
// ============================================================================

const LOBBY_BOTS = [
    { name: 'ElPibe_Tango', id: 'lobbybot_1' },
    { name: 'LaFlaca_77', id: 'lobbybot_2' },
    { name: 'Trucazo_LP', id: 'lobbybot_3' },
    { name: 'MateAmargo', id: 'lobbybot_4' },
    { name: 'ElRusoo', id: 'lobbybot_5' },
    { name: 'Gordito_Dch', id: 'lobbybot_6' },
    { name: 'Lali_Envido', id: 'lobbybot_7' },
    { name: 'NegroFacha', id: 'lobbybot_8' },
    { name: 'TucuPower', id: 'lobbybot_9' },
    { name: 'Chimi_Crack', id: 'lobbybot_10' },
    { name: 'Bokeee', id: 'lobbybot_11' },
    { name: 'elgordonumber1', id: 'lobbybot_12' },
];

const LOBBY_BOT_PHRASES = [
    // Invitations
    'quien se copa a jugar?? dale q no muerdo... mucho 😏',
    'necesito un rival digno aca puro cagon parece',
    'hay alguien con huevos pa jugar o son todos pecho frio??',
    'dale loco entrale a una sala q no como crudo',
    'armen una mesa q les voy a romper el orto a todos',
    'falta gente con sangre nadie se anima a un trucazo??',
    'quien se prende?? yo invito el mate y las puteadas',
    'vengan de a uno o de a dos me da igual les gano a todos',
    'estoy mas al pedo q cenicero de moto jugamos o q??',
    'cree sala el q no entra es cagon',
    'algun valiente?? o estan todos mirando como bobos',
    'dale papa metete a jugar q la vida es corta',
    'bueno quien juega?? no sean ortiva',
    'entren a mi sala manga de cagones',
    'dale dale q me aburro alguien juegue',

    // Trash talk
    'el ultimo q me desafio no volvio a jugar 💀',
    'aca se viene a ganar o a llorar vos elegis',
    'tengo la mano caliente ojo eh',
    'les aviso q soy mas pesado q collar de sandias',
    'hoy estoy imparable ni mi vieja me frena',
    'si me toca el ancho de espada les rompo el alma',
    'uff q lindo dia para humillar gente en el truco',
    'el q entra a mi sala sale llorando estan avisados',
    'soy inbatible hoy no me gana ni dios',
    'les meto 30 a 0 a todos no me importa nada',
    'jajaj el ultimo lloro mal re quemado se fue',

    // General banter
    'q embole nadie juega a esta hora??',
    'se murieron todos o q?? dale lacreeen',
    'bueno me hago un mate y vuelvo no se mueran',
    'jajaja terrible partida la de recien le meti 30-2',
    're manija estoy quiero truquear',
    'como andan piranias?? listos para perder??',
    'acabo de ganar 5 seguidas quien se anima a pararme',
    'esto es mas adictivo q el asado de los domingos',
    'pongan primera q arrancamos 🔥',
    'me aburro donde estan los cracks??',
    'toy en racha no me para ni la afip',
    'che tienen miedo o q onda??',
    'senores el truco se juega con los huevos en la mesa',
    'hoy vine manso picante ojo',
    'el q no arriesga no gana metanse a jugar cobardes',
    'alguien dijo truco?? dije TRUCO 🗣️',
    'arriba las palmas q llego el campeon 👑',
    'vine a romperla quien se prende??',
    'la ultima sala la gane de taquito jajaja',
    'eeee vamo a jugar q hacen ahi parados',
    'recien le gane a uno q se creia picante jajajaj',
    'no hay con q darme muchachos',
    'uh loco q cartas tenia recien no lo podia creer',
    'boludo me salio envido de 33 jajajajaj',
    'aca estamos los pibes tomando mate y trucando',
    'uuuh casi le gano pero se me dio vuelta el forro',

    // New phrases
    'Daleeeeeeeeee',
    'puros mancos aca...',
    'el de arriba se la come',
    'JIJIJIJIJI',
    'No lo soñeeeeeeeee',
];

const LOBBY_BOT_ROOM_NAMES = [
    'vengan si se animan 😤',
    'sala del campeon 👑',
    'entren cobardes',
    'aca se juega en serio',
    'mesa de los cracks',
    'ojo q muerdo',
    'solo pa valientes',
    'el q entra no sale',
    'truco a lo macho',
    'sala picante 🔥',
    'dale q va',
    'la mesa del barrio',
    'trucazo violento',
    'mesa brava',
    'pa los q saben',
];

let lobbyBotInterval = null;
let lobbyBotRoomInterval = null;
let lobbyBotsStarted = false;

function startLobbyBots(io) {
    if (lobbyBotsStarted) return;
    lobbyBotsStarted = true;

    // Chat: a random bot says something every 8-25 seconds (varying delay)
    function scheduleBotChat() {
        const delay = (8 + Math.random() * 17) * 1000;
        lobbyBotInterval = setTimeout(() => {
            const bot = LOBBY_BOTS[Math.floor(Math.random() * LOBBY_BOTS.length)];
            const phrase = LOBBY_BOT_PHRASES[Math.floor(Math.random() * LOBBY_BOT_PHRASES.length)];
            io.to('lobby').emit('lobby_chat', {
                username: bot.name,
                message: phrase,
                timestamp: Date.now(),
            });
            scheduleBotChat(); // schedule next with new random delay
        }, delay);
    }
    scheduleBotChat();

    // Occasionally a bot creates a room (every 45-90 seconds, varying)
    function scheduleBotRoom() {
        const delay = (45 + Math.random() * 45) * 1000;
        lobbyBotRoomInterval = setTimeout(() => {
            scheduleBotRoomAction();
            scheduleBotRoom(); // schedule next
        }, delay);
    }
    function scheduleBotRoomAction() {
        // Only create if there aren't already many bot lobby rooms waiting
        const publicRooms = roomManager.getPublicRooms();
        const waitingBotLobbyRooms = publicRooms.filter(r =>
            r.status === 'waiting' && !r.isBot && r.host && LOBBY_BOTS.some(b => b.name === r.host)
        );
        if (waitingBotLobbyRooms.length >= 2) return; // max 2 lobby-bot rooms at a time

        const bot = LOBBY_BOTS[Math.floor(Math.random() * LOBBY_BOTS.length)];
        const roomName = LOBBY_BOT_ROOM_NAMES[Math.floor(Math.random() * LOBBY_BOT_ROOM_NAMES.length)];
        const mode = Math.random() < 0.5 ? '1v1' : '2v2';

        const room = roomManager.createRoom(bot.id, bot.name, { name: roomName, mode, timeLimit: 0 });

        // Announce in chat
        io.to('lobby').emit('lobby_chat', {
            username: bot.name,
            message: `cree sala "${roomName}" — ${mode.toUpperCase()}, el q no entra es pecho frio 🧊⚪🔴`,
            timestamp: Date.now(),
        });
        io.emit('rooms_list', roomManager.getPublicRooms());

        // Bot leaves the room after 60-120s if nobody joined
        setTimeout(() => {
            const currentRoom = roomManager.getPlayerRoom(bot.id);
            if (currentRoom && currentRoom.id === room.id && currentRoom.status === 'waiting') {
                const humanJoined = currentRoom.players.some(p => !LOBBY_BOTS.some(b => b.id === p.id));
                if (!humanJoined) {
                    roomManager.leaveRoom(bot.id);
                    io.emit('rooms_list', roomManager.getPublicRooms());
                }
            }
        }, (60 + Math.random() * 60) * 1000);
    }
    scheduleBotRoom();

    // Patch: whenever online_count is emitted, add 10 bots
    const _origEmit = io.emit;
    io.emit = function(event, ...args) {
        if (event === 'online_count' && typeof args[0] === 'number') {
            args[0] = args[0] + LOBBY_BOTS.length;
        }
        return _origEmit.call(io, event, ...args);
    };

    // Send initial burst of chat messages with staggered timing
    let delay = 2000;
    const shuffled = [...LOBBY_BOTS].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 5; i++) {
        const bot = shuffled[i % shuffled.length];
        const phrase = LOBBY_BOT_PHRASES[Math.floor(Math.random() * LOBBY_BOT_PHRASES.length)];
        setTimeout(() => {
            io.to('lobby').emit('lobby_chat', {
                username: bot.name,
                message: phrase,
                timestamp: Date.now(),
            });
        }, delay);
        delay += 3000 + Math.random() * 4000;
    }

    // Create first bot room after 10s
    setTimeout(() => {
        const bot = shuffled[0];
        const roomName = LOBBY_BOT_ROOM_NAMES[Math.floor(Math.random() * LOBBY_BOT_ROOM_NAMES.length)];
        const room = roomManager.createRoom(bot.id, bot.name, { name: roomName, mode: '2v2', timeLimit: 0 });
        io.to('lobby').emit('lobby_chat', {
            username: bot.name,
            message: `arme sala "${roomName}" — 2v2, quien se copa?? 🔥`,
            timestamp: Date.now(),
        });
        io.emit('rooms_list', roomManager.getPublicRooms());

        // Auto-cleanup
        setTimeout(() => {
            const currentRoom = roomManager.getPlayerRoom(bot.id);
            if (currentRoom && currentRoom.id === room.id && currentRoom.status === 'waiting') {
                const humanJoined = currentRoom.players.some(p => !LOBBY_BOTS.some(b => b.id === p.id));
                if (!humanJoined) {
                    roomManager.leaveRoom(bot.id);
                    io.emit('rooms_list', roomManager.getPublicRooms());
                }
            }
        }, 90000);
    }, 10000);

    console.log('Lobby bots started: 10 bots active');
}

module.exports = { setupSocketHandlers, startLobbyBots };
