// lib/proxy.js – Per-user proxy management
import { ProxyAgent } from 'undici';
import { getDB } from './db.js';

async function col() {
  const db = await getDB();
  return db.collection('proxies');
}

const userCache = new Map();
const CACHE_TTL = 30 * 1000;

export function invalidateCache(username) {
  if (username) userCache.delete(username);
  else userCache.clear();
}

export async function getActiveProxies(username, force = false) {
  if (!username) return [];
  const now = Date.now();
  const cached = userCache.get(username);
  if (!force && cached && cached.list.length > 0 && (now - cached.loadedAt) < CACHE_TTL) {
    return cached.list;
  }
  const c = await col();
  const list = await c.find({ owner: username, status: 'live' }).toArray();
  userCache.set(username, { list, loadedAt: now, currentIndex: cached?.currentIndex || 0 });
  return list;
}

export function getNextProxy(username) {
  const cached = userCache.get(username);
  if (!cached || !cached.list.length) return null;
  const p = cached.list[cached.currentIndex % cached.list.length];
  cached.currentIndex++;
  return p;
}

function makeAgent(proxyUrl) {
  return new ProxyAgent({
    uri: proxyUrl,
    requestTls: { rejectUnauthorized: false },
    proxyTls: { rejectUnauthorized: false }
  });
}

export async function addProxy(username, url) {
  if (!url) return { ok: false, message: 'URL required' };
  const clean = url.trim();
  if (!/^(https?|socks[45]?):\/\//i.test(clean)) {
    return { ok: false, message: 'Invalid format. Use http://, https://, socks5://' };
  }
  const c = await col();
  const exists = await c.findOne({ owner: username, url: clean });
  if (exists) return { ok: false, message: 'Proxy already exists' };

  await c.insertOne({
    owner: username,
    url: clean,
    status: 'unknown',
    lastChecked: null,
    latency: null,
    proxyIp: null,
    createdAt: new Date()
  });
  invalidateCache(username);
  return { ok: true, message: 'Proxy added' };
}

export async function listProxies(username) {
  const c = await col();
  return await c.find({ owner: username }).sort({ createdAt: -1 }).toArray();
}

export async function deleteProxy(username, id) {
  const c = await col();
  const { ObjectId } = await import('mongodb');
  try {
    const r = await c.deleteOne({ _id: new ObjectId(id), owner: username });
    invalidateCache(username);
    return { ok: r.deletedCount > 0 };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

export async function testProxy(url, timeout = 12000) {
  const start = Date.now();
  try {
    const agent = makeAgent(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const res = await fetch('https://api.ipify.org?format=json', {
      dispatcher: agent,
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, ip: data.ip, latency: Date.now() - start };
  } catch (e) {
    return { ok: false, message: e.message || 'Timeout' };
  }
}

export async function checkAllProxies(username) {
  const c = await col();
  const list = await c.find({ owner: username }).toArray();
  const results = [];

  for (const p of list) {
    const r = await testProxy(p.url);
    await c.updateOne(
      { _id: p._id },
      {
        $set: {
          status: r.ok ? 'live' : 'dead',
          lastChecked: new Date(),
          latency: r.ok ? r.latency : null,
          proxyIp: r.ip || null
        }
      }
    );
    results.push({ id: p._id.toString(), url: p.url, ...r });
  }
  invalidateCache(username);
  return results;
}

export async function fetchWithProxy(url, options = {}, username = null, retries = 1) {
  if (!username) {
    return await fetch(url, options);
  }

  const proxies = await getActiveProxies(username);
  if (!proxies.length) {
    return await fetch(url, options);
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const p = getNextProxy(username);
    if (!p) break;
    try {
      const agent = makeAgent(p.url);
      const res = await fetch(url, { ...options, dispatcher: agent });
      return res;
    } catch (e) {
      if (attempt === retries) {
        return await fetch(url, options);
      }
    }
  }
  return await fetch(url, options);
}
