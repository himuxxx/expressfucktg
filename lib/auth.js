// lib/auth.js – JWT + User management
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'expressvpn-super-secret-key-change-me';
const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

// ===== Ensure data dir + users file =====
function ensureUsersFile() {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    // ডিফল্ট অ্যাডমিন তৈরি (env থেকে)
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASS || 'admin123';
    const adminHash = bcrypt.hashSync(adminPass, 10);
    fs.writeFileSync(USERS_FILE, JSON.stringify([
      {
        username: adminUser,
        password: adminHash,
        role: 'admin',
        approved: true,
        createdAt: new Date().toISOString()
      }
    ], null, 2));
  }
}
ensureUsersFile();

// ===== Read/Write users =====
export function getUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ===== Register =====
export function registerUser(username, password) {
  if (!username || !password) {
    return { ok: false, message: 'Username and password required' };
  }
  if (username.length < 3) {
    return { ok: false, message: 'Username must be at least 3 characters' };
  }
  if (password.length < 4) {
    return { ok: false, message: 'Password must be at least 4 characters' };
  }

  const users = getUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, message: 'Username already exists' };
  }

  const hash = bcrypt.hashSync(password, 10);
  users.push({
    username,
    password: hash,
    role: 'user',
    approved: false,       // অ্যাডমিন অনুমোদন দিতে হবে
    createdAt: new Date().toISOString()
  });
  saveUsers(users);
  return { ok: true, message: 'Registered! Wait for admin approval.' };
}

// ===== Login =====
export function loginUser(username, password) {
  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { ok: false, message: 'Invalid username or password' };
  if (!bcrypt.compareSync(password, user.password)) {
    return { ok: false, message: 'Invalid username or password' };
  }
  if (!user.approved) {
    return { ok: false, message: 'Your account is pending admin approval' };
  }

  const token = jwt.sign(
    { username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  return { ok: true, token, user: { username: user.username, role: user.role } };
}

// ===== Verify token =====
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// ===== Admin: list / approve / delete =====
export function listUsers() {
  return getUsers().map(u => ({
    username: u.username,
    role: u.role,
    approved: u.approved,
    createdAt: u.createdAt
  }));
}

export function approveUser(username) {
  const users = getUsers();
  const u = users.find(x => x.username === username);
  if (!u) return { ok: false, message: 'User not found' };
  u.approved = true;
  saveUsers(users);
  return { ok: true };
}

export function deleteUser(username) {
  const users = getUsers();
  const idx = users.findIndex(x => x.username === username);
  if (idx === -1) return { ok: false, message: 'User not found' };
  if (users[idx].role === 'admin') return { ok: false, message: 'Cannot delete admin' };
  users.splice(idx, 1);
  saveUsers(users);
  return { ok: true };
}

// ===== Auth middleware =====
export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Login required' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = payload;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
