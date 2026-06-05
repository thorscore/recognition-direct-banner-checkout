import { readFile, writeFile } from "node:fs/promises";

const csvPath = new URL("../../jds-shopify-files/Shopify Files/Acrylic-Shopify.csv", import.meta.url);
const outputPath = new URL("../catalog/premier-acrylic-awards.json", import.meta.url);
const endpoint = "https://api.jdsapp.com/get-product-details-by-skus";
const markup = 2.5;
const token = process.env.JDS_API_TOKEN;

if (!token) {
  throw new Error("Set JDS_API_TOKEN before running this script.");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        value += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value || row.length) {
    row.push(value);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }

  const [headers, ...bodyRows] = rows;
  return bodyRows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])),
  );
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(2));
}

function price(value) {
  const number = money(value);
  return number == null ? null : Number((number * markup).toFixed(2));
}

async function fetchBatch(skus) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, skus }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`JDS API failed (${response.status}): ${body.slice(0, 300)}`);
  }

  return response.json();
}

const rows = parseCsv(await readFile(csvPath, "utf8"));
const rowsBySku = new Map();
for (const row of rows) {
  const sku = row["Variant SKU"]?.trim();
  if (sku && !rowsBySku.has(sku)) rowsBySku.set(sku, row);
}

const skus = [...rowsBySku.keys()];
const detailsBySku = new Map();
const batchSize = 75;

for (let index = 0; index < skus.length; index += batchSize) {
  const batch = skus.slice(index, index + batchSize);
  const details = await fetchBatch(batch);
  for (const item of details) {
    if (item?.sku) detailsBySku.set(String(item.sku).trim(), item);
  }
  console.log(`Fetched ${Math.min(index + batchSize, skus.length)} of ${skus.length}`);
}

const missing = skus.filter((sku) => !detailsBySku.has(sku));
if (missing.length) {
  throw new Error(`Missing JDS pricing for ${missing.length} SKUs: ${missing.slice(0, 20).join(", ")}`);
}

const unavailable = [];
const products = skus.flatMap((sku) => {
  const row = rowsBySku.get(sku);
  const item = detailsBySku.get(sku);
  if (
    String(item.name || "").toLowerCase() === "unavailable" ||
    !Number.isFinite(Number(item.lessThanCasePrice))
  ) {
    unavailable.push(sku);
    return [];
  }

  const costs = {
    lessThanCase: money(item.lessThanCasePrice),
    oneCase: money(item.oneCase),
    fiveCases: money(item.fiveCases),
    tenCases: money(item.tenCases),
    twentyCases: money(item.twentyCases ?? item.tenCases),
    fortyCases: money(item.fortyCases ?? item.tenCases),
  };
  const prices = {
    lessThanCase: price(item.lessThanCasePrice),
    oneCase: price(item.oneCase),
    fiveCases: price(item.fiveCases),
    tenCases: price(item.tenCases),
    twentyCases: price(item.twentyCases ?? item.tenCases),
    fortyCases: price(item.fortyCases ?? item.tenCases),
  };

  return [{
    sku,
    title: item.name || row.Title,
    displayName: item.name || row.Title,
    size: "",
    optionName: row["Option1 Name"] || "",
    optionValue: row["Option1 Value"] || "",
    description: item.description || row["Body (HTML)"] || "",
    caseQuantity: Number(item.caseQuantity || 1),
    costs,
    prices,
    image: item.image || row["Image Src"] || "",
    thumbnail: item.thumbnail || row["Image Src"] || "",
    imageAlt: row["Image Alt Text"] || item.name || row.Title,
    productType: row.Type || "Acrylic Award",
    vendor: row.Vendor || "Premier Acrylic",
    handle: row.Handle || "",
    availableQuantity: Number(item.availableQuantity || 0),
    localQuantity: Number(item.localQuantity || 0),
  }];
});

await writeFile(
  outputPath,
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "JDS Acrylic Shopify CSV + JDS API",
    markup,
    title: "Acrylic Awards",
    products,
  }, null, 2)}\n`,
);

const sample = products.find((product) => product.sku === "IMP601BU");
console.log(JSON.stringify({
  totalProducts: products.length,
  skippedUnavailable: unavailable.length,
  sample: {
    sku: sample?.sku,
    caseQuantity: sample?.caseQuantity,
    costs: sample?.costs,
    prices: sample?.prices,
  },
}, null, 2));
