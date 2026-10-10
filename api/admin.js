// api/admin.js
import {
  createUser, listUsers, deleteUser, setValidity,
  validateSession, generateRandomUser
} from '../lib/auth.js';
import {
  listProxies, addProxy, deleteProxy, checkAllProxies, testProxy, invalidateCache
} from '../lib/proxy.js';
import { getDB } from '../lib/db.js';

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
    const { validityDays, count } = req.body || {};
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

  // ===== PROXY: List =====
  if (action === 'proxy-list' && req.method === 'GET') {
    const list = await listProxies();
    return res.status(200).json({
      ok: true,
      proxies: list.map(p => ({
        id: p._id.toString(),
        url: p.url,
        status: p.status,
        latency: p.latency,
        proxyIp: p.proxyIp,
        lastChecked: p.lastChecked,
        createdAt: p.createdAt
      }))
    });
  }

  // ===== PROXY: Add =====
  if (action === 'proxy-add' && req.method === 'POST') {
    const { url } = req.body || {};
    const r = await addProxy(url);
    return res.status(r.ok ? 200 : 400).json(r);
  }

  // ===== PROXY: Delete =====
  if (action === 'proxy-delete' && req.method === 'POST') {
    const { id } = req.body || {};
    const r = await deleteProxy(id);
    return res.status(r.ok ? 200 : 400).json(r);
  }

  // ===== PROXY: Test single =====
  if (action === 'proxy-test' && req.method === 'POST') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, message: 'ID required' });
    try {
      const db = await getDB();
      const c = db.collection('proxies');
      const { ObjectId } = await import('mongodb');
      const p = await c.findOne({ _id: new ObjectId(id) });
      if (!p) return res.status(404).json({ ok: false, message: 'Proxy not found' });
      const r = await testProxy(p.url);
      await c.updateOne({ _id: p._id }, {
        $set: {
          status: r.ok ? 'live' : 'dead',
          lastChecked: new Date(),
          latency: r.ok ? r.latency : null,
          proxyIp: r.ip || null
        }
      });
      invalidateCache();
      return res.status(200).json({ ok: true, result: r });
    } catch (e) {
      return res.status(500).json({ ok: false, message: e.message });
    }
  }

  // ===== PROXY: Test all =====
  if (action === 'proxy-check-all' && req.method === 'POST') {
    const results = await checkAllProxies();
    const live = results.filter(r => r.ok).length;
    return res.status(200).json({
      ok: true,
      total: results.length,
      live,
      dead: results.length - live,
      results
    });
  }

  return res.status(404).json({ error: 'Unknown action' });
}
