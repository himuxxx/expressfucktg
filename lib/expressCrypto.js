import forge from 'node-forge';

// ===== AES-128-CBC Decrypt =====
export function aesDecrypt(data, keyBase64, ivBase64) {
  const key = forge.util.decode64(keyBase64);
  const iv = forge.util.decode64(ivBase64);
  const decipher = forge.cipher.createDecipher('AES-CBC', key);
  decipher.start({ iv });
  decipher.update(forge.util.createBuffer(data));
  const pass = decipher.finish();
  if (!pass) throw new Error('AES decrypt failed');
  return decipher.output.getBytes();
}

// ===== AES-128-CBC Encrypt (for testing only) =====
export function aesEncrypt(data, keyBase64, ivBase64) {
  const key = forge.util.decode64(keyBase64);
  const iv = forge.util.decode64(ivBase64);
  const cipher = forge.cipher.createCipher('AES-CBC', key);
  cipher.start({ iv });
  cipher.update(forge.util.createBuffer(data));
  cipher.finish();
  return cipher.output.getBytes();
}

// ===== HMAC-SHA1 → Base64 =====
export function hmacSha1Base64(data, key) {
  const hmac = forge.hmac.create();
  hmac.start('sha1', key);
  hmac.update(data);
  return forge.util.encode64(hmac.digest().getBytes());
}

// ===== GZip =====
export function gzipData(str) {
  const input = forge.util.createBuffer(str, 'raw');
  const compressed = forge.util.encode64(''); // placeholder – we'll use pako instead
  // node-forge doesn't have gzip, so we use zlib
  return null;
}

// ===== Envelope Encrypt (CMS / PKCS7) =====
export function envelopeEncrypt(data, certBase64) {
  const certDer = forge.util.decode64(certBase64);
  const certAsn1 = forge.asn1.fromDer(certDer);
  const cert = forge.pki.certificateFromAsn1(certAsn1);

  // Generate random AES key + IV
  const key = forge.random.getBytesSync(16);
  const iv = forge.random.getBytesSync(16);

  // Encrypt data with AES-CBC
  const cipher = forge.cipher.createCipher('AES-CBC', key);
  cipher.start({ iv });
  cipher.update(forge.util.createBuffer(data));
  cipher.finish();
  const encryptedContent = cipher.output.getBytes();

  // Encrypt AES key with RSA (cert public key)
  const publicKey = cert.publicKey;
  const encryptedKey = publicKey.encrypt(key, 'RSA-OAEP');

  // Build CMS EnvelopedData structure
  // Note: full CMS construction is complex – we'll use a simplified ASN.1 approach
  // that matches the C# EnvelopedCms format

  // ... (Simplified for brevity – see full implementation below)
  // We'll use forge.pkcs7.createEnvelopedData() instead
  const p7 = forge.pkcs7.createEnvelopedData();
  p7.addRecipient(cert);
  p7.content = forge.util.createBuffer(data);
  p7.encrypt();
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return der;
}
