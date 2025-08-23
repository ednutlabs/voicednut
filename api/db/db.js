const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.db = null;
        this.isInitialized = false;
        this.dbPath = path.join(__dirname, 'data.db');
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                    return;
                }
                console.log('Connected to SQLite database');
                this.createTables().then(() => {
                    this.isInitialized = true;
                    resolve();
                }).catch(reject);
            });
        });
    }

    async createTables() {
        const tables = [
            // Enhanced calls table with better status tracking
            `CREATE TABLE IF NOT EXISTS calls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                call_sid TEXT UNIQUE NOT NULL,
                phone_number TEXT NOT NULL,
                prompt TEXT,
                first_message TEXT,
                user_chat_id TEXT,
                status TEXT DEFAULT 'initiated',
                twilio_status TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                ended_at DATETIME,
                duration INTEGER,
                call_summary TEXT,
                ai_analysis TEXT
            )`,

            // Call transcripts table
            `CREATE TABLE IF NOT EXISTS call_transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                call_sid TEXT NOT NULL,
                speaker TEXT NOT NULL CHECK(speaker IN ('user', 'ai')),
                message TEXT NOT NULL,
                interaction_count INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(call_sid) REFERENCES calls(call_sid)
            )`,

            // Enhanced call states for real-time tracking
            `CREATE TABLE IF NOT EXISTS call_states (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                call_sid TEXT NOT NULL,
                state TEXT NOT NULL,
                data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(call_sid) REFERENCES calls(call_sid)
            )`,

            // Simplified webhook notifications table
            `CREATE TABLE IF NOT EXISTS webhook_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                call_sid TEXT NOT NULL,
                notification_type TEXT NOT NULL,
                telegram_chat_id TEXT NOT NULL,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sent_at DATETIME,
                FOREIGN KEY(call_sid) REFERENCES calls(call_sid)
            )`
        ];

        for (const table of tables) {
            await new Promise((resolve, reject) => {
                this.db.run(table, (err) => {
                    if (err) {
                        console.error('Error creating table:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }

        // Create indexes for better performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_calls_call_sid ON calls(call_sid)',
            'CREATE INDEX IF NOT EXISTS idx_calls_user_chat_id ON calls(user_chat_id)',
            'CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status)',
            'CREATE INDEX IF NOT EXISTS idx_transcripts_call_sid ON call_transcripts(call_sid)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_status ON webhook_notifications(status)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_call_sid ON webhook_notifications(call_sid)'
        ];

        for (const index of indexes) {
            await new Promise((resolve, reject) => {
                this.db.run(index, (err) => {
                    if (err && !err.message.includes('already exists')) {
                        console.error('Error creating index:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }

        console.log('✅ Database tables and indexes created successfully');
    }

    // Enhanced call creation with immediate status tracking
    async createCall(callData) {
        const { call_sid, phone_number, prompt, first_message, user_chat_id } = callData;
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO calls (call_sid, phone_number, prompt, first_message, user_chat_id, status)
                VALUES (?, ?, ?, ?, ?, 'initiated')
            `);
            
            stmt.run([call_sid, phone_number, prompt, first_message, user_chat_id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    // Enhanced status update with Twilio status tracking
    async updateCallStatus(call_sid, status, additionalData = {}) {
        return new Promise((resolve, reject) => {
            let updateFields = ['status = ?'];
            let values = [status];

            if (additionalData.started_at) {
                updateFields.push('started_at = ?');
                values.push(additionalData.started_at);
            }
            if (additionalData.ended_at) {
                updateFields.push('ended_at = ?');
                values.push(additionalData.ended_at);
            }
            if (additionalData.duration !== undefined) {
                updateFields.push('duration = ?');
                values.push(additionalData.duration);
            }
            if (additionalData.call_summary) {
                updateFields.push('call_summary = ?');
                values.push(additionalData.call_summary);
            }
            if (additionalData.ai_analysis) {
                updateFields.push('ai_analysis = ?');
                values.push(additionalData.ai_analysis);
            }
            if (additionalData.twilio_status) {
                updateFields.push('twilio_status = ?');
                values.push(additionalData.twilio_status);
            }

            values.push(call_sid);

            const sql = `UPDATE calls SET ${updateFields.join(', ')} WHERE call_sid = ?`;
            
            this.db.run(sql, values, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async updateCallState(call_sid, state, data = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO call_states (call_sid, state, data)
                VALUES (?, ?, ?)
            `);
            
            stmt.run([call_sid, state, data ? JSON.stringify(data) : null], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    async addTranscript(transcriptData) {
        const { call_sid, speaker, message, interaction_count } = transcriptData;
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO call_transcripts (call_sid, speaker, message, interaction_count)
                VALUES (?, ?, ?, ?)
            `);
            
            stmt.run([call_sid, speaker, message, interaction_count], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    // Simplified webhook notification creation
    async createWebhookNotification(call_sid, notification_type, telegram_chat_id) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO webhook_notifications (call_sid, notification_type, telegram_chat_id)
                VALUES (?, ?, ?)
            `);
            
            stmt.run([call_sid, notification_type, telegram_chat_id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    async updateWebhookNotification(id, status, error_message = null, sent_at = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                UPDATE webhook_notifications 
                SET status = ?, error_message = ?, sent_at = ?
                WHERE id = ?
            `);
            
            stmt.run([status, error_message, sent_at, id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
            stmt.finalize();
        });
    }

    async getPendingWebhookNotifications() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT wn.*, c.phone_number, c.call_summary, c.ai_analysis
                FROM webhook_notifications wn
                JOIN calls c ON wn.call_sid = c.call_sid
                WHERE wn.status = 'pending'
                ORDER BY wn.created_at ASC
                LIMIT 50
            `;
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async getCall(call_sid) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM calls WHERE call_sid = ?`;
            
            this.db.get(sql, [call_sid], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async getCallTranscripts(call_sid) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM call_transcripts 
                WHERE call_sid = ? 
                ORDER BY interaction_count ASC, timestamp ASC
            `;
            
            this.db.all(sql, [call_sid], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async getCallsWithTranscripts(limit = 50) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT c.*, 
                       COUNT(ct.id) as transcript_count
                FROM calls c
                LEFT JOIN call_transcripts ct ON c.call_sid = ct.call_sid
                GROUP BY c.call_sid
                ORDER BY c.created_at DESC
                LIMIT ?
            `;
            
            this.db.all(sql, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // Clean up old completed notifications (run periodically)
    async cleanupOldNotifications(daysOld = 7) {
        return new Promise((resolve, reject) => {
            const sql = `
                DELETE FROM webhook_notifications 
                WHERE status = 'sent' 
                AND created_at < datetime('now', '-' || ? || ' days')
            `;
            
            this.db.run(sql, [daysOld], function(err) {
                if (err) {
                    reject(err);
                } else {
                    console.log(`Cleaned up ${this.changes} old notifications`);
                    resolve(this.changes);
                }
            });
        });
    }

    // Get call statistics
    async getCallStats() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    COUNT(*) as total_calls,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_calls,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_calls,
                    AVG(duration) as avg_duration,
                    COUNT(CASE WHEN created_at >= datetime('now', '-24 hours') THEN 1 END) as calls_24h
                FROM calls
            `;
            
            this.db.get(sql, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                    } else {
                        console.log('Database connection closed');
                    }
                    resolve();
                });
            });
        }
    }
}

module.exports = Database;