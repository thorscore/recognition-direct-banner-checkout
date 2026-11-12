import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createBadgeDesignAccount } from '../badge-design-account.mjs';
import { createBadgeDesignerOrders } from '../badge-designer/orders.mjs';
import { CATALOG_VERSION, DUETS_COLORS } from '../badge-designer/catalog.mjs';
import { initialDraft, priceDraft } from '../badge-designer/model.mjs';

const origin = 'https://recognition-direct.com';
const base = 'https://checkout.recognition-direct.com';
const owner = 'owner@example.test';
const bag = amount => ({ shopMoney: { amount, currencyCode: 'USD' } });

function shopify() {
  let creates = 0;
  const drafts = new Map();
  return {
    drafts,
    get creates() { return creates; },
    async graphql(query, { input, id }) {
      if (query.includes('DesignerPickup')) {
        assert.equal(input.shippingAddress.zip, '91977');
        return { draftOrderAvailableDeliveryOptions: {
          availableLocalPickupOptions: [{
            locationId: 'gid://shopify/Location/97024180520', handle: 'rate', code: 'Troy Street', source: 'shopify',
          }],
          pageInfo: { hasNextPage: false },
        } };
      }
      if (query.includes('DesignerCheckout')) {
        const id = 'gid://shopify/DraftOrder/' + (++creates);
        assert.equal(input.taxExempt, false);
        const [line] = input.lineItems;
        const pickup = input.shippingLine.shippingRateHandle === 'rate';
        const originalUnitPriceSet = bag(line.originalUnitPriceWithCurrency.amount);
        drafts.set(id, {
          id, status: 'OPEN', invoiceUrl: 'https://f375fe-2d.myshopify.com/invoices/fake-reference-' + creates,
          input, subtotalPriceSet: bag((Number(line.originalUnitPriceWithCurrency.amount) * line.quantity).toFixed(2)),
          totalShippingPriceSet: bag(pickup ? '0.00' : input.shippingLine.priceWithCurrency.amount),
          shippingLine: pickup ? { custom: false, deliveryCategory: 'pick-up', code: 'Troy Street', source: 'shopify' }
            : { custom: true, deliveryCategory: 'shipping', title: input.shippingLine.title },
          lineItems: { nodes: [{ ...line, originalUnitPriceSet, currentQuantity: line.quantity }], pageInfo: { hasNextPage: false } },
          order: null,
        });
        return { draftOrderCreate: { draftOrder: { id }, userErrors: [] } };
      }
      return { draftOrder: drafts.get(id) };
    },
  };
}

function order(family, overrides = {}) {
  const configuration = {
    ...initialDraft(family), ...(family === 'duets' ? { stockColor: DUETS_COLORS[0].id, size: '3x2', delivery: 'troy' } : {}),
    people: [{ name: 'Sample Name', title: 'Sample Title', copies: 1 }], cornerRadius: '1/4',
    ...overrides,
  };
  return {
    key: randomUUID(), email: owner, configuration, catalogVersion: CATALOG_VERSION,
    subtotalCents: priceDraft(configuration).totalCents, logoScale: 0.75,
    logo: { type: 'image/svg+xml', base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64') },
  };
}

test('guest designs create verified shipping and native pickup checkouts and preserve paid artwork', async t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const shop = shopify();
  const orders = createBadgeDesignerOrders({ db, graphql: shop.graphql, base, previewEmail: owner });
  const standard = order('standard');
  const duets = order('duets', {textVerticalPosition: 64});
  await assert.rejects(orders.checkout({ ...standard, email: 'other@example.test' }), /PREVIEW_EMAIL_REQUIRED/);
  await assert.rejects(orders.checkout({ ...standard, subtotalCents: 1 }), /ORDER_OPTIONS_CHANGED/);
  await assert.rejects(orders.checkout(order('standard', { people: [{ name: '', copies: 1 }] })), /ORDER_NAMES_REQUIRED/);
  assert.equal(shop.creates, 0);
  const first = await orders.checkout(standard);
  assert.match(first.checkoutUrl, /fake-reference-1$/);
  assert.deepEqual(await orders.checkout(standard), first);
  const second = await orders.checkout(duets);
  assert.match(second.checkoutUrl, /fake-reference-2$/);
  assert.equal(shop.creates, 2);
  await assert.rejects(orders.checkout(order('standard')), /PREVIEW_ORDER_LIMIT/);
  const pickup = shop.drafts.get('gid://shopify/DraftOrder/2');
  assert.equal(pickup.input.shippingLine.shippingRateHandle, 'rate');
  assert.equal(pickup.input.shippingAddress.address1, '8680 Troy Street');
  assert.equal(pickup.input.lineItems[0].title, 'Full-Color Name Badges');
  assert.ok(!JSON.stringify(pickup.input).includes('Sample Name'));
  await assert.rejects(orders.production(duets.key), /ORDER_PAYMENT_PENDING/);
  pickup.status = 'COMPLETED';
  pickup.order = {
    id: 'gid://shopify/Order/2', email: 'proof@example.test', test: false,
    cancelledAt: null, displayFinancialStatus: 'PAID', fullyPaid: true, lineItems: pickup.lineItems,
  };
  const details = await orders.production(duets.key);
  assert.equal(details.configuration.email, 'proof@example.test');
  assert.equal(details.configuration.design.people[0].name, 'Sample Name');
  assert.deepEqual(details.logo, duets.logo);
  assert.equal(details.configuration.design.cornerRadius, '1/4');
  assert.equal(details.configuration.design.textVerticalPosition, 64);
});

test('checkout endpoint requires no customer session and production details require one', async t => {
  const shop = shopify();
  const app = createBadgeDesignAccount({
    databasePath: ':memory:', origins: [origin, base], sendCode: async () => {},
    production: { base, graphql: shop.graphql, owner },
  });
  t.after(app.close);
  async function request(action, body, requestOrigin = origin) {
    const { Readable } = await import('node:stream');
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    req.method = 'POST';
    req.headers = { origin: requestOrigin, 'content-type': 'application/json' };
    const url = new URL('/api/badge-design-account/' + action, base);
    let status, output;
    await app.handle(req, { writeHead(code) { status = code; }, end(body) { output = JSON.parse(body); } }, url);
    return { status, output };
  }
  const sample = order('standard');
  assert.equal((await request('checkout', sample)).status, 200);
  assert.deepEqual(await request('production', { id: sample.key }, base), {
    status: 401, output: { error: 'SIGN_IN_REQUIRED' },
  });
  assert.equal(shop.creates, 1);
});
