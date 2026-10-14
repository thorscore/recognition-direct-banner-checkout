import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { customCartAnalyticsItem } from "../custom-cart-analytics.mjs";

const banner = { productHandle: "13oz-vinyl-banner", quantity: 2, unitPrice: 37.5, totalPrice: 75 };

test("confirmed cart analytics use stable catalog IDs and exact calculated amounts", () => {
  assert.deepEqual(customCartAnalyticsItem(banner), {
    item_id: "10299129856296", item_name: "13oz Vinyl Banners", product_group: "13oz-banners",
    quantity: 2, price: 37.5, value: 75, currency: "USD",
  });
  const item = customCartAnalyticsItem({ productHandle: "styrene", quantity: 116, unitPrice: 18.92, totalPrice: 2194.72 });
  assert.equal(item.item_id, "10299156300072");
  assert.equal(item.value, 2194.72);
  assert.equal(item.quantity, 116);
});

test("private order fields cannot enter the analytics response", () => {
  const record = { ...banner, name: "PRIVATE", email: "PRIVATE", phone: "PRIVATE", artworkUrl: "PRIVATE", attributes: [{ key: "Notes", value: "PRIVATE" }] };
  const before = JSON.stringify(record);
  assert.doesNotMatch(JSON.stringify(customCartAnalyticsItem(record)), /PRIVATE/);
  assert.equal(JSON.stringify(record), before);
});

test("unknown, free, inconsistent, and invalid amounts fail closed", () => {
  assert.equal(customCartAnalyticsItem(null), null);
  for (const changes of [{ productHandle: "archived" }, { productHandle: "solar-placards" }, { quantity: 0 }, { quantity: 1.5 }, { quantity: 100001 }, { unitPrice: 0 }, { unitPrice: NaN }, { totalPrice: Infinity }, { totalPrice: 1 }]) {
    assert.equal(customCartAnalyticsItem({ ...banner, ...changes }), null);
  }
});

test("metadata is returned only after the custom cart has been persisted", async () => {
  const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function addCustomOrderToCart(");
  const end = source.indexOf("\nfunction truncateShopifyDraftNote", start);
  const events = [];
  const cart = { id: "test-cart", items: [] };
  const context = vm.createContext({
    customCartAnalyticsItem,
    getOrCreateCustomOrderCart: async () => cart,
    URL, APP_BASE_URL: "https://checkout.example.invalid",
    randomUUID: () => "test-item",
    draftItemQuantity: () => 2,
    draftLineSubtotal: () => 75,
    customOrderCartUrl: () => "https://checkout.example.invalid/custom-order-cart",
    persistOrderRecord: async () => events.push("order"),
    writeCustomOrderCart: async () => events.push("cart"),
    corsHeaders: () => ({}), customCartCookie: () => "test-cookie",
    wantsJson: () => true,
    json: (res, status, payload) => { events.push("response"); return { status, payload }; },
    Date,
  });
  vm.runInContext(source.slice(start, end) + ";this.add = addCustomOrderToCart;", context);
  const result = await context.add({ url: "/api/catalog-checkout" }, {}, { ...banner }, { lineItems: [{ title: "13oz Vinyl Banner" }] }, { quantity: 2 });
  assert.equal(result.status, 200);
  assert.equal(result.payload.analyticsItem.value, 75);
  assert.deepEqual(events, ["order", "cart", "response"]);
  events.length = 0;
  context.writeCustomOrderCart = async () => { throw new Error("disk unavailable"); };
  await assert.rejects(context.add({ url: "/api/catalog-checkout" }, {}, { ...banner }, {}, {}), /disk unavailable/);
  assert.ok(!events.includes("response"));
});

test("credentialed cart requests are limited to existing approved origins and the catalog submission route", async () => {
  const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  const start = source.indexOf("function corsHeaders(req)");
  const end = source.indexOf("\nfunction html(", start);
  const context = vm.createContext({ ALLOWED_ORIGINS: new Set(["https://recognition-direct.com"]) });
  vm.runInContext(source.slice(start, end) + ";this.headers = corsHeaders;", context);
  for (const url of ["/api/catalog-checkout", "/api/catalog-checkout?cart=test"]) {
    const response = context.headers({ url, headers: { origin: "https://recognition-direct.com" } });
    assert.equal(response["Access-Control-Allow-Credentials"], "true");
    assert.equal(response["Access-Control-Allow-Origin"], "https://recognition-direct.com");
  }
  for (const url of ["/api/catalog-price", "/api/catalog-product", "/api/name-badge-checkout"]) {
    assert.equal(context.headers({ url, headers: { origin: "https://recognition-direct.com" } })["Access-Control-Allow-Credentials"], undefined);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(context.headers({ url: "/api/catalog-checkout", headers: { origin: "https://evil.example" } }))), {});
});
