// api/proxy.js – per-user proxy endpoints
import { validateSession } from '../lib/auth.js';
import {
  listProxies, addProxy, deleteProxy, checkAllProxies, testProxy,
  invalidateCache
} from '../lib/proxy.js';
import { getDB } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: '🔒 Login required' });

  const username = session.username;
  const action = req.query.action;

  if (action === 'list' && req.method === 'GET') {
    const list = await listProxies(username);
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

  if (action === 'add' && req.method === 'POST') {
    const { url } = req.body || {};
    const r = await addProxy(username, url);
    return res.status(r.ok ? 200 : 400).json(r);
  }

  if (action === 'delete' && req.method === 'POST') {
    const { id } = req.body || {};
    const r = await deleteProxy(username, id);
    return res.status(r.ok ? 200 : 400).json(r);
  }

  if (action === 'test' && req.method === 'POST') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, message: 'ID required' });
    try {
      const db = await getDB();
      const c = db.collection('proxies');
      const { ObjectId } = await import('mongodb');
      const p = await c.findOne({ _id: new ObjectId(id), owner: username });
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
      invalidateCache(username);
      return res.status(200).json({ ok: true, result: r });
    } catch (e) {
      return res.status(500).json({ ok: false, message: e.message });
    }
  }

  if (action === 'check-all' && req.method === 'POST') {
    const results = await checkAllProxies(username);
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
