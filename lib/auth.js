// lib/auth.js – Hardcoded auth (no env needed)
import crypto from 'crypto';
import { AUTH_USERS, SESSION_SECRET } from './config.js';

// ===== টোকেন তৈরি (HMAC signed) =====
export function createToken(username) {
  const timestamp = Date.now();
  const payload = `${username}.${timestamp}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

// ===== টোকেন যাচাই =====
export function verifyToken(token) {
  try {
    if (!token) return null;
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const lastDot = decoded.lastIndexOf('.');
    const sig = decoded.slice(lastDot + 1);
    const rest = decoded.slice(0, lastDot);
    const parts = rest.split('.');
    const username = parts[0];
    const timestamp = parts[1];

    const expected = crypto.createHmac('sha256', SESSION_SECRET)
      .update(`${username}.${timestamp}`).digest('hex');
    if (sig !== expected) return null;

    // ৭ দিনের মেয়াদ
    if (Date.now() - Number(timestamp) > 7 * 24 * 3600 * 1000) return null;

    return { username };
  } catch (e) { return null; }
}

// ===== লগইন =====
export function loginUser(username, password) {
  if (!username || !password) {
    return { ok: false, message: 'Username and password required' };
  }
  const user = AUTH_USERS.find(
    u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );
  if (!user) {
    return { ok: false, message: '❌ Invalid username or password' };
  }
  const token = createToken(user.username);
  return {
    ok: true,
    token,
    user: { username: user.username }
  };
}
