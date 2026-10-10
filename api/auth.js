// api/auth.js
import {
  registerUser, loginUser, listUsers, approveUser, deleteUser, verifyToken
} from '../lib/auth.js';

export default async function handler(req, res) {
  // CORS + cookies
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || (req.body && req.body.action);

  // ===== REGISTER =====
  if (action === 'register' && req.method === 'POST') {
    const { username, password } = req.body;
    const result = registerUser(username, password);
    return res.status(result.ok ? 200 : 400).json(result);
  }

  // ===== LOGIN =====
  if (action === 'login' && req.method === 'POST') {
    const { username, password } = req.body;
    const result = loginUser(username, password);
    if (result.ok) {
      res.setHeader(
        'Set-Cookie',
        `token=${result.token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Lax`
      );
    }
    return res.status(result.ok ? 200 : 401).json(result);
  }

  // ===== VERIFY (check if token is valid) =====
  if (action === 'verify' && req.method === 'GET') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false });
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ ok: false });
    return res.status(200).json({ ok: true, user: payload });
  }

  // ===== ADMIN: List users =====
  if (action === 'list' && req.method === 'GET') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const payload = token ? verifyToken(token) : null;
    if (!payload || payload.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    return res.status(200).json({ users: listUsers() });
  }

  // ===== ADMIN: Approve =====
  if (action === 'approve' && req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const payload = token ? verifyToken(token) : null;
    if (!payload || payload.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { username } = req.body;
    const result = approveUser(username);
    return res.status(result.ok ? 200 : 400).json(result);
  }

  // ===== ADMIN: Delete =====
  if (action === 'delete' && req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const payload = token ? verifyToken(token) : null;
    if (!payload || payload.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { username } = req.body;
    const result = deleteUser(username);
    return res.status(result.ok ? 200 : 400).json(result);
  }

  return res.status(404).json({ error: 'Unknown action' });
}
