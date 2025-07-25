const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, './db/data.db'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS calls (
    call_uuid TEXT PRIMARY KEY,
    phone_number TEXT,
    prompt TEXT,
    first_message TEXT,
    user_chat_id INTEGER,
    status TEXT DEFAULT 'initiated',
    call_sid TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

function logCall({ call_uuid, phone_number, prompt, first_message, user_chat_id }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO calls (call_uuid, phone_number, prompt, first_message, user_chat_id) 
       VALUES (?, ?, ?, ?, ?)`,
      [call_uuid, phone_number, prompt, first_message, user_chat_id],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function updateCallStatus(call_uuid, status, call_sid = null) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE calls SET status = ?, call_sid = ? WHERE call_uuid = ?`,
      [status, call_sid, call_uuid],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

function getCall(call_uuid) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM calls WHERE call_uuid = ?`, 
      [call_uuid], 
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

module.exports = { logCall, getCall, updateCallStatus };