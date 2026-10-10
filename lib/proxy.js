// ===== Add proxy for a user (auto-format detection) =====
export async function addProxy(username, url) {
  if (!url) return { ok: false, message: 'URL required' };
  let clean = url.trim();
  if (!clean) return { ok: false, message: 'Empty proxy' };

  // ===== AUTO-FORMAT DETECTION =====
  // 1. Already has protocol (http://, https://, socks5://)
  if (!/^(https?|socks[45]?):\/\//i.test(clean)) {
    // 2. Format: ip:port:user:pass  →  http://user:pass@ip:port
    const parts = clean.split(':');
    if (parts.length === 4) {
      const [ip, port, user, pass] = parts;
      clean = `http://${user}:${pass}@${ip}:${port}`;
    }
    // 3. Format: ip:port  →  http://ip:port
    else if (parts.length === 2) {
      const [ip, port] = parts;
      clean = `http://${ip}:${port}`;
    }
    // 4. Format: user:pass@ip:port (no protocol)
    else if (clean.includes('@')) {
      clean = `http://${clean}`;
    }
    // 5. Invalid
    else {
      return { ok: false, message: 'Invalid format. Use ip:port:user:pass or ip:port or http://user:pass@ip:port' };
    }
  }

  // ===== Final validation =====
  if (!/^(https?|socks[45]?):\/\/.+/i.test(clean)) {
    return { ok: false, message: 'Invalid proxy URL after normalization' };
  }

  const c = await col();
  const exists = await c.findOne({ owner: username, url: clean });
  if (exists) return { ok: false, message: 'Proxy already exists' };

  await c.insertOne({
    owner: username,
    url: clean,
    original: url.trim(),          // keep original for display
    status: 'unknown',
    lastChecked: null,
    latency: null,
    proxyIp: null,
    createdAt: new Date()
  });
  invalidateCache(username);
  return { ok: true, message: 'Proxy added' };
}
