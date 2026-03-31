// Authentication routes
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { run, get } = require('../db/database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'shtruco-secret';

// Signup
router.post('/signup', async (req, res) => {
    try {
        const { email, username, password } = req.body;

        if (!email || !username || !password) {
            return res.status(400).json({ error: 'Email, username, and password are required' });
        }
        if (password.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }
        if (username.length < 2 || username.length > 20) {
            return res.status(400).json({ error: 'Username must be 2-20 characters' });
        }

        // Check if email or username exists
        const existingEmail = get('SELECT id FROM users WHERE email = ?', [email]);
        if (existingEmail) {
            return res.status(409).json({ error: 'Email already registered' });
        }
        const existingUsername = get('SELECT id FROM users WHERE username = ?', [username]);
        if (existingUsername) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        const id = uuidv4();
        const password_hash = await bcrypt.hash(password, 10);

        run('INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)',
            [id, email, username, password_hash]);

        const token = jwt.sign({ id, username, email }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            token,
            user: { id, username, email, wins: 0, losses: 0, elo: 1000 }
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = get('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        run('UPDATE users SET last_login = datetime("now") WHERE id = ?', [user.id]);

        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                wins: user.wins,
                losses: user.losses,
                elo: user.elo
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Middleware to verify JWT
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Verify socket token
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

// Get profile
router.get('/profile', authMiddleware, (req, res) => {
    const user = get('SELECT id, email, username, wins, losses, elo, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
});

// Leaderboard
router.get('/leaderboard', (req, res) => {
    const { all: allFn } = require('../db/database');
    const users = allFn('SELECT username, wins, losses, elo FROM users ORDER BY elo DESC LIMIT 20');
    res.json({ leaderboard: users });
});

module.exports = { router, authMiddleware, verifyToken };
