import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCatalogQuoteHandler, quoteInput, quoteMailConfig, QUOTE_FILE_LIMIT } from '../catalog-quotes.mjs';

const products = JSON.parse((await readFile(new URL('../catalog/catalog-inventory.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, '')).products;
function form(overrides = {}, file) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ product_handle: 'custom-seg-fabric', name: 'Quote Test Only', email: 'info@recognition-direct.com',
    width: '8', height: '4', units: 'feet', order_quantity: '2', option_graphic: 'backlit', delivery_method: 'ship',
    catalog_options: '{}', quote_request_key: '11111111-2222-4333-8444-555555555555', notes: 'INTERNAL TEST. Do not produce or ship.', ...overrides })) data.set(key, value);
  if (file) data.set('artwork', file);
  return data;
}
async function fixture(t, send) {
  const messages = [];
  let handler;
  const server = createServer(async (req, res) => { if (!await handler(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  handler = await createCatalogQuoteHandler({ databasePath: ':memory:', products, baseUrl: base, allowedOrigins: new Set([base]), env: {},
    transport: { async sendMail(message) { messages.push(message); return send ? send(message) : { accepted: ['info@recognition-direct.com'] }; } } });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await handler.close(); });
  return { messages, base, post: (data, origin = base) => fetch(base + '/api/catalog-quote', { method: 'POST', headers: { Origin: origin }, body: data }) };
}

test('quote captures dimensions, quantity, options, contact and private artwork', async t => {
  const { post, messages } = await fixture(t);
  const file = new File(['%PDF-1.4\nINTERNAL TEST'], 'quote-test.pdf');
  const response = await post(form({}, file)), result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.status, 'sent'); assert.ok(result.reference);
  assert.equal(messages.length, 1); assert.equal(messages[0].to, 'info@recognition-direct.com');
  assert.equal(messages[0].replyTo, 'info@recognition-direct.com');
  assert.match(messages[0].text, /Requested size: 8 x 4 feet/); assert.match(messages[0].text, /Quantity: 2/);
  assert.match(messages[0].text, /Graphic: Backlit/); assert.match(messages[0].text, /No Shopify order, charge/);
  assert.equal(messages[0].attachments[0].filename, 'quote-test.pdf');
  assert.ok(Buffer.isBuffer(messages[0].attachments[0].content)); assert.doesNotMatch(JSON.stringify(result), /Quote Test|@|uploads|artwork/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('simultaneous and repeated submissions send exactly one message', async t => {
  const { post, messages } = await fixture(t, async () => { await new Promise(resolve => setTimeout(resolve, 30)); return { accepted: ['info@recognition-direct.com'] }; });
  const [a, b] = await Promise.all([post(form()), post(form())]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal((await a.json()).reference, (await b.json()).reference);
  assert.equal((await post(form())).status, 200); assert.equal(messages.length, 1);
  assert.equal((await post(form({ notes: 'Changed after send' }))).status, 409);
});

test('known SMTP rejection can retry the same saved request', async t => {
  let attempts = 0;
  const { post, messages } = await fixture(t, async () => { if (++attempts === 1) throw Object.assign(new Error('private diagnostic'), { code: 'EAUTH' }); return { accepted: ['info@recognition-direct.com'] }; });
  const first = await post(form()), failure = await first.json();
  assert.equal(first.status, 502); assert.equal(failure.uncertain, false); assert.ok(failure.reference);
  assert.doesNotMatch(JSON.stringify(failure), /private diagnostic/);
  const second = await post(form()); assert.equal(second.status, 200); assert.equal((await second.json()).reference, failure.reference);
  assert.equal(messages.length, 2);
});

test('uncertain SMTP outcome does not resend or report success', async t => {
  const { post, messages } = await fixture(t, async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); });
  const first = await post(form()), failure = await first.json();
  assert.equal(first.status, 502); assert.equal(failure.uncertain, true);
  const again = await post(form()); assert.equal(again.status, 502); assert.equal((await again.json()).reference, failure.reference);
  assert.equal(messages.length, 1);
});

test('bad origins, recipient injection, unrelated products and invalid fields do not send mail', async t => {
  const { post, messages } = await fixture(t);
  assert.equal((await post(form(), 'https://evil.example')).status, 403);
  assert.equal((await post(form({ email: 'person@example.test\r\nBcc: evil@example.test' }))).status, 400);
  assert.equal((await post(form({ product_handle: '13oz-vinyl-banner' }))).status, 400);
  assert.equal((await post(form({ width: '0' }))).status, 400);
  assert.equal((await post(form({ order_quantity: '2.5' }))).status, 400);
  assert.equal(messages.length, 0);
});

test('file size, extension and signature checks reject invalid uploads', async () => {
  await assert.rejects(quoteInput(form({}, new File(['<script>bad</script>'], 'bad.pdf')), products), /valid PDF/);
  await assert.rejects(quoteInput(form({}, new File(['%PDF-1.4'], 'bad.html')), products), /valid PDF/);
  await assert.rejects(quoteInput(form({}, new File([new Uint8Array(QUOTE_FILE_LIMIT + 1)], 'large.pdf')), products), /10 MB/);
  const duplicate = form({}, new File(['%PDF-1.4'], 'one.pdf')); duplicate.append('artwork', new File(['%PDF-1.4'], 'two.pdf'));
  await assert.rejects(quoteInput(duplicate, products), /one artwork/);
});

test('complete-display quote retains package and applicable accessories', async () => {
  const { payload } = await quoteInput(form({ product_handle: 'straight-tension-fabric-displays', option_hardware: 'gf', option_size: '10ft', option_sides: '2', option_tradeshow_display: 'podium', option_tradeshow_led: '2' }), products);
  assert.equal(payload.size, ''); assert.ok(payload.selections.some(([label, value]) => label === 'Package' && value === 'Graphic + Frame'));
  assert.ok(payload.selections.some(([label, value]) => label === 'Display Size' && value === '10ft'));
  assert.ok(payload.selections.some(([label, value]) => label === 'Display Option' && value === 'Double Sided'));
  assert.ok(payload.selections.some(([label, value]) => label === 'LED Light' && value === '2 LED Lights'));
  assert.ok(!payload.selections.some(([label]) => label === 'Podium Print'));
});

test('email config reuses existing sender securely and never accepts arbitrary recipients', () => {
  const config = quoteMailConfig({ EXPRESS_ONE_SMTP_USER: 'roth@recognition-direct.com', EXPRESS_ONE_SMTP_PASS: 'abcd efgh ijkl mnop', EXPRESS_ONE_STAFF_EMAIL: 'ignored@example.test' });
  assert.equal(config.enabled, true); assert.equal(config.smtp.auth.pass, 'abcdefghijklmnop');
  assert.equal(config.smtp.tls.rejectUnauthorized, true); assert.equal(config.smtp.disableUrlAccess, true);
  assert.equal(quoteMailConfig({}).enabled, false);
});

test('ordinary form posts receive a private HTML confirmation, not raw JSON or checkout', async t => {
  const { base, messages } = await fixture(t);
  const response = await fetch(base + '/api/catalog-quote', { method: 'POST', headers: { Origin: base, Accept: 'text/html' }, body: form() });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text(); assert.match(html, /Quote request sent/); assert.doesNotMatch(html, /Quote Test Only|8 x 4|checkoutUrl/);
  assert.equal(messages.length, 1);
});

test('status and method handling expose no sender settings and bursts are bounded', async t => {
  const { base, post } = await fixture(t);
  const response = await fetch(base + '/api/catalog-quote/status');
  const status = await response.json(); assert.equal(status.enabled, true); assert.equal(status.maxFileBytes, QUOTE_FILE_LIMIT);
  assert.doesNotMatch(JSON.stringify(status), /smtp|password|sender|user/);
  assert.equal((await fetch(base + '/api/catalog-quote')).status, 405);
  for (let index = 0; index < 6; index++) assert.equal((await post(form())).status, 200);
  assert.equal((await post(form())).status, 429);
});
