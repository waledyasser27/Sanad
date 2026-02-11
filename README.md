<<<<<<< HEAD
# Sanad
=======
# Sanad Project Setup Guide

This project includes:
- Public website (landing page)
- Admin panel (`/admin`)
- Node.js backend API
- SQLite database (`sanad.db`)

## Prerequisites
1. Install Node.js LTS from `https://nodejs.org`
2. Open terminal in project root:

```bash
cd C:\Users\Dell\sanad1
npm install
```

## Run
```bash
npm start
```
Server URL:
- `http://localhost:3000`

## Access URLs
- Landing page: `http://localhost:3000`
- Admin login: `http://localhost:3000/admin`
- Admin dashboard direct URL: `http://localhost:3000/admin/dashboard`

## Default Admin Credentials
- Username: `admin`
- Password: `password123`

## Data Storage
- Database file: `sanad.db` (SQLite)
- Contact messages are saved in table: `messages`
- Admin users are saved in table: `admins`

## Password Storage Notes
- Admin passwords are now handled with hashed storage (`password_hash` + `password_salt`) using PBKDF2-SHA512.
- Legacy plaintext passwords (if any old rows exist) are migrated to hashed fields on successful login.

## Admin API (Protected)
- `POST /api/login`
- `GET /api/messages`
- `PATCH /api/messages/:id/read`
- `DELETE /api/messages/:id`
- `POST /api/logout`

## Contact API
- `POST /api/contact`
>>>>>>> de7f0e3 (Admin dashboard upgrade + backend/database improvements)
