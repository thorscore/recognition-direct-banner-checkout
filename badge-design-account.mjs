import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { BADGE_ORDER_BODY_LIMIT, BadgeOrderError, createBadgeDesignerOrders } from './badge-designer/orders.mjs';

export const BADGE_DESIGN_PATH = '/api/badge-design-account';
const COOKIE = '__Secure-rd_badge_design';
const CODE_AGE = 10 * 60_000;
const RATE_WINDOW = 15 * 60_000;
const SESSION_AGE = 7 * 24 * 60 * 60_000;
const MAX_LOGO = 5 * 1024 * 1024;
const MAX_BODY = Math.ceil(MAX_LOGO / 3) * 4 + 8192;
const REQUIRED_OPTIONS = ['family', 'size', 'stockColor', 'frame', 'fastener', 'dome', 'organization', 'textColor', 'layout'];
const OPTIONAL_OPTIONS = ['textAlignment', 'cornerRadius', 'textSize'];
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf']);
const token = () => randomBytes(32).toString('hex');
const digest = value => createHash('sha256').update(value).digest('hex');
const isToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

class RequestError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}

function reject(status, code) {
  throw new RequestError(status, code);
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(req, limit) {
  if (req.headers['content-type'] !== 'application/json' || req.headers['content-encoding']) {
    reject(415, 'JSON_REQUIRED');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      req.resume();
      reject(413, 'BODY_SIZE_LIMIT');
    }
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { reject(400, 'JSON_INVALID'); }
  if (!object(body)) reject(400, 'JSON_INVALID');
  return body;
}

function checkedDesign(input) {
  const { schema, label, options, logo, logoScale, requestKey } = input;
  if (schema !== 'recognition-direct-badge-design.v1' || typeof label !== 'string' ||
      !label.trim() || label.length > 60 || /[\u0000-\u001f\u007f]/.test(label) ||
      !Number.isFinite(logoScale) || logoScale < 0.25 || logoScale > 1 ||
      typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(requestKey) ||
      !object(options) || !REQUIRED_OPTIONS.every(key => Object.hasOwn(options, key))) {
    reject(422, 'DESIGN_INVALID');
  }
  for (const [key, value] of Object.entries(options)) {
    if (![...REQUIRED_OPTIONS, ...OPTIONAL_OPTIONS].includes(key) ||
        !(typeof value === 'boolean' || Number.isFinite(value) || (typeof value === 'string' && value.length <= 160))) {
      reject(422, 'DESIGN_INVALID');
    }
  }
  if (logo !== null) {
    if (!object(logo) || !LOGO_TYPES.has(logo.type) || typeof logo.base64 !== 'string') {
      reject(422, 'LOGO_INVALID');
    }
    const bytes = Buffer.from(logo.base64, 'base64');
    if (!bytes.length || bytes.length > MAX_LOGO || bytes.toString('base64') !== logo.base64) {
      reject(422, 'LOGO_INVALID');
    }
  }
  return {
    requestKey,
    design: { schema, label: label.trim(), options, logo: logo && { type: logo.type, base64: logo.base64 }, logoScale },
  };
}

export function createBadgeDesignAccount({ databasePath, origins, sendCode, previewEmail, production, now = Date.now }) {
  if (!databasePath || typeof sendCode !== 'function' || !origins.length) throw new Error('Badge design account setup is incomplete.');
  const allowedOrigins = new Set(origins);
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS badge_library_key (id INTEGER PRIMARY KEY CHECK (id = 1), secret TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS badge_library_codes (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, mac TEXT, issued INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS badge_library_codes_issued ON badge_library_codes(issued);
    CREATE TABLE IF NOT EXISTS badge_library_sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS badge_library_designs (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_key TEXT NOT NULL,
      label TEXT NOT NULL, design TEXT NOT NULL, bytes INTEGER NOT NULL,
      UNIQUE(owner, request_key)
    );
  `);
  db.prepare('INSERT OR IGNORE INTO badge_library_key VALUES (1, ?)').run(token());
  const key = db.prepare('SELECT secret FROM badge_library_key WHERE id = 1').get().secret;
  const mac = value => createHmac('sha256', key).update(value).digest('hex');
  const orderService = production && createBadgeDesignerOrders({
    db, graphql: production.graphql, base: production.base, previewEmail, now,
  });
  const productionOwner = production && mac('email:' + production.owner);
  const saveCookie = (value, age) => `${COOKIE}=${value}; Path=${BADGE_DESIGN_PATH}; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`;

  function session(req) {
    const raw = (req.headers.cookie || '').split(';').map(pair => pair.trim())
      .find(pair => pair.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    return isToken(raw) && db.prepare('SELECT id, owner FROM badge_library_sessions WHERE id = ? AND expires > ?')
      .get(digest(raw), now());
  }

  function sessionKey(active) {
    return mac('browser:' + active.id);
  }

  async function issueCode(body) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(email)) {
      reject(422, 'EMAIL_INVALID');
    }
    if (previewEmail && email !== previewEmail) reject(403, 'PREVIEW_EMAIL_REQUIRED');
    const time = now();
    const owner = mac('email:' + email);
    db.prepare('DELETE FROM badge_library_codes WHERE issued <= ?').run(time - RATE_WINDOW);
    const recent = db.prepare('SELECT COUNT(*) AS count, MAX(issued) AS latest FROM badge_library_codes WHERE owner = ?').get(owner);
    const total = db.prepare('SELECT COUNT(*) AS count FROM badge_library_codes').get().count;
    if (recent.count >= 3 || (recent.latest !== null && time - recent.latest < 60_000) ||
        total >= 40) reject(429, 'CODE_RATE_LIMIT');
    const id = token();
    const code = String(randomInt(100_000_000)).padStart(8, '0');
    db.prepare('INSERT INTO badge_library_codes (id,owner,issued) VALUES (?,?,?)').run(id, owner, time);
    try { await sendCode(email, code); }
    catch { reject(502, 'CODE_DELIVERY_FAILED'); }
    db.prepare('UPDATE badge_library_codes SET mac = ? WHERE id = ?').run(mac('code:' + id + ':' + code), id);
    return { challenge: id };
  }

  function verifyCode({ challenge, code }, prior) {
    const row = isToken(challenge) && db.prepare('SELECT * FROM badge_library_codes WHERE id = ?').get(challenge);
    if (!row?.mac || row.issued + CODE_AGE <= now() || row.attempts >= 5 ||
        typeof code !== 'string' || !/^[0-9]{8}$/.test(code)) reject(401, 'CODE_INVALID');
    const hash = mac('code:' + challenge + ':' + code);
    if (!timingSafeEqual(Buffer.from(hash), Buffer.from(row.mac))) {
      db.prepare('UPDATE badge_library_codes SET attempts = attempts + 1 WHERE id = ?').run(challenge);
      reject(401, 'CODE_INVALID');
    }
    const raw = token();
    const id = digest(raw);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE badge_library_codes SET mac = NULL WHERE id = ?').run(challenge);
      db.prepare('DELETE FROM badge_library_sessions WHERE expires <= ? OR id = ?').run(now(), prior?.id ?? '');
      db.prepare('INSERT INTO badge_library_sessions VALUES (?,?,?)').run(id, row.owner, now() + SESSION_AGE);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return { raw, key: sessionKey({ id }) };
  }

  function save(owner, body) {
    const { requestKey, design } = checkedDesign(body);
    const serialized = JSON.stringify(design);
    const previous = db.prepare('SELECT id, design FROM badge_library_designs WHERE owner = ? AND request_key = ?')
      .get(owner, requestKey);
    if (previous) {
      if (previous.design !== serialized) reject(409, 'RETRY_CONFLICT');
      return { id: previous.id };
    }
    const bytes = Buffer.byteLength(serialized);
    const account = db.prepare('SELECT COUNT(*) AS count FROM badge_library_designs WHERE owner = ?').get(owner);
    const storage = db.prepare('SELECT COALESCE(SUM(bytes), 0) AS bytes FROM badge_library_designs').get();
    if (account.count >= 30 || storage.bytes + bytes > 128 * 1024 * 1024) reject(507, 'DESIGN_STORAGE_FULL');
    const id = token();
    db.prepare('INSERT INTO badge_library_designs VALUES (?,?,?,?,?,?)').run(id, owner, requestKey, design.label, serialized, bytes);
    return { id };
  }

  async function handle(req, res, url) {
    const path = url.pathname.slice(BADGE_DESIGN_PATH.length);
    const origin = req.headers.origin;
    const headers = {
      'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', Vary: 'Origin',
      'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, noarchive',
    };
    function reply(status, body, extra) {
      res.writeHead(status, { ...headers, ...extra });
      res.end(status === 204 ? undefined : JSON.stringify(body));
    }
    if (!allowedOrigins.has(origin)) return reply(403, { error: 'ORIGIN_REQUIRED' });
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    if (req.method === 'OPTIONS') {
      return reply(204, null, {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Badge-Session',
      });
    }
    try {
      if (req.method !== 'POST') reject(405, 'POST_REQUIRED');
      const active = session(req);
      if (path === '/session') return reply(200, { session: active ? sessionKey(active) : null });
      if (path === '/code') return reply(200, await issueCode(await readJson(req, 1024)));
      if (path === '/verify') {
        const verified = verifyCode(await readJson(req, 1024), session(req));
        return reply(200, { session: verified.key }, { 'Set-Cookie': saveCookie(verified.raw, SESSION_AGE / 1000) });
      }
      if (path === '/checkout' && orderService) {
        return reply(200, await orderService.checkout(await readJson(req, BADGE_ORDER_BODY_LIMIT)));
      }
      if (!active || req.headers['x-badge-session'] !== sessionKey(active)) reject(401, 'SIGN_IN_REQUIRED');
      if (path === '/production' && orderService) {
        if (origin !== production.base || active.owner !== productionOwner) reject(403, 'ORDER_OWNER_REQUIRED');
        const { id } = await readJson(req, 1024);
        if (session(req)?.id !== active.id) reject(401, 'SIGN_IN_REQUIRED');
        return reply(200, await orderService.production(id));
      }
      if (path === '/sign-out') {
        db.prepare('DELETE FROM badge_library_sessions WHERE id = ?').run(active.id);
        return reply(200, {}, { 'Set-Cookie': saveCookie('', 0) });
      }
      if (path === '/list') {
        const designs = db.prepare('SELECT id, label FROM badge_library_designs WHERE owner = ? ORDER BY rowid DESC').all(active.owner);
        return reply(200, { designs });
      }
      if (path === '/save') {
        const body = await readJson(req, MAX_BODY);
        if (session(req)?.id !== active.id) reject(401, 'SIGN_IN_REQUIRED');
        return reply(201, save(active.owner, body));
      }
      if (path === '/open' || path === '/remove') {
        const { id } = await readJson(req, 1024);
        if (session(req)?.id !== active.id) reject(401, 'SIGN_IN_REQUIRED');
        const row = isToken(id) && db.prepare('SELECT design FROM badge_library_designs WHERE id = ? AND owner = ?').get(id, active.owner);
        if (!row) reject(404, 'DESIGN_NOT_FOUND');
        if (path === '/open') return reply(200, JSON.parse(row.design));
        db.prepare('DELETE FROM badge_library_designs WHERE id = ? AND owner = ?').run(id, active.owner);
        return reply(200, {});
      }
      reject(404, 'NOT_FOUND');
    } catch (error) {
      const known = error instanceof RequestError || error instanceof BadgeOrderError;
      return reply(known ? error.status : 503, {
        error: known ? error.message : path === '/checkout' ? 'ORDER_REVIEW_REQUIRED' : 'SAVED_DESIGNS_UNAVAILABLE',
      });
    }
  }

  return { handle, close: () => db.close() };
}

export async function configureBadgeDesignAccount({ databasePath, mode, graphql, base, env = process.env }) {
  if (mode !== 'preview' && mode !== 'live') throw new Error('Badge design sign-in mode is not configured.');
  const { alertConfig } = await import('./express-one-alerts.mjs');
  const mail = alertConfig({
    EXPRESS_ONE_EMAIL_ENABLED: 'true',
    EXPRESS_ONE_SMTP_HOST: env.EXPRESS_ONE_SMTP_HOST,
    EXPRESS_ONE_SMTP_PORT: env.EXPRESS_ONE_SMTP_PORT,
    EXPRESS_ONE_SMTP_USER: env.EXPRESS_ONE_SMTP_USER,
    EXPRESS_ONE_SMTP_PASS: env.EXPRESS_ONE_SMTP_PASS,
    EXPRESS_ONE_EMAIL_FROM: env.EXPRESS_ONE_EMAIL_FROM,
  }, false);
  if (!mail.enabled) throw new Error('Badge design sign-in email is not configured.');
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport(mail.smtp);
  const owner = mail.smtp.auth.user.trim().toLowerCase();
  return createBadgeDesignAccount({
    databasePath,
    origins: ['https://recognition-direct.com', 'https://www.recognition-direct.com', base],
    previewEmail: mode === 'preview' ? owner : undefined,
    production: { graphql, base, owner },
    async sendCode(to, code) {
      const result = await transport.sendMail({
        from: mail.from,
        to,
        subject: 'Recognition Direct | Badge design sign-in code',
        text: `Your sign-in code is ${code}. Enter it on the Recognition Direct badge design page to save or reopen designs for reorders. This code expires in 10 minutes and works once.`,
      });
      if (!result.accepted.some(address => address.toLowerCase() === to)) throw new Error('Recipient not accepted.');
    },
  });
}
