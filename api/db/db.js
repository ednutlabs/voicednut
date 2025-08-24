const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class EnhancedDatabase {
    constructor() {
        this.db = null;
        this.isInitialized = false;
        this.dbPath = path.join(__dirname, 'data.db');
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening enhanced database:', err);
                    reject(err);
                    return;
                }
                console.log('Connected to enhanced SQLite database');
                this.createEnhancedTables().then(() => {
                    this.isInitialized = true;
                    console.log('✅ Enhanced database initialization complete'.green);
                    resolve();
                }).catch(reject);
            });
        });
    }

    async createEnhancedTables() {
        const tables = [
            // Enhanced calls table with comprehensive tracking
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
                ai_analysis TEXT,
                business_context TEXT,
                generated_functions TEXT,
                answered_by TEXT,
                error_code TEXT,
                error_message TEXT,
                ring_duration INTEGER,
                answer_delay INTEGER
            )`,

            // Enhanced call transcripts table with personality tracking
            `CREATE TABLE IF NOT EXISTS call_transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                call_sid TEXT NOT NULL,
                speaker TEXT NOT NULL CHECK(speaker IN ('user', 'ai')),
                message TEXT NOT NULL,
                interaction_count INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                personality_used TEXT,
                adaptation_data TEXT,
                confidence_score REAL,
                FOREIGN KEY(call_sid) REFERENCES calls(call_sid)
            )`,

            // Enhanced call states for comprehensive real-time tracking
            `CREATE TABLE IF NOT EXISTS call_states (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                call_sid TEXT NOT NULL,
                state TEXT NOT NULL,
                data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                sequence_number INTEGER,
                FOREIGN KEY(call_sid) REFERENCES calls(call_sid)
            )`,

            // Enhanced webhook notifications table with delivery metrics
            `CREATE TABLE IF NOT EXISTS webhook_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                call_sid TEXT NOT NULL,
                notification_type TEXT NOT NULL,
                telegram_chat_id TEXT NOT NULL,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed', 'retrying')),
                error_message TEXT,
                retry_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sent_at DATETIME,
                delivery_time_ms INTEGER,
                telegram_message_id INTEGER,
                priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
                FOREIGN KEY(call_sid) REFERENCES calls(call_sid)
            )`,

            // Notification delivery metrics for analytics
            `CREATE TABLE IF NOT EXISTS notification_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                notification_type TEXT NOT NULL,
                total_count INTEGER DEFAULT 0,
                success_count INTEGER DEFAULT 0,
                failure_count INTEGER DEFAULT 0,
                avg_delivery_time_ms REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(date, notification_type)
            )`,

            // Service health monitoring logs
            `CREATE TABLE IF NOT EXISTS service_health_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service_name TEXT NOT NULL,
                status TEXT NOT NULL,
                details TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Call performance metrics
            `CREATE TABLE IF NOT EXISTS call_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                call_sid TEXT NOT NULL,
                metric_type TEXT NOT NULL,
                metric_value REAL,
                metric_data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(call_sid) REFERENCES calls(call_sid)
            )`,

            // Enhanced user sessions tracking
            `CREATE TABLE IF NOT EXISTS user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_chat_id TEXT NOT NULL,
                session_start DATETIME DEFAULT CURRENT_TIMESTAMP,
                session_end DATETIME,
                total_calls INTEGER DEFAULT 0,
                successful_calls INTEGER DEFAULT 0,
                failed_calls INTEGER DEFAULT 0,
                total_duration INTEGER DEFAULT 0,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const table of tables) {
            await new Promise((resolve, reject) => {
                this.db.run(table, (err) => {
                    if (err) {
                        console.error('Error creating enhanced table:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }

        // Create comprehensive indexes for optimal performance
        const indexes = [
            // Call indexes
            'CREATE INDEX IF NOT EXISTS idx_calls_call_sid ON calls(call_sid)',
            'CREATE INDEX IF NOT EXISTS idx_calls_user_chat_id ON calls(user_chat_id)',
            'CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status)',
            'CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_calls_twilio_status ON calls(twilio_status)',
            'CREATE INDEX IF NOT EXISTS idx_calls_phone_number ON calls(phone_number)',
            
            // Transcript indexes
            'CREATE INDEX IF NOT EXISTS idx_transcripts_call_sid ON call_transcripts(call_sid)',
            'CREATE INDEX IF NOT EXISTS idx_transcripts_timestamp ON call_transcripts(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_transcripts_speaker ON call_transcripts(speaker)',
            'CREATE INDEX IF NOT EXISTS idx_transcripts_personality ON call_transcripts(personality_used)',
            
            // State indexes
            'CREATE INDEX IF NOT EXISTS idx_states_call_sid ON call_states(call_sid)',
            'CREATE INDEX IF NOT EXISTS idx_states_timestamp ON call_states(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_states_state ON call_states(state)',
            
            // Notification indexes
            'CREATE INDEX IF NOT EXISTS idx_notifications_status ON webhook_notifications(status)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_call_sid ON webhook_notifications(call_sid)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_type ON webhook_notifications(notification_type)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON webhook_notifications(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_chat_id ON webhook_notifications(telegram_chat_id)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_priority ON webhook_notifications(priority)',
            
            // Metrics indexes
            'CREATE INDEX IF NOT EXISTS idx_metrics_date ON notification_metrics(date)',
            'CREATE INDEX IF NOT EXISTS idx_metrics_type ON notification_metrics(notification_type)',
            'CREATE INDEX IF NOT EXISTS idx_call_metrics_call_sid ON call_metrics(call_sid)',
            'CREATE INDEX IF NOT EXISTS idx_call_metrics_type ON call_metrics(metric_type)',
            
            // Health indexes
            'CREATE INDEX IF NOT EXISTS idx_health_service ON service_health_logs(service_name)',
            'CREATE INDEX IF NOT EXISTS idx_health_timestamp ON service_health_logs(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_health_status ON service_health_logs(status)',
            
            // Session indexes
            'CREATE INDEX IF NOT EXISTS idx_sessions_chat_id ON user_sessions(telegram_chat_id)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_start ON user_sessions(session_start)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_activity ON user_sessions(last_activity)'
        ];

        for (const index of indexes) {
            await new Promise((resolve, reject) => {
                this.db.run(index, (err) => {
                    if (err && !err.message.includes('already exists')) {
                        console.error('Error creating enhanced index:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }

        console.log('✅ Enhanced database tables and indexes created successfully');
    }

    // Enhanced call creation with comprehensive metadata
    async createCall(callData) {
        const { 
            call_sid, 
            phone_number, 
            prompt, 
            first_message, 
            user_chat_id, 
            business_context = null,
            generated_functions = null 
        } = callData;
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO calls (
                    call_sid, phone_number, prompt, first_message, 
                    user_chat_id, status, business_context, generated_functions
                )
                VALUES (?, ?, ?, ?, ?, 'initiated', ?, ?)
            `);
            
            stmt.run([
                call_sid, 
                phone_number, 
                prompt, 
                first_message, 
                user_chat_id, 
                business_context,
                generated_functions
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    // Enhanced status update with comprehensive tracking
    async updateCallStatus(call_sid, status, additionalData = {}) {
        return new Promise((resolve, reject) => {
            let updateFields = ['status = ?'];
            let values = [status];

            // Handle all possible additional data fields
            const fieldMappings = {
                'started_at': 'started_at',
                'ended_at': 'ended_at', 
                'duration': 'duration',
                'call_summary': 'call_summary',
                'ai_analysis': 'ai_analysis',
                'twilio_status': 'twilio_status',
                'answered_by': 'answered_by',
                'error_code': 'error_code',
                'error_message': 'error_message',
                'ring_duration': 'ring_duration',
                'answer_delay': 'answer_delay'
            };

            Object.entries(fieldMappings).forEach(([key, field]) => {
                if (additionalData[key] !== undefined) {
                    updateFields.push(`${field} = ?`);
                    values.push(additionalData[key]);
                }
            });

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

    // Enhanced call state tracking
    async updateCallState(call_sid, state, data = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO call_states (call_sid, state, data, sequence_number)
                VALUES (?, ?, ?, (
                    SELECT COALESCE(MAX(sequence_number), 0) + 1 
                    FROM call_states 
                    WHERE call_sid = ?
                ))
            `);
            
            stmt.run([call_sid, state, data ? JSON.stringify(data) : null, call_sid], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    // Enhanced transcript with personality tracking
    async addTranscript(transcriptData) {
        const { 
            call_sid, 
            speaker, 
            message, 
            interaction_count,
            personality_used = null,
            adaptation_data = null,
            confidence_score = null
        } = transcriptData;
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO call_transcripts (
                    call_sid, speaker, message, interaction_count, 
                    personality_used, adaptation_data, confidence_score
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run([
                call_sid, 
                speaker, 
                message, 
                interaction_count,
                personality_used,
                adaptation_data,
                confidence_score
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    // Enhanced webhook notification creation with priority
    async createEnhancedWebhookNotification(call_sid, notification_type, telegram_chat_id, priority = 'normal') {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO webhook_notifications (call_sid, notification_type, telegram_chat_id, priority, retry_count)
                VALUES (?, ?, ?, ?, 0)
            `);
            
            stmt.run([call_sid, notification_type, telegram_chat_id, priority], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    // Backward compatibility method
    async createWebhookNotification(call_sid, notification_type, telegram_chat_id) {
        return this.createEnhancedWebhookNotification(call_sid, notification_type, telegram_chat_id, 'normal');
    }

    // Enhanced webhook notification update with delivery metrics
    async updateEnhancedWebhookNotification(id, status, error_message = null, telegram_message_id = null) {
        return new Promise((resolve, reject) => {
            const sent_at = status === 'sent' ? new Date().toISOString() : null;
            
            // Calculate delivery time if we're marking as sent
            if (status === 'sent') {
                this.db.get('SELECT created_at FROM webhook_notifications WHERE id = ?', [id], (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    let delivery_time_ms = null;
                    if (row) {
                        const created = new Date(row.created_at);
                        delivery_time_ms = new Date() - created;
                    }
                    
                    const stmt = this.db.prepare(`
                        UPDATE webhook_notifications 
                        SET status = ?, error_message = ?, sent_at = ?, 
                            telegram_message_id = ?, delivery_time_ms = ?
                        WHERE id = ?
                    `);
                    
                    stmt.run([status, error_message, sent_at, telegram_message_id, delivery_time_ms, id], function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(this.changes);
                        }
                    });
                    stmt.finalize();
                });
            } else {
                const stmt = this.db.prepare(`
                    UPDATE webhook_notifications 
                    SET status = ?, error_message = ?, retry_count = retry_count + 1
                    WHERE id = ?
                `);
                
                stmt.run([status, error_message, id], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
                stmt.finalize();
            }
        });
    }

    // Backward compatibility method
    async updateWebhookNotification(id, status, error_message = null, sent_at = null) {
        return this.updateEnhancedWebhookNotification(id, status, error_message, null);
    }

    // Enhanced pending notifications with priority and retry logic
    async getEnhancedPendingWebhookNotifications(limit = 50) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    wn.*,
                    c.phone_number, 
                    c.call_summary, 
                    c.ai_analysis,
                    c.status as call_status,
                    c.duration as call_duration,
                    c.twilio_status
                FROM webhook_notifications wn
                JOIN calls c ON wn.call_sid = c.call_sid
                WHERE wn.status IN ('pending', 'retrying')
                    AND wn.retry_count < 3
                ORDER BY 
                    CASE wn.priority
                        WHEN 'urgent' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'normal' THEN 3
                        WHEN 'low' THEN 4
                        ELSE 5
                    END,
                    CASE wn.notification_type
                        WHEN 'call_failed' THEN 1
                        WHEN 'call_completed' THEN 2
                        WHEN 'call_transcript' THEN 3
                        ELSE 4
                    END,
                    wn.created_at ASC
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

    // Backward compatibility method
    async getPendingWebhookNotifications() {
        return this.getEnhancedPendingWebhookNotifications(50);
    }

    // Enhanced notification metrics logging
    async logNotificationMetric(notification_type, success, delivery_time_ms = null) {
        const today = new Date().toISOString().split('T')[0];
        
        return new Promise((resolve, reject) => {
            // Use UPSERT logic for SQLite
            const stmt = this.db.prepare(`
                INSERT INTO notification_metrics 
                    (date, notification_type, total_count, success_count, failure_count, avg_delivery_time_ms, updated_at)
                VALUES (?, ?, 1, ?, ?, ?, datetime('now'))
                ON CONFLICT(date, notification_type) DO UPDATE SET
                    total_count = total_count + 1,
                    success_count = success_count + excluded.success_count,
                    failure_count = failure_count + excluded.failure_count,
                    avg_delivery_time_ms = (avg_delivery_time_ms * (total_count - 1) + excluded.avg_delivery_time_ms) / total_count,
                    updated_at = datetime('now')
            `);
            
            const success_increment = success ? 1 : 0;
            const failure_increment = success ? 0 : 1;
            const delivery_time = delivery_time_ms || 0;
            
            stmt.run([
                today, 
                notification_type, 
                success_increment, 
                failure_increment, 
                delivery_time
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID || this.changes);
                }
            });
            stmt.finalize();
        });
    }

    // Enhanced service health logging
    async logServiceHealth(service_name, status, details = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO service_health_logs (service_name, status, details)
                VALUES (?, ?, ?)
            `);
            
            stmt.run([service_name, status, JSON.stringify(details)], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    // Call metrics tracking
    async addCallMetric(call_sid, metric_type, metric_value, metric_data = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO call_metrics (call_sid, metric_type, metric_value, metric_data)
                VALUES (?, ?, ?, ?)
            `);
            
            stmt.run([call_sid, metric_type, metric_value, JSON.stringify(metric_data)], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    // User session tracking
    async updateUserSession(telegram_chat_id, call_outcome = null) {
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];
            
            const stmt = this.db.prepare(`
                INSERT INTO user_sessions 
                    (telegram_chat_id, session_start, total_calls, successful_calls, failed_calls, last_activity)
                VALUES (?, datetime('now'), 1, ?, ?, datetime('now'))
                ON CONFLICT(telegram_chat_id) DO UPDATE SET
                    total_calls = total_calls + 1,
                    successful_calls = successful_calls + ?,
                    failed_calls = failed_calls + ?,
                    last_activity = datetime('now')
            `);
            
            const success_increment = (call_outcome === 'completed') ? 1 : 0;
            const failure_increment = (call_outcome && call_outcome !== 'completed') ? 1 : 0;
            
            stmt.run([
                telegram_chat_id,
                success_increment,
                failure_increment,
                success_increment,
                failure_increment
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID || this.changes);
                }
            });
            stmt.finalize();
        });
    }

    // Get enhanced call details
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

    // Get enhanced call transcripts
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

    // Get enhanced calls with comprehensive metrics
    async getCallsWithTranscripts(limit = 50) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT c.*, 
                       COUNT(ct.id) as transcript_count,
                       COUNT(CASE WHEN ct.personality_used IS NOT NULL THEN 1 END) as personality_adaptations,
                       GROUP_CONCAT(DISTINCT ct.personality_used) as personalities_used
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

    // Get enhanced notification analytics
    async getNotificationAnalytics(days = 7) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    notification_type,
                    SUM(total_count) as total,
                    SUM(success_count) as successful,
                    SUM(failure_count) as failed,
                    AVG(avg_delivery_time_ms) as avg_delivery_time,
                    COUNT(*) as days_active,
                    MAX(updated_at) as last_updated
                FROM notification_metrics 
                WHERE date >= date('now', '-${days} days')
                GROUP BY notification_type
                ORDER BY total DESC
            `;
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const analytics = {
                        period_days: days,
                        total_notifications: 0,
                        total_successful: 0,
                        total_failed: 0,
                        overall_success_rate: 0,
                        avg_delivery_time_ms: 0,
                        breakdown: rows || []
                    };
                    
                    let totalDeliveryTime = 0;
                    let deliveryTimeCount = 0;
                    
                    analytics.breakdown.forEach(row => {
                        analytics.total_notifications += row.total;
                        analytics.total_successful += row.successful;
                        analytics.total_failed += row.failed;
                        
                        if (row.avg_delivery_time && row.total > 0) {
                            totalDeliveryTime += row.avg_delivery_time * row.total;
                            deliveryTimeCount += row.total;
                        }
                    });
                    
                    if (analytics.total_notifications > 0) {
                        analytics.overall_success_rate = 
                            ((analytics.total_successful / analytics.total_notifications) * 100).toFixed(2);
                    }
                    
                    if (deliveryTimeCount > 0) {
                        analytics.avg_delivery_time_ms = (totalDeliveryTime / deliveryTimeCount).toFixed(2);
                    }
                    
                    resolve(analytics);
                }
            });
        });
    }

    // Get comprehensive call statistics
    async getEnhancedCallStats(hours = 24) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    COUNT(*) as total_calls,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_calls,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_calls,
                    COUNT(CASE WHEN status = 'busy' THEN 1 END) as busy_calls,
                    COUNT(CASE WHEN status = 'no-answer' THEN 1 END) as no_answer_calls,
                    AVG(duration) as avg_duration,
                    AVG(answer_delay) as avg_answer_delay,
                    AVG(ring_duration) as avg_ring_duration,
                    COUNT(CASE WHEN created_at >= datetime('now', '-${hours} hours') THEN 1 END) as recent_calls,
                    COUNT(DISTINCT user_chat_id) as unique_users
                FROM calls
            `;
            
            this.db.get(sql, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    // Calculate success rate
                    const successRate = row.total_calls > 0 ? 
                        ((row.completed_calls / row.total_calls) * 100).toFixed(2) : 0;
                    
                    resolve({
                        ...row,
                        success_rate: successRate,
                        period_hours: hours
                    });
                }
            });
        });
    }

    // Get service health summary
    async getServiceHealthSummary(hours = 24) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    service_name,
                    status,
                    COUNT(*) as count,
                    MAX(timestamp) as last_occurrence
                FROM service_health_logs 
                WHERE timestamp >= datetime('now', '-${hours} hours')
                GROUP BY service_name, status
                ORDER BY service_name, status
            `;
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const summary = {
                        period_hours: hours,
                        services: {},
                        total_events: 0
                    };
                    
                    rows.forEach(row => {
                        if (!summary.services[row.service_name]) {
                            summary.services[row.service_name] = {};
                        }
                        summary.services[row.service_name][row.status] = {
                            count: row.count,
                            last_occurrence: row.last_occurrence
                        };
                        summary.total_events += row.count;
                    });
                    
                    resolve(summary);
                }
            });
        });
    }

    // Comprehensive cleanup with enhanced metrics
    async cleanupOldRecords(daysToKeep = 30) {
        const tables = [
            { name: 'call_states', dateField: 'timestamp' },
            { name: 'service_health_logs', dateField: 'timestamp' },
            { name: 'call_metrics', dateField: 'timestamp' },
            { name: 'notification_metrics', dateField: 'created_at' }
        ];
        
        let totalCleaned = 0;
        const cleanupResults = {};
        
        for (const table of tables) {
            const cleaned = await new Promise((resolve, reject) => {
                const sql = `
                    DELETE FROM ${table.name} 
                    WHERE ${table.dateField} < datetime('now', '-${daysToKeep} days')
                `;
                
                this.db.run(sql, function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });
            
            cleanupResults[table.name] = cleaned;
            totalCleaned += cleaned;
            
            if (cleaned > 0) {
                console.log(`🧹 Cleaned ${cleaned} old records from ${table.name}`.gray);
            }
        }
        
        // Clean up old successful webhook notifications (keep for 7 days)
        const webhooksCleaned = await new Promise((resolve, reject) => {
            const sql = `
                DELETE FROM webhook_notifications 
                WHERE status = 'sent' 
                AND created_at < datetime('now', '-7 days')
            `;
            
            this.db.run(sql, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
        
        cleanupResults.webhook_notifications = webhooksCleaned;
        totalCleaned += webhooksCleaned;
        
        if (webhooksCleaned > 0) {
            console.log(`🧹 Cleaned ${webhooksCleaned} old successful webhook notifications`.gray);
        }
        
        // Clean up old user sessions (keep for 90 days)
        const sessionsCleaned = await new Promise((resolve, reject) => {
            const sql = `
                DELETE FROM user_sessions 
                WHERE last_activity < datetime('now', '-90 days')
            `;
            
            this.db.run(sql, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
        
        cleanupResults.user_sessions = sessionsCleaned;
        totalCleaned += sessionsCleaned;
        
        if (sessionsCleaned > 0) {
            console.log(`🧹 Cleaned ${sessionsCleaned} old user sessions`.gray);
        }
        
        // Log cleanup operation
        await this.logServiceHealth('database', 'cleanup_completed', {
            total_cleaned: totalCleaned,
            days_kept: daysToKeep,
            breakdown: cleanupResults
        });
        
        console.log(`✅ Enhanced cleanup completed: ${totalCleaned} total records cleaned`.green);
        
        return {
            total_cleaned: totalCleaned,
            breakdown: cleanupResults,
            days_kept: daysToKeep
        };
    }

    // Database maintenance and optimization
    async optimizeDatabase() {
        return new Promise((resolve, reject) => {
            console.log('🔧 Running database optimization...'.yellow);
            
            // Run VACUUM to reclaim space and defragment
            this.db.run('VACUUM', (err) => {
                if (err) {
                    console.error('❌ Database VACUUM failed:', err);
                    reject(err);
                } else {
                    // Run ANALYZE to update query planner statistics
                    this.db.run('ANALYZE', (analyzeErr) => {
                        if (analyzeErr) {
                            console.error('❌ Database ANALYZE failed:', analyzeErr);
                            reject(analyzeErr);
                        } else {
                            console.log('✅ Database optimization completed'.green);
                            resolve(true);
                        }
                    });
                }
            });
        });
    }

    // Get database size and performance metrics
    async getDatabaseMetrics() {
        return new Promise((resolve, reject) => {
            const fs = require('fs');
            
            // Get file size
            let fileSize = 0;
            try {
                const stats = fs.statSync(this.dbPath);
                fileSize = stats.size;
            } catch (e) {
                console.warn('Could not get database file size:', e.message);
            }
            
            // Get table counts
            const sql = `
                SELECT 
                    'calls' as table_name,
                    COUNT(*) as row_count
                FROM calls
                UNION ALL
                SELECT 'call_transcripts', COUNT(*) FROM call_transcripts
                UNION ALL
                SELECT 'call_states', COUNT(*) FROM call_states
                UNION ALL
                SELECT 'webhook_notifications', COUNT(*) FROM webhook_notifications
                UNION ALL
                SELECT 'notification_metrics', COUNT(*) FROM notification_metrics
                UNION ALL
                SELECT 'service_health_logs', COUNT(*) FROM service_health_logs
                UNION ALL
                SELECT 'call_metrics', COUNT(*) FROM call_metrics
                UNION ALL
                SELECT 'user_sessions', COUNT(*) FROM user_sessions
            `;
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const metrics = {
                        file_size_bytes: fileSize,
                        file_size_mb: (fileSize / (1024 * 1024)).toFixed(2),
                        table_counts: {},
                        total_rows: 0
                    };
                    
                    rows.forEach(row => {
                        metrics.table_counts[row.table_name] = row.row_count;
                        metrics.total_rows += row.row_count;
                    });
                    
                    resolve(metrics);
                }
            });
        });
    }

    // Enhanced close method with cleanup
    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                // Log database shutdown
                this.logServiceHealth('database', 'shutdown_initiated', {
                    timestamp: new Date().toISOString()
                }).then(() => {
                    this.db.close((err) => {
                        if (err) {
                            console.error('Error closing enhanced database:', err);
                        } else {
                            console.log('✅ Enhanced database connection closed'.green);
                        }
                        resolve();
                    });
                }).catch(() => {
                    // If logging fails, still close the database
                    this.db.close((err) => {
                        if (err) {
                            console.error('Error closing enhanced database:', err);
                        } else {
                            console.log('✅ Enhanced database connection closed'.green);
                        }
                        resolve();
                    });
                });
            });
        }
    }

    // Health check method
    async healthCheck() {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            // Simple query to test database connectivity
            this.db.get('SELECT 1 as test', [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        status: 'healthy',
                        initialized: this.isInitialized,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        });
    }
}

module.exports = EnhancedDatabase;
