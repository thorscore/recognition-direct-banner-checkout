export const BANNER_DRINKWARE_SOURCE = "banner-cart-drinkware";
export const CART_DRINKWARE_PRODUCTS = [
  { id: 15411785924904, handle: "personalized-32-oz-polar-camel-water-bottle", sku: "LWB202", title: "32 oz Polar Camel Water Bottle" },
  { id: 15411785826600, handle: "personalized-20-oz-polar-camel-tumbler-with-slider-lid", sku: "LTM7252", title: "20 oz Polar Camel Tumbler" },
];

export function hasEligibleBanner(cart) {
  const tags = (cart?.items || []).flatMap(item => item.draftInput?.tags || []);
  return !tags.some(tag => ["league-billed", "jamul-ayso", "no-charge-checkout"].includes(tag))
    && tags.some(tag => ["13oz-vinyl-banner", "custom-banner"].includes(tag));
}

export function cartDeliveryChoice(cart) {
  const choices = new Set((cart?.items || []).flatMap(item => item.draftInput?.tags || [])
    .filter(tag => ["ship", "pickup-la-mesa", "pickup-pine-valley", "pickup-spring-valley"].includes(tag)));
  return choices.size === 1 ? [...choices][0] : null;
}

function safeImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "cdn.shopify.com" ? url.href : null;
  } catch { return null; }
}

export function liveDrinkwareOffer(product, spec, cartId, priceForSku) {
  if (Number(product?.id) !== spec.id || product?.handle !== spec.handle || product?.available !== true) return null;
  const variant = product.variants?.find(value => value.sku === spec.sku && value.available === true);
  const price = Number(variant?.price) / 100;
  const image = safeImage(variant?.featured_image?.src || product.featured_image);
  // An offer must match both the live storefront and the custom order calculator.
  if (!variant?.id || !Number.isFinite(price) || price <= 0 || !image) return null;
  const configuredPrice = priceForSku(spec.sku);
  if (!Number.isFinite(configuredPrice) || Math.abs(price - configuredPrice) > 0.001) return null;
  const link = new URL(`/products/${spec.handle}`, "https://recognition-direct.com");
  link.searchParams.set("variant", String(variant.id));
  link.searchParams.set("cart", cartId);
  link.searchParams.set("rd_offer", BANNER_DRINKWARE_SOURCE);
  return { title: spec.title, price, image, href: link.href };
}

export async function loadCartDrinkware(cart, { fetchImpl = fetch, priceForSku, productHandleForSku }) {
  const delivery = cartDeliveryChoice(cart);
  if (!hasEligibleBanner(cart) || !delivery || delivery === "pickup-spring-valley") return [];
  const existingHandles = new Set((cart.items || []).flatMap(item => (item.draftInput?.lineItems || []).map(line => {
    const sku = line.customAttributes?.find(value => value.key === "SKU")?.value;
    return productHandleForSku(sku);
  })).filter(Boolean));
  const specs = CART_DRINKWARE_PRODUCTS.filter(spec => !existingHandles.has(productHandleForSku(spec.sku)));
  const offers = await Promise.all(specs.map(async spec => {
    try {
      const response = await fetchImpl(`https://recognition-direct.com/products/${spec.handle}.js`, {
        signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      const offer = liveDrinkwareOffer(await response.json(), spec, cart.id, priceForSku);
      if (offer) {
        const link = new URL(offer.href);
        link.searchParams.set("rd_delivery", delivery);
        offer.href = link.href;
      }
      return offer;
    } catch { return null; }
  }));
  return offers.filter(Boolean);
}

export function isBannerDrinkwareAddition(cart, source, sku, productHandleForSku) {
  const productHandle = productHandleForSku(sku);
  return source === BANNER_DRINKWARE_SOURCE && hasEligibleBanner(cart) && Boolean(productHandle)
    && CART_DRINKWARE_PRODUCTS.some(spec => productHandleForSku(spec.sku) === productHandle);
}
