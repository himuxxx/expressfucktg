// api/admin.js
import {
  createUser, listUsers, deleteUser, setValidity,
  validateSession, generateRandomUser
} from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ===== Admin auth check =====
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = await validateSession(token);
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: '👑 Admin only' });
  }

  const action = req.query.action;

  // ===== List users =====
  if (action === 'list' && req.method === 'GET') {
    const users = await listUsers();
    return res.status(200).json({ ok: true, users });
  }

  // ===== Add user =====
  if (action === 'add' && req.method === 'POST') {
    const { username, password, validityDays } = req.body || {};
    const result = await createUser(username, password, validityDays);
    return res.status(result.ok ? 200 : 400).json(result);
  }

  // ===== Random generate =====
  if (action === 'random' && req.method === 'POST') {
    const { validityDays } = req.body || {};
    // ৫ বার চেষ্টা করব unique username পেতে
    let attempt = 0, result;
    while (attempt < 5) {
      const { username, password } = generateRandomUser();
      result = await createUser(username, password, validityDays);
      if (result.ok) return res.status(200).json({ ok: true, username, password, validityDays });
      attempt++;
    }
    return res.status(400).json({ ok: false, message: 'Failed to generate unique user' });
  }

  // ===== Delete user =====
  if (action === 'delete' && req.method === 'POST') {
    const { username } = req.body || {};
    const result = await deleteUser(username || '');
    return res.status(result.ok ? 200 : 400).json(result);
  }

  // ===== Set validity =====
  if (action === 'validity' && req.method === 'POST') {
    const { username, validityDays } = req.body || {};
    const result = await setValidity(username || '', validityDays);
    return res.status(result.ok ? 200 : 400).json(result);
  }

  return res.status(404).json({ error: 'Unknown action' });
}
