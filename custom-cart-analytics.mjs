const products = {
  "13oz-vinyl-banner": { id: "10299129856296", name: "13oz Vinyl Banners", group: "13oz-banners" },
  styrene: { id: "10299156300072", name: "Custom Styrene Signs", group: "styrene-signs" },
};

export function customCartAnalyticsItem(orderRecord) {
  if (!orderRecord || !Object.hasOwn(products, orderRecord.productHandle)) return null;
  const product = products[orderRecord?.productHandle];
  if (!product) return null;
  const { quantity, unitPrice, totalPrice } = orderRecord;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) return null;
  if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 100000) return null;
  if (!Number.isFinite(totalPrice) || totalPrice <= 0 || totalPrice > 10000000) return null;
  if (Math.abs(Math.round(unitPrice * quantity * 100) - Math.round(totalPrice * 100)) > 1) return null;
  return {
    item_id: product.id,
    item_name: product.name,
    product_group: product.group,
    quantity,
    price: Number(unitPrice.toFixed(2)),
    value: Number(totalPrice.toFixed(2)),
    currency: "USD",
  };
}
