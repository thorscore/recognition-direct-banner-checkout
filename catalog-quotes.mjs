import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

export const QUOTE_FILE_LIMIT = 10 * 1024 * 1024;
const BODY_LIMIT = QUOTE_FILE_LIMIT + 64 * 1024;
const recipient = 'info@recognition-direct.com';
const titles = new Map([
  ['custom-seg-fabric', 'Custom SEG Replacement Fabric Graphics'],
  ['straight-tension-fabric-displays', 'Straight Tension Fabric Displays']
]);
const emailValid = value => /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/.test(value);
const digest = value => createHash('sha256').update(value).digest('hex');
class QuoteError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
function text(value, max = 500, required = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new QuoteError('Enter valid text within the field limits.');
  const result = value.trim();
  if (required && !result) throw new QuoteError('Complete your name and email, then try again.');
  return result;
}
function number(value, label, max, integer = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > max || integer && !Number.isSafeInteger(n)) throw new QuoteError(`Enter a valid ${label}.`);
  return n;
}
export function quoteMailConfig(env = process.env) {
  const host = env.CATALOG_QUOTE_SMTP_HOST || env.EXPRESS_ONE_SMTP_HOST || 'smtp.gmail.com';
  const port = Number(env.CATALOG_QUOTE_SMTP_PORT || env.EXPRESS_ONE_SMTP_PORT || 465);
  const user = env.CATALOG_QUOTE_SMTP_USER || env.EXPRESS_ONE_SMTP_USER;
  const raw = env.CATALOG_QUOTE_SMTP_PASS || env.EXPRESS_ONE_SMTP_PASS || '';
  const compact = raw.replace(/\s/g, '');
  const pass = host.toLowerCase() === 'smtp.gmail.com' && /^[a-z]{16}$/i.test(compact) ? compact : raw;
  const from = env.CATALOG_QUOTE_EMAIL_FROM || env.EXPRESS_ONE_EMAIL_FROM || user;
  if (env.CATALOG_QUOTE_ENABLED === 'false' || !/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/i.test(host) || ![465, 587].includes(port) || !emailValid(user || '') || !emailValid(from || '') || !pass) return { enabled: false };
  return { enabled: true, from, smtp: { host, port, secure: port === 465, requireTLS: true,
    auth: { user, pass }, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false } };
}

export async function quoteInput(form, products) {
  const get = (key, max = 500, required = false) => text(form.get(key) ?? '', max, required);
  if (get('company_website')) throw new QuoteError('Unable to send this request. Please contact us directly.');
  const handle = get('product_handle', 100);
  const product = products.find(p => p.url === '/' + handle);
  if (!titles.has(handle) || !product) throw new QuoteError('This product is not enabled for this quote form.');
  const name = get('name', 120, true), email = get('email', 254, true);
  if (!emailValid(email)) throw new QuoteError('Enter a valid email address.');
  const quantity = number(get('order_quantity', 8), 'whole-number quantity', 10000, true);
  const deliveryValue = get('delivery_method', 50);
  const delivery = { ship: 'Ship', 'pickup-la-mesa': 'Pickup at La Mesa', 'pickup-pine-valley': 'Pickup at Pine Valley' }[deliveryValue];
  if (!delivery) throw new QuoteError('Select shipping or a pickup option.');
  const needBy = get('need_by', 10);
  if (needBy && (!/^\d{4}-\d{2}-\d{2}$/.test(needBy) || !Number.isFinite(Date.parse(needBy)) || new Date(needBy).toISOString().slice(0, 10) !== needBy)) throw new QuoteError('Enter a valid need-by date.');
  let options;
  try { options = JSON.parse(get('catalog_options', 6000) || '{}'); } catch { throw new QuoteError('Refresh the product options and try again.'); }
  if (!options || Array.isArray(options) || typeof options !== 'object') throw new QuoteError('Select valid product options.');
  const selections = [];
  const values = {};
  for (const attr of product.attrs?.attrs || []) {
    if (['size', 'hidden', 'price_break'].includes(attr.component) || !attr.options?.length) continue;
    const raw = form.get('option_' + attr.key) ?? options[attr.key] ?? attr.options.find(o => o.default)?.key ?? attr.options[0].key;
    const value = text(raw, 200);
    const option = attr.options.find(o => String(o.key) === value);
    if (!option) throw new QuoteError('Select valid product options.');
    values[attr.key] = value;
    if (handle === 'straight-tension-fabric-displays' && ((values.hardware === '0' && ['tradeshow_display', 'tradeshow_led'].includes(attr.key)) || (values.hardware === 'gf' && attr.key === 'podium'))) continue;
    selections.push([attr.label || (attr.key === 'hardware' ? 'Package' : attr.key), option.label || value]);
  }
  let size = '';
  if (handle === 'custom-seg-fabric') {
    const units = get('units', 10);
    if (!['feet', 'inches'].includes(units)) throw new QuoteError('Select feet or inches.');
    const width = number(get('width', 20), 'width', units === 'feet' ? 40 : 480);
    const height = number(get('height', 20), 'height', units === 'feet' ? 10 : 120);
    size = `${width} x ${height} ${units}`;
  }
  const files = form.getAll('artwork').filter(f => typeof f !== 'string' && f.size > 0);
  if (files.length > 1) throw new QuoteError('Attach one artwork or reference file.');
  const file = files[0];
  let artwork = null;
  if (file) {
    if (file.size > QUOTE_FILE_LIMIT) throw new QuoteError('Artwork must be 10 MB or smaller. Send the quote without the file to arrange a larger transfer.', 413);
    const extension = extname(file.name).toLowerCase();
    const bytes = Buffer.from(await file.arrayBuffer());
    const pdf = bytes.subarray(0, 5).toString() === '%PDF-';
    const ps = bytes.subarray(0, 4).toString() === '%!PS';
    const valid = { '.pdf': pdf, '.ai': pdf || ps, '.eps': ps,
      '.psd': bytes.subarray(0, 4).toString() === '8BPS',
      '.png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      '.jpg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
      '.jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 }[extension];
    if (!valid) throw new QuoteError('Use a valid PDF, AI, EPS, PSD, JPG or PNG file.');
    const filename = file.name.replace(/^.*[\\/]/, '').replace(/[^a-z0-9._ -]/gi, '_').slice(-140) || 'artwork' + extension;
    artwork = { filename, bytes, sha256: digest(bytes) };
  }
  return { payload: { product: titles.get(handle), handle, name, company: get('company', 160), email,
    phone: get('phone', 80), quantity, size, selections, delivery, needBy, notes: get('notes', 4000),
    artwork: artwork ? { filename: artwork.filename, sha256: artwork.sha256, bytes: artwork.bytes.length } : null }, artwork };
}

export function quoteEmail(payload, reference, from, bytes) {
  const lines = [
    `Quote request: ${reference}`, `Product: ${payload.product}`, `Product page: https://recognition-direct.com/products/${payload.handle}`,
    `Name: ${payload.name}`, `Company: ${payload.company || 'Not supplied'}`, `Email: ${payload.email}`, `Phone: ${payload.phone || 'Not supplied'}`,
    `Quantity: ${payload.quantity}`, ...(payload.size ? [`Requested size: ${payload.size}`] : []),
    ...payload.selections.map(([label, value]) => `${label}: ${value}`), `Delivery preference: ${payload.delivery}`,
    `Need-by date: ${payload.needBy || 'Not supplied (not a delivery promise)'}`, `Notes: ${payload.notes || 'None'}`,
    `Artwork: ${payload.artwork ? payload.artwork.filename + ' (attached)' : 'Not attached; follow up as needed'}`,
    '', 'This is a quote request only. Confirm fit, artwork, pricing, delivery and deadline before accepting an order. No Shopify order, charge, production or shipment was created.'
  ];
  return { from, to: recipient, replyTo: payload.email, subject: `Website quote ${reference}: ${payload.product}`,
    messageId: `<catalog-quote-${reference}@recognition-direct.com>`, text: lines.join('\n'),
    attachments: payload.artwork && bytes ? [{ filename: payload.artwork.filename, content: Buffer.from(bytes), contentType: 'application/octet-stream', contentDisposition: 'attachment' }] : [] };
}

export async function createCatalogQuoteHandler({ databasePath, products, allowedOrigins, baseUrl, env = process.env, transport, mock = false, now = Date.now }) {
  if (databasePath !== ':memory:') await mkdir(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS catalog_quotes (id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, payload TEXT NOT NULL, artwork BLOB, state TEXT NOT NULL, created_at INTEGER NOT NULL, error_category TEXT NOT NULL DEFAULT ''); CREATE INDEX IF NOT EXISTS quote_fingerprint ON catalog_quotes(fingerprint,created_at);");
  db.prepare("UPDATE catalog_quotes SET state='uncertain',error_category='interrupted' WHERE state='sending'").run();
  const config = quoteMailConfig(env);
  const mail = transport || (config.enabled && !mock ? (await import('nodemailer')).default.createTransport(config.smtp) : null);
  const ready = Boolean(transport || config.enabled && !mock);
  const inFlight = new Map(), rates = new Map();
  const headers = origin => ({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin', ...(allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) });
  const reply = (res, status, payload, origin, native = false) => {
    if (!native) { res.writeHead(status, headers(origin)); res.end(JSON.stringify(payload)); return; }
    const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const title = payload.ok ? 'Quote request sent' : 'Quote request needs attention';
    res.writeHead(status, { ...headers(origin), 'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" });
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Recognition Direct</title><style>body{max-width:700px;margin:60px auto;padding:0 24px;font:16px/1.6 Arial,sans-serif;color:#172033}h1{font-size:30px}a{color:#3154b8}p{overflow-wrap:anywhere}</style><main><p>Recognition Direct</p><h1>${title}</h1><p>${escape(payload.ok ? 'We will review the details and follow up by email. No order or charge has been created.' : payload.error)}</p>${payload.reference ? `<p>Reference: <strong>${escape(payload.reference)}</strong></p>` : ''}<p><a href="mailto:info@recognition-direct.com">Email info@recognition-direct.com</a></p><a href="https://recognition-direct.com/">Return to the store</a></main></html>`);
  };
  function limit(req) {
    const key = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',').at(-1).trim();
    const time = now();
    for (const [id, rate] of rates) if (time - rate.start > 60000) rates.delete(id);
    const rate = rates.get(key) || { start: time, count: 0 };
    if (++rate.count > 6 || rates.size >= 1000 || db.prepare('SELECT count(*) AS n FROM catalog_quotes WHERE created_at>?').get(time - 3600000).n >= 60) throw new QuoteError('Too many requests. Please wait before trying again, or contact us directly.', 429);
    rates.set(key, rate);
  }
  async function deliver(row) {
    if (row.state === 'sent') return { ok: true, reference: row.id, status: 'sent' };
    if (row.state === 'uncertain') throw new QuoteError('Your request was saved, but email delivery is unconfirmed. Please contact info@recognition-direct.com with this reference; do not submit it again.', 502, { reference: row.id, uncertain: true });
    if (inFlight.has(row.id)) return inFlight.get(row.id);
    if (inFlight.size >= 3) throw new QuoteError('Quote requests are busy. Please wait a moment and try again.', 503, { reference: row.id });
    const sending = Promise.resolve().then(async () => {
      db.prepare("UPDATE catalog_quotes SET state='sending' WHERE id=?").run(row.id);
      try {
        const result = await mail.sendMail(quoteEmail(JSON.parse(row.payload), row.id, config.from || 'info@recognition-direct.com', row.artwork));
        if (!result.accepted?.some(address => typeof address === 'string' && address.toLowerCase() === recipient)) throw Object.assign(new Error('Recipient not accepted'), { code: 'EENVELOPE' });
        db.prepare("UPDATE catalog_quotes SET state='sent',artwork=NULL,error_category='' WHERE id=?").run(row.id);
        return { ok: true, reference: row.id, status: 'sent' };
      } catch (error) {
        const known = ['EAUTH', 'EDNS', 'ECONNECTION', 'ECONNREFUSED', 'EENVELOPE', 'EMESSAGE'];
        const uncertain = error.command === 'DATA' || !known.includes(error.code);
        db.prepare('UPDATE catalog_quotes SET state=?,error_category=? WHERE id=?').run(uncertain ? 'uncertain' : 'failed', known.includes(error.code) ? error.code : 'unconfirmed', row.id);
        throw new QuoteError(uncertain ? 'Your request was saved, but email delivery is unconfirmed. Please contact info@recognition-direct.com with this reference; do not submit it again.' : 'The quote email was not accepted. Your details are saved; try again or contact info@recognition-direct.com with this reference.', 502, { reference: row.id, uncertain });
      } finally { inFlight.delete(row.id); }
    });
    inFlight.set(row.id, sending);
    return sending;
  }
  const handler = async (req, res, url) => {
    if (!['/api/catalog-quote', '/api/catalog-quote/status'].includes(url.pathname)) return false;
    const origin = req.headers.origin || '';
    const native = (req.headers.accept || '').includes('text/html');
    if (req.method === 'GET' && url.pathname.endsWith('/status')) { reply(res, 200, { enabled: ready, maxFileBytes: QUOTE_FILE_LIMIT, products: [...titles.keys()] }, origin); return true; }
    try {
      if (req.method !== 'POST' || url.pathname !== '/api/catalog-quote') throw new QuoteError('Method not allowed.', 405);
      if (!allowedOrigins.has(origin)) throw new QuoteError('Please send this request from the Recognition Direct website.', 403);
      if (!ready) throw new QuoteError('Online quote email is unavailable. Please contact info@recognition-direct.com.', 503);
      limit(req);
      if (!/^multipart\/form-data;\s*boundary=/i.test(req.headers['content-type'] || '')) throw new QuoteError('Send the quote using the product form.');
      if (Number(req.headers['content-length']) > BODY_LIMIT) throw new QuoteError('Artwork must be 10 MB or smaller.', 413);
      const chunks = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > BODY_LIMIT) throw new QuoteError('Artwork must be 10 MB or smaller.', 413); chunks.push(chunk); }
      const form = await new Request(baseUrl + url.pathname, { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: Buffer.concat(chunks) }).formData();
      const { payload, artwork } = await quoteInput(form, products);
      const fingerprint = digest(JSON.stringify(payload));
      const key = text(form.get('quote_request_key') ?? '', 80) || digest(fingerprint + Math.floor(now() / 600000));
      if (!/^[a-z0-9-]{20,80}$/i.test(key)) throw new QuoteError('Refresh the quote form and try again.');
      let row = db.prepare('SELECT * FROM catalog_quotes WHERE request_key=?').get(key);
      if (row && row.fingerprint !== fingerprint) throw new QuoteError('These details changed after the request was sent. Refresh the page to start a new quote.', 409);
      if (!row) {
        if (db.prepare('SELECT coalesce(sum(length(artwork)),0) AS n FROM catalog_quotes').get().n + (artwork?.bytes.length || 0) > 100 * 1024 * 1024) throw new QuoteError('Online artwork storage is busy. Please contact us to arrange the file transfer.', 503);
        const id = randomUUID();
        db.prepare('INSERT INTO catalog_quotes(id,request_key,fingerprint,payload,artwork,state,created_at) VALUES(?,?,?,?,?,?,?)').run(id, key, fingerprint, JSON.stringify(payload), artwork?.bytes || null, 'pending', now());
        row = db.prepare('SELECT * FROM catalog_quotes WHERE id=?').get(id);
      }
      const result = await deliver(row);
      reply(res, 200, result, origin, native);
    } catch (error) {
      reply(res, error instanceof QuoteError ? error.status : 400, { error: error instanceof QuoteError ? error.message : 'Unable to read this request. Please check the file and try again.', ...(error.extra || {}) }, origin, native);
    }
    return true;
  };
  handler.close = async () => { await Promise.allSettled(inFlight.values()); mail?.close?.(); db.close(); };
  return handler;
}
