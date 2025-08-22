// api/database/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      const dbPath = path.join(__dirname, 'data.db');
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err.message);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.initializeTables()
            .then(() => {
              this.isInitialized = true;
              resolve();
            })
            .catch(reject);
        }
      });
    });
  }

  initializeTables() {
    return new Promise((resolve, reject) => {
      let tablesCreated = 0;
      const totalTables = 4;
      
      const checkCompletion = (err) => {
        if (err) {
          console.error('Error creating table:', err.message);
          reject(err);
          return;
        }
        tablesCreated++;
        if (tablesCreated === totalTables) {
          console.log('Database tables initialized');
          resolve();
        }
      };

      // Calls table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS calls (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          call_sid TEXT UNIQUE NOT NULL,
          phone_number TEXT NOT NULL,
          prompt TEXT NOT NULL,
          first_message TEXT NOT NULL,
          user_chat_id TEXT,
          status TEXT DEFAULT 'initiated',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          started_at DATETIME,
          ended_at DATETIME,
          duration INTEGER,
          call_summary TEXT,
          ai_analysis TEXT
        )
      `, checkCompletion);

      // Transcripts table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS transcripts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          call_sid TEXT NOT NULL,
          speaker TEXT NOT NULL,
          message TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          interaction_count INTEGER,
          confidence REAL,
          FOREIGN KEY (call_sid) REFERENCES calls (call_sid)
        )
      `, checkCompletion);

      // Call states table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS call_states (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          call_sid TEXT NOT NULL,
          state TEXT NOT NULL,
          state_data TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (call_sid) REFERENCES calls (call_sid)
        )
      `, checkCompletion);

      // Webhook notifications table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS webhook_notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          call_sid TEXT NOT NULL,
          notification_type TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          telegram_chat_id TEXT,
          sent_at DATETIME,
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (call_sid) REFERENCES calls (call_sid)
        )
      `, checkCompletion);
    });
  }

  // Call management methods
  createCall(callData) {
    return new Promise((resolve, reject) => {
      const { call_sid, phone_number, prompt, first_message, user_chat_id } = callData;
      
      this.db.run(`
        INSERT INTO calls (call_sid, phone_number, prompt, first_message, user_chat_id, status)
        VALUES (?, ?, ?, ?, ?, 'initiated')
      `, [call_sid, phone_number, prompt, first_message, user_chat_id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, call_sid });
        }
      });
    });
  }

  updateCallStatus(call_sid, status, additionalData = {}) {
    return new Promise((resolve, reject) => {
      let query = 'UPDATE calls SET status = ?';
      let params = [status];

      if (additionalData.started_at) {
        query += ', started_at = ?';
        params.push(additionalData.started_at);
      }
      if (additionalData.ended_at) {
        query += ', ended_at = ?';
        params.push(additionalData.ended_at);
      }
      if (additionalData.duration) {
        query += ', duration = ?';
        params.push(additionalData.duration);
      }
      if (additionalData.call_summary) {
        query += ', call_summary = ?';
        params.push(additionalData.call_summary);
      }
      if (additionalData.ai_analysis) {
        query += ', ai_analysis = ?';
        params.push(additionalData.ai_analysis);
      }

      query += ' WHERE call_sid = ?';
      params.push(call_sid);

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Transcript management methods
  addTranscript(transcriptData) {
    return new Promise((resolve, reject) => {
      const { call_sid, speaker, message, interaction_count, confidence } = transcriptData;
      
      this.db.run(`
        INSERT INTO transcripts (call_sid, speaker, message, interaction_count, confidence)
        VALUES (?, ?, ?, ?, ?)
      `, [call_sid, speaker, message, interaction_count, confidence || null], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  getCallTranscripts(call_sid) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM transcripts 
        WHERE call_sid = ? 
        ORDER BY timestamp ASC
      `, [call_sid], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Call state management
  updateCallState(call_sid, state, state_data = null) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO call_states (call_sid, state, state_data)
        VALUES (?, ?, ?)
      `, [call_sid, state, JSON.stringify(state_data)], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  // Webhook notification methods
  createWebhookNotification(call_sid, notification_type, telegram_chat_id) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO webhook_notifications (call_sid, notification_type, telegram_chat_id)
        VALUES (?, ?, ?)
      `, [call_sid, notification_type, telegram_chat_id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  updateWebhookNotification(id, status, error_message = null, sent_at = null) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE webhook_notifications 
        SET status = ?, error_message = ?, sent_at = ?, retry_count = retry_count + 1
        WHERE id = ?
      `, [status, error_message, sent_at || new Date().toISOString(), id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  getPendingWebhookNotifications() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT wn.*, c.phone_number, c.call_summary, c.ai_analysis
        FROM webhook_notifications wn
        JOIN calls c ON wn.call_sid = c.call_sid
        WHERE wn.status = 'pending' AND wn.retry_count < 3
        ORDER BY wn.created_at ASC
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Analytics and reporting methods
  getCall(call_sid) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT * FROM calls WHERE call_sid = ?
      `, [call_sid], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  getCallsWithTranscripts(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT c.*, 
               COUNT(t.id) as transcript_count,
               MAX(t.timestamp) as last_transcript_time
        FROM calls c
        LEFT JOIN transcripts t ON c.call_sid = t.call_sid
        GROUP BY c.call_sid
        ORDER BY c.created_at DESC
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('Database connection closed');
        }
        resolve();
      });
    });
  }
}

module.exports = Database;