import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const APP_BASE_URL = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP || "f375fe-2d";
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || "";
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || "";
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || "";
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const MOCK_SHOPIFY = process.env.MOCK_SHOPIFY === "true";
const DATA_DIR = join(import.meta.dirname, "data");
const PUBLIC_DIR = join(import.meta.dirname, "public");
const CATALOG_FILE = join(import.meta.dirname, "catalog", "catalog-inventory.json");
const OLD_CATALOG_BASE_URL = "https://recognition-direct.bs.run";
const UPLOAD_DIR = join(DATA_DIR, "uploads");
const ORDER_DIR = join(DATA_DIR, "orders");
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 100);
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const MAX_BODY_BYTES = (MAX_FILE_MB + 10) * 1024 * 1024;
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "https://recognition-direct.com,https://www.recognition-direct.com,https://recognition-direct.bs.run,http://localhost:4173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
ALLOWED_ORIGINS.add(APP_BASE_URL);
const ALLOWED_FILE_EXTENSIONS = new Set([".pdf", ".ai", ".eps", ".psd", ".jpg", ".jpeg", ".png", ".txt", ".csv"]);
const CATALOG_PRICE_OVERRIDES = new Map([
  ["fabric-block-out", { squareFootRate: 3.98 }],
]);
const DEFAULT_NAME_BADGE_BASE_PRICE_BREAKS = "1:12.00,10:11.50,25:11.00,50:10.00,100:9.50,250:8.75,500:8.50,1000:8.00";
const DEFAULT_NAME_BADGE_NO_FRAME_PRICE_BREAKS = "1:8.00,10:7.50,25:7.00,50:6.00,100:5.50,250:5.25,500:5.00,1000:4.50";
const DEFAULT_NAME_BADGE_MAGNET_PRICE_BREAKS = "1:2.25,10:2.25,25:2.25,50:2.25,100:1.90,250:1.90,500:1.75,1000:1.50";
const DEFAULT_NAME_BADGE_DOME_PRICE_BREAKS = "1:4.00,10:4.00,25:4.00,50:3.50,100:3.50,250:3.00,500:2.50,1000:2.50";
const NAME_BADGE_BASE_PRICE_BREAKS = parseNameBadgePriceBreaks(process.env.NAME_BADGE_BASE_PRICE_BREAKS || DEFAULT_NAME_BADGE_BASE_PRICE_BREAKS);
const NAME_BADGE_NO_FRAME_PRICE_BREAKS = parseNameBadgePriceBreaks(process.env.NAME_BADGE_NO_FRAME_PRICE_BREAKS || DEFAULT_NAME_BADGE_NO_FRAME_PRICE_BREAKS);
const NAME_BADGE_MAGNET_PRICE_BREAKS = parseNameBadgePriceBreaks(process.env.NAME_BADGE_MAGNET_PRICE_BREAKS || DEFAULT_NAME_BADGE_MAGNET_PRICE_BREAKS);
const NAME_BADGE_DOME_PRICE_BREAKS = parseNameBadgePriceBreaks(process.env.NAME_BADGE_DOME_PRICE_BREAKS || DEFAULT_NAME_BADGE_DOME_PRICE_BREAKS);
const SOLAR_PLACARD_PRODUCTS = [
  { key: "placard-6x6", title: '6" x 6" Solar Placard', type: "placard", size: '6" x 6"', image: "placard-6x6.png", featured: true, unitPrice: 17 },
  { key: "placard-8x6", title: '8" x 6" Solar Placard', type: "placard", size: '8" x 6"', image: "placard-8x6.png", featured: true, unitPrice: 17 },
  { key: "placard-8x8", title: '8" x 8" Solar Placard', type: "placard", size: '8" x 8"', image: "placard-8x8.png", unitPrice: 20 },
  { key: "placard-10x10", title: '10" x 10" Solar Placard', type: "placard", size: '10" x 10"', image: "placard-10x10.png", unitPrice: 25 },
  { key: "placard-12x12", title: '12" x 12" Solar Placard', type: "placard", size: '12" x 12"', image: "placard-12x12.png", unitPrice: 30 },
  { key: "placard-10x7-5", title: '10" x 7.5" Solar Placard', type: "placard", size: '10" x 7.5"', image: "placard-10x7-5.png", unitPrice: 25 },
  { key: "placard-12x9", title: '12" x 9" Solar Placard', type: "placard", size: '12" x 9"', image: "placard-12x9.png", unitPrice: 30 },
  { key: "plate-1x4", title: '1" x 4" Solar Plate', type: "plate", size: '1" x 4"', image: "plate-any-text-4x1.png" },
  { key: "plate-1-5x4", title: '1.5" x 4" Solar Plate', type: "plate", size: '1.5" x 4"', image: "plate-any-text-4x1-5.png" },
  { key: "plate-1-5x6", title: '1.5" x 6" Solar Plate', type: "plate", size: '1.5" x 6"', image: "plate-any-text-6x1-5.png" },
  { key: "plate-2x6", title: '2" x 6" Solar Plate', type: "plate", size: '2" x 6"', image: "plate-any-text-6x2.png" },
  { key: "plate-3x6", title: '3" x 6" Solar Plate', type: "plate", size: '3" x 6"', image: "plate-any-text-6x3.png" },
  { key: "plate-4x4", title: '4" x 4" Solar Plate', type: "plate", size: '4" x 4"', image: "plate-any-text-4x4.png" },
  { key: "plate-custom", title: "Custom Solar Plate Size", type: "plate", size: "Custom", image: "plate-any-text-6x2.png" },
];
const solarProductByKey = new Map(SOLAR_PLACARD_PRODUCTS.map((product) => [product.key, product]));

let cachedToken = SHOPIFY_ACCESS_TOKEN;
let tokenExpiresAt = SHOPIFY_ACCESS_TOKEN ? Number.POSITIVE_INFINITY : 0;

await mkdir(UPLOAD_DIR, { recursive: true });
await mkdir(ORDER_DIR, { recursive: true });
const catalogData = JSON.parse((await readFile(CATALOG_FILE, "utf8")).replace(/^\uFEFF/, ""));
const catalogByHandle = new Map(catalogData.products.map((product) => [
  product.url.replace(/^\/+/, "").split("?")[0].replace(/-+/g, "-"),
  product,
]));

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(payload));
}

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  return origin && ALLOWED_ORIGINS.has(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }
    : {};
}

function html(res, status, markup) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(markup);
}

function cleanText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function readPositiveNumber(value, label) {
  const number = Number.parseFloat(String(value || ""));
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be greater than zero.`);
  return number;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[character]);
}

function parseNameBadgePriceBreaks(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [minimumQuantity, unitPrice] = part.split(":").map((entry) => Number.parseFloat(entry));
      return Number.isFinite(minimumQuantity) && Number.isFinite(unitPrice) && minimumQuantity > 0 && unitPrice >= 0
        ? { minimumQuantity: Math.floor(minimumQuantity), unitPrice }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.minimumQuantity - b.minimumQuantity);
}

function priceForQuantity(priceBreaks, quantity, label) {
  let price = null;
  for (const priceBreak of priceBreaks) {
    if (quantity >= priceBreak.minimumQuantity) price = priceBreak.unitPrice;
  }
  if (price === null) throw new Error(`${label} pricing is not configured yet.`);
  return Number(price.toFixed(2));
}

function nameBadgeUnitPrice(quantity, frame, fastener, finish) {
  if (quantity >= 1500) throw new Error("Quantities of 1500 or more are by quote. Please contact us for pricing.");
  const basePriceBreaks = frame === "no-frame" ? NAME_BADGE_NO_FRAME_PRICE_BREAKS : NAME_BADGE_BASE_PRICE_BREAKS;
  const basePrice = priceForQuantity(basePriceBreaks, quantity, "Name badge");
  const magnetPrice = fastener === "magnetic" ? priceForQuantity(NAME_BADGE_MAGNET_PRICE_BREAKS, quantity, "Magnet fastener") : 0;
  const domePrice = finish === "epoxy-dome" ? priceForQuantity(NAME_BADGE_DOME_PRICE_BREAKS, quantity, "Epoxy dome finish") : 0;
  return Number((basePrice + magnetPrice + domePrice).toFixed(2));
}

function nameBadgeOption(formData, name, allowed, label) {
  const value = field(formData, name, 100);
  if (!allowed.includes(value)) throw new Error(`Select a valid ${label}.`);
  return value;
}

function nameBadgeLabel(value) {
  return ({
    "1x3": "1\" x 3\"",
    "1-5x3": "1.5\" x 3\"",
    white: "White",
    "brushed-gold": "Brushed Gold",
    "brushed-silver": "Brushed Silver",
    "no-frame": "No Frame",
    "silver-frame": "Silver Frame",
    "gold-frame": "Gold Frame",
    magnetic: "Magnetic",
    pin: "Pin",
    standard: "Standard",
    "epoxy-dome": "Epoxy Dome",
  })[value] || value;
}

function nameBadgePriceChartHtml() {
  const quantities = NAME_BADGE_BASE_PRICE_BREAKS.map((priceBreak) => priceBreak.minimumQuantity);
  const quantityLabels = ["1-9", "10-24", "25-49", "50-99", "100-249", "250-499", "500-999", "1000-1499"];
  const priceCell = (priceBreaks, quantity) => `$${priceForQuantity(priceBreaks, quantity, "Name badge").toFixed(2)}`;
  const row = (label, priceBreaks) => `<tr><th scope="row">${escapeHtml(label)}</th>${quantities.map((quantity) => `<td>${priceCell(priceBreaks, quantity)}</td>`).join("")}</tr>`;
  return `<div class="badge-price-chart" aria-label="Name badge quantity price chart">
    <h2>Quantity Pricing</h2>
    <div class="badge-price-chart__scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Option</th>
            ${quantityLabels.map((label) => `<th scope="col">${label}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${row("No Frame", NAME_BADGE_NO_FRAME_PRICE_BREAKS)}
          ${row("Silver / Gold Frame", NAME_BADGE_BASE_PRICE_BREAKS)}
          ${row("Magnetic add-on", NAME_BADGE_MAGNET_PRICE_BREAKS)}
          ${row("Epoxy Dome add-on", NAME_BADGE_DOME_PRICE_BREAKS)}
        </tbody>
      </table>
    </div>
    <p>Pin back is included. Quantities of 1500+ are by quote.</p>
  </div>`;
}

function publicAssetResponseHeaders(name) {
  return name.toLowerCase().endsWith(".png")
    ? "image/png"
    : "application/octet-stream";
}

function buildNameBadgeInput(formData) {
  const quantity = Math.max(1, Math.floor(readPositiveNumber(formData.get("order_quantity"), "Quantity")));
  const frame = nameBadgeOption(formData, "badge_frame", ["no-frame", "silver-frame", "gold-frame"], "frame");
  const fastener = nameBadgeOption(formData, "badge_fastener", ["magnetic", "pin"], "fastener");
  const finish = nameBadgeOption(formData, "badge_finish", ["standard", "epoxy-dome"], "finish");
  const unitPrice = nameBadgeUnitPrice(quantity, frame, fastener, finish);
  return {
    quantity,
    unitPrice,
    totalPrice: Number((quantity * unitPrice).toFixed(2)),
    size: nameBadgeOption(formData, "badge_size", ["1x3", "1-5x3"], "badge size"),
    color: nameBadgeOption(formData, "badge_color", ["white", "brushed-gold", "brushed-silver"], "badge color"),
    frame,
    fastener,
    finish,
  };
}

async function readRequestBody(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new Error("Upload is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function requestFormData(req) {
  const body = await readRequestBody(req);
  const request = new Request(`${APP_BASE_URL}${req.url}`, {
    method: "POST",
    headers: { "content-type": req.headers["content-type"] || "" },
    body,
  });
  return request.formData();
}

async function saveUpload(file) {
  if (!file || typeof file === "string" || file.size === 0) return "";
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} exceeds the ${MAX_FILE_MB} MB artwork limit.`);
  const extension = extname(file.name).toLowerCase();
  if (!ALLOWED_FILE_EXTENSIONS.has(extension)) throw new Error(`${file.name} has an unsupported file type.`);
  const storedName = `${randomUUID()}${extension}`;
  await writeFile(join(UPLOAD_DIR, storedName), Buffer.from(await file.arrayBuffer()));
  return `${APP_BASE_URL}/uploads/${storedName}`;
}

async function getShopifyToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
    throw new Error("Shopify app credentials are not configured.");
  }

  const response = await fetch(`https://${SHOPIFY_SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
    }),
  });
  if (!response.ok) throw new Error(`Shopify token request failed (${response.status}).`);
  const payload = await response.json();
  cachedToken = payload.access_token;
  tokenExpiresAt = Date.now() + Number(payload.expires_in || 86_399) * 1000;
  return cachedToken;
}

async function shopifyGraphql(query, variables) {
  const response = await fetch(`https://${SHOPIFY_SHOP}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": await getShopifyToken(),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Shopify GraphQL request failed (${response.status}).`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join(" "));
  return payload.data;
}

function field(formData, name, maxLength = 500) {
  return cleanText(formData.get(name), maxLength);
}

function attribute(key, value) {
  return value ? { key, value } : null;
}

function deliveryMethodLabel(value) {
  if (value === "pickup-la-mesa") return "Pickup at La Mesa Street Side Pickup";
  if (value === "pickup-pine-valley") return "Pickup at Pine Valley";
  return "Ship";
}

function productHandle(value) {
  return cleanText(value, 255).replace(/^\/+/, "").split("?")[0].replace(/-+/g, "-");
}

function catalogPricingOverride(product) {
  const handle = productHandle(product.url);
  return CATALOG_PRICE_OVERRIDES.get(handle) || null;
}

function catalogAttributeIsHidden(product, attr) {
  const handle = productHandle(product.url);
  if (handle === "coroplast" && attr.key === "hot_size") return true;
  return handle === "table-top-banner-stand" && attr.key === "lamination";
}

function catalogOptionIsHidden(product, attr, option) {
  const handle = productHandle(product.url);
  if (["standard-retractable", "deluxe-retractable", "sd-retractable"].includes(handle) && attr.key === "led" && String(option.key) === "2") return true;
  if (handle === "step-repeat-backdrop" && attr.key === "size" && String(option.key) === "custom") return true;
  return false;
}

function normalizeCatalogValues(product, sourceValues) {
  const values = { ...sourceValues };
  const handle = productHandle(product.url);
  if (["standard-retractable", "deluxe-retractable", "sd-retractable"].includes(handle) && String(values.led) === "2") values.led = "1";
  if (handle === "step-repeat-backdrop" && String(values.size) === "custom") values.size = "120x96";
  if (handle === "coroplast") values.hot_size = "custom";
  return values;
}

function catalogDisplayTitle(product) {
  const handle = productHandle(product.url);
  if (handle === "coroplast") return "Coroplast / Yard Signs";
  return product.title;
}

function catalogAttributeLabel(product, attr) {
  const handle = productHandle(product.url);
  if (handle === "coroplast" && attr.key === "hardware") return "Yard Stake";
  if (!attr.label && ["flag_pole", "flag_pole_tab"].includes(attr.key)) return "Hardware";
  if (!attr.label && attr.key === "sign_h_stake_tab") return "Yard Sign Package";
  if (!attr.label && attr.key === "tent_hardware") return "Tent Package";
  if (!attr.label && attr.key === "tent_wall") return "Wall Type";
  if (!attr.label && attr.key === "design") return "Design";
  if (attr.key === "hardware" && attr.label && attr.label !== "Hardware") return attr.label;
  if (attr.key === "hardware") return "Package";
  return (attr.label || attr.key).replace(/\s+/g, " ").trim();
}

function catalogSizeAttribute(product) {
  return (product.attrs?.attrs || []).find((attr) => attr.component === "size") || null;
}

function catalogCustomSizeControl(product) {
  const sizeAttr = catalogSizeAttribute(product);
  const visibilityRule = (sizeAttr?.visible || []).find((rule) => rule.op === "=" && rule.key && rule.value);
  if (!visibilityRule) return null;

  const controller = (product.attrs?.attrs || []).find((attr) => attr.key === visibilityRule.key);
  if (!controller?.options?.length) return null;

  const presets = controller.options
    .filter((option) => /^\d+(\.\d+)?x\d+(\.\d+)?$/.test(String(option.key || "")))
    .map((option) => {
      const [width, height] = String(option.key).split("x").map((part) => Number(part) || 0);
      return {
        key: option.key,
        label: option.label || option.key,
        width,
        height,
        default: option.default === true,
      };
    });

  if (!presets.length) return null;
  return {
    key: controller.key,
    customValue: visibilityRule.value,
    presets,
  };
}

function defaultCatalogValues(product) {
  return Object.fromEntries((product.attrs?.attrs || []).flatMap((attr) => {
    const selected = (attr.options || []).find((option) => option.default === true);
    return selected ? [[attr.key, selected.key]] : [];
  }));
}

function sizeParts(value) {
  const [width, height] = String(value || "0x0").split("x").map((part) => Number(part) || 0);
  return { width, height, area: width * height, shortSide: Math.min(width, height), longSide: Math.max(width, height) };
}

function matchesCatalogRule(values, rule) {
  if (rule.op === "group") return matchesCatalogRules(values, rule.value || []);
  const actual = String(values[rule.key] ?? "");
  const expected = String(rule.value ?? "");
  if (rule.op === "=") return actual === expected;
  if (rule.op === "!=") return actual !== expected;
  const size = sizeParts(actual);
  const number = Number(expected);
  if (rule.op === "area<") return size.area < number;
  if (rule.op === "area>") return size.area > number;
  if (rule.op === "ss<") return size.shortSide < number;
  if (rule.op === "ss>") return size.shortSide > number;
  if (rule.op === "ls<") return size.longSide < number;
  if (rule.op === "ls>") return size.longSide > number;
  return true;
}

function matchesCatalogRules(values, rules) {
  return (rules || []).reduce((result, rule, index) => {
    const matches = matchesCatalogRule(values, rule);
    if (index === 0) return rule.logic === "and_not" ? !matches : matches;
    if (rule.logic === "or") return result || matches;
    if (rule.logic === "and_not") return result && !matches;
    return result && matches;
  }, true);
}

function applyCatalogActions(product, sourceValues) {
  const values = { ...sourceValues };
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false;
    for (const attr of product.attrs?.attrs || []) {
      for (const action of attr.action || []) {
        if (action.type !== "change" || !matchesCatalogRules(values, action.match)) continue;
        for (const change of action.change || []) {
          if (String(values[change.key] ?? "") === String(change.value ?? "")) continue;
          values[change.key] = change.value;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return values;
}

function catalogOptions(formData) {
  try {
    return JSON.parse(field(formData, "catalog_options", 20_000) || "{}");
  } catch {
    throw new Error("Product options could not be read.");
  }
}

function selectedCatalogAttributes(product, values) {
  const labels = new Set();
  return (product.attrs?.attrs || []).flatMap((attr) => {
    if (catalogAttributeIsHidden(product, attr)) return [];
    if (attr.component === "size" || attr.component === "hidden" || attr.component === "price_break") return [];
    const label = catalogAttributeLabel(product, attr);
    if (labels.has(label)) return [];
    labels.add(label);
    const selected = (attr.options || []).find((option) => String(option.key) === String(values[attr.key]));
    return selected?.label ? [attribute(label, selected.label)] : [];
  }).filter(Boolean);
}

function cookieHeader(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  return cookies.map((cookie) => cookie.split(";")[0]).filter(Boolean).join("; ");
}

function cookieValue(cookie, name) {
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function oldCatalogVersion(markup) {
  const encoded = markup.match(/data-page="([^"]+)"/)?.[1];
  if (!encoded) throw new Error("Old catalog session could not be prepared.");
  const payload = JSON.parse(decodeURIComponent(Buffer.from(encoded, "base64").toString("utf8")));
  return payload.version || payload.props?.version;
}

async function quoteCatalogProduct(product, quantity, values) {
  const pageResponse = await fetch(`${OLD_CATALOG_BASE_URL}${product.url}`);
  if (!pageResponse.ok) throw new Error(`Old catalog session failed (${pageResponse.status}).`);
  const markup = await pageResponse.text();
  const cookie = cookieHeader(pageResponse);
  const xsrfToken = cookieValue(cookie, "XSRF-TOKEN");
  const version = oldCatalogVersion(markup);
  const response = await fetch(`${OLD_CATALOG_BASE_URL}/item/quote`, {
    method: "POST",
    headers: {
      "Accept": "text/html, application/xhtml+xml",
      "Content-Type": "application/json",
      "Cookie": cookie,
      "Referer": `${OLD_CATALOG_BASE_URL}${product.url}`,
      "X-Inertia": "true",
      "X-Inertia-Version": version,
      "X-Requested-With": "XMLHttpRequest",
      "X-XSRF-TOKEN": xsrfToken,
    },
    body: JSON.stringify({ id: product.id, quantity: String(quantity), values }),
  });
  if (!response.ok) throw new Error(`Old catalog quote failed (${response.status}).`);
  const payload = await response.json();
  const quote = payload.props?.quoteResult?.quote?.[0];
  if (!quote || !Number.isFinite(Number(quote.unit_price))) throw new Error("Select valid product options to calculate the price.");
  return { unitPrice: Number(quote.unit_price), quoteResult: payload.props.quoteResult };
}

function adjustedCatalogUnitPrice(product, input, quotedUnitPrice) {
  let unitPrice = quotedUnitPrice;
  const handle = productHandle(product.url);
  if (handle === "coroplast" && String(input.values?.hardware || "") === "1") {
    unitPrice = Number((unitPrice + 1.9).toFixed(2));
  }

  const override = catalogPricingOverride(product);
  if (!override?.squareFootRate || !input.squareFeetEach) return unitPrice;

  const oldRate = Number(product.sqft || 0);
  if (!oldRate) return unitPrice;

  const minimum = Number(product.minimum || 0);
  const oldBasePrice = Math.max(minimum, input.squareFeetEach * oldRate);
  const newBasePrice = Math.max(minimum, input.squareFeetEach * override.squareFootRate);
  return Number(Math.max(0, unitPrice - oldBasePrice + newBasePrice).toFixed(2));
}

function buildCatalogQuoteInput(product, quantity, rawValues, formData) {
  let values = normalizeCatalogValues(product, { ...defaultCatalogValues(product), ...rawValues });
  const hasSize = (product.attrs?.attrs || []).some((attr) => attr.component === "size");
  if (hasSize) {
    const width = readPositiveNumber(formData.get("width"), "Width");
    const height = readPositiveNumber(formData.get("height"), "Height");
    const units = field(formData, "units") === "inches" ? "inches" : "feet";
    const inchesWide = units === "inches" ? width : width * 12;
    const inchesHigh = units === "inches" ? height : height * 12;
    values._size = `${inchesWide}x${inchesHigh}`;
    values = normalizeCatalogValues(product, applyCatalogActions(product, values));
    return { values, width, height, units, squareFeetEach: (inchesWide * inchesHigh) / 144 };
  }
  return { values: normalizeCatalogValues(product, applyCatalogActions(product, values)), width: 0, height: 0, units: "feet", squareFeetEach: 0 };
}

async function handleCatalogProduct(req, res, url) {
  const product = catalogByHandle.get(productHandle(url.searchParams.get("handle")));
  if (!product) return json(res, 404, { error: "This catalog product is not configured." }, corsHeaders(req));
  const labels = new Set();
  const hasCustomSize = (product.attrs?.attrs || []).some((attr) => attr.component === "size");
  const override = catalogPricingOverride(product);
  const squareFootRate = override?.squareFootRate || Number(product.sqft || 0);
  const attrs = (product.attrs?.attrs || [])
    .filter((attr) => attr.component !== "size" && attr.component !== "hidden" && attr.component !== "price_break")
    .filter((attr) => !catalogAttributeIsHidden(product, attr))
    .filter((attr) => {
      const label = catalogAttributeLabel(product, attr);
      if (labels.has(label)) return false;
      labels.add(label);
      return true;
    })
    .map((attr) => ({
      key: attr.key,
      label: catalogAttributeLabel(product, attr),
      component: attr.component || "select",
      visible: attr.visible || null,
      options: (attr.options || [])
        .filter((option) => option.visible !== false && option.label)
        .filter((option) => option.component !== "option_group")
        .filter((option) => !catalogOptionIsHidden(product, attr, option))
        .map((option) => ({
          key: option.key,
          label: option.label || option.key,
          default: option.default === true,
          visible: option.visible || null,
        })),
    }));
  return json(res, 200, {
    id: product.id,
    title: catalogDisplayTitle(product),
    hasCustomSize,
    usesSquareFootPricing: squareFootRate > 0,
    squareFootRate,
    minimumPrice: Number(product.minimum || 0),
    customSizeControl: catalogCustomSizeControl(product),
    attrs,
  }, corsHeaders(req));
}

async function handleCatalogPrice(req, res) {
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: "Origin is not allowed." });
  const formData = await requestFormData(req);
  const product = catalogByHandle.get(productHandle(formData.get("product_handle")));
  if (!product) throw new Error("This catalog product is not configured.");
  const quantity = Math.max(1, Math.floor(readPositiveNumber(formData.get("order_quantity"), "Quantity")));
  const input = buildCatalogQuoteInput(product, quantity, catalogOptions(formData), formData);
  const quote = await quoteCatalogProduct(product, quantity, input.values);
  const unitPrice = adjustedCatalogUnitPrice(product, input, quote.unitPrice);
  return json(res, 200, { unitPrice, totalPrice: Number((unitPrice * quantity).toFixed(2)), squareFeetEach: input.squareFeetEach }, corsHeaders(req));
}

async function handleNameBadgePrice(req, res) {
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: "Origin is not allowed." });

  const formData = await requestFormData(req);
  const input = buildNameBadgeInput(formData);
  return json(res, 200, {
    unitPrice: input.unitPrice,
    totalPrice: input.totalPrice,
    priceBreaks: NAME_BADGE_BASE_PRICE_BREAKS,
    noFramePriceBreaks: NAME_BADGE_NO_FRAME_PRICE_BREAKS,
    magnetPriceBreaks: NAME_BADGE_MAGNET_PRICE_BREAKS,
    domePriceBreaks: NAME_BADGE_DOME_PRICE_BREAKS,
  }, corsHeaders(req));
}

function buildAttributes(formData, artworkUrls) {
  return [
    attribute("Banner Size", field(formData, "banner_size")),
    attribute("Square Footage Each", field(formData, "square_footage_each")),
    attribute("Total Square Footage", field(formData, "total_square_footage")),
    attribute("Material", "13oz vinyl"),
    attribute("Included Finishing", "Hemmed with grommets every 2 ft"),
    attribute("Delivery Method", deliveryMethodLabel(field(formData, "delivery_method"))),
    attribute("Banner Type", field(formData, "banner_type")),
    attribute("Sport", field(formData, "sport")),
    attribute("League Name", field(formData, "league_name")),
    attribute("Age Group", field(formData, "age_group")),
    attribute("Team Name", field(formData, "team_name")),
    attribute("Team Colors", field(formData, "team_colors")),
    attribute("Players Names and Numbers", field(formData, "players", 1500)),
    attribute("Coaches Names", field(formData, "coaches")),
    attribute("Team Parents / Volunteers", field(formData, "volunteers")),
    attribute("Youth Design Ideas", field(formData, "youth_design_ideas", 1000)),
    attribute("Banner Description", field(formData, "banner_description", 1500)),
    attribute("Need-by Date", field(formData, "need_by")),
    attribute("Phone", field(formData, "phone")),
    attribute("Notes", field(formData, "notes", 1500)),
    attribute("Youth Print-ready Artwork", artworkUrls.youthArtwork),
    attribute("Youth Design Idea Image", artworkUrls.youthIdeaImage),
    attribute("Standard Print-ready Art File", artworkUrls.standardArtwork),
    attribute("Standard Example / Banner Element", artworkUrls.standardIdeaImage),
  ].filter(Boolean);
}

function buildBannerDesignAttributes(formData, artworkUrls) {
  return [
    attribute("Banner Type", field(formData, "banner_type")),
    attribute("Sport", field(formData, "sport")),
    attribute("League Name", field(formData, "league_name")),
    attribute("Age Group", field(formData, "age_group")),
    attribute("Team Name", field(formData, "team_name")),
    attribute("Team Colors", field(formData, "team_colors")),
    attribute("Players Names and Numbers", field(formData, "players", 1500)),
    attribute("Coaches Names", field(formData, "coaches")),
    attribute("Team Parents / Volunteers", field(formData, "volunteers")),
    attribute("Youth Design Ideas", field(formData, "youth_design_ideas", 1000)),
    attribute("Banner Description", field(formData, "banner_description", 1500)),
    attribute("Youth Print-ready Artwork", artworkUrls.youthArtwork),
    attribute("Youth Design Idea Image", artworkUrls.youthIdeaImage),
    attribute("Standard Print-ready Art File", artworkUrls.standardArtwork),
    attribute("Standard Example / Banner Element", artworkUrls.standardIdeaImage),
  ].filter(Boolean);
}

async function createDraftOrder(input) {
  const mutation = `#graphql
    mutation CreateBannerDraftOrder($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          invoiceUrl
        }
        userErrors {
          field
          message
        }
      }
    }`;

  const data = await shopifyGraphql(mutation, { input });
  const result = data.draftOrderCreate;
  if (result.userErrors?.length) throw new Error(result.userErrors.map((error) => error.message).join(" "));
  if (!result.draftOrder?.invoiceUrl) throw new Error("Shopify did not return a secure checkout URL.");
  return result.draftOrder;
}

async function handleCheckout(req, res) {
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: "Origin is not allowed." });

  const formData = await requestFormData(req);
  const width = readPositiveNumber(formData.get("width"), "Width");
  const height = readPositiveNumber(formData.get("height"), "Height");
  const units = field(formData, "units") === "inches" ? "inches" : "feet";
  const quantity = Math.max(1, Math.floor(readPositiveNumber(formData.get("order_quantity"), "Quantity")));
  const maxWidth = units === "inches" ? 1740 : 145;
  const maxHeight = units === "inches" ? 120 : 10;
  if (width > maxWidth || height > maxHeight) throw new Error("Banner dimensions exceed the 145 ft wide x 10 ft tall maximum.");

  const squareFeetEach = units === "inches" ? (width * height) / 144 : width * height;
  const unitPrice = Number((squareFeetEach * 2.5).toFixed(2));
  const totalPrice = Number((unitPrice * quantity).toFixed(2));
  const unitLabel = units === "inches" ? "in" : "ft";
  const deliveryMethod = deliveryMethodLabel(field(formData, "delivery_method"));
  const isPickup = deliveryMethod !== "Ship";

  const artworkUrls = {
    youthArtwork: await saveUpload(formData.get("youth_artwork")),
    youthIdeaImage: await saveUpload(formData.get("youth_idea_image")),
    standardArtwork: await saveUpload(formData.get("standard_artwork")),
    standardIdeaImage: await saveUpload(formData.get("standard_idea_image")),
  };

  formData.set("banner_size", `${width} ${unitLabel} x ${height} ${unitLabel}`);
  formData.set("square_footage_each", `${squareFeetEach.toFixed(2)} sq ft`);
  formData.set("total_square_footage", `${(squareFeetEach * quantity).toFixed(2)} sq ft`);
  const attributes = buildAttributes(formData, artworkUrls);
  const email = field(formData, "email", 320);
  if (!email || !email.includes("@")) throw new Error("Enter a valid email address.");

  const orderRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    email,
    quantity,
    unitPrice,
    totalPrice,
    deliveryMethod,
    attributes,
    artworkUrls,
  };
  await writeFile(join(ORDER_DIR, `${orderRecord.id}.json`), JSON.stringify(orderRecord, null, 2));

  if (MOCK_SHOPIFY) {
    res.writeHead(303, { Location: `${APP_BASE_URL}/mock-checkout?id=${encodeURIComponent(orderRecord.id)}` });
    return res.end();
  }

  const draftOrder = await createDraftOrder({
    email,
    note: `Recognition Direct banner configuration ${orderRecord.id}. Delivery method: ${deliveryMethod}.`,
    tags: ["custom-banner", "proof-required", isPickup ? field(formData, "delivery_method") : "ship"],
    allowDiscountCodesInCheckout: true,
    lineItems: [{
      title: "Custom 13oz Vinyl Banner",
      quantity,
      originalUnitPriceWithCurrency: { amount: unitPrice.toFixed(2), currencyCode: "USD" },
      requiresShipping: !isPickup,
      taxable: true,
      customAttributes: attributes,
    }],
    customAttributes: [
      { key: "Configuration ID", value: orderRecord.id },
      { key: "Proof Required", value: "Yes" },
      { key: "Delivery Method", value: deliveryMethod },
    ],
  });

  orderRecord.shopifyDraftOrderId = draftOrder.id;
  orderRecord.checkoutUrl = draftOrder.invoiceUrl;
  await writeFile(join(ORDER_DIR, `${orderRecord.id}.json`), JSON.stringify(orderRecord, null, 2));
  res.writeHead(303, { Location: draftOrder.invoiceUrl });
  res.end();
}

async function handleCatalogCheckout(req, res) {
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: "Origin is not allowed." });

  const formData = await requestFormData(req);
  const handle = productHandle(formData.get("product_handle"));
  const product = catalogByHandle.get(handle);
  if (!product) throw new Error("This catalog product is not configured.");

  const quantity = Math.max(1, Math.floor(readPositiveNumber(formData.get("order_quantity"), "Quantity")));
  const input = buildCatalogQuoteInput(product, quantity, catalogOptions(formData), formData);
  const { values, width, height, units, squareFeetEach } = input;
  const quote = await quoteCatalogProduct(product, quantity, values);
  const unitPrice = adjustedCatalogUnitPrice(product, input, quote.unitPrice);
  const totalPrice = Number((unitPrice * quantity).toFixed(2));
  const deliveryMethod = deliveryMethodLabel(field(formData, "delivery_method"));
  const isPickup = deliveryMethod !== "Ship";
  const artworkUrl = await saveUpload(formData.get("artwork"));
  const bannerArtworkUrls = {
    youthArtwork: await saveUpload(formData.get("youth_artwork")),
    youthIdeaImage: await saveUpload(formData.get("youth_idea_image")),
    standardArtwork: await saveUpload(formData.get("standard_artwork")),
    standardIdeaImage: await saveUpload(formData.get("standard_idea_image")),
  };
  const email = field(formData, "email", 320);
  if (!email || !email.includes("@")) throw new Error("Enter a valid email address.");

  const unitLabel = units === "inches" ? "in" : "ft";
  const attributes = [
    attribute("Configured Product", catalogDisplayTitle(product)),
    attribute("Original Catalog URL", `https://recognition-direct.bs.run${product.url}`),
    attribute("Product Size", squareFeetEach > 0 ? `${width} ${unitLabel} x ${height} ${unitLabel}` : ""),
    attribute("Square Footage Each", squareFeetEach > 0 ? `${squareFeetEach.toFixed(2)} sq ft` : ""),
    ...selectedCatalogAttributes(product, values),
    attribute("Delivery Method", deliveryMethod),
    attribute("Need-by Date", field(formData, "need_by")),
    attribute("Phone", field(formData, "phone")),
    attribute("Notes", field(formData, "notes", 1500)),
    attribute("Artwork", artworkUrl),
    ...buildBannerDesignAttributes(formData, bannerArtworkUrls),
  ].filter(Boolean);

  const orderRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    productHandle: handle,
    productTitle: catalogDisplayTitle(product),
    email,
    quantity,
    unitPrice,
    totalPrice,
    deliveryMethod,
    attributes,
    artworkUrl,
    bannerArtworkUrls,
  };
  await writeFile(join(ORDER_DIR, `${orderRecord.id}.json`), JSON.stringify(orderRecord, null, 2));

  if (MOCK_SHOPIFY) {
    res.writeHead(303, { Location: `${APP_BASE_URL}/mock-checkout?id=${encodeURIComponent(orderRecord.id)}` });
    return res.end();
  }

  const draftOrder = await createDraftOrder({
    email,
    note: `Recognition Direct catalog configuration ${orderRecord.id}. Delivery method: ${deliveryMethod}.`,
    tags: ["catalog-configuration", "proof-required", handle, isPickup ? field(formData, "delivery_method") : "ship"],
    allowDiscountCodesInCheckout: true,
    lineItems: [{
      title: catalogDisplayTitle(product),
      quantity,
      originalUnitPriceWithCurrency: { amount: unitPrice.toFixed(2), currencyCode: "USD" },
      requiresShipping: !isPickup,
      taxable: true,
      customAttributes: attributes,
    }],
    customAttributes: [
      { key: "Configuration ID", value: orderRecord.id },
      { key: "Proof Required", value: "Yes" },
      { key: "Delivery Method", value: deliveryMethod },
    ],
  });

  orderRecord.shopifyDraftOrderId = draftOrder.id;
  orderRecord.checkoutUrl = draftOrder.invoiceUrl;
  await writeFile(join(ORDER_DIR, `${orderRecord.id}.json`), JSON.stringify(orderRecord, null, 2));
  res.writeHead(303, { Location: draftOrder.invoiceUrl });
  res.end();
}

async function handleNameBadgeCheckout(req, res) {
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: "Origin is not allowed." });

  const formData = await requestFormData(req);
  const input = buildNameBadgeInput(formData);
  const deliveryMethod = deliveryMethodLabel(field(formData, "delivery_method"));
  const isPickup = deliveryMethod !== "Ship";
  const artworkUrl = await saveUpload(formData.get("artwork"));
  const namesFileUrl = await saveUpload(formData.get("names_file"));
  const email = field(formData, "email", 320);
  const expressOne = formData.get("express_one") === "yes";
  if (!email || !email.includes("@")) throw new Error("Enter a valid email address.");

  const attributes = [
    attribute("Product", "Name Badges"),
    attribute("Badge Size", nameBadgeLabel(input.size)),
    attribute("Badge Color", nameBadgeLabel(input.color)),
    attribute("Frame", nameBadgeLabel(input.frame)),
    attribute("Fastener", nameBadgeLabel(input.fastener)),
    attribute("Finish", nameBadgeLabel(input.finish)),
    attribute("Delivery Method", deliveryMethod),
    attribute("Express One", expressOne ? "Yes - hold extra badge stock and ship releases as needed" : "No"),
    attribute("Names / Badge Text", field(formData, "badge_names", 3000)),
    attribute("Names File", namesFileUrl),
    attribute("Need-by Date", field(formData, "need_by")),
    attribute("Phone", field(formData, "phone")),
    attribute("Notes", field(formData, "notes", 1500)),
    attribute("Artwork", artworkUrl),
  ].filter(Boolean);

  const orderRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    productHandle: "name-badges",
    productTitle: "Name Badges",
    email,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    totalPrice: input.totalPrice,
    deliveryMethod,
    expressOne,
    attributes,
    artworkUrl,
    namesFileUrl,
  };
  await writeFile(join(ORDER_DIR, `${orderRecord.id}.json`), JSON.stringify(orderRecord, null, 2));

  if (MOCK_SHOPIFY) {
    res.writeHead(303, { Location: `${APP_BASE_URL}/mock-checkout?id=${encodeURIComponent(orderRecord.id)}` });
    return res.end();
  }

  const draftOrder = await createDraftOrder({
    email,
    note: `Recognition Direct name badge order ${orderRecord.id}. Delivery method: ${deliveryMethod}.`,
    tags: ["name-badges", "proof-required", isPickup ? field(formData, "delivery_method") : "ship"],
    allowDiscountCodesInCheckout: true,
    lineItems: [{
      title: "Name Badges",
      quantity: input.quantity,
      originalUnitPriceWithCurrency: { amount: input.unitPrice.toFixed(2), currencyCode: "USD" },
      requiresShipping: !isPickup,
      taxable: true,
      customAttributes: attributes,
    }],
    customAttributes: [
      { key: "Configuration ID", value: orderRecord.id },
      { key: "Proof Required", value: "Yes" },
      { key: "Delivery Method", value: deliveryMethod },
    ],
  });

  orderRecord.shopifyDraftOrderId = draftOrder.id;
  orderRecord.checkoutUrl = draftOrder.invoiceUrl;
  await writeFile(join(ORDER_DIR, `${orderRecord.id}.json`), JSON.stringify(orderRecord, null, 2));
  res.writeHead(303, { Location: draftOrder.invoiceUrl });
  res.end();
}

async function handleCustomNameBadgeInquiry(req, res) {
  const formData = await requestFormData(req);
  const email = field(formData, "email", 320);
  if (!email || !email.includes("@")) throw new Error("Enter a valid email address.");
  const artworkUrl = await saveUpload(formData.get("artwork"));
  const inquiry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    type: "custom-name-badge-inquiry",
    name: field(formData, "name"),
    company: field(formData, "company"),
    email,
    phone: field(formData, "phone"),
    estimatedQuantity: field(formData, "estimated_quantity"),
    requestedSize: field(formData, "requested_size"),
    requestedColor: field(formData, "requested_color"),
    framePreference: field(formData, "frame_preference"),
    fastenerPreference: field(formData, "fastener_preference"),
    finishPreference: field(formData, "finish_preference"),
    needBy: field(formData, "need_by"),
    notes: field(formData, "notes", 2500),
    artworkUrl,
  };
  await writeFile(join(ORDER_DIR, `${inquiry.id}.json`), JSON.stringify(inquiry, null, 2));
  res.writeHead(303, { Location: `${APP_BASE_URL}/custom-name-badges/thanks?id=${encodeURIComponent(inquiry.id)}` });
  res.end();
}

async function handleSolarPlacardInquiry(req, res) {
  const formData = await requestFormData(req);
  const email = field(formData, "email", 320);
  if (!email || !email.includes("@")) throw new Error("Enter a valid email address.");
  const product = solarProductByKey.get(field(formData, "product_key", 80));
  if (!product) throw new Error("Select a solar placard or plate.");
  const quantity = Math.max(1, Math.floor(Number.parseFloat(field(formData, "order_quantity")) || 1));
  const planUrl = await saveUpload(formData.get("plan_file"));
  const artworkUrl = await saveUpload(formData.get("artwork"));
  const unitPrice = Number.isFinite(product.unitPrice) ? product.unitPrice : null;
  const totalPrice = unitPrice === null ? null : Number((unitPrice * quantity).toFixed(2));
  const inquiry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    type: "solar-placard-request",
    productKey: product.key,
    productTitle: product.title,
    productType: product.type,
    size: product.size,
    quantity,
    unitPrice,
    totalPrice,
    customWidth: field(formData, "custom_width"),
    customHeight: field(formData, "custom_height"),
    plateText: field(formData, "plate_text", 3000),
    name: field(formData, "name"),
    company: field(formData, "company"),
    email,
    phone: field(formData, "phone"),
    deliveryMethod: deliveryMethodLabel(field(formData, "delivery_method")),
    needBy: field(formData, "need_by"),
    notes: field(formData, "notes", 2500),
    planUrl,
    artworkUrl,
  };
  await writeFile(join(ORDER_DIR, `${inquiry.id}.json`), JSON.stringify(inquiry, null, 2));
  res.writeHead(303, { Location: `${APP_BASE_URL}/solar-placards/thanks?id=${encodeURIComponent(inquiry.id)}` });
  res.end();
}

async function handleUpload(req, res, pathname) {
  const name = pathname.slice("/uploads/".length);
  if (!/^[a-f0-9-]+\.(pdf|ai|eps|psd|jpg|jpeg|png|txt|csv)$/i.test(name)) return json(res, 404, { error: "Not found." });
  try {
    const bytes = await readFile(join(UPLOAD_DIR, name));
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"` });
    res.end(bytes);
  } catch {
    json(res, 404, { error: "Not found." });
  }
}

async function servePublicFile(res, name, contentType) {
  try {
    const bytes = await readFile(join(PUBLIC_DIR, name));
    res.writeHead(200, { "Content-Type": contentType });
    res.end(bytes);
  } catch {
    json(res, 404, { error: "Not found." });
  }
}

function nameBadgePageHtml() {
  const priceBreakText = NAME_BADGE_BASE_PRICE_BREAKS.length
    ? NAME_BADGE_BASE_PRICE_BREAKS.map((priceBreak) => `${priceBreak.minimumQuantity}+ framed badges: $${priceBreak.unitPrice.toFixed(2)} each`).join(" | ")
    : "Quantity pricing is not configured yet.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Name Badges | Recognition Direct</title>
  <meta name="description" content="Order custom name badges from Recognition Direct with size, badge color, frame, and fastener options.">
  <style>
    :root{--ink:#18212f;--muted:#5d6675;--line:#d9dee7;--accent:#c6262e;--blue:#3154b8}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:var(--ink);font:16px/1.45 Arial,Helvetica,sans-serif}
    .wrap{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:38px 0 46px}
    .hero{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:28px;align-items:start}
    .art{min-width:0;min-height:420px;border:1px solid var(--line);border-radius:8px;background:linear-gradient(135deg,#f8fafc,#e9eef7);display:grid;gap:18px;align-content:start;justify-items:center;padding:24px;overflow:hidden}
    .badge-preview{width:min(620px,100%);text-align:center}
    .badge-preview img{display:block;width:100%;height:auto;border-radius:8px;box-shadow:0 18px 45px rgba(24,33,47,.16)}
    .badge-preview span{display:block;margin-top:10px;color:var(--muted)}
    .badge-price-chart{width:100%;min-width:0;border:1px solid var(--line);border-radius:8px;background:#fff;padding:14px;text-align:left}
    .badge-price-chart h2{margin:0 0 10px;font-size:20px;line-height:1.2}
    .badge-price-chart__scroll{width:100%;max-width:100%;overflow-x:auto}
    .badge-price-chart table{width:100%;min-width:600px;border-collapse:collapse;font-size:12px}
    .badge-price-chart th,.badge-price-chart td{padding:7px 7px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
    .badge-price-chart th:first-child,.badge-price-chart td:first-child{text-align:left}
    .badge-price-chart thead th{background:#f1f5ff;color:var(--ink);font-weight:800}
    .badge-price-chart tbody th{font-weight:800}
    .badge-price-chart p{margin:10px 0 0;color:var(--muted);font-size:13px}
    h1{margin:0 0 10px;font-size:clamp(34px,5vw,58px);line-height:1}
    .intro{margin:0 0 20px;color:var(--muted);font-size:18px}
    form{display:grid;gap:16px}
    .panel{border:1px solid var(--line);border-radius:8px;padding:18px;background:#fff}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    label,legend{display:block;margin:0 0 6px;font-size:13px;font-weight:800;color:#344055}
    input,select,textarea{width:100%;min-height:44px;border:1px solid #b9c3d2;border-radius:4px;padding:10px;font:inherit}
    input[type="checkbox"]{width:auto;min-height:0;padding:0}
    .choice{display:flex;gap:10px;align-items:center;margin:0;font-size:15px;color:var(--ink)}
    .choice span{font-weight:900}
    textarea{min-height:112px;resize:vertical}
    .full{grid-column:1/-1}
    .price{border-radius:8px;background:var(--ink);color:#fff;padding:18px}
    .price small{color:#d7dde8;text-transform:uppercase;font-weight:800;letter-spacing:.05em}
    .total{margin:6px 0;font-size:42px;font-weight:900;line-height:1}
    .note{margin:8px 0 0;color:var(--muted);font-size:13px}
    .price .note{color:#d7dde8}
    .actions{display:grid;gap:10px}
    button{min-height:50px;border:0;border-radius:4px;background:var(--accent);color:#fff;font:inherit;font-weight:900;cursor:pointer}
    button:disabled{background:#98a1af;cursor:not-allowed}
    .status{min-height:22px;color:var(--muted);font-size:14px}
    @media(max-width:820px){.hero,.grid{grid-template-columns:1fr}.art{min-height:260px}}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="hero">
      <div class="art" aria-label="Name badge preview">
        <div class="badge-preview">
          <img data-badge-preview src="${APP_BASE_URL}/assets/name-badges/1x3-white-no-frame.png" alt="Selected name badge preview" width="902" height="303">
          <span data-badge-preview-caption>White 1&quot; x 3&quot; badge with no frame</span>
        </div>
        ${nameBadgePriceChartHtml()}
      </div>
      <div>
        <p class="note">Recognition Direct</p>
        <h1>Name Badges</h1>
        <p class="intro">Order custom name badges with your choice of size, badge color, frame, and fastener. You will receive a proof before production.</p>

        <form id="badge-form" action="${APP_BASE_URL}/api/name-badge-checkout" method="post" enctype="multipart/form-data">
          <div class="panel grid">
            <div>
              <label for="order_quantity">Quantity</label>
              <input id="order_quantity" name="order_quantity" type="number" min="1" step="1" value="1" required>
            </div>
            <div class="full">
              <label class="choice">
                <input type="checkbox" name="express_one" value="yes">
                <span>Use Express One for this order</span>
              </label>
              <p class="note">Order a larger quantity now to receive the quantity discount. We produce and hold your extra badge stock, then ship badges as your team needs them. Express One orders receive priority production. Shipping for later releases is invoiced after those badges are sent.</p>
            </div>
            <div>
              <label for="badge_size">Size</label>
              <select id="badge_size" name="badge_size">
                <option value="1x3">1&quot; x 3&quot;</option>
                <option value="1-5x3">1.5&quot; x 3&quot;</option>
              </select>
            </div>
            <div>
              <label for="badge_color">Color</label>
              <select id="badge_color" name="badge_color">
                <option value="white">White</option>
                <option value="brushed-gold">Brushed Gold</option>
                <option value="brushed-silver">Brushed Silver</option>
              </select>
            </div>
            <div>
              <label for="badge_frame">Frame</label>
              <select id="badge_frame" name="badge_frame">
                <option value="no-frame">No Frame</option>
                <option value="silver-frame">Silver Frame</option>
                <option value="gold-frame">Gold Frame</option>
              </select>
            </div>
            <div>
              <label for="badge_finish">Finish</label>
              <select id="badge_finish" name="badge_finish">
                <option value="standard">Standard</option>
                <option value="epoxy-dome">Epoxy Dome Finish</option>
              </select>
            </div>
            <div>
              <label for="badge_fastener">Fastener</label>
              <select id="badge_fastener" name="badge_fastener">
                <option value="magnetic">Magnetic</option>
                <option value="pin">Pin</option>
              </select>
            </div>
            <div>
              <label for="delivery_method">Delivery</label>
              <select id="delivery_method" name="delivery_method">
                <option value="ship">Ship</option>
                <option value="pickup-la-mesa">Pickup at La Mesa</option>
                <option value="pickup-pine-valley">Pickup at Pine Valley</option>
              </select>
            </div>
            <div class="full">
              <p class="note">Custom sizes and colors are available by request. <a href="${APP_BASE_URL}/custom-name-badges">Tell us what you need</a>.</p>
            </div>
            <div class="full">
              <label for="badge_names">Names / badge text</label>
              <textarea id="badge_names" name="badge_names" placeholder="One badge per line. Example:&#10;Roth Ward - Owner&#10;Jane Smith - Sales"></textarea>
            </div>
            <div>
              <label for="names_file">Names file upload</label>
              <input id="names_file" name="names_file" type="file" accept=".txt,.csv,text/plain,text/csv">
            </div>
            <div>
              <label for="artwork">Logo / artwork upload</label>
              <input id="artwork" name="artwork" type="file" accept=".pdf,.ai,.eps,.psd,.jpg,.jpeg,.png">
            </div>
            <div>
              <label for="need_by">Need-by date</label>
              <input id="need_by" name="need_by" type="date">
            </div>
          </div>

          <div class="panel grid">
            <div>
              <label for="email">Email</label>
              <input id="email" name="email" type="email" required>
            </div>
            <div>
              <label for="phone">Phone</label>
              <input id="phone" name="phone" type="tel">
            </div>
            <div class="full">
              <label for="notes">Notes</label>
              <textarea id="notes" name="notes" placeholder="Tell us about layout, font, logo placement, or anything else we should know."></textarea>
            </div>
          </div>

          <div class="price">
            <small>Estimated total</small>
            <div class="total" data-total>$0.00</div>
            <p class="note" data-price-note>${escapeHtml(priceBreakText)}</p>
          </div>

          <div class="actions">
            <button type="submit" ${NAME_BADGE_BASE_PRICE_BREAKS.length ? "" : "disabled"}>Add name badges to checkout</button>
            <div class="status" data-status></div>
          </div>
        </form>
      </div>
    </div>
  </main>
  <script>
    const form = document.querySelector('#badge-form');
    const total = document.querySelector('[data-total]');
    const status = document.querySelector('[data-status]');
    const button = form.querySelector('button');
    const preview = document.querySelector('[data-badge-preview]');
    const previewCaption = document.querySelector('[data-badge-preview-caption]');
    const previewImages = {
      '1x3|white|no-frame': '1x3-white-no-frame.png',
      '1x3|white|gold-frame': '1x3-white-gold-frame.png',
      '1x3|white|silver-frame': '1x3-white-silver-frame.png',
      '1x3|brushed-gold|no-frame': '1x3-brushed-gold-no-frame.png',
      '1x3|brushed-gold|gold-frame': '1x3-brushed-gold-gold-frame.png',
      '1x3|brushed-silver|no-frame': '1x3-brushed-silver-no-frame.png',
      '1x3|brushed-silver|silver-frame': '1x3-brushed-silver-silver-frame.png',
      '1-5x3|white|no-frame': '1-5x3-white-no-frame.png',
      '1-5x3|white|gold-frame': '1-5x3-white-gold-frame.png',
      '1-5x3|white|silver-frame': '1-5x3-white-silver-frame.png',
      '1-5x3|brushed-gold|no-frame': '1-5x3-brushed-gold-no-frame.png',
      '1-5x3|brushed-gold|gold-frame': '1-5x3-brushed-gold-gold-frame.png',
      '1-5x3|brushed-silver|no-frame': '1-5x3-brushed-silver-no-frame.png',
      '1-5x3|brushed-silver|silver-frame': '1-5x3-brushed-silver-silver-frame.png'
    };
    const labels = {
      '1x3': '1" x 3"',
      '1-5x3': '1.5" x 3"',
      white: 'White',
      'brushed-gold': 'Brushed Gold',
      'brushed-silver': 'Brushed Silver',
      'no-frame': 'No Frame',
      'gold-frame': 'Gold Frame',
      'silver-frame': 'Silver Frame'
    };
    function updatePreview() {
      const size = form.elements.badge_size.value;
      const color = form.elements.badge_color.value;
      const frame = form.elements.badge_frame.value;
      const key = [size, color, frame].join('|');
      const fallbackKey = [size, color, 'no-frame'].join('|');
      const file = previewImages[key] || previewImages[fallbackKey] || previewImages['1x3|white|no-frame'];
      preview.src = '${APP_BASE_URL}/assets/name-badges/' + file;
      preview.alt = labels[color] + ' ' + labels[size] + ' badge preview, ' + labels[frame];
      previewCaption.textContent = labels[color] + ' ' + labels[size] + ' badge, ' + labels[frame];
    }
    async function price() {
      updatePreview();
      status.textContent = 'Checking price...';
      try {
        const response = await fetch('${APP_BASE_URL}/api/name-badge-price', { method: 'POST', body: new FormData(form) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Price unavailable');
        total.textContent = '$' + payload.totalPrice.toFixed(2);
        status.textContent = '$' + payload.unitPrice.toFixed(2) + ' each based on quantity.';
        button.disabled = false;
      } catch (error) {
        total.textContent = '$0.00';
        status.textContent = error.message || 'Pricing is not available yet.';
        button.disabled = true;
      }
    }
    form.addEventListener('input', price);
    form.addEventListener('change', price);
    updatePreview();
    price();
  </script>
</body>
</html>`;
}

function customNameBadgePageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Custom Name Badge Request | Recognition Direct</title>
  <meta name="description" content="Request custom name badges in special sizes, colors, or finishes from Recognition Direct.">
  <style>
    :root{--ink:#18212f;--muted:#5d6675;--line:#d9dee7;--accent:#c6262e;--blue:#3154b8}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:var(--ink);font:16px/1.45 Arial,Helvetica,sans-serif}
    .wrap{width:min(920px,calc(100% - 32px));margin:0 auto;padding:42px 0 52px}
    .eyebrow{margin:0 0 8px;color:var(--accent);font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    h1{margin:0;font-size:clamp(34px,5vw,56px);line-height:1}
    .intro{margin:14px 0 24px;color:var(--muted);font-size:18px}
    form{display:grid;gap:16px}
    .panel{border:1px solid var(--line);border-radius:8px;padding:18px;background:#fff}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .full{grid-column:1/-1}
    label{display:block;margin:0 0 6px;font-size:13px;font-weight:800;color:#344055}
    input,select,textarea{width:100%;min-height:44px;border:1px solid #b9c3d2;border-radius:4px;padding:10px;font:inherit}
    textarea{min-height:130px;resize:vertical}
    button{min-height:50px;border:0;border-radius:4px;background:var(--accent);color:#fff;font:inherit;font-weight:900;cursor:pointer}
    .back{display:inline-block;margin-top:18px;color:var(--blue)}
    @media(max-width:760px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="wrap">
    <p class="eyebrow">Recognition Direct</p>
    <h1>Custom Name Badge Request</h1>
    <p class="intro">Use this form for custom badge sizes, custom colors, or badge requests that need review before pricing. This form does not create a checkout.</p>
    <form action="${APP_BASE_URL}/api/custom-name-badge-inquiry" method="post" enctype="multipart/form-data">
      <div class="panel grid">
        <div>
          <label for="name">Name</label>
          <input id="name" name="name" required>
        </div>
        <div>
          <label for="company">Company</label>
          <input id="company" name="company">
        </div>
        <div>
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required>
        </div>
        <div>
          <label for="phone">Phone</label>
          <input id="phone" name="phone" type="tel">
        </div>
        <div>
          <label for="estimated_quantity">Estimated quantity</label>
          <input id="estimated_quantity" name="estimated_quantity" type="number" min="1" step="1">
        </div>
        <div>
          <label for="need_by">Need-by date</label>
          <input id="need_by" name="need_by" type="date">
        </div>
      </div>

      <div class="panel grid">
        <div>
          <label for="requested_size">Requested size</label>
          <input id="requested_size" name="requested_size" placeholder='Example: 2" x 3"'>
        </div>
        <div>
          <label for="requested_color">Requested color</label>
          <input id="requested_color" name="requested_color" placeholder="Example: Black, red, brushed copper">
        </div>
        <div>
          <label for="frame_preference">Frame preference</label>
          <select id="frame_preference" name="frame_preference">
            <option value="">No preference</option>
            <option>No Frame</option>
            <option>Silver Frame</option>
            <option>Gold Frame</option>
          </select>
        </div>
        <div>
          <label for="fastener_preference">Fastener preference</label>
          <select id="fastener_preference" name="fastener_preference">
            <option value="">No preference</option>
            <option>Magnetic</option>
            <option>Pin</option>
          </select>
        </div>
        <div>
          <label for="finish_preference">Finish preference</label>
          <select id="finish_preference" name="finish_preference">
            <option value="">No preference</option>
            <option>Standard</option>
            <option>Epoxy Dome</option>
          </select>
        </div>
        <div>
          <label for="artwork">Logo / artwork upload</label>
          <input id="artwork" name="artwork" type="file" accept=".pdf,.ai,.eps,.psd,.jpg,.jpeg,.png">
        </div>
        <div class="full">
          <label for="notes">What do you need?</label>
          <textarea id="notes" name="notes" placeholder="Tell us about badge size, color, layout, logo placement, and any special requirements."></textarea>
        </div>
      </div>

      <button type="submit">Send custom badge request</button>
    </form>
    <a class="back" href="${APP_BASE_URL}/name-badges">Back to standard name badges</a>
  </main>
</body>
</html>`;
}

function customNameBadgeThanksHtml(url) {
  const id = escapeHtml(url.searchParams.get("id") || "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Custom Name Badge Request Sent | Recognition Direct</title>
  <style>body{margin:0;font:16px/1.45 Arial,Helvetica,sans-serif;color:#18212f}.wrap{width:min(760px,calc(100% - 32px));margin:0 auto;padding:56px 0}.box{border:1px solid #d9dee7;border-radius:8px;padding:24px}h1{margin:0 0 12px;font-size:38px;line-height:1}p{color:#5d6675}.button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;margin-top:10px;padding:0 18px;background:#3154b8;color:#fff;text-decoration:none;border-radius:4px;font-weight:800}</style>
</head>
<body>
  <main class="wrap">
    <div class="box">
      <h1>Request sent</h1>
      <p>Thank you. Your custom name badge request has been saved for review. We will follow up with pricing before any checkout is created.</p>
      ${id ? `<p>Request ID: ${id}</p>` : ""}
      <a class="button" href="${APP_BASE_URL}/name-badges">Back to name badges</a>
    </div>
  </main>
</body>
</html>`;
}

function solarProductCardsHtml(products) {
  return products.map((product) => `
    <button class="product-card${product.featured ? " featured" : ""}" type="button" data-product-key="${escapeHtml(product.key)}">
      ${product.featured ? '<span class="pill">Featured</span>' : ""}
      <img src="${APP_BASE_URL}/assets/solar-placards/${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy">
      <strong>${escapeHtml(product.title)}</strong>
      <em>${Number.isFinite(product.unitPrice) ? `$${product.unitPrice.toFixed(2)}` : "Price review required"}</em>
      <small>${product.type === "placard" ? "Upload PDF plan sheet/design" : "Enter requested plate text"}</small>
    </button>
  `).join("");
}

function solarPlacardsPageHtml() {
  const featured = SOLAR_PLACARD_PRODUCTS.filter((product) => product.type === "placard" && product.featured);
  const otherPlacards = SOLAR_PLACARD_PRODUCTS.filter((product) => product.type === "placard" && !product.featured);
  const plates = SOLAR_PLACARD_PRODUCTS.filter((product) => product.type === "plate");
  const first = SOLAR_PLACARD_PRODUCTS[0];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Solar Placards | Recognition Direct</title>
  <meta name="description" content="Order solar placards and engraved solar plates from Recognition Direct. Upload PDF plans or enter custom plate text.">
  <style>
    :root{--ink:#18212f;--muted:#5d6675;--line:#d9dee7;--accent:#c6262e;--blue:#3154b8;--soft:#f5f7fb}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:var(--ink);font:16px/1.45 Arial,Helvetica,sans-serif}
    .wrap{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:38px 0 48px}
    .eyebrow{margin:0 0 8px;color:var(--accent);font-size:13px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    h1{margin:0;font-size:clamp(36px,5vw,62px);line-height:1}
    h2{margin:0 0 14px;font-size:24px;line-height:1.2}
    h3{margin:28px 0 12px;font-size:20px}
    .intro{max-width:760px;margin:14px 0 26px;color:var(--muted);font-size:18px}
    .layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(380px,.95fr);gap:24px;align-items:start}
    .panel{border:1px solid var(--line);border-radius:8px;background:#fff;padding:18px}
    .gallery{background:linear-gradient(135deg,#fff,#eef2f8)}
    .product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .product-card{position:relative;display:grid;gap:8px;width:100%;min-height:170px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:12px;text-align:left;cursor:pointer}
    .product-card:hover,.product-card.active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
    .product-card img{display:block;width:100%;height:112px;object-fit:contain;background:#ef2d32;border-radius:4px}
    .product-card strong{font-size:15px;line-height:1.2}
    .product-card em{color:var(--accent);font-style:normal;font-weight:900}
    .product-card small{color:var(--muted);font-size:12px}
    .pill{position:absolute;top:10px;left:10px;z-index:1;border-radius:999px;background:#18212f;color:#fff;padding:4px 8px;font-size:11px;font-weight:900;text-transform:uppercase}
    .selected{display:grid;gap:14px}
    .preview{display:block;width:100%;max-height:360px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#ef2d32}
    form{display:grid;gap:16px}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .full{grid-column:1/-1}
    label{display:block;margin:0 0 6px;font-size:13px;font-weight:900;color:#344055}
    input,select,textarea{width:100%;min-height:44px;border:1px solid #b9c3d2;border-radius:4px;padding:10px;font:inherit;background:#fff}
    textarea{min-height:112px;resize:vertical}
    .note{margin:8px 0 0;color:var(--muted);font-size:13px}
    .price-note{border-radius:8px;background:#18212f;color:#fff;padding:16px}
    .price-note strong{display:block;margin-bottom:4px}
    .price-note span{color:#d7dde8}
    .estimate{border-radius:8px;background:#18212f;color:#fff;padding:16px}
    .estimate small{display:block;color:#d7dde8;text-transform:uppercase;font-weight:900;letter-spacing:.05em}
    .estimate strong{display:block;margin:4px 0;font-size:34px;line-height:1}
    .estimate span{color:#d7dde8}
    button.submit{min-height:50px;border:0;border-radius:4px;background:var(--accent);color:#fff;font:inherit;font-weight:900;cursor:pointer}
    [hidden]{display:none!important}
    @media(max-width:920px){.layout{grid-template-columns:1fr}.product-grid{grid-template-columns:1fr 1fr}}
    @media(max-width:560px){.product-grid,.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="wrap">
    <p class="eyebrow">Recognition Direct</p>
    <h1>Solar Placards</h1>
    <p class="intro">Choose a solar placard size and upload the PDF plan sheet that contains the design, or choose a solar plate and enter the text you want printed. Pricing will be confirmed after review until the final price list is added.</p>

    <div class="layout">
      <section class="panel gallery" aria-label="Solar placard products">
        <h2>Featured Solar Placards</h2>
        <div class="product-grid">${solarProductCardsHtml(featured)}</div>
        <h3>Other Solar Placards</h3>
        <div class="product-grid">${solarProductCardsHtml(otherPlacards)}</div>
        <h3>Solar Plates</h3>
        <div class="product-grid">${solarProductCardsHtml(plates)}</div>
      </section>

      <section class="selected">
        <img class="preview" data-preview src="${APP_BASE_URL}/assets/solar-placards/${escapeHtml(first.image)}" alt="${escapeHtml(first.title)}">
        <form action="${APP_BASE_URL}/api/solar-placard-request" method="post" enctype="multipart/form-data" data-solar-form>
          <input type="hidden" name="product_key" value="${escapeHtml(first.key)}">
          <div class="panel grid">
            <div class="full">
              <label for="selected_product">Selected item</label>
              <input id="selected_product" data-selected-title value="${escapeHtml(first.title)}" readonly>
              <p class="note" data-selected-instruction>Upload the PDF plan sheet that contains the placard design.</p>
            </div>
            <div>
              <label for="order_quantity">Quantity</label>
              <input id="order_quantity" name="order_quantity" type="number" min="1" step="1" value="1" required>
            </div>
            <div>
              <label for="delivery_method">Delivery</label>
              <select id="delivery_method" name="delivery_method">
                <option value="ship">Ship</option>
                <option value="pickup-la-mesa">Pickup at La Mesa</option>
                <option value="pickup-pine-valley">Pickup at Pine Valley</option>
              </select>
            </div>
            <div data-custom-size hidden>
              <label for="custom_width">Custom width in inches</label>
              <input id="custom_width" name="custom_width" type="number" min="0.1" step="0.1">
            </div>
            <div data-custom-size hidden>
              <label for="custom_height">Custom height in inches</label>
              <input id="custom_height" name="custom_height" type="number" min="0.1" step="0.1">
            </div>
            <div class="full" data-placard-upload>
              <label for="plan_file">PDF plan sheet / placard design</label>
              <input id="plan_file" name="plan_file" type="file" accept=".pdf,application/pdf">
              <p class="note">Upload the plan sheet that shows the placard layout and required labeling.</p>
            </div>
            <div class="full" data-plate-text hidden>
              <label for="plate_text">Plate text</label>
              <textarea id="plate_text" name="plate_text" placeholder="Type the exact text you would like on the plate."></textarea>
            </div>
            <div class="full">
              <label for="artwork">Additional artwork or reference file</label>
              <input id="artwork" name="artwork" type="file" accept=".pdf,.ai,.eps,.psd,.jpg,.jpeg,.png">
            </div>
          </div>

          <div class="panel grid">
            <div>
              <label for="name">Name</label>
              <input id="name" name="name" required>
            </div>
            <div>
              <label for="company">Company</label>
              <input id="company" name="company">
            </div>
            <div>
              <label for="email">Email</label>
              <input id="email" name="email" type="email" required>
            </div>
            <div>
              <label for="phone">Phone</label>
              <input id="phone" name="phone" type="tel">
            </div>
            <div>
              <label for="need_by">Need-by date</label>
              <input id="need_by" name="need_by" type="date">
            </div>
            <div class="full">
              <label for="notes">Notes</label>
              <textarea id="notes" name="notes" placeholder="Tell us anything else we should know about the solar placard or plate."></textarea>
            </div>
          </div>

          <div class="estimate">
            <small data-price-label>Pricing review required</small>
            <strong data-price-total>Quote</strong>
            <span data-price-message>Submit this request and we will confirm pricing. Once the price list is added, this page can send customers directly to checkout.</span>
          </div>
          <button class="submit" type="submit">Send solar request</button>
        </form>
      </section>
    </div>
  </main>
  <script>
    const products = ${JSON.stringify(SOLAR_PLACARD_PRODUCTS)};
    const form = document.querySelector('[data-solar-form]');
    const cards = [...document.querySelectorAll('[data-product-key]')];
    const preview = document.querySelector('[data-preview]');
    const selectedTitle = document.querySelector('[data-selected-title]');
    const selectedInstruction = document.querySelector('[data-selected-instruction]');
    const customSizeFields = [...document.querySelectorAll('[data-custom-size]')];
    const placardUpload = document.querySelector('[data-placard-upload]');
    const plateText = document.querySelector('[data-plate-text]');
    const priceLabel = document.querySelector('[data-price-label]');
    const priceTotal = document.querySelector('[data-price-total]');
    const priceMessage = document.querySelector('[data-price-message]');
    let selectedProduct = products[0];
    function money(value) {
      return '$' + Number(value).toFixed(2);
    }
    function updatePrice() {
      const quantity = Math.max(1, Number.parseInt(form.elements.order_quantity.value || '1', 10));
      if (Number.isFinite(selectedProduct.unitPrice)) {
        priceLabel.textContent = money(selectedProduct.unitPrice) + ' each';
        priceTotal.textContent = money(selectedProduct.unitPrice * quantity);
        priceMessage.textContent = 'Estimated total based on selected item and quantity. You will receive a proof before production.';
      } else {
        priceLabel.textContent = 'Pricing review required';
        priceTotal.textContent = 'Quote';
        priceMessage.textContent = 'Submit this request and we will confirm pricing. Once the price list is added, this page can send customers directly to checkout.';
      }
    }
    function selectProduct(key) {
      const product = products.find((entry) => entry.key === key) || products[0];
      selectedProduct = product;
      form.elements.product_key.value = product.key;
      selectedTitle.value = product.title;
      preview.src = '${APP_BASE_URL}/assets/solar-placards/' + product.image;
      preview.alt = product.title;
      selectedInstruction.textContent = product.type === 'placard'
        ? 'Upload the PDF plan sheet that contains the placard design.'
        : 'Type the exact text you would like on the plate.';
      placardUpload.hidden = product.type !== 'placard';
      plateText.hidden = product.type !== 'plate';
      customSizeFields.forEach((field) => { field.hidden = product.key !== 'plate-custom'; });
      cards.forEach((card) => card.classList.toggle('active', card.dataset.productKey === product.key));
      updatePrice();
    }
    cards.forEach((card) => card.addEventListener('click', () => selectProduct(card.dataset.productKey)));
    form.elements.order_quantity.addEventListener('input', updatePrice);
    selectProduct('${escapeHtml(first.key)}');
  </script>
</body>
</html>`;
}

function solarPlacardsThanksHtml(url) {
  const id = escapeHtml(url.searchParams.get("id") || "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Solar Request Sent | Recognition Direct</title>
  <style>body{margin:0;font:16px/1.45 Arial,Helvetica,sans-serif;color:#18212f}.wrap{width:min(760px,calc(100% - 32px));margin:0 auto;padding:56px 0}.box{border:1px solid #d9dee7;border-radius:8px;padding:24px}h1{margin:0 0 12px;font-size:38px;line-height:1}p{color:#5d6675}.button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;margin-top:10px;padding:0 18px;background:#3154b8;color:#fff;text-decoration:none;border-radius:4px;font-weight:800}</style>
</head>
<body>
  <main class="wrap">
    <div class="box">
      <h1>Solar request sent</h1>
      <p>Thank you. Your solar placard or plate request has been saved for review. We will follow up with pricing before any checkout is created.</p>
      ${id ? `<p>Request ID: ${id}</p>` : ""}
      <a class="button" href="${APP_BASE_URL}/solar-placards">Back to Solar Placards</a>
    </div>
  </main>
</body>
</html>`;
}

async function handleMockCheckout(res, url) {
  const id = url.searchParams.get("id") || "";
  try {
    const order = JSON.parse(await readFile(join(ORDER_DIR, `${id}.json`), "utf8"));
    html(res, 200, `<!doctype html>
      <html><head><meta charset="utf-8"><title>Mock Shopify Checkout</title>
      <style>body{font:16px Arial;margin:40px;color:#18212f}.box{max-width:680px;border:1px solid #d9dee7;padding:24px;border-radius:8px}dt{font-weight:700}dd{margin:0 0 10px}</style></head>
      <body><div class="box"><h1>Mock Shopify Checkout</h1><p>Local verification only. Production redirects to Shopify payment.</p>
      <dl><dt>Item</dt><dd>Custom 13oz Vinyl Banner</dd><dt>Quantity</dt><dd>${order.quantity}</dd>
      <dt>Unit price</dt><dd>$${order.unitPrice.toFixed(2)}</dd><dt>Total</dt><dd>$${order.totalPrice.toFixed(2)}</dd>
      <dt>Delivery method</dt><dd>${escapeHtml(order.deliveryMethod || "Ship")}</dd>
      <dt>Email</dt><dd>${escapeHtml(order.email)}</dd></dl></div></body></html>`);
  } catch {
    json(res, 404, { error: "Not found." });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", APP_BASE_URL);
  try {
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/catalog-")) return json(res, 204, {}, corsHeaders(req));
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/name-badge-")) return json(res, 204, {}, corsHeaders(req));
    if (req.method === "GET" && url.pathname === "/api/catalog-product") return await handleCatalogProduct(req, res, url);
    if (req.method === "POST" && url.pathname === "/api/catalog-price") return await handleCatalogPrice(req, res);
    if (req.method === "POST" && url.pathname === "/api/name-badge-price") return await handleNameBadgePrice(req, res);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/custom-13oz-vinyl-banner")) {
      return await servePublicFile(res, "custom-13oz-vinyl-banner.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/name-badges") return html(res, 200, nameBadgePageHtml());
    if (req.method === "GET" && url.pathname === "/custom-name-badges") return html(res, 200, customNameBadgePageHtml());
    if (req.method === "GET" && url.pathname === "/custom-name-badges/thanks") return html(res, 200, customNameBadgeThanksHtml(url));
    if (req.method === "GET" && url.pathname === "/solar-placards") return html(res, 200, solarPlacardsPageHtml());
    if (req.method === "GET" && url.pathname === "/solar-placards/thanks") return html(res, 200, solarPlacardsThanksHtml(url));
    if (req.method === "GET" && /^\/assets\/name-badges\/[a-z0-9.-]+\.png$/i.test(url.pathname)) {
      return await servePublicFile(res, url.pathname.slice("/assets/".length), publicAssetResponseHeaders(url.pathname));
    }
    if (req.method === "GET" && /^\/assets\/solar-placards\/[a-z0-9.-]+\.png$/i.test(url.pathname)) {
      return await servePublicFile(res, url.pathname.slice("/assets/".length), publicAssetResponseHeaders(url.pathname));
    }
    if (req.method === "GET" && url.pathname === "/assets/full-color-banner-eye.png") {
      return await servePublicFile(res, "full-color-banner-eye.png", "image/png");
    }
    if (req.method === "GET" && url.pathname.startsWith("/uploads/")) return await handleUpload(req, res, url.pathname);
    if (req.method === "GET" && url.pathname === "/mock-checkout") return await handleMockCheckout(res, url);
    if (req.method === "POST" && url.pathname === "/api/banner-checkout") return await handleCheckout(req, res);
    if (req.method === "POST" && url.pathname === "/api/catalog-checkout") return await handleCatalogCheckout(req, res);
    if (req.method === "POST" && url.pathname === "/api/name-badge-checkout") return await handleNameBadgeCheckout(req, res);
    if (req.method === "POST" && url.pathname === "/api/custom-name-badge-inquiry") return await handleCustomNameBadgeInquiry(req, res);
    if (req.method === "POST" && url.pathname === "/api/solar-placard-request") return await handleSolarPlacardInquiry(req, res);
    return json(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    return json(res, 400, { error: error.message || "Unable to create checkout." });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Recognition Direct banner checkout listening on ${APP_BASE_URL}`);
});
