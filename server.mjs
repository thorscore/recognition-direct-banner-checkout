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
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "https://recognition-direct.com,https://www.recognition-direct.com,https://recognition-direct.bs.run,http://localhost:4173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
ALLOWED_ORIGINS.add(APP_BASE_URL);
const ALLOWED_FILE_EXTENSIONS = new Set([".pdf", ".ai", ".eps", ".psd", ".jpg", ".jpeg", ".png"]);

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
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} exceeds the 20 MB artwork limit.`);
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

async function shopifyRest(pathname, options = {}) {
  const response = await fetch(`https://${SHOPIFY_SHOP}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": await getShopifyToken(),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Shopify REST request failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
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
    if (attr.component === "size" || attr.component === "hidden") return [];
    const label = attr.label || attr.key;
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

function buildCatalogQuoteInput(product, quantity, rawValues, formData) {
  let values = { ...defaultCatalogValues(product), ...rawValues };
  const hasSize = (product.attrs?.attrs || []).some((attr) => attr.component === "size");
  if (hasSize) {
    const width = readPositiveNumber(formData.get("width"), "Width");
    const height = readPositiveNumber(formData.get("height"), "Height");
    const units = field(formData, "units") === "inches" ? "inches" : "feet";
    const inchesWide = units === "inches" ? width : width * 12;
    const inchesHigh = units === "inches" ? height : height * 12;
    values._size = `${inchesWide}x${inchesHigh}`;
    values = applyCatalogActions(product, values);
    return { values, width, height, units, squareFeetEach: (inchesWide * inchesHigh) / 144 };
  }
  return { values: applyCatalogActions(product, values), width: 0, height: 0, units: "feet", squareFeetEach: 0 };
}

async function handleCatalogProduct(req, res, url) {
  const product = catalogByHandle.get(productHandle(url.searchParams.get("handle")));
  if (!product) return json(res, 404, { error: "This catalog product is not configured." }, corsHeaders(req));
  const labels = new Set();
  const hasCustomSize = (product.attrs?.attrs || []).some((attr) => attr.component === "size");
  const attrs = (product.attrs?.attrs || [])
    .filter((attr) => attr.component !== "size" && attr.component !== "hidden")
    .filter((attr) => {
      const label = attr.label || attr.key;
      if (labels.has(label)) return false;
      labels.add(label);
      return true;
    })
    .map((attr) => ({
      key: attr.key,
      label: attr.label || attr.key,
      component: attr.component || "select",
      options: (attr.options || [])
        .filter((option) => option.visible !== false && option.label)
        .map((option) => ({ key: option.key, label: option.label || option.key, default: option.default === true })),
    }));
  return json(res, 200, { id: product.id, title: product.title, hasCustomSize, usesSquareFootPricing: Number(product.sqft || 0) > 0, attrs }, corsHeaders(req));
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
  return json(res, 200, { unitPrice: quote.unitPrice, totalPrice: Number((quote.unitPrice * quantity).toFixed(2)), squareFeetEach: input.squareFeetEach }, corsHeaders(req));
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
  const { unitPrice } = await quoteCatalogProduct(product, quantity, values);
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
    attribute("Configured Product", product.title),
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
    productTitle: product.title,
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
      title: product.title,
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

async function handleRetargetCatalogTemplate(req, res, url) {
  if (url.searchParams.get("key") !== "8b3057fb03fc4f778c03e09ad5f7e0f6") {
    return json(res, 404, { error: "Not found." });
  }

  const data = await shopifyGraphql(`
    query CatalogProductsForTemplateUpdate($query: String!) {
      products(first: 250, query: $query) {
        nodes {
          id
          title
          handle
          status
        }
      }
    }
  `, { query: "tag:catalog-migration" });

  const updated = [];
  const failed = [];
  for (const product of data.products.nodes) {
    try {
      const numericId = product.id.split("/").pop();
      const result = await shopifyRest(`/products/${numericId}.json`, {
        method: "PUT",
        body: JSON.stringify({
          product: {
            id: Number(numericId),
            template_suffix: "catalog-configurator-v2",
          },
        }),
      });
      updated.push({
        id: result.product?.id,
        title: result.product?.title,
        handle: result.product?.handle,
        template_suffix: result.product?.template_suffix,
      });
    } catch (error) {
      failed.push({ title: product.title, handle: product.handle, error: error.message });
    }
  }

  return json(res, 200, {
    found: data.products.nodes.length,
    updated: updated.length,
    failed,
    sample: updated.slice(0, 10),
  });
}

async function handleUpload(req, res, pathname) {
  const name = pathname.slice("/uploads/".length);
  if (!/^[a-f0-9-]+\.(pdf|ai|eps|psd|jpg|jpeg|png)$/i.test(name)) return json(res, 404, { error: "Not found." });
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
    if (req.method === "GET" && url.pathname === "/api/catalog-product") return await handleCatalogProduct(req, res, url);
    if (req.method === "POST" && url.pathname === "/api/catalog-price") return await handleCatalogPrice(req, res);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/custom-13oz-vinyl-banner")) {
      return await servePublicFile(res, "custom-13oz-vinyl-banner.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/assets/full-color-banner-eye.png") {
      return await servePublicFile(res, "full-color-banner-eye.png", "image/png");
    }
    if (req.method === "GET" && url.pathname.startsWith("/uploads/")) return await handleUpload(req, res, url.pathname);
    if (req.method === "GET" && url.pathname === "/mock-checkout") return await handleMockCheckout(res, url);
    if (req.method === "POST" && url.pathname === "/api/banner-checkout") return await handleCheckout(req, res);
    if (req.method === "POST" && url.pathname === "/api/catalog-checkout") return await handleCatalogCheckout(req, res);
    if (req.method === "POST" && url.pathname === "/internal/retarget-catalog-template") return await handleRetargetCatalogTemplate(req, res, url);
    return json(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    return json(res, 400, { error: error.message || "Unable to create checkout." });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Recognition Direct banner checkout listening on ${APP_BASE_URL}`);
});
