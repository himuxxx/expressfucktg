import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import checkHandler from './api/check.js';
import authHandler from './api/auth.js';
import adminHandler from './api/admin.js';
import analyticsHandler from './api/analytics.js';
import telegramHandler from './api/telegram.js';
import proxyHandler from './api/proxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== API Routes only =====
app.all('/api/check',     (req, res) => checkHandler(req, res));
app.all('/api/auth',      (req, res) => authHandler(req, res));
app.all('/api/admin',     (req, res) => adminHandler(req, res));
app.all('/api/analytics', (req, res) => analyticsHandler(req, res));
app.all('/api/proxy',     (req, res) => proxyHandler(req, res));
app.post('/api/telegram', (req, res) => telegramHandler(req, res));

// ===== Serve ONLY index.html =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ===== Block EVERYTHING else =====
app.use((req, res) => res.status(403).send('Forbidden'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ ExpressVPN Checker running on port ${PORT}`));
