import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { customCartReviewLines } from "../custom-cart-review.mjs";

const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
const catalog = JSON.parse((await readFile(new URL("../catalog/catalog-inventory.json", import.meta.url), "utf8")).replace(/^\uFEFF/, ""));
const product = catalog.products.find((item) => item.url === "/yard-sign-and-h-stake");
const req = { headers: { origin: "https://recognition-direct.com" } };

function scenario(size, stake, quantity = 1) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ product_handle: "yard-sign-and-h-stake", order_quantity: String(quantity), email: "test@example.invalid", delivery_method: "pickup-la-mesa", catalog_options: JSON.stringify({ yard_sign_size: size, yard_sign_stake: stake }) })) form.set(key, value);
  const captured = { uploads: 0, writes: 0 };
  const context = vm.createContext({
    cleanText: (value, maxLength = 500) => String(value ?? "").trim().slice(0, maxLength),
    field: (data, key) => String(data.get(key) ?? ""),
    readPositiveNumber: Number,
    ALLOWED_ORIGINS: new Set([req.headers.origin]),
    requestFormData: async () => form,
    catalogByHandle: new Map([["yard-sign-and-h-stake", product]]),
    corsHeaders: () => ({}),
    json: (_res, status, body) => ({ status, body }),
    defaultedDeliveryMethodValue: () => "pickup-la-mesa",
    deliveryMethodLabel: () => "La Mesa Pickup",
    saveUpload: async () => { captured.uploads += 1; return ""; },
    bannerOrderSource: () => null,
    classifyCatalogShipping: () => ({ label: "Pickup" }),
    attribute: (key, value) => value ? { key, value } : null,
    buildBannerDesignAttributes: () => [],
    shippingAttributes: () => [],
    buildYouthSportsBannerPrompt: () => "",
    randomUUID: () => "test-yard-sign",
    writeFile: async () => { captured.writes += 1; },
    join: (...parts) => parts.join("/"),
    ORDER_DIR: "test-only",
    shippingTags: () => [],
    draftOrderPickupAddress: () => ({}),
    draftOrderShippingLine: () => ({}),
    addCustomOrderToCart: async (_req, _res, record, input) => Object.assign(captured, { record, input }),
    combinedCartShippingLine: () => ({}),
    truncateShopifyDraftNote: (value) => value,
    orderAttributionAttributes: () => [],
  });
  vm.runInContext(
    source.slice(source.indexOf("const CATALOG_PRICE_OVERRIDES ="), source.indexOf("const DEFAULT_NAME_BADGE_BASE_PRICE_BREAKS ="))
      + source.slice(source.indexOf("function productHandle("), source.indexOf("async function handleNameBadgePrice("))
      + source.slice(source.indexOf("async function handleCatalogCheckout("), source.indexOf("async function handleNameBadgeCheckout("))
      + source.slice(source.indexOf("function combineCustomCartDraftInput("), source.indexOf("async function handleCustomOrderCartCheckout(")),
    context,
  );
  return { context, captured };
}

test("yard-sign API exposes a blank default and explicit with/without-stake choices", async () => {
  const { context } = scenario("18x24", "");
  const result = await context.handleCatalogProduct(req, {}, new URL("https://example.invalid/api/catalog-product?handle=yard-sign-and-h-stake"));
  const stake = result.body.attrs.find((item) => item.key === "yard_sign_stake");
  assert.equal(stake.label, "H-stake (required)");
  assert.equal(stake.component, "select");
  assert.equal(stake.options.find((option) => option.default).key, "");
  assert.deepEqual(Array.from(stake.options, (option) => option.key), ["", "with-stake", "without-stake"]);
});

test("stake choice never changes existing yard-sign size and quantity prices", async () => {
  for (const [size, price] of [["12x18", 12], ["18x24", 16]]) {
    for (const stake of ["", "with-stake", "without-stake"]) {
      for (const quantity of [1, 3, 50]) {
        const { context } = scenario(size, stake, quantity);
        const result = await context.handleCatalogPrice(req, {});
        assert.equal(result.status, 200);
        assert.equal(result.body.unitPrice, price);
        assert.equal(result.body.totalPrice, price * quantity);
      }
    }
  }
});

test("missing or invalid stake cannot save artwork, create records or reach checkout", async () => {
  for (const stake of [undefined, "", "included", "with-stake ", ["with-stake"], "<script>"]) {
    const { context, captured } = scenario("18x24", stake);
    await assert.rejects(context.handleCatalogCheckout(req, {}), /Choose with H-stake or without H-stake/);
    assert.equal(captured.uploads, 0);
    assert.equal(captured.writes, 0);
    assert.equal(captured.input, undefined);
  }
});

test("each choice survives saved order, cart review and combined Shopify checkout", async () => {
  for (const [stake, label, packageLabel] of [["with-stake", "With H-stake", "Yard Sign with H-Stake"], ["without-stake", "Without H-stake", "Yard Sign Only"]]) {
    for (const [size, price] of [["12x18", 12], ["18x24", 16]]) {
      const { context, captured } = scenario(size, stake, 3);
      await context.handleCatalogCheckout(req, {});
      const combined = context.combineCustomCartDraftInput({ id: "test-cart", items: [{ orderId: "test-yard-sign", draftInput: captured.input }] });
      for (const attributes of [captured.record.attributes, captured.input.lineItems[0].customAttributes, combined.lineItems[0].customAttributes]) {
        assert.ok(attributes.some((item) => item.key === "H-stake" && item.value === label));
        assert.ok(attributes.some((item) => item.key === "Package" && item.value === packageLabel));
      }
      assert.equal(captured.record.totalPrice, price * 3);
      assert.equal(combined.lineItems[0].originalUnitPriceWithCurrency.amount, price.toFixed(2));
      assert.equal(combined.lineItems[0].quantity, 3);
      assert.equal(captured.record.deliveryMethod, "La Mesa Pickup");
      const review = customCartReviewLines({ draftInput: captured.input });
      assert.ok(JSON.stringify(review).includes(packageLabel));
    }
  }
});
