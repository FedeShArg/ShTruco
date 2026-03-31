// TRUCO Sh! — Multiplayer Server
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { initDatabase } = require('./db/database');
const { router: authRouter } = require('./auth/auth');
const { setupSocketHandlers, startLobbyBots } = require('./socket/socket-handler');

const PORT = process.env.PORT || 3000;

async function main() {
    // Init database
    await initDatabase();

    const app = express();
    const server = http.createServer(app);

    // Socket.io
    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Serve static client files
    app.use(express.static(path.join(__dirname, '..', 'client'), { etag: false, maxAge: 0 }));

    // Auth routes
    app.use('/api/auth', authRouter);

    // Health check
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', uptime: process.uptime() });
    });

    // Fallback to client (SPA routing)
    app.use((req, res, next) => {
        if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/socket.io/')) {
            res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
        } else {
            next();
        }
    });

    // Socket handlers
    setupSocketHandlers(io);

    // Start lobby bots (10 fake users chatting & creating rooms)
    startLobbyBots(io);

    server.listen(PORT, () => {
        console.log(`\n  TRUCO Sh! Server running on http://localhost:${PORT}\n`);
    });
}

main().catch(console.error);
