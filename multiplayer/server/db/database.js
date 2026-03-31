// Database module using sql.js (pure JS SQLite)
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;
const DB_PATH = process.env.DB_PATH || './shtruco.db';

async function initDatabase() {
    const SQL = await initSqlJs();

    // Load existing DB or create new
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            elo INTEGER DEFAULT 1000,
            created_at TEXT DEFAULT (datetime('now')),
            last_login TEXT DEFAULT (datetime('now'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS games (
            id TEXT PRIMARY KEY,
            mode TEXT NOT NULL,
            status TEXT DEFAULT 'in_progress',
            winner_id TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            finished_at TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS game_players (
            game_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            team INTEGER DEFAULT 0,
            score INTEGER DEFAULT 0,
            PRIMARY KEY (game_id, user_id),
            FOREIGN KEY (game_id) REFERENCES games(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    saveDatabase();
    console.log('Database initialized');
    return db;
}

function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

function getDb() {
    return db;
}

// Helper query functions
function run(sql, params = []) {
    db.run(sql, params);
    saveDatabase();
}

function get(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

function all(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

module.exports = { initDatabase, getDb, saveDatabase, run, get, all };
