const crypto = require('crypto');

const ALG = 'HS256';
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function hashPassword(password, salt) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  return hash.toString('hex');
}

function sign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function createJWT(payload, expiresInSeconds = 60 * 60 * 24 * 30) {
  const header = { alg: ALG, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, exp: now + expiresInSeconds, ...payload };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(body));
  const signature = sign(`${encHeader}.${encPayload}`, SECRET);
  return `${encHeader}.${encPayload}.${signature}`;
}

function verifyJWT(token) {
  const [encHeader, encPayload, sig] = token.split('.');
  if (!encHeader || !encPayload || !sig) throw new Error('Invalid token');
  const expected = sign(`${encHeader}.${encPayload}`, SECRET);
  if (sig !== expected) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(encPayload, 'base64url').toString('utf8'));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) throw new Error('Token expired');
  return payload;
}

module.exports = { hashPassword, createJWT, verifyJWT };

