import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
const catalog = JSON.parse((await readFile(new URL("../catalog/catalog-inventory.json", import.meta.url), "utf8")).replace(/^\uFEFF/, ""));
const products = catalog.products.filter(product => ["/standard-retractable", "/deluxe-retractable"].includes(product.url));
const context = vm.createContext({
  cleanText: (value, max = 500) => String(value ?? "").trim().slice(0, max),
  field: (form, key) => String(form.get(key) ?? ""),
  readPositiveNumber: Number,
  catalogByHandle: new Map(products.map(product => [product.url.slice(1), product])),
  corsHeaders: () => ({}),
  json: (_res, status, body) => ({ status, body }),
});
vm.runInContext(
  source.slice(source.indexOf("const CATALOG_PRICE_OVERRIDES ="), source.indexOf("const DEFAULT_NAME_BADGE_BASE_PRICE_BREAKS ="))
  + source.slice(source.indexOf("function productHandle("), source.indexOf("async function handleCatalogPrice(")), context,
);

const input = (product, options, version = "verified-led-v1") => {
  const form = new FormData();
  form.set("rd_stand_options", version);
  return context.buildCatalogQuoteInput(product, 1, options, form);
};

test("verified stand metadata exposes two-light choices only to the new forms", async () => {
  for (const product of products) {
    const url = new URL("https://example.invalid/api/catalog-product?handle=" + product.url.slice(1));
    const legacy = await context.handleCatalogProduct({}, {}, url);
    assert.ok(!legacy.body.attrs.find(attr => attr.key === "led").options.some(option => option.key === "2"));
    url.searchParams.set("rd_stand_options", "verified-led-v1");
    const next = await context.handleCatalogProduct({}, {}, url);
    assert.equal(next.body.standOptionsVersion, "verified-led-v1");
    assert.ok(next.body.attrs.find(attr => attr.key === "led").options.some(option => option.key === "2"));
  }
});

test("Standard size and Deluxe side selection retain the required light count", () => {
  for (const [product, twoSize, oneSize] of [[products[0], "47x81", "33x81"], [products[1], "33x81d", "33x81"]]) {
    assert.equal(input(product, { hardware: "ph", size: twoSize, led: "1" }).values.led, "2");
    assert.equal(input(product, { hardware: "ph", size: twoSize, led: "2" }).values.led, "2");
    assert.equal(input(product, { hardware: "ph", size: oneSize, led: "2" }).values.led, "1");
    assert.equal(input(product, { hardware: "ph", size: twoSize, led: "0" }).values.led, "0");
    assert.equal(input(product, { hardware: "p", size: twoSize, led: "2" }).values.led, "0");
  }
});

test("legacy forms retain their previous contract until the new theme is published", () => {
  for (const product of products) {
    const values = input(product, { hardware: "ph", size: product.url === "/standard-retractable" ? "47x81" : "33x81d", led: "2" }, "").values;
    assert.equal(values.led, "1");
  }
  assert.equal(context.verifiedRetractableOptions({ url: "/sd-retractable" }, "verified-led-v1"), false);
  assert.equal(context.verifiedRetractableOptions({ url: "/13oz-vinyl-banner" }, "verified-led-v1"), false);
});

test("pricing and checkout share the same normalized configuration without inventing prices", async () => {
  const calls = [];
  context.quoteCatalogProduct = async (_product, quantity, values) => {
    calls.push({ quantity, values: { ...values } });
    return { unitPrice: 321.09 };
  };
  const product = products[0];
  const quoteInput = input(product, { hardware: "ph", size: "47x81", led: "2" });
  assert.equal(await context.catalogUnitPrice(product, 2, quoteInput), 321.09);
  assert.equal(calls[0].values.led, "2");
  assert.equal(calls[0].quantity, 2);
  assert.match(source, /const input = buildCatalogQuoteInput\(product, quantity, catalogOptions\(formData\), formData\);/);
});
