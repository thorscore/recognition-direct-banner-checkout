import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BADGE_DESIGN_PATH, createBadgeDesignAccount } from '../badge-design-account.mjs';

const origin = 'https://recognition-direct.com';
const sample = {
  schema: 'recognition-direct-badge-design.v1',
  label: 'Office badge',
  options: {
    family: 'standard', size: '3x1', stockColor: 'white', frame: 'none', fastener: 'magnet',
    dome: false, organization: 'Sample office', textColor: '#000000', layout: 'left',
    cornerRadius: '1/4', textAlignment: 'center', textSize: 112,
  },
  logo: { type: 'image/svg+xml', base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') },
  logoScale: 0.75,
  requestKey: 'sample-design-1',
  people: [{ name: 'Order-only name' }],
  delivery: 'troy',
};

test('badge accounts restore the same private design after clearing cookies and restarting', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rd-design-test-'));
  const databasePath = join(directory, 'designs.sqlite');
  const messages = new Map();
  let server, service, base;
  let now = Date.now();
  async function start() {
    service = createBadgeDesignAccount({
      databasePath, origins: [origin], now: () => now,
      sendCode: async (email, code) => { messages.set(email, code); },
    });
    server = createServer((req, res) => service.handle(req, res, new URL(req.url, 'http://localhost')));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + server.address().port + BADGE_DESIGN_PATH;
  }
  async function stop() {
    await new Promise(resolve => server.close(resolve));
    service.close();
  }
  await start();
  t.after(async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
  });
  function browser(site = origin) {
    let cookie, session;
    return async (path, body = {}) => {
      const headers = { Origin: site, 'Content-Type': 'application/json' };
      if (cookie) headers.Cookie = cookie;
      if (session) headers['X-Badge-Session'] = session;
      const result = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await result.json();
      const setCookie = result.headers.get('set-cookie');
      if (setCookie) {
        assert.match(setCookie, /Secure; HttpOnly; SameSite=Strict/);
        cookie = setCookie.split(';')[0];
      }
      if (Object.hasOwn(data, 'session')) session = data.session;
      assert.equal(result.headers.get('cache-control'), 'private, no-store');
      return { status: result.status, data };
    };
  }
  async function signIn(client, email) {
    const { status, data } = await client('/code', { email });
    assert.equal(status, 200);
    const code = messages.get(email.toLowerCase());
    const result = await client('/verify', { challenge: data.challenge, code });
    assert.equal(result.status, 200);
    assert.ok(result.data.session);
    assert.equal((await client('/verify', { challenge: data.challenge, code })).status, 401);
  }

  const guest = browser();
  assert.equal((await guest('/session')).data.session, null);
  assert.equal((await guest('/save', sample)).status, 401);
  assert.equal((await browser('https://example.com')('/code', { email: 'test@example.com' })).status, 403);
  assert.equal(messages.size, 0);

  const alice = browser();
  await signIn(alice, 'Alice@example.com');
  assert.equal((await alice('/code', { email: 'alice@example.com' })).status, 429);
  const saved = await alice('/save', sample);
  assert.equal(saved.status, 201);
  const { id } = saved.data;
  assert.equal((await alice('/save', sample)).data.id, id);
  assert.equal((await alice('/save', { ...sample, label: 'Changed' })).status, 409);
  assert.deepEqual((await alice('/list')).data.designs, [{ id, label: sample.label }]);

  const bob = browser();
  await signIn(bob, 'bob@example.com');
  assert.deepEqual((await bob('/list')).data.designs, []);
  assert.equal((await bob('/open', { id })).status, 404);
  assert.equal((await bob('/remove', { id })).status, 404);

  await stop();
  now += 61_000;
  await start();
  const otherDevice = browser();
  assert.equal((await otherDevice('/open', { id })).status, 401);
  await signIn(otherDevice, 'alice@example.com');
  const restored = (await otherDevice('/open', { id })).data;
  assert.deepEqual(restored.options, sample.options);
  assert.deepEqual(restored.logo, sample.logo);
  assert.equal(restored.logoScale, sample.logoScale);
  assert.equal(Object.hasOwn(restored, 'people'), false);
  assert.equal(Object.hasOwn(restored, 'delivery'), false);
  assert.equal((await otherDevice('/sign-out')).status, 200);
  assert.equal((await otherDevice('/open', { id })).status, 401);
  assert.equal((await alice('/remove', { id })).status, 200);
  assert.deepEqual((await alice('/list')).data.designs, []);
});

test('preview mode sends codes only to the configured business inbox', async t => {
  const sent = [];
  const service = createBadgeDesignAccount({
    databasePath: ':memory:',
    origins: [origin],
    previewEmail: 'alice@example.com',
    sendCode: async email => { sent.push(email); },
  });
  const server = createServer((req, res) => service.handle(req, res, new URL(req.url, 'http://localhost')));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    service.close();
  });
  const url = 'http://127.0.0.1:' + server.address().port + BADGE_DESIGN_PATH + '/code';
  const request = email => fetch(url, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const denied = await request('bob@example.com');
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error, 'PREVIEW_EMAIL_REQUIRED');
  assert.equal((await request('Alice@example.com')).status, 200);
  assert.deepEqual(sent, ['alice@example.com']);
});
