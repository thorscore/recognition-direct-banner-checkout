import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { ATTRIBUTION_CONSENT_COOKIE, ATTRIBUTION_TTL_MS, clearOrderAttribution, mergeOrderAttribution, orderAttributionAttributes, readOrderAttribution } from "../order-attribution.mjs";

const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
const client = await readFile(new URL("../public/order-attribution.js", import.meta.url), "utf8");
const base = "https://recognition-direct.com";
const plain = value => JSON.parse(JSON.stringify(value));
function capture(overrides = {}) {
  const visit = { at: new Date().toISOString(), landingPage: `${base}/pages/solar-placards`, referrerHost: "www.google.com", ...overrides };
  return { version: 1, consent: "allowed", first: visit, last: visit, orderPage: `${base}/products/coroplast` };
}

test("only consented, bounded, recent capture is accepted", () => {
  const now = Date.now();
  const valid = capture();
  assert.equal(readOrderAttribution(JSON.stringify(valid)).first.referrerHost, "www.google.com");
  for (const value of [null, "not json", "x".repeat(4097), { ...valid, version: 2 }, { ...valid, consent: false }, capture({ at: new Date(now - ATTRIBUTION_TTL_MS - 1000).toISOString() }), capture({ at: new Date(now + 3600000).toISOString() })]) {
    assert.equal(readOrderAttribution(value, now), null);
  }
  assert.deepEqual(readOrderAttribution({ version: 1, consent: "denied", first: valid.first }), { version: 1, consent: "denied" });
});

test("capture strips private URLs, query strings, untrusted fields and personal campaign values", () => {
  const input = capture({ landingPage: `${base}/products/styrene?email=PRIVATE#PRIVATE`, referrerHost: "checkout.recognition-direct.com", utmSource: "google", utmMedium: "organic", utmCampaign: "person@example.com", email: "PRIVATE" });
  input.orderPage = `${base}/checkouts/PRIVATE`;
  const data = readOrderAttribution(input);
  assert.equal(data.first.landingPage, `${base}/products/styrene`);
  assert.equal(data.orderPage, "");
  assert.equal(data.first.referrerHost, "");
  assert.equal(data.first.utmCampaign, "");
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE|example.com|checkout/);
  for (const landingPage of [`${base}/account`, `${base}/search?q=PRIVATE`, "https://evil.example/products/styrene", `${base}:8080/products/styrene`, "javascript:alert(1)"]) assert.equal(readOrderAttribution(capture({ landingPage })), null);
  for (const referrerHost of ["shop.app", "recognition-direct.bs.run", "f375fe-2d.myshopify.com", "a@b.com", "https://google.com/"]) assert.equal(readOrderAttribution(capture({ referrerHost })).first.referrerHost, "");
});

test("mixed carts retain earliest first touch and do not replace a referral with direct", () => {
  const first = capture({ at: new Date(Date.now() - 86400000).toISOString() });
  const next = capture({ referrerHost: "", landingPage: `${base}/` });
  const merged = mergeOrderAttribution(first, next);
  assert.equal(merged.first.referrerHost, "www.google.com");
  assert.equal(merged.last.referrerHost, "www.google.com");
  const external = capture({ referrerHost: "chatgpt.com" });
  assert.equal(mergeOrderAttribution(merged, external).last.referrerHost, "chatgpt.com");
  assert.equal(mergeOrderAttribution(merged, { version: 1, consent: "denied" }), null);
  assert.match(orderAttributionAttributes(next).find(a => a.key === "Acquisition First Source").value, /Direct \/ unknown/);
});

function browser({ href = `${base}/`, referrer = "", permitted = true, store = new Map(), storageBlocked = false, designMode = false, privacyMissing = false } = {}) {
  const events = new Map();
  const document = { referrer, cookie: "", addEventListener: (name, listener) => events.set(name, listener) };
  const localStorage = {
    getItem: name => { if (storageBlocked) throw Error("blocked"); return store.get(name) || null; },
    setItem: (name, value) => { if (storageBlocked) throw Error("blocked"); store.set(name, value); },
    removeItem: name => { if (storageBlocked) throw Error("blocked"); store.delete(name); },
  };
  let permission = permitted;
  const window = { location: new URL(href), localStorage, Shopify: { designMode, ...(privacyMissing ? {} : { customerPrivacy: { analyticsProcessingAllowed: () => permission } }) } };
  vm.runInNewContext(client, { window, document, URL, Date });
  return { window, document, store, events, data: () => plain(window.rdOrderAttribution.payload()), consent(value) { permission = value; events.get("visitorConsentCollected")?.(); }, form(action) { const data = new FormData(); events.get("formdata")({ target: { action }, formData: data }); return data; } };
}

test("client keeps a Google or ChatGPT referral through internal navigation and records the actual order page", () => {
  const first = browser({ href: `${base}/pages/solar-placards?email=PRIVATE`, referrer: "https://www.google.com/search?q=PRIVATE" });
  const second = browser({ href: `${base}/products/coroplast`, referrer: `${base}/pages/custom-signs-san-diego`, store: first.store });
  const data = second.data();
  assert.equal(data.first.landingPage, `${base}/pages/solar-placards`);
  assert.equal(data.last.referrerHost, "www.google.com");
  assert.equal(data.orderPage, `${base}/products/coroplast`);
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE/);
  const third = browser({ href: `${base}/products/styrene`, referrer: "https://chatgpt.com/", store: first.store });
  assert.equal(third.data().first.referrerHost, "www.google.com");
  assert.equal(third.data().last.referrerHost, "chatgpt.com");
});

test("internal ChatGPT guide is never mislabeled as an external ChatGPT referral", () => {
  const guide = browser({ href: `${base}/products/13oz-vinyl-banner?rd_source=chatgpt-banner-guide`, referrer: `${base}/pages/custom-banners-from-chatgpt-designs` });
  assert.equal(guide.data().first.referrerHost, "");
  assert.equal(guide.data().first.utmSource, "");
});

test("permission denial, unavailable privacy API and theme editor fail closed; blocked storage cannot break ordering", () => {
  for (const options of [{ permitted: false }, { privacyMissing: true }, { designMode: true }]) {
    const page = browser(options);
    assert.equal(page.store.size, 0);
    assert.deepEqual(page.data(), { version: 1, consent: "denied" });
  }
  const page = browser({ referrer: "https://bing.com/", storageBlocked: true });
  assert.equal(page.data().first.referrerHost, "bing.com");
  const granted = browser({ referrer: "https://www.google.com/" });
  granted.consent(false);
  assert.equal(granted.store.size, 0);
  assert.match(granted.document.cookie, /rd_acquisition_consent=denied/);
  assert.deepEqual(granted.data(), { version: 1, consent: "denied" });
});

test("all six supported checkout forms carry metadata without modifying files, quantities or other destinations", () => {
  const page = browser({ href: `${base}/products/13oz-vinyl-banner`, referrer: "https://www.google.com/" });
  for (const type of ["banner", "catalog", "name-badge", "solar-placard", "premier-award", "polar-camel"]) {
    const data = page.form(`https://checkout.recognition-direct.com/api/${type}-checkout?cart=existing`);
    assert.equal(readOrderAttribution(data.get("rd_attribution")).first.referrerHost, "www.google.com");
    assert.equal([...data.keys()].length, 1);
  }
  for (const action of ["https://evil.example/api/catalog-checkout", `${base}/cart/add`, "https://checkout.recognition-direct.com/api/catalog-price"]) assert.equal(page.form(action).has("rd_attribution"), false);
});

test("stale capture is replaced; constrained campaign tags are retained without full URLs", () => {
  const store = new Map([["rdAcquisitionV1", JSON.stringify(capture({ at: "2000-01-01T00:00:00Z" }))]]);
  const page = browser({ href: `${base}/pages/solar-placards?utm_source=league&utm_medium=email&utm_campaign=fall-2026&email=PRIVATE`, store });
  const data = page.data();
  assert.equal(data.first.utmSource, "league");
  assert.equal(data.first.utmMedium, "email");
  assert.equal(data.first.utmCampaign, "fall-2026");
  assert.equal(data.first.referrerHost, "");
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE/);
});

test("combined draft input retains capture while preserving guide source, pricing, shipping and tax", () => {
  const data = capture();
  const cart = { id: "test-only", attribution: data, items: [{ orderId: "test-only-config", summary: { title: "13oz Vinyl Banner" }, draftInput: { email: "test@example.invalid", note: "Existing note", tags: ["chatgpt-banner-guide"], lineItems: [{ title: "Banner", quantity: 1, originalUnitPriceWithCurrency: { amount: "37.50", currencyCode: "USD" }, taxable: true, customAttributes: [{ key: "Order Source", value: "ChatGPT banner guide" }] }] } }] };
  const context = vm.createContext({ orderAttributionAttributes, combinedCartShippingLine: () => ({ priceWithCurrency: { amount: "19.95", currencyCode: "USD" } }), truncateShopifyDraftNote: value => value });
  vm.runInContext(source.slice(source.indexOf("function combineCustomCartDraftInput("), source.indexOf("async function handleCustomOrderCartCheckout(")), context);
  const result = context.combineCustomCartDraftInput(cart);
  assert.ok(result.customAttributes.some(a => a.key === "Acquisition First Source" && /google.com/.test(a.value)));
  assert.equal(result.lineItems[0].customAttributes[0].value, "ChatGPT banner guide");
  assert.equal(result.lineItems[0].originalUnitPriceWithCurrency.amount, "37.50");
  assert.equal(result.lineItems[0].taxable, true);
  assert.equal(result.shippingLine.priceWithCurrency.amount, "19.95");
  assert.equal(result.taxExempt, false);
  delete cart.attribution;
  assert.equal(context.combineCustomCartDraftInput(cart).customAttributes.some(a => a.key.startsWith("Acquisition ")), false);
});

test("permission revocation strips acquisition metadata but never product or guide details", () => {
  const cart = { attribution: capture(), items: [{ attribution: capture(), draftInput: { customAttributes: orderAttributionAttributes(capture()), lineItems: [{ customAttributes: [{ key: "Order Source", value: "ChatGPT banner guide" }, ...orderAttributionAttributes(capture()).map(a => ({ ...a, key: `_${a.key}` }))] }] } }] };
  clearOrderAttribution(cart);
  assert.equal(cart.attribution, undefined);
  assert.equal(cart.items[0].attribution, undefined);
  assert.deepEqual(cart.items[0].draftInput.customAttributes, []);
  assert.deepEqual(cart.items[0].draftInput.lineItems[0].customAttributes, [{ key: "Order Source", value: "ChatGPT banner guide" }]);
  assert.match(source, new RegExp(`parseCookies\\(req\\)\\[ATTRIBUTION_CONSENT_COOKIE\\] !== "allowed"`));
  assert.equal(ATTRIBUTION_CONSENT_COOKIE, "rd_acquisition_consent");
});
