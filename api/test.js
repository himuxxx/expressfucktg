// api/test.js
export default async function handler(req, res) {
  const results = {};

  try {
    const r = await fetch('https://www.expressapisv2.net/', { method: 'GET' });
    results.fetch_root = `OK ${r.status}`;
  } catch (e) {
    results.fetch_root = `FAIL: ${e.message} | cause: ${e.cause?.message || e.cause?.code || ''}`;
  }

  try {
    const dns = await import('dns/promises');
    const addrs = await dns.lookup('www.expressapisv2.net', { all: true });
    results.dns = addrs;
  } catch (e) {
    results.dns = `FAIL: ${e.message}`;
  }

  try {
    const https = await import('https');
    const ok = await new Promise((resolve) => {
      const req2 = https.request({ host: 'www.expressapisv2.net', port: 443, method: 'GET', path: '/' }, (r) => {
        resolve(`OK ${r.statusCode}`);
      });
      req2.on('error', (err) => resolve(`FAIL: ${err.message}`));
      req2.end();
    });
    results.https_request = ok;
  } catch (e) {
    results.https_request = `FAIL: ${e.message}`;
  }

  res.status(200).json(results);
}
