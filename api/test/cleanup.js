// test/cleanup.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '../db/data.db'));

const testSIDs = [
  'MOCHA_STATUS_SID',
  'INBOUND123MOCHA',
  'TRANSCRIPT_CALL_001',
  'AUDIO_CALL_001',
];

db.serialize(() => {
  testSIDs.forEach(sid => {
    db.run('DELETE FROM calls WHERE call_sid = ?', [sid], (err) => {
      if (err) console.error(`❌ Error deleting ${sid}:`, err.message);
    });
  });
});

db.close(() => console.log('✅ Test data cleanup complete'));