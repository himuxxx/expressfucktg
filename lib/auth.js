// lib/auth.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, ADMIN_USER, ADMIN_PASS } from './config.js';
import { getUsersCol } from './db.js';

// ===== Admin auto-create (প্রথমবার) =====
export async function ensureAdmin() {
  const col = await getUsersCol();
  const admin = await col.findOne({ username: ADMIN_USER });
  if (!admin) {
    await col.insertOne({
      username: ADMIN_USER,
      password: bcrypt.hashSync(ADMIN_PASS, 10),
      role: 'admin',
      validity: null,       // admin এর মেয়াদ নেই
      createdAt: new Date()
    });
  }
}

// ===== Register/Add User =====
export async function createUser(username, password, validityDays) {
  if (!username || !password) return { ok: false, message: 'Username and password required' };
  const clean = username.trim().toLowerCase();
  if (clean.length < 3) return { ok: false, message: 'Username minimum 3 characters' };
  if (password.length < 4) return { ok: false, message: 'Password minimum 4 characters' };

  const col = await getUsersCol();
  const exists = await col.findOne({ username: clean });
  if (exists) return { ok: false, message: 'Username already exists' };

  let validity = null;
  if (validityDays && Number(validityDays) > 0) {
    validity = new Date(Date.now() + Number(validityDays) * 24 * 60 * 60 * 1000);
  }

  await col.insertOne({
    username: clean,
    password: bcrypt.hashSync(password, 10),
    role: 'user',
    validity,
    createdAt: new Date()
  });

  return { ok: true, message: 'User created' };
}

// ===== Login =====
export async function loginUser(username, password) {
  await ensureAdmin();
  const col = await getUsersCol();
  const clean = username.trim().toLowerCase();
  const user = await col.findOne({ username: clean });
  if (!user) return { ok: false, message: 'Invalid credentials' };
  if (!bcrypt.compareSync(password, user.password)) {
    return { ok: false, message: 'Invalid credentials' };
  }

  // ===== মেয়াদ চেক =====
  if (user.validity && new Date(user.validity) < new Date()) {
    return { ok: false, message: '⏰ Your access has expired' };
  }

  const token = jwt.sign(
    { username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    ok: true,
    token,
    user: {
      username: user.username,
      role: user.role,
      validity: user.validity
    }
  };
}

// ===== Verify =====
export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; }
}

// ===== Live check: token valid + validity not expired =====
export async function validateSession(token) {
  const payload = verifyToken(token);
  if (!payload) return null;
  const col = await getUsersCol();
  const user = await col.findOne({ username: payload.username });
  if (!user) return null;
  if (user.validity && new Date(user.validity) < new Date()) return null;
  return { username: user.username, role: user.role };
}

// ===== Admin: list =====
export async function listUsers() {
  await ensureAdmin();
  const col = await getUsersCol();
  const users = await col.find({}, { projection: { password: 0 } }).sort({ createdAt: -1 }).toArray();
  return users.map(u => ({
    username: u.username,
    role: u.role,
    validity: u.validity,
    createdAt: u.createdAt
  }));
}

// ===== Admin: update validity =====
export async function setValidity(username, days) {
  const col = await getUsersCol();
  let validity = null;
  if (days && Number(days) > 0) {
    validity = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);
  }
  const r = await col.updateOne({ username: username.toLowerCase() }, { $set: { validity } });
  return { ok: r.matchedCount > 0, message: r.matchedCount ? 'Updated' : 'User not found' };
}

// ===== Admin: delete =====
export async function deleteUser(username) {
  if (username === ADMIN_USER) return { ok: false, message: 'Cannot delete admin' };
  const col = await getUsersCol();
  const r = await col.deleteOne({ username: username.toLowerCase() });
  return { ok: r.deletedCount > 0, message: r.deletedCount ? 'User deleted' : 'User not found' };
}

// ===== Random user/pass generator =====
export function generateRandomUser() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const all = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let user = 'user_';
  for (let i = 0; i < 6; i++) user += all[Math.floor(Math.random() * all.length)];
  let pass = '';
  for (let i = 0; i < 10; i++) pass += all[Math.floor(Math.random() * all.length)];
  return { username: user, password: pass };
}
