// api/auth.js – Login + Verify
import { loginUser, verifyToken } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;

  // ===== LOGIN =====
  if (action === 'login' && req.method === 'POST') {
    const { username, password } = req.body || {};
    const result = loginUser(username, password);
    return res.status(result.ok ? 200 : 401).json(result);
  }

  // ===== VERIFY TOKEN =====
  if (action === 'verify' && req.method === 'GET') {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ ok: false });
    return res.status(200).json({ ok: true, user: payload });
  }

  return res.status(404).json({ error: 'Unknown action' });
}
