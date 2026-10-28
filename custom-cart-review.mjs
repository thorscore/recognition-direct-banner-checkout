const REVIEW_FIELDS = new Set([
  "# of Sides", "Material", "Pole Pocket", "Hem", "Grommet", "Corners", "Rope", "Windslit",
  "Banner Type", "Sport", "League Name", "Age Group", "Team Name", "Team Colors",
  "Player Names", "Coaches Names", "Team Parents / Volunteers", "Youth Design Ideas",
  "Banner Description", "Plate Text", "Need-by Date", "Notes",
  "Package", "H-stake",
]);
const UPLOAD_FIELDS = new Set([
  "Artwork", "Youth Print-ready Artwork", "Youth Design Idea Image", "Standard Print-ready Art File",
  "Standard Example / Banner Element", "PDF Plan Sheet / Placard Design", "Additional Artwork",
]);

export function customCartReviewLines(item) {
  const draft = item.draftInput || {};
  const tags = draft.tags || [];
  if (!tags.some((tag) => ["13oz-vinyl-banner", "solar-placards", "yard-sign-and-h-stake"].includes(tag))) return [];
  const orderDelivery = draft.customAttributes?.find(({ key }) => key === "Delivery Method")?.value || "";
  return (draft.lineItems || []).map((line) => {
    const attributes = line.customAttributes || [];
    const value = (key) => attributes.find((attribute) => attribute.key === key)?.value || "";
    return {
      title: line.title || item.summary?.title || "Custom item",
      quantity: line.quantity || 1,
      size: value("Product Size") || value("Size"),
      delivery: value("Delivery Method") || orderDelivery,
      details: attributes.filter(({ key, value }) => value && (REVIEW_FIELDS.has(key) || UPLOAD_FIELDS.has(key)))
        .map(({ key, value }) => ({ label: key, value: UPLOAD_FIELDS.has(key) ? "Attached" : String(value) })),
    };
  });
}
