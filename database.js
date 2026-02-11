const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const HASH_ITERATIONS = 120000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';

function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
}

const dbPath = path.resolve(__dirname, 'sanad.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database ' + dbPath + ': ' + err.message);
        return;
    }

    console.log('Connected to the SQLite database.');

    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            service TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER NOT NULL DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (messageTableErr) => {
            if (messageTableErr) {
                console.error('Error creating messages table: ' + messageTableErr.message);
            }
        });

        db.run(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT,
            password_hash TEXT,
            password_salt TEXT
        )`, (adminTableErr) => {
            if (adminTableErr) {
                console.error('Error creating admins table: ' + adminTableErr.message);
                return;
            }

            const defaultSalt = crypto.randomBytes(16).toString('hex');
            const defaultHash = hashPassword('password123', defaultSalt);
            const insert = 'INSERT OR IGNORE INTO admins (username, password, password_hash, password_salt) VALUES (?, ?, ?, ?)';
            db.run(insert, ['admin', null, defaultHash, defaultSalt]);
        });

        db.run('CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_messages_service ON messages(service)');
        db.run('CREATE INDEX IF NOT EXISTS idx_messages_email ON messages(email)');

        db.all('PRAGMA table_info(messages)', [], (tableErr, columns) => {
            if (tableErr) {
                console.error('Failed to inspect messages schema: ' + tableErr.message);
                return;
            }

            const hasReadColumn = columns.some((col) => col.name === 'is_read');
            if (!hasReadColumn) {
                db.run('ALTER TABLE messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0');
            }
        });

        db.all('PRAGMA table_info(admins)', [], (tableErr, columns) => {
            if (tableErr) {
                console.error('Failed to inspect admins schema: ' + tableErr.message);
                return;
            }

            const hasPasswordHash = columns.some((col) => col.name === 'password_hash');
            const hasPasswordSalt = columns.some((col) => col.name === 'password_salt');

            if (!hasPasswordHash) {
                db.run('ALTER TABLE admins ADD COLUMN password_hash TEXT');
            }

            if (!hasPasswordSalt) {
                db.run('ALTER TABLE admins ADD COLUMN password_salt TEXT');
            }

            db.all('SELECT id, password, password_hash, password_salt FROM admins', [], (readErr, admins) => {
                if (readErr) {
                    console.error('Failed to read admins for migration: ' + readErr.message);
                    return;
                }

                admins.forEach((admin) => {
                    if (!admin.password_hash && admin.password) {
                        const salt = crypto.randomBytes(16).toString('hex');
                        const hash = hashPassword(admin.password, salt);

                        db.run(
                            'UPDATE admins SET password_hash = ?, password_salt = ? WHERE id = ?',
                            [hash, salt, admin.id],
                            (updateErr) => {
                                if (updateErr) {
                                    console.error('Failed to migrate admin password for id ' + admin.id + ': ' + updateErr.message);
                                }
                            }
                        );
                    }
                });
            });
        });
    });
});

module.exports = db;