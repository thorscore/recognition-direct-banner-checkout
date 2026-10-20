import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { customCartReviewLines } from "../custom-cart-review.mjs";

const attribute = (key, value) => ({ key, value });
const banner = {
  summary: { title: "13oz Vinyl Banner", quantity: 2, subtotal: 75 },
  draftInput: {
    tags: ["catalog-configuration", "13oz-vinyl-banner", "pickup-la-mesa"],
    lineItems: [{ title: "13oz Vinyl Banner", quantity: 2, customAttributes: [
      attribute("Product Size", "60 in x 36 in"), attribute("Delivery Method", "Pickup at La Mesa"),
      attribute("Banner Type", "Standard Banner"), attribute("Banner Description", "TEST ONLY"),
      attribute("Customer Email", "private@example.com"), attribute("Configuration ID", "private-id"),
      attribute("Standard Print-ready Art File", "https://example.com/private-artwork.pdf"),
    ] }],
  },
};

test("existing banner carts show saved size, delivery and customization without mutation", () => {
  const before = JSON.stringify(banner);
  const [line] = customCartReviewLines(banner);
  assert.equal(line.size, "60 in x 36 in");
  assert.equal(line.delivery, "Pickup at La Mesa");
  assert.equal(line.quantity, 2);
  assert.ok(line.details.some(({ label, value }) => label === "Banner Type" && value === "Standard Banner"));
  assert.ok(line.details.some(({ label, value }) => label === "Standard Print-ready Art File" && value === "Attached"));
  assert.ok(!JSON.stringify(line).includes("private"));
  assert.equal(JSON.stringify(banner), before);
});

test("solar orders preserve each selected plate size, quantity and text", () => {
  const review = customCartReviewLines({ draftInput: {
    tags: ["solar-placards"], customAttributes: [attribute("Delivery Method", "Ship")],
    lineItems: [
      { title: '6" x 6" Solar Placard', quantity: 1, customAttributes: [attribute("Size", '6" x 6"')] },
      { title: "Custom Solar Plate Size", quantity: 3, customAttributes: [attribute("Size", '2" x 4"'), attribute("Plate Text", "AC DISCONNECT")] },
    ],
  } });
  assert.equal(review.length, 2);
  assert.equal(review[1].quantity, 3);
  assert.equal(review[1].size, '2" x 4"');
  assert.equal(review[1].delivery, "Ship");
  assert.deepEqual(review[1].details, [{ label: "Plate Text", value: "AC DISCONNECT" }]);
});

test("unrelated products and old incomplete records are unchanged", () => {
  assert.deepEqual(customCartReviewLines({ draftInput: { tags: ["name-badges"] } }), []);
  assert.deepEqual(customCartReviewLines({ summary: { title: "Old item" } }), []);
  assert.deepEqual(customCartReviewLines({ draftInput: { tags: ["13oz-vinyl-banner"], lineItems: [{}] } })[0].details, []);
});

test("review HTML escapes customer text and keeps private upload URLs out", async () => {
  const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  const context = vm.createContext({ customCartReviewLines, escapeHtml: value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])) });
  vm.runInContext(source.slice(source.indexOf("function renderCustomCartReview("), source.indexOf("async function handleCustomOrderCartPage(")), context);
  const item = structuredClone(banner);
  item.draftInput.lineItems[0].customAttributes.push(attribute("Notes", '<img src=x onerror="alert(1)">'));
  const html = context.renderCustomCartReview(item);
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("private-artwork.pdf"));
  assert.ok(html.includes("Review customization"));
});
