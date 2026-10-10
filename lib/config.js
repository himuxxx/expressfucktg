// lib/config.js – সব কিছু হার্ডকোড, env ছাড়াই চলবে

export const TELEGRAM_BOT_TOKEN = '8309899708:AAFNUyL_31xccoskKknrJYQr5UoT2GnINkw';
export const TELEGRAM_CHAT_ID = '@exprsv';

// ===== লগইন করার জন্য ইউজার ও পাসওয়ার্ড (আপনি যাদের দিতে চান) =====
// যত খুশি ইউজার যোগ করুন — username:password
export const AUTH_USERS = [
  { username: 'himu',   password: 'himu1122' },
  { username: 'himu1122',  password: 'himu1122' },
  // { username: 'friend1', password: 'friendpass1' },  // চাইলে যোগ করুন
];

// ===== সেশন সিক্রেট (গোপন কী — যেকোনো লম্বা টেক্সট দিন) =====
export const SESSION_SECRET = 'expressvpn-shakib-secret-key-2026-very-long-random-string';
