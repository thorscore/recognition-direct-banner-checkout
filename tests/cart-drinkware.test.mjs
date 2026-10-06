import assert from "node:assert/strict";
import test from "node:test";
import { BANNER_DRINKWARE_SOURCE, CART_DRINKWARE_PRODUCTS, hasEligibleBanner, isBannerDrinkwareAddition, liveDrinkwareOffer, loadCartDrinkware } from "../cart-drinkware.mjs";

const cartId = "cd29b3e0-cfbf-4b3e-9215-aa43b3971925";
const bannerCart = () => ({ id: cartId, items: [{ draftInput: { tags: ["13oz-vinyl-banner"], lineItems: [] } }] });
const handles = sku => /^LWB20[123]$/.test(sku || "") ? "water-bottle" : /^LTM725[123]$/.test(sku || "") ? "tumbler" : null;
const priceForSku = sku => sku === "LWB202" ? 29.75 : 23;
const product = spec => ({
  id: spec.id, handle: spec.handle, available: true,
  featured_image: "https://cdn.shopify.com/s/files/1/0865/5762/2568/files/black.png",
  variants: [{ id: 67837136077096, sku: spec.sku, price: spec.sku === "LWB202" ? 2975 : 2300, available: true }],
});
const loaderOptions = fetchImpl => ({ fetchImpl, priceForSku, productHandleForSku: handles });

test("offers are limited to banner carts, excluding league billing", () => {
  assert.equal(hasEligibleBanner(bannerCart()), true);
  assert.equal(hasEligibleBanner(null), false);
  assert.equal(hasEligibleBanner({ items: [] }), false);
  assert.equal(hasEligibleBanner({ items: [{ draftInput: { tags: ["solar-placards"] } }] }), false);
  for (const tag of ["league-billed", "jamul-ayso", "no-charge-checkout"]) {
    const cart = bannerCart();
    cart.items[0].draftInput.tags.push(tag);
    assert.equal(hasEligibleBanner(cart), false);
  }
});

test("live offers preserve cart, exact displayed variant, and source without adding an item", () => {
  const spec = CART_DRINKWARE_PRODUCTS[0];
  const offer = liveDrinkwareOffer(product(spec), spec, cartId, priceForSku);
  const url = new URL(offer.href);
  assert.equal(offer.price, 29.75);
  assert.equal(url.origin, "https://recognition-direct.com");
  assert.equal(url.pathname, `/products/${spec.handle}`);
  assert.equal(url.searchParams.get("cart"), cartId);
  assert.equal(url.searchParams.get("variant"), "67837136077096");
  assert.equal(url.searchParams.get("rd_offer"), BANNER_DRINKWARE_SOURCE);
});

test("missing, unpublished, unavailable, and mismatched products fail closed", () => {
  const spec = CART_DRINKWARE_PRODUCTS[0];
  for (const changes of [{ id: 1 }, { handle: "old-archived-product" }, { available: false }, { variants: [] }, { featured_image: "https://untrusted.example/image.png" }]) {
    assert.equal(liveDrinkwareOffer({ ...product(spec), ...changes }, spec, cartId, priceForSku), null);
  }
});

test("a free, sold-out, or wrong-SKU variant is never offered", () => {
  const spec = CART_DRINKWARE_PRODUCTS[0];
  for (const changes of [{ price: 0 }, { price: -100 }, { price: "not-a-price" }, { available: false }, { sku: "ARCHIVED" }]) {
    const data = product(spec);
    Object.assign(data.variants[0], changes);
    assert.equal(liveDrinkwareOffer(data, spec, cartId, priceForSku), null);
  }
});

test("storefront price must agree with the custom calculator", () => {
  const spec = CART_DRINKWARE_PRODUCTS[0];
  assert.equal(liveDrinkwareOffer(product(spec), spec, cartId, () => 30), null);
  assert.equal(liveDrinkwareOffer(product(spec), spec, cartId, () => null), null);
  const data = product(spec);
  data.variants[0].featured_image = { src: "https://cdn.shopify.com/s/files/black-variant.png" };
  assert.equal(liveDrinkwareOffer(data, spec, cartId, priceForSku).image, data.variants[0].featured_image.src);
});

test("loader fetches only the two approved storefront products without changing cart contents", async () => {
  const cart = bannerCart();
  const original = JSON.stringify(cart);
  const urls = [];
  const offers = await loadCartDrinkware(cart, loaderOptions(async url => {
    urls.push(url);
    const spec = CART_DRINKWARE_PRODUCTS.find(value => url.endsWith(`/${value.handle}.js`));
    return { ok: true, json: async () => product(spec) };
  }));
  assert.equal(offers.length, 2);
  assert.deepEqual(urls.sort(), CART_DRINKWARE_PRODUCTS.map(spec => `https://recognition-direct.com/products/${spec.handle}.js`).sort());
  assert.equal(JSON.stringify(cart), original);
});

test("unrelated carts require no storefront requests", async () => {
  const offers = await loadCartDrinkware(null, loaderOptions(async () => { throw new Error("Must not fetch"); }));
  assert.deepEqual(offers, []);
});

test("already-added drinkware is not offered again, including a different color", async () => {
  const cart = bannerCart();
  cart.items.push({ draftInput: { lineItems: [{ customAttributes: [{ key: "SKU", value: "LWB203" }] }] } });
  const calls = [];
  const offers = await loadCartDrinkware(cart, loaderOptions(async url => {
    calls.push(url);
    return { ok: true, json: async () => product(CART_DRINKWARE_PRODUCTS[1]) };
  }));
  assert.equal(offers.length, 1);
  assert.deepEqual(calls, [`https://recognition-direct.com/products/${CART_DRINKWARE_PRODUCTS[1].handle}.js`]);
});

test("network failure and unpublished products omit offers without blocking checkout", async () => {
  for (const fetchImpl of [async () => { throw new Error("Timed out"); }, async () => ({ ok: false })]) {
    assert.deepEqual(await loadCartDrinkware(bannerCart(), loaderOptions(fetchImpl)), []);
  }
});

test("only configured drinkware additions from eligible banner carts receive the sales source", () => {
  assert.equal(isBannerDrinkwareAddition(bannerCart(), BANNER_DRINKWARE_SOURCE, "LWB203", handles), true);
  assert.equal(isBannerDrinkwareAddition(bannerCart(), BANNER_DRINKWARE_SOURCE, "LTM7252", handles), true);
  assert.equal(isBannerDrinkwareAddition(bannerCart(), "other", "LWB202", handles), false);
  assert.equal(isBannerDrinkwareAddition(bannerCart(), BANNER_DRINKWARE_SOURCE, "OTHER", handles), false);
  assert.equal(isBannerDrinkwareAddition(null, BANNER_DRINKWARE_SOURCE, "LWB202", handles), false);
});
