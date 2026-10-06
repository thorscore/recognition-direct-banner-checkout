import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
const catalog = JSON.parse((await readFile(new URL("../catalog/catalog-inventory.json", import.meta.url), "utf8")).replace(/^\uFEFF/, ""));
const banner = catalog.products.find((product) => product.url === "/13oz-vinyl-banner");

// Exercise the server's pricing helpers without starting it or creating real orders.
function pricingContext(quote) {
  const context = vm.createContext({
    cleanText: (value, maxLength = 500) => String(value ?? "").trim().slice(0, maxLength),
    field: (formData, name) => String(formData.get(name) ?? ""),
    readPositiveNumber: (value) => Number(value),
  });
  vm.runInContext(
    source.slice(source.indexOf("const CATALOG_PRICE_OVERRIDES ="), source.indexOf("const DEFAULT_NAME_BADGE_BASE_PRICE_BREAKS ="))
      + source.slice(source.indexOf("function productHandle("), source.indexOf("async function handleCatalogProduct(")),
    context,
  );
  context.quoteCatalogProduct = quote;
  return context;
}

function bannerInput(context, width = 5, height = 3, options = {}, units = "feet", quantity = 1) {
  const form = new FormData();
  form.set("width", String(width));
  form.set("height", String(height));
  form.set("units", units);
  return context.buildCatalogQuoteInput(banner, quantity, options, form);
}

test("standard banner quotes replace the exact old base without a five-cent residual", async () => {
  for (const [width, height, oldPrice, expected] of [
    [5, 3, 35.15, 37.5],
    [5, 4, 46.85, 50],
    [6, 3, 42.2, 45],
    [4, 3, 28.1, 30],
    [4, 8, 75, 80],
  ]) {
    let calls = 0;
    const context = pricingContext(async () => {
      calls += 1;
      return { unitPrice: oldPrice };
    });
    assert.equal(await context.catalogUnitPrice(banner, 1, bannerInput(context, width, height)), expected);
    assert.equal(context.catalogPricingOverride(banner).squareFootRate, 2.5);
    assert.equal(calls, 1, "standard options must not require a second supplier quote");
  }
});

test("feet and inches produce the same price", async () => {
  const context = pricingContext(async () => ({ unitPrice: 35.15 }));
  const input = bannerInput(context, 60, 36, {}, "inches");
  assert.equal(input.squareFeetEach, 15);
  assert.equal(await context.catalogUnitPrice(banner, 1, input), 37.5);
});

test("the existing banner minimum remains in place", async () => {
  const context = pricingContext(async () => ({ unitPrice: 17.2 }));
  assert.equal(await context.catalogUnitPrice(banner, 1, bannerInput(context, 1, 1)), 17.2);
});

test("quantity uses the advertised rate instead of old base quantity discounts", async () => {
  const quantities = [];
  const context = pricingContext(async (_product, quantity) => {
    quantities.push(quantity);
    return { unitPrice: 33.4 };
  });
  const unitPrice = await context.catalogUnitPrice(banner, 4, bannerInput(context, 5, 3, {}, "feet", 4));
  assert.equal(unitPrice, 37.5);
  assert.equal(unitPrice * 4, 150);
  assert.deepEqual(quantities, [4]);
});

test("special finishing and second-side premiums are retained", async () => {
  for (const [options, oldPrice, expected] of [
    [{ corner: "A" }, 44.95, 47.3],
    [{ polepocket: "2/TB" }, 42.95, 45.3],
    [{ rope: "v4" }, 52.15, 54.5],
    [{ sides: "2" }, 70.3, 72.65],
  ]) {
    const calls = [];
    const context = pricingContext(async (_product, quantity, values) => {
      calls.push({ quantity, values: { ...values } });
      return { unitPrice: calls.length === 1 ? oldPrice : 35.15 };
    });
    assert.equal(await context.catalogUnitPrice(banner, 1, bannerInput(context, 5, 3, options)), expected);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].values._size, "60x36");
    assert.equal(calls[1].values.sides, "1");
    assert.equal(calls[1].values.hem, "A");
    assert.equal(calls[1].values.grommet, "24/TBLR");
    assert.equal(calls[1].values.corner, "0");
    assert.equal(calls[1].values.polepocket, "0");
    assert.equal(calls[1].values.rope, "v1");
  }
});

test("failed baseline quotes do not silently drop optional charges", async () => {
  let calls = 0;
  const context = pricingContext(async () => {
    if (++calls === 2) throw new Error("Supplier unavailable");
    return { unitPrice: 44.95 };
  });
  await assert.rejects(
    context.catalogUnitPrice(banner, 1, bannerInput(context, 5, 3, { corner: "A" })),
    /Supplier unavailable/,
  );
});

test("other product price adjustments remain unchanged", async () => {
  let calls = 0;
  const context = pricingContext(async () => {
    calls += 1;
    return { unitPrice: 26.4 };
  });
  assert.equal(await context.catalogUnitPrice({ url: "/aluminum-sign" }, 1, { values: { size: "12x18" } }), 29.7);
  assert.equal(await context.catalogUnitPrice({ url: "/coroplast" }, 1, { values: { hardware: "1" } }), 28.3);
  assert.equal(await context.catalogUnitPrice({ url: "/fabric-block-out", sqft: 3, minimum: 10 }, 1, { values: {}, squareFeetEach: 8 }), 34.24);
  assert.equal(await context.catalogUnitPrice({ url: "/pvc-board" }, 1, { values: {} }), 26.4);
  assert.equal(calls, 4);
});
