import {normalizeBadgeContact,badgeContactShopifyFields,badgeContactNote} from '../badge-order-contact.mjs';
import { createHash } from 'node:crypto';
import { CATALOG_VERSION, DUETS_COLORS, FIXED_SIZES, STANDARD_COLORS } from './catalog.mjs';
import { draftInput, normalizeDraft, priceDraft } from './model.mjs';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
export const BADGE_ORDER_BODY_LIMIT = Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 96 * 1024;
const REFERENCE = '_rd_badge_configuration';
const PICKUP_LOCATION = 'gid://shopify/Location/97024180520';
const PICKUP_ADDRESS = {
  firstName: 'Recognition Direct', lastName: 'Pickup', address1: '8680 Troy Street',
  city: 'Spring Valley', provinceCode: 'CA', countryCode: 'US', zip: '91977',
};
const MONEY = '{ shopMoney { amount currencyCode } }';
const LINE = `title quantity requiresShipping taxable customAttributes { key value } originalUnitPriceSet ${MONEY}`;
const DELIVERY = `query DesignerPickup($input: DraftOrderAvailableDeliveryOptionsInput!) {
  draftOrderAvailableDeliveryOptions(input:$input, localPickupCount:20) {
    availableLocalPickupOptions { locationId handle code source }
    pageInfo { hasNextPage }
  }
}`;
const CREATE = `mutation DesignerCheckout($input: DraftOrderInput!) {
  draftOrderCreate(input:$input) { draftOrder { id } userErrors { field message } }
}`;
const CHECKOUT = `query DesignerDraft($id: ID!) {
  draftOrder(id:$id) {
    id status invoiceUrl subtotalPriceSet ${MONEY} totalShippingPriceSet ${MONEY}
    shippingLine { title code source custom deliveryCategory }
    lineItems(first:2) { nodes { ${LINE} } pageInfo { hasNextPage } }
  }
}`;
const PAID = `query DesignerPaid($id: ID!) {
  draftOrder(id:$id) {
    id status order {
      id test email fullyPaid displayFinancialStatus cancelledAt
      lineItems(first:2) { nodes { ${LINE} currentQuantity } pageInfo { hasNextPage } }
    }
  }
}`;

export class BadgeOrderError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}
function fail(status, code) { throw new BadgeOrderError(status, code); }
const digest = value => createHash('sha256').update(value).digest('hex');
const validKey = key => typeof key === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(key);
const validDraft = id => typeof id === 'string' && /^gid:\/\/shopify\/DraftOrder\/[1-9]\d{0,19}$/.test(id);

function readLogo(logo) {
  if (logo === null) return null;
  if (!logo || typeof logo.base64 !== 'string' || logo.base64.length > Math.ceil(MAX_LOGO_BYTES / 3) * 4) fail(422, 'LOGO_INVALID');
  const bytes = Buffer.from(logo.base64, 'base64');
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES || bytes.toString('base64') !== logo.base64) fail(422, 'LOGO_INVALID');
  const prefix = bytes.subarray(0, 1024);
  const signature = {
    'image/png': () => bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'image/jpeg': () => bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')),
    'image/webp': () => bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP',
    'image/svg+xml': () => /<svg(?:\s|>)/i.test(prefix.toString()),
    'application/pdf': () => /%PDF-\d\.\d/.test(prefix.toString()),
  };
  if (!Object.hasOwn(signature, logo.type) || !signature[logo.type]()) fail(422, 'LOGO_INVALID');
  return { type: logo.type, base64: logo.base64 };
}

function orderInput(body, previewEmail) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,63}$/.test(email)) fail(422, 'EMAIL_INVALID');
  if (previewEmail && email !== previewEmail) fail(403, 'PREVIEW_EMAIL_REQUIRED');
  if (!validKey(body.key) || body.catalogVersion !== CATALOG_VERSION) fail(409, 'ORDER_OPTIONS_CHANGED');
  let contact;
  try { contact = normalizeBadgeContact(body.contact); } catch (error) { fail(422, error.message); }
  let document, price;
  try {
    document = normalizeDraft(body.configuration);
    price = priceDraft(draftInput(document));
  } catch { fail(422, 'ORDER_OPTIONS_INVALID'); }
  if (document.people.some(person => !person.name.trim() || /[\r\n]/.test(person.name + person.title))) fail(422, 'ORDER_NAMES_REQUIRED');
  if (price.mode !== 'estimated' || body.subtotalCents !== price.totalCents) fail(409, 'ORDER_OPTIONS_CHANGED');
  const logoScale = body.logoScale;
  if (!Number.isFinite(logoScale) || logoScale < 0.25 || logoScale > 1) fail(422, 'LOGO_INVALID');
  return {
    key: body.key, email, ...(contact ? {contact} : {}), design: draftInput(document), price, logo: readLogo(body.logo), logoScale,
    namedQuantity: document.namedQuantity, heldForLater: document.heldForLater,
  };
}

function shipping(quantity) {
  if (quantity >= 1000) return { title: 'Oversized Shipping & Handling', cents: 7500 };
  if (quantity >= 250) return { title: 'Large Item Shipping & Handling', cents: 3995 };
  if (quantity >= 50) return { title: 'Standard Shipping & Handling', cents: 1995 };
  return { title: 'Small Package Shipping & Handling', cents: 1295 };
}

function lineItem(order) {
  return {
    title: order.design.family === 'standard' ? 'Engravable Name Badges' : 'Full-Color Name Badges',
    quantity: order.design.quantity,
    originalUnitPriceWithCurrency: { amount: (order.price.unitCents / 100).toFixed(2), currencyCode: 'USD' },
    requiresShipping: true, taxable: true, customAttributes: [{ key: REFERENCE, value: order.key }],
  };
}
function moneyMatches(actual, cents) {
  const money = actual?.shopMoney;
  return money?.currencyCode === 'USD' && /^\d{1,8}(?:\.\d{1,2})?$/.test(money.amount) &&
    Math.round(Number(money.amount) * 100) === cents;
}
function matchesLine(actual, order) {
  const line = actual?.nodes?.[0];
  const expected = lineItem(order);
  return actual?.pageInfo?.hasNextPage === false && actual.nodes.length === 1 &&
    line?.title === expected.title && line.quantity === expected.quantity && line.requiresShipping && line.taxable &&
    line.customAttributes?.some(attribute => attribute.key === REFERENCE && attribute.value === order.key) &&
    moneyMatches(line.originalUnitPriceSet, order.price.unitCents);
}

export function createBadgeDesignerOrders({ db, graphql, previewEmail, base, now = Date.now }) {
  if (typeof graphql !== 'function') throw new Error('Badge checkout requires the shop connection.');
  db.exec(`
    CREATE TABLE IF NOT EXISTS badge_designer_orders (
      id TEXT PRIMARY KEY, family TEXT NOT NULL, email_hash TEXT NOT NULL, started INTEGER NOT NULL,
      configuration TEXT NOT NULL, fingerprint TEXT NOT NULL, logo TEXT,
      delivery_code TEXT, delivery_source TEXT, draft_id TEXT UNIQUE
    );
    CREATE INDEX IF NOT EXISTS badge_designer_orders_started ON badge_designer_orders(started);
  `);
  const find = db.prepare('SELECT * FROM badge_designer_orders WHERE id=?');
  return {
    async checkout(body) {
      const order = orderInput(body, previewEmail);
      const { logo, ...details } = order;
      const payload = JSON.stringify(details);
      const artwork = logo ? JSON.stringify(logo) : null;
      const fingerprint = digest(JSON.stringify([payload, artwork]));
      let row = find.get(order.key);
      if (row && row.fingerprint !== fingerprint) fail(409, 'ORDER_REQUEST_CHANGED');
      const pickup = order.design.delivery === 'troy';
      const rate = pickup ? { cents: 0 } : shipping(order.design.quantity);
      if (!row) {
        const emailHash = digest(order.email);
        const recent = db.prepare('SELECT COUNT(*) AS count FROM badge_designer_orders WHERE email_hash=? AND started>?').get(emailHash, now() - 900000);
        const total = db.prepare('SELECT COUNT(*) AS count FROM badge_designer_orders WHERE started>?').get(now() - 900000);
        if (recent.count >= 8 || total.count >= 100) fail(429, 'ORDER_RATE_LIMIT');
        const storage = db.prepare('SELECT COALESCE(SUM(length(configuration) + COALESCE(length(logo),0)),0) AS bytes FROM badge_designer_orders').get();
        if (storage.bytes + Buffer.byteLength(payload) + Buffer.byteLength(artwork ?? '') > 256 * 1024 * 1024) {
          fail(503, 'ORDER_STORAGE_FULL');
        }
        if (previewEmail && db.prepare('SELECT 1 FROM badge_designer_orders WHERE family=? LIMIT 1').get(order.design.family)) {
          fail(409, 'PREVIEW_ORDER_LIMIT');
        }
        // Reserve the request before calling Shopify so a lost response never creates a second draft.
        db.prepare('INSERT INTO badge_designer_orders VALUES (?,?,?,?,?,?,?,NULL,NULL,NULL)')
          .run(order.key, order.design.family, emailHash, now(), payload, fingerprint, artwork);
        const line = lineItem(order);
        let shippingLine = { title: rate.title, priceWithCurrency: { amount: (rate.cents / 100).toFixed(2), currencyCode: 'USD' } };
        if (pickup) {
          let options;
          try {
            ({ draftOrderAvailableDeliveryOptions: options } = await graphql(DELIVERY, {
              input: { lineItems: [line], shippingAddress: PICKUP_ADDRESS, acceptAutomaticDiscounts: false },
            }));
          } catch {
            db.prepare('DELETE FROM badge_designer_orders WHERE id=?').run(order.key);
            fail(409, 'ORDER_PICKUP_UNAVAILABLE');
          }
          const pickups = options?.availableLocalPickupOptions ?? [];
          const matches = pickups.filter(option => option.locationId === PICKUP_LOCATION);
          const selected = matches[0];
          if (options?.pageInfo?.hasNextPage !== false || matches.length !== 1 || !selected?.handle ||
              !selected.code || !selected.source ||
              pickups.filter(option => option.code === selected.code && option.source === selected.source).length !== 1) {
            db.prepare('DELETE FROM badge_designer_orders WHERE id=?').run(order.key);
            fail(409, 'ORDER_PICKUP_UNAVAILABLE');
          }
          shippingLine = { shippingRateHandle: selected.handle };
          db.prepare('UPDATE badge_designer_orders SET delivery_code=?,delivery_source=? WHERE id=?')
            .run(selected.code, selected.source, order.key);
        }
        const { draftOrderCreate: created } = await graphql(CREATE, {
          input: {
            lineItems: [line], email: order.email, shippingLine, ...badgeContactShopifyFields(order.contact),
            ...(pickup ? { shippingAddress: PICKUP_ADDRESS } : {}),
            presentmentCurrencyCode: 'USD', taxExempt: false,
            acceptAutomaticDiscounts: false, allowDiscountCodesInCheckout: false, useCustomerDefaultAddress: false,
            tags: ['name-badges', 'proof-required', 'rd-badge-designer', pickup ? 'pickup-spring-valley' : 'ship',
              ...(previewEmail ? ['badge-designer-preview'] : [])],
            note: 'Review the badge configuration and artwork before preparing the proof: ' +
              new URL('/badge-production#' + order.key, base).href + (order.contact ? '\n\n' + badgeContactNote(order.contact) : ''),
          },
        });
        if (!created?.draftOrder && created?.userErrors?.length > 0) {
          db.prepare('DELETE FROM badge_designer_orders WHERE id=?').run(order.key);
        }
        if (!validDraft(created?.draftOrder?.id) || created.userErrors?.length !== 0) fail(409, 'ORDER_REVIEW_REQUIRED');
        db.prepare('UPDATE badge_designer_orders SET draft_id=? WHERE id=?').run(created.draftOrder.id, order.key);
        row = find.get(order.key);
      }
      if (!validDraft(row.draft_id)) fail(409, 'ORDER_REVIEW_REQUIRED');
      const { draftOrder: draft } = await graphql(CHECKOUT, { id: row.draft_id });
      const delivery = draft?.shippingLine;
      const deliveryMatches = pickup
        ? delivery?.custom === false && delivery.deliveryCategory === 'pick-up' &&
          delivery.code === row.delivery_code && delivery.source === row.delivery_source
        : delivery?.custom === true && delivery.title === rate.title && delivery.deliveryCategory !== 'pick-up';
      if (draft?.id !== row.draft_id || draft.status !== 'OPEN' || !deliveryMatches ||
          !matchesLine(draft.lineItems, order) || !moneyMatches(draft.subtotalPriceSet, order.price.totalCents) ||
          !moneyMatches(draft.totalShippingPriceSet, rate.cents)) fail(409, 'ORDER_REVIEW_REQUIRED');
      const link = new URL(draft.invoiceUrl);
      if (!['https://f375fe-2d.myshopify.com', 'https://recognition-direct.com'].includes(link.origin) ||
          link.username || link.password || !/^\/(?:\d+\/)?invoices\/[a-z\d_-]+\/?$/i.test(link.pathname)) fail(409, 'ORDER_REVIEW_REQUIRED');
      return { checkoutUrl: link.href };
    },
    async production(key) {
      const row = validKey(key) && find.get(key);
      if (!row || !validDraft(row.draft_id)) fail(404, 'ORDER_NOT_FOUND');
      const configuration = JSON.parse(row.configuration);
      const { draftOrder: draft } = await graphql(PAID, { id: row.draft_id });
      const order = draft?.order;
      if (draft?.id !== row.draft_id || draft.status !== 'COMPLETED' || order?.test !== false ||
          order.cancelledAt !== null || !order.fullyPaid || order.displayFinancialStatus !== 'PAID' ||
          typeof order.email !== 'string' || !order.email.includes('@') ||
          !matchesLine(order.lineItems, configuration) ||
          order.lineItems.nodes[0].currentQuantity !== configuration.design.quantity) fail(409, 'ORDER_PAYMENT_PENDING');
      const design = configuration.design;
      const colors = design.family === 'standard' ? STANDARD_COLORS : DUETS_COLORS;
      return {
        configuration: { ...configuration, email: order.email }, logo: row.logo ? JSON.parse(row.logo) : null, shopifyOrder: order.id,
        size: FIXED_SIZES.find(size => size.id === design.size)?.label ?? design.size,
        color: colors.find(color => color.id === design.stockColor)?.name ?? design.stockColor,
      };
    },
  };
}
