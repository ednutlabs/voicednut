// db/logger.js

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./calls.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS calls (
    call_uuid TEXT PRIMARY KEY,
    phone_number TEXT,
    prompt TEXT,
    first_message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

function logCall({ call_uuid, phone_number, prompt, first_message }) {
  db.run(
    `INSERT INTO calls (call_uuid, phone_number, prompt, first_message) VALUES (?, ?, ?, ?)`,
    [call_uuid, phone_number, prompt, first_message]
  );
}

function getCall(call_uuid, callback) {
  db.get(`SELECT * FROM calls WHERE call_uuid = ?`, [call_uuid], (err, row) => {
    if (err) return callback(null);
    callback(row);
  });
}

module.exports = { logCall, getCall };