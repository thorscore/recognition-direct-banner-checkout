export const SPRING_VALLEY_PICKUP_LABEL = "Pickup at 8680 Troy St., Spring Valley, CA 91977";
const BANNER_METHODS = new Set(["ship", "pickup-la-mesa", "pickup-pine-valley"]);
const OTHER_METHODS = new Set(["ship", "pickup-spring-valley"]);

export function validateDeliveryMethod(value, is13ozBanner = false) {
  const method = String(value || "ship");
  if ((is13ozBanner ? BANNER_METHODS : OTHER_METHODS).has(method)) return method;
  throw new Error(is13ozBanner
    ? "13oz banners can be shipped or picked up at La Mesa or Pine Valley. Office pickup at 8680 Troy St. is not available for banners. Please choose a listed option."
    : "This product can be shipped or picked up at 8680 Troy St., Spring Valley, CA 91977. La Mesa and Pine Valley pickup are for 13oz banners only. Please reload the product page and choose a listed option.");
}

export function assertCartDelivery(items) {
  const methods = new Set();
  for (const item of items || []) {
    const tags = item.draftInput?.tags || [];
    if (tags.includes("league-billed")) continue;
    const method = tags.find(tag => ["ship", "pickup-la-mesa", "pickup-pine-valley", "pickup-spring-valley"].includes(tag));
    if (!method) continue;
    validateDeliveryMethod(method, tags.includes("13oz-vinyl-banner") || tags.includes("custom-banner"));
    methods.add(method);
  }
  if (methods.size > 1) throw new Error("These items have different delivery choices. Please check out shipping items together, or place separate orders for each pickup location. 13oz banners use La Mesa or Pine Valley; other products use 8680 Troy St., Spring Valley.");
}
