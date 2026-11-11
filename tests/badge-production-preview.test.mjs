import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {productionPlan} from '../public/badge-preview/render.js';
import {badgeTextLayout, containImage} from '../public/badge-preview/layout.js';
import {DUETS_COLORS} from '../public/badge-preview/catalog.js';
import {serveBadgeProductionAsset, BADGE_PRODUCTION_HEADERS} from '../badge-production-assets.mjs';

const measure = (value, size) => ({width: value.length * size * .55, actualBoundingBoxAscent: size * .4, actualBoundingBoxDescent: size * .4});
function configuration(family = 'standard', overrides = {}) {
  return {logoScale: .75, design: {
    family, size: '1-5x3', stockColor: family === 'standard' ? 'brushed-gold' : DUETS_COLORS[0].id,
    frame: family === 'standard' ? 'gold' : 'none', cornerRadius: '1/8', textSize: 100, textAlignment: 'center',
    layout: 'logo-left', textColor: '#123456', organization: 'Sample office',
    people: [{name: 'Alex Sample', title: 'Manager', copies: 2}, {name: 'Taylor Sample', title: '', copies: 1}],
    ...overrides,
  }};
}

test('production geometry matches the storefront and leaves saved data unchanged', () => {
  for (const family of ['standard', 'duets']) for (const layout of ['logo-left', 'logo-top']) for (const alignment of ['left', 'center']) {
    const saved = configuration(family, {layout, textAlignment: alignment});
    const original = JSON.stringify(saved), logo = {width: 1600, height: 600};
    const plan = productionPlan(saved, 0, logo, measure);
    const expected = badgeTextLayout(900, 450, layout, {hasLogo: true, alignment, ...saved.design.people[0], organization: saved.design.organization, textSize: 100});
    assert.deepEqual(plan.clip, expected.clip);
    assert.deepEqual(plan.logoRect, containImage(1600, 600, expected.logo, .75, {width: 900, height: 450, radius: plan.radius}));
    assert.equal(plan.lines[0].x, expected.x);
    assert.equal(plan.lines[0].y, expected.lines[0].y);
    assert.equal(plan.lines[0].fontPoints, plan.lines[0].size / 300 * 72);
    assert.equal(JSON.stringify(saved), original);
    assert.equal(Boolean(plan.surface), family === 'standard');
  }
});

test('selection, corner radius, text-size fitting, and no-logo layout are retained', () => {
  const base = configuration('duets', {cornerRadius: '1/4'});
  const first = productionPlan(base, 0, null, measure), second = productionPlan(base, 1, null, measure);
  assert.equal(first.radius, 75);
  assert.equal(second.logoRect, null);
  assert.equal(second.lines.length, 2);
  assert.equal(second.lines[0].value, 'Taylor Sample');
  assert.equal(first.lines[0].x, 450);
  const small = productionPlan(configuration('duets', {textSize: 70, people: [{name: 'A', title: '', copies: 1}], organization: ''}), 0, null, measure);
  const large = productionPlan(configuration('duets', {textSize: 130, people: [{name: 'A', title: '', copies: 1}], organization: ''}), 0, null, measure);
  assert.ok(large.lines[0].fontPoints > small.lines[0].fontPoints);
  const long = productionPlan(configuration('duets', {people: [{name: 'Long '.repeat(200), copies: 1}]}), 0, null, measure);
  assert.equal(long.warnings.length, 1);
  for (const index of [-1, 2, 0.5, NaN]) assert.throws(() => productionPlan(base, index, null, measure));
  assert.throws(() => productionPlan(configuration('standard', {size: '../private'}), 0, null, measure));
});

test('only whitelisted generic preview assets are served with private-page headers', async t => {
  const server = createServer(async (req, res) => {
    if (!await serveBadgeProductionAsset(req, res, new URL(req.url, 'http://localhost'), true)) {res.writeHead(404); res.end();}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const path of ['/badge-production', '/badge-production.js', '/badge-preview/render.js', '/badge-preview/logo-preview.js', '/badge-preview/pdfjs-6-5-438.mjs', '/badge-preview/pdf-worker-6-5-438.mjs']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    await response.arrayBuffer();
  }
  for (const path of ['/badge-preview/../../badge-design-account.mjs', '/badge-preview/logo.svg', '/badge-preview/data.sqlite', '/badge-preview/pdfjs-6-5-438.mjs/extra']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  assert.equal((await fetch(base + '/badge-production', {method: 'POST'})).status, 404);
  assert.equal(await serveBadgeProductionAsset({method: 'GET'}, {}, new URL(base + '/badge-production'), false), false);
  assert.ok(!BADGE_PRODUCTION_HEADERS['Content-Security-Policy'].includes('unsafe-eval'));
  assert.ok(!BADGE_PRODUCTION_HEADERS['Content-Security-Policy'].includes('https:'));
});
