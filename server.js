const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

const app = express();
const PORT = 3000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const MAX_CONTACT_MESSAGE_LENGTH = 2000;
const MAX_SEARCH_LENGTH = 120;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const PBKDF2_ITERATIONS = 120000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

const sessions = new Map();
const failedLoginAttempts = new Map();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    const start = Date.now();
    const requestId = crypto.randomUUID();

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });

    next();
});

function normalizeText(value, maxLength) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function issueSession(adminRow) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_TTL_MS;

    sessions.set(token, {
        adminId: adminRow.id,
        username: adminRow.username,
        expiresAt
    });

    return {
        token,
        expiresAt
    };
}

function parseBearerToken(headerValue) {
    if (!headerValue || typeof headerValue !== 'string') {
        return '';
    }

    const [scheme, token] = headerValue.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
        return '';
    }

    return token.trim();
}

function authMiddleware(req, res, next) {
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
        return res.status(401).json({ error: 'Missing authorization token.' });
    }

    const session = sessions.get(token);
    if (!session) {
        return res.status(401).json({ error: 'Invalid session token.' });
    }

    if (Date.now() > session.expiresAt) {
        sessions.delete(token);
        return res.status(401).json({ error: 'Session expired. Please login again.' });
    }

    session.expiresAt = Date.now() + SESSION_TTL_MS;
    req.admin = session;
    next();
}

function getThrottleKey(req, username) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    return `${ip}:${username}`;
}

function isLoginBlocked(key) {
    const entry = failedLoginAttempts.get(key);
    if (!entry) {
        return false;
    }

    if (Date.now() > entry.blockUntil) {
        failedLoginAttempts.delete(key);
        return false;
    }

    return true;
}

function markLoginFailure(key) {
    const now = Date.now();
    const entry = failedLoginAttempts.get(key) || { count: 0, blockUntil: now };
    entry.count += 1;

    if (entry.count >= 5) {
        entry.blockUntil = now + 1000 * 60 * 10;
    } else {
        entry.blockUntil = now + 1000 * 30;
    }

    failedLoginAttempts.set(key, entry);
}

function clearLoginFailures(key) {
    failedLoginAttempts.delete(key);
}

function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
}

function verifyPassword(row, password) {
    if (row.password_hash && row.password_salt) {
        const hash = hashPassword(password, row.password_salt);
        return hash === row.password_hash;
    }

    return typeof row.password === 'string' && row.password === password;
}

function migrateLegacyPasswordIfNeeded(row, plainPassword) {
    if (row.password_hash || !row.password) {
        return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(plainPassword, salt);

    db.run(
        'UPDATE admins SET password_hash = ?, password_salt = ? WHERE id = ?',
        [hash, salt, row.id],
        (err) => {
            if (err) {
                console.error('Failed to migrate legacy admin password:', err.message);
            }
        }
    );
}

function toMessageResponse(row) {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        service: row.service,
        message: row.message,
        timestamp: row.timestamp,
        isRead: row.is_read === 1
    };
}

app.post('/api/contact', (req, res) => {
    const name = normalizeText(req.body.name, 120);
    const email = normalizeText(req.body.email, 160).toLowerCase();
    const service = normalizeText(req.body.service || 'General', 80) || 'General';
    const message = normalizeText(req.body.message, MAX_CONTACT_MESSAGE_LENGTH);

    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Please fill in all required fields.' });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const sql = 'INSERT INTO messages (name, email, service, message) VALUES (?, ?, ?, ?)';
    const params = [name, email, service, message];

    db.run(sql, params, function onInsert(err) {
        if (err) {
            console.error('Failed to store contact message:', err.message);
            return res.status(500).json({ error: 'Failed to save message.' });
        }

        return res.json({ message: 'Message sent successfully!', id: this.lastID });
    });
});

app.post('/api/login', (req, res) => {
    const username = normalizeText(req.body.username, 80);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    const throttleKey = getThrottleKey(req, username);
    if (isLoginBlocked(throttleKey)) {
        return res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
    }

    const sql = 'SELECT id, username, password, password_hash, password_salt FROM admins WHERE username = ?';
    db.get(sql, [username], (err, row) => {
        if (err) {
            console.error('Login query failed:', err.message);
            return res.status(500).json({ error: 'Unable to login right now.' });
        }

        if (!row || !verifyPassword(row, password)) {
            markLoginFailure(throttleKey);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        migrateLegacyPasswordIfNeeded(row, password);
        clearLoginFailures(throttleKey);

        const session = issueSession(row);
        return res.json({
            message: 'Login successful',
            token: session.token,
            expiresAt: new Date(session.expiresAt).toISOString(),
            user: { id: row.id, username: row.username }
        });
    });
});

app.get('/api/messages', authMiddleware, (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const requestedLimit = parseInt(req.query.limit, 10) || DEFAULT_LIMIT;
    const limit = Math.max(1, Math.min(requestedLimit, MAX_LIMIT));
    const offset = (page - 1) * limit;

    const search = normalizeText(req.query.search || '', MAX_SEARCH_LENGTH).toLowerCase();
    const service = normalizeText(req.query.service || '', 80).toLowerCase();
    const read = normalizeText(req.query.read || '', 10).toLowerCase();

    const whereClauses = [];
    const whereParams = [];

    if (search) {
        whereClauses.push('(LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(service) LIKE ? OR LOWER(message) LIKE ?)');
        const like = `%${search}%`;
        whereParams.push(like, like, like, like);
    }

    if (service && service !== 'all') {
        whereClauses.push('LOWER(service) = ?');
        whereParams.push(service);
    }

    if (read === 'read') {
        whereClauses.push('is_read = 1');
    } else if (read === 'unread') {
        whereClauses.push('is_read = 0');
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM messages ${whereSql}`;
    const dataSql = `
        SELECT id, name, email, service, message, timestamp, is_read
        FROM messages
        ${whereSql}
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
    `;

    db.get(countSql, whereParams, (countErr, countRow) => {
        if (countErr) {
            console.error('Failed to count messages:', countErr.message);
            return res.status(500).json({ error: 'Failed to load messages.' });
        }

        const dataParams = [...whereParams, limit, offset];
        db.all(dataSql, dataParams, (dataErr, rows) => {
            if (dataErr) {
                console.error('Failed to query messages:', dataErr.message);
                return res.status(500).json({ error: 'Failed to load messages.' });
            }

            const total = countRow?.total || 0;
            return res.json({
                messages: rows.map(toMessageResponse),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limit))
                }
            });
        });
    });
});

app.patch('/api/messages/:id/read', authMiddleware, (req, res) => {
    const messageId = parseInt(req.params.id, 10);
    if (!Number.isInteger(messageId) || messageId <= 0) {
        return res.status(400).json({ error: 'Invalid message id.' });
    }

    const isRead = req.body.isRead === true || req.body.isRead === 1 || req.body.isRead === '1';

    db.run('UPDATE messages SET is_read = ? WHERE id = ?', [isRead ? 1 : 0, messageId], function onUpdate(err) {
        if (err) {
            console.error('Failed to update message read status:', err.message);
            return res.status(500).json({ error: 'Failed to update message.' });
        }

        if (!this.changes) {
            return res.status(404).json({ error: 'Message not found.' });
        }

        return res.json({ message: 'Message status updated.', id: messageId, isRead });
    });
});

app.delete('/api/messages/:id', authMiddleware, (req, res) => {
    const messageId = parseInt(req.params.id, 10);
    if (!Number.isInteger(messageId) || messageId <= 0) {
        return res.status(400).json({ error: 'Invalid message id.' });
    }

    db.run('DELETE FROM messages WHERE id = ?', [messageId], function onDelete(err) {
        if (err) {
            console.error('Failed to delete message:', err.message);
            return res.status(500).json({ error: 'Failed to delete message.' });
        }

        if (!this.changes) {
            return res.status(404).json({ error: 'Message not found.' });
        }

        return res.json({ message: 'Message deleted.', id: messageId });
    });
});

app.post('/api/logout', authMiddleware, (req, res) => {
    const token = parseBearerToken(req.headers.authorization);
    sessions.delete(token);
    res.json({ message: 'Logged out successfully.' });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
        if (now > session.expiresAt) {
            sessions.delete(token);
        }
    }
}, 1000 * 60 * 10).unref();

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});