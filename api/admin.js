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

  // ===== Random generate (multiple) =====
  if (action === 'random' && req.method === 'POST') {
    const { validityDays, count } = req.body || {};
    // count 1 থেকে 100 এর মধ্যে
    const n = Math.min(Math.max(parseInt(count) || 1, 1), 100);

    const created = [];
    for (let i = 0; i < n; i++) {
      let attempt = 0, result;
      while (attempt < 15) {
        const { username, password } = generateRandomUser();
        result = await createUser(username, password, validityDays);
        if (result.ok) {
          created.push({ username, password, validityDays });
          break;
        }
        attempt++;
      }
    }

    return res.status(200).json({
      ok: true,
      users: created,
      count: created.length,
      requested: n,
      validityDays: validityDays || 0
    });
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
