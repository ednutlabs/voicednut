const sqlite3 = require('sqlite3').verbose();
const path = require('path');

function setup() {
    const db = new sqlite3.Database(path.join(__dirname, './db/data.db'));

    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS calls (
            call_sid TEXT PRIMARY KEY,
            phone_number TEXT,
            prompt TEXT,
            first_message TEXT,
            user_chat_id INTEGER,
            status TEXT DEFAULT 'initiated',
            transcription TEXT,
            summary TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    });

    db.close();
}

module.exports = { setup };