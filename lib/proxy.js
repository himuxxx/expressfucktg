// lib/proxy.js – Proxy management with rotation
import { ProxyAgent } from 'undici';
import { getDB } from './db.js';

async function col() {
  const db = await getDB();
  return db.collection('proxies');
}

// ===== Cache for speed =====
let proxyCache = { list: [], loadedAt: 0, currentIndex: 0 };
const CACHE_TTL = 30 * 1000; // 30 sec

export function invalidateCache() {
  proxyCache.loadedAt = 0;
}

// ===== Get all live proxies =====
export async function getActiveProxies(force = false) {
  const now = Date.now();
  if (!force && proxyCache.list.length > 0 && (now - proxyCache.loadedAt) < CACHE_TTL) {
    return proxyCache.list;
  }
  const c = await col();
  const list = await c.find({ status: 'live' }).toArray();
  proxyCache = { list, loadedAt: now, currentIndex: proxyCache.currentIndex };
  return list;
}

// ===== Round-robin next proxy =====
export function getNextProxy() {
  if (!proxyCache.list.length) return null;
  const p = proxyCache.list[proxyCache.currentIndex % proxyCache.list.length];
  proxyCache.currentIndex++;
  return p;
}

// ===== Create ProxyAgent from URL =====
function makeAgent(proxyUrl) {
  return new ProxyAgent({
    uri: proxyUrl,
    requestTls: { rejectUnauthorized: false },
    proxyTls: { rejectUnauthorized: false }
  });
}

// ===== Add proxy =====
export async function addProxy(url) {
  if (!url) return { ok: false, message: 'URL required' };
  const clean = url.trim();
  if (!/^(https?|socks[45]?):\/\//i.test(clean)) {
    return { ok: false, message: 'Invalid format. Use http://, https://, socks5://' };
  }
  const c = await col();
  const exists = await c.findOne({ url: clean });
  if (exists) return { ok: false, message: 'Proxy already exists' };

  await c.insertOne({
    url: clean,
    status: 'unknown',
    lastChecked: null,
    latency: null,
    proxyIp: null,
    createdAt: new Date()
  });
  invalidateCache();
  return { ok: true, message: 'Proxy added' };
}

// ===== List all proxies =====
export async function listProxies() {
  const c = await col();
  return await c.find({}).sort({ createdAt: -1 }).toArray();
}

// ===== Delete proxy =====
export async function deleteProxy(id) {
  const c = await col();
  const { ObjectId } = await import('mongodb');
  try {
    const r = await c.deleteOne({ _id: new ObjectId(id) });
    invalidateCache();
    return { ok: r.deletedCount > 0 };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ===== Test a single proxy =====
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

// ===== Test all proxies =====
export async function checkAllProxies() {
  const c = await col();
  const list = await c.find({}).toArray();
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
  invalidateCache();
  return results;
}

// ===== FETCH WITH AUTO PROXY =====
export async function fetchWithProxy(url, options = {}, retries = 1) {
  const proxies = await getActiveProxies();

  // No proxies — direct fetch
  if (!proxies.length) {
    return await fetch(url, options);
  }

  // Try with proxy
  for (let attempt = 0; attempt <= retries; attempt++) {
    const p = getNextProxy();
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
