// lib/expressCrypto.js
import forge from 'node-forge';

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

export function aesEncrypt(data, keyBase64, ivBase64) {
  const key = forge.util.decode64(keyBase64);
  const iv = forge.util.decode64(ivBase64);
  const cipher = forge.cipher.createCipher('AES-CBC', key);
  cipher.start({ iv });
  cipher.update(forge.util.createBuffer(data));
  cipher.finish();
  return cipher.output.getBytes();
}

export function hmacSha1Base64(data, key) {
  const hmac = forge.hmac.create();
  hmac.start('sha1', key);
  hmac.update(data);
  return forge.util.encode64(hmac.digest().getBytes());
}
