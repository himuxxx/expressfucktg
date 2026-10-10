// api/analytics.js
import { validateSession } from '../lib/auth.js';
import { getStats, getUserStats, getRecentChecks } from '../lib/analytics.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ===== Admin only =====
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = await validateSession(token);
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: '👑 Admin only' });
  }

  const action = req.query.action;

  if (action === 'stats') {
    const [stats, users, recent] = await Promise.all([
      getStats(),
      getUserStats(),
      getRecentChecks(20)
    ]);
    return res.status(200).json({ ok: true, stats, users, recent });
  }

  if (action === 'live') {
    const [stats, recent] = await Promise.all([
      getStats(),
      getRecentChecks(15)
    ]);
    return res.status(200).json({ ok: true, stats, recent });
  }

  return res.status(404).json({ error: 'Unknown action' });
}
