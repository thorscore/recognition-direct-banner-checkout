import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { bannerOrderSource, CHATGPT_BANNER_GUIDE_SOURCE } from "../banner-order-source.mjs";

const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");

test("source attribution is limited to the named guide and 13oz banners", () => {
  assert.deepEqual(bannerOrderSource("13oz-vinyl-banner", CHATGPT_BANNER_GUIDE_SOURCE), {
    tag: "chatgpt-banner-guide", label: "ChatGPT banner guide",
  });
  for (const value of [null, undefined, "", "google", "https://example.com", "<script>", " chatgpt-banner-guide", [CHATGPT_BANNER_GUIDE_SOURCE]]) {
    assert.equal(bannerOrderSource("13oz-vinyl-banner", value), null);
  }
  assert.equal(bannerOrderSource("solar-placards", CHATGPT_BANNER_GUIDE_SOURCE), null);
});

async function configuredOrder(handle, guideSource) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ product_handle: handle, order_quantity: "1", name: "Test Buyer", email: "test@example.invalid", delivery_method: "pickup-la-mesa", rd_source: guideSource || "" })) form.set(key, value);
  const captured = {};
  const context = vm.createContext({
    bannerOrderSource,
    ALLOWED_ORIGINS: new Set(["https://recognition-direct.com"]),
    requestFormData: async () => form,
    productHandle: value => value,
    catalogByHandle: new Map([[handle, { url: `/${handle}` }]]),
    readPositiveNumber: Number,
    catalogOptions: () => ({}),
    buildCatalogQuoteInput: () => ({ values: {}, width: 5, height: 3, units: "feet", squareFeetEach: 15 }),
    YARD_SIGN_H_STAKE_HANDLE: "yard-sign-and-h-stake",
    catalogUnitPrice: async () => 37.5,
    defaultedDeliveryMethodValue: () => "pickup-la-mesa",
    DEFAULT_13OZ_BANNER_DELIVERY_METHOD: "pickup-la-mesa",
    deliveryMethodLabel: () => "La Mesa Pickup",
    saveUpload: async () => "",
    field: (data, key) => String(data.get(key) || ""),
    isYouthSportsBanner: () => false,
    classifyCatalogShipping: () => ({ label: "Pickup" }),
    attribute: (key, value) => value ? { key, value } : null,
    catalogDisplayTitle: () => "13oz Vinyl Banners",
    selectedCatalogAttributes: () => [],
    buildBannerDesignAttributes: () => [],
    shippingAttributes: () => [],
    buildYouthSportsBannerPrompt: () => "",
    randomUUID: () => "test-configuration",
    writeFile: async () => {},
    join: (...parts) => parts.join("/"),
    ORDER_DIR: "test-only",
    shippingTags: () => [],
    draftOrderPickupAddress: () => ({}),
    draftOrderShippingLine: () => ({}),
    addCustomOrderToCart: async (_req, _res, record, input) => Object.assign(captured, { record, input }),
    combinedCartShippingLine: () => ({}),
    truncateShopifyDraftNote: value => value,
  });
  vm.runInContext(
    source.slice(source.indexOf("async function handleCatalogCheckout("), source.indexOf("async function handleNameBadgeCheckout("))
      + source.slice(source.indexOf("function combineCustomCartDraftInput("), source.indexOf("async function handleCustomOrderCartCheckout(")),
    context,
  );
  await context.handleCatalogCheckout({ headers: { origin: "https://recognition-direct.com" } }, {});
  captured.combined = context.combineCustomCartDraftInput({
    id: "test-cart", items: [
      { orderId: "test-configuration", draftInput: captured.input },
      { orderId: "other-item", draftInput: { tags: ["banner-cart-drinkware"], lineItems: [], note: "Second item" } },
    ],
  });
  return captured;
}

test("guide source survives configured order and mixed-cart checkout without changing pricing or delivery", async () => {
  const { record, input, combined } = await configuredOrder("13oz-vinyl-banner", CHATGPT_BANNER_GUIDE_SOURCE);
  assert.equal(record.orderSource, CHATGPT_BANNER_GUIDE_SOURCE);
  assert.equal(record.totalPrice, 37.5);
  assert.equal(record.deliveryMethod, "La Mesa Pickup");
  assert.ok(input.tags.includes("pickup-la-mesa"));
  assert.ok(input.tags.includes("proof-required"));
  assert.ok(combined.tags.includes(CHATGPT_BANNER_GUIDE_SOURCE));
  assert.ok(combined.tags.includes("banner-cart-drinkware"));
  assert.ok(combined.lineItems[0].customAttributes.some(item => item.key === "Order Source" && item.value === "ChatGPT banner guide"));
  assert.match(combined.note, /Order source: ChatGPT banner guide/);
  assert.equal(combined.lineItems[0].originalUnitPriceWithCurrency.amount, "37.50");
  assert.equal(combined.lineItems[0].taxable, true);
  assert.equal(record.checkoutHandoffAt, undefined);
  assert.equal(record.purchasedAt, undefined);
});

test("ordinary and other-product orders are not falsely attributed to the guide", async () => {
  for (const [handle, guideSource] of [["13oz-vinyl-banner", ""], ["13oz-vinyl-banner", "arbitrary"], ["pvc-board", CHATGPT_BANNER_GUIDE_SOURCE]]) {
    const { record, input } = await configuredOrder(handle, guideSource);
    assert.equal(record.orderSource, undefined);
    assert.equal(input.tags.includes(CHATGPT_BANNER_GUIDE_SOURCE), false);
    assert.equal(input.lineItems[0].customAttributes.some(item => item.key === "Order Source"), false);
  }
});
