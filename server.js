// server.js
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import checkHandler from './api/check.js';
import telegramHandler from './api/telegram.js';
import authHandler from './api/auth.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.post('/api/check', (req, res) => checkHandler(req, res));
app.post('/api/telegram', (req, res) => telegramHandler(req, res));
app.all('/api/auth', (req, res) => authHandler(req, res));

app.use(express.static('.'));
app.get('/', (req, res) => res.sendFile('index.html', { root: '.' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ ExpressVPN Checker running on port ${PORT}`));
