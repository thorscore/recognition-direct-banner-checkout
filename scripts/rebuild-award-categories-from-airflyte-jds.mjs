import { readFile, writeFile } from "node:fs/promises";

const csvPath = new URL("../../jds-shopify-files/Shopify Files/Airflyte-Shopify.csv", import.meta.url);
const catalogDir = new URL("../catalog/", import.meta.url);
const endpoint = "https://api.jdsapp.com/get-product-details-by-skus";
const markup = 2.5;
const token = process.env.JDS_API_TOKEN;

const categoryConfigs = [
  {
    id: "plaques",
    title: "Plaques",
    file: "premier-award-plaques.json",
    include: ({ type }) => (
      /plaque/i.test(type) ||
      /piano finish|walnut plaque|high gloss plaque|perpetual plaque|roster plaque|certificate plaque|photo plaque|routed plaque|corner plaque|alder plaque|walnut framed plaque|walnut step edge plaque|desktop plaque|shield plaque|high gloss diamond|airflyte frame/i.test(type)
    ),
  },
  {
    id: "executive-awards",
    title: "Executive Awards",
    file: "premier-executive-awards.json",
    include: ({ type }) => /flame series|achiever figure|book award/i.test(type),
  },
  {
    id: "glass-crystal-awards",
    title: "Glass & Crystal Awards",
    file: "premier-glass-crystal-awards.json",
    include: ({ type, title }) => (
      (/glass|crystal|ornament/i.test(type) || /crystal|glass/i.test(title)) &&
      !/^glassware$/i.test(type) &&
      !/^clock$/i.test(type) &&
      !/pen|writing|paperweight|desk wedge|binder|certificate holder|gavel|pen case|business card box|name plate|power bank|coaster|key ring|gift set/i.test(type)
    ),
  },
  {
    id: "clocks",
    title: "Clocks",
    file: "premier-award-clocks.json",
    include: ({ type }) => /^clock$/i.test(type),
  },
  {
    id: "office-accessories",
    title: "Office Accessories",
    file: "premier-office-accessories.json",
    include: ({ type, title }) => /pen|writing|paperweight|desk wedge|binder|certificate holder|gavel|pen case|business card box|name plate|power bank|coaster|key ring|gift set/i.test(type) || /gift set|whiskey stone|bamboo case/i.test(title),
  },
  {
    id: "cutting-boards",
    title: "Cutting Boards",
    file: "premier-cutting-boards.json",
    include: ({ type, title }) => /serving board|cheese set/i.test(type) || /cutting board|serving board|cheese set/i.test(title),
  },
  {
    id: "bison-river-knives",
    title: "Bison River Knives",
    file: "premier-bison-river-knives.json",
    include: ({ type, title }) => /knife|axe|multi tool/i.test(type) || /bison river/i.test(title),
  },
  {
    id: "award-drinkware",
    title: "Award Drinkware",
    file: "premier-award-drinkware.json",
    include: ({ type, title }) => /^drinkware$|^cam$/i.test(type) || /polar camel/i.test(title),
  },
];

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

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
  if (!sku || rowsBySku.has(sku)) continue;
  const type = row.Type || "";
  if (/acrylic/i.test(type) || /^glassware$/i.test(type)) continue;
  rowsBySku.set(sku, row);
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

const categoryProducts = new Map(categoryConfigs.map((category) => [category.id, []]));
const unmatchedTypes = new Map();
const unavailable = [];

for (const [sku, row] of rowsBySku) {
  const item = detailsBySku.get(sku);
  if (!item) continue;
  if (
    String(item.name || "").toLowerCase() === "unavailable" ||
    !Number.isFinite(Number(item.lessThanCasePrice))
  ) {
    unavailable.push(sku);
    continue;
  }

  const type = row.Type || "";
  const title = item.name || row.Title || "";
  const matchingCategory = categoryConfigs.find((category) => category.include({ type, title, row, item }));
  if (!matchingCategory) {
    unmatchedTypes.set(type || "(blank)", (unmatchedTypes.get(type || "(blank)") || 0) + 1);
    continue;
  }

  const product = {
    sku,
    title,
    displayName: title,
    size: "",
    optionName: row["Option1 Name"] || "",
    optionValue: row["Option1 Value"] || "",
    description: item.description || stripHtml(row["Body (HTML)"]) || "",
    caseQuantity: Number(item.caseQuantity || 1),
    costs: {
      lessThanCase: money(item.lessThanCasePrice),
      oneCase: money(item.oneCase),
      fiveCases: money(item.fiveCases),
      tenCases: money(item.tenCases),
      twentyCases: money(item.twentyCases ?? item.tenCases),
      fortyCases: money(item.fortyCases ?? item.tenCases),
    },
    prices: {
      lessThanCase: price(item.lessThanCasePrice),
      oneCase: price(item.oneCase),
      fiveCases: price(item.fiveCases),
      tenCases: price(item.tenCases),
      twentyCases: price(item.twentyCases ?? item.tenCases),
      fortyCases: price(item.fortyCases ?? item.tenCases),
    },
    image: item.image || row["Image Src"] || "",
    thumbnail: item.thumbnail || row["Image Src"] || "",
    imageAlt: row["Image Alt Text"] || title,
    productType: type || matchingCategory.title,
    vendor: row.Vendor || "Airflyte",
    handle: row.Handle || "",
    availableQuantity: Number(item.availableQuantity || 0),
    localQuantity: Number(item.localQuantity || 0),
  };

  categoryProducts.get(matchingCategory.id).push(product);
}

const summary = {};
for (const category of categoryConfigs) {
  const products = categoryProducts.get(category.id);
  await writeFile(
    new URL(category.file, catalogDir),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "JDS Airflyte Shopify CSV + JDS API",
      markup,
      title: category.title,
      products,
    }, null, 2)}\n`,
  );
  summary[category.title] = products.length;
}

console.log(JSON.stringify({
  summary,
  skippedUnavailable: unavailable.length,
  unmatchedTypes: Object.fromEntries([...unmatchedTypes.entries()].sort((a, b) => b[1] - a[1])),
}, null, 2));
