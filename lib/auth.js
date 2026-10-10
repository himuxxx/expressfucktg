// lib/auth.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, ADMIN_USER, ADMIN_PASS } from './config.js';
import { getUsersCol } from './db.js';

export async function ensureAdmin() {
  const col = await getUsersCol();
  const admin = await col.findOne({ username: ADMIN_USER });
  if (!admin) {
    await col.insertOne({
      username: ADMIN_USER,
      password: bcrypt.hashSync(ADMIN_PASS, 10),
      role: 'admin',
      validity: null,
      createdAt: new Date()
    });
  }
}

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

export async function loginUser(username, password) {
  await ensureAdmin();
  const col = await getUsersCol();
  const clean = username.trim().toLowerCase();
  const user = await col.findOne({ username: clean });
  if (!user) return { ok: false, message: 'Invalid credentials' };
  if (!bcrypt.compareSync(password, user.password)) {
    return { ok: false, message: 'Invalid credentials' };
  }

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

export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; }
}

export async function validateSession(token) {
  const payload = verifyToken(token);
  if (!payload) return null;
  const col = await getUsersCol();
  const user = await col.findOne({ username: payload.username });
  if (!user) return null;
  if (user.validity && new Date(user.validity) < new Date()) return null;
  return { username: user.username, role: user.role };
}

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

export async function setValidity(username, days) {
  const col = await getUsersCol();
  let validity = null;
  if (days && Number(days) > 0) {
    validity = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);
  }
  const r = await col.updateOne({ username: username.toLowerCase() }, { $set: { validity } });
  return { ok: r.matchedCount > 0, message: r.matchedCount ? 'Updated' : 'User not found' };
}

export async function deleteUser(username) {
  if (username === ADMIN_USER) return { ok: false, message: 'Cannot delete admin' };
  const col = await getUsersCol();
  const r = await col.deleteOne({ username: username.toLowerCase() });
  return { ok: r.deletedCount > 0, message: r.deletedCount ? 'User deleted' : 'User not found' };
}

export function generateRandomUser() {
  const names = [
    'sakib', 'rabbi', 'arif', 'rahim', 'karim', 'hasan', 'rakib',
    'emon', 'tanvir', 'nayem', 'sohel', 'noman', 'shanto', 'rifat',
    'shuvo', 'tuhin', 'raju', 'sujon', 'fahim', 'joy', 'sabbir',
    'sumon', 'mizan', 'ashik', 'hasib', 'imran', 'salman', 'nahid',
    'mahin', 'rasel', 'jubayer', 'antik', 'shakil', 'monir', 'ali'
  ];
  const name = names[Math.floor(Math.random() * names.length)];
  const suffix = Math.floor(Math.random() * 90) + 10;
  const username = `${name}${suffix}`;
  const password = String(Math.floor(Math.random() * 900000) + 100000);
  return { username, password };
}
