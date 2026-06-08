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
const PREMIER_AWARDS_FILE = join(import.meta.dirname, "catalog", "premier-baseball-softball-resin-trophies.json");
const PREMIER_SOCCER_AWARDS_FILE = join(import.meta.dirname, "catalog", "premier-soccer-resin-trophies.json");
const PREMIER_ACRYLIC_AWARDS_FILE = join(import.meta.dirname, "catalog", "premier-acrylic-awards.json");
const PREMIER_AWARD_PLAQUES_FILE = join(import.meta.dirname, "catalog", "premier-award-plaques.json");
const PREMIER_EXECUTIVE_AWARDS_FILE = join(import.meta.dirname, "catalog", "premier-executive-awards.json");
const PREMIER_GLASS_CRYSTAL_AWARDS_FILE = join(import.meta.dirname, "catalog", "premier-glass-crystal-awards.json");
const PREMIER_AWARD_CLOCKS_FILE = join(import.meta.dirname, "catalog", "premier-award-clocks.json");
const PREMIER_OFFICE_ACCESSORIES_FILE = join(import.meta.dirname, "catalog", "premier-office-accessories.json");
const PREMIER_CUTTING_BOARDS_FILE = join(import.meta.dirname, "catalog", "premier-cutting-boards.json");
const PREMIER_BISON_RIVER_KNIVES_FILE = join(import.meta.dirname, "catalog", "premier-bison-river-knives.json");
const PREMIER_AWARD_DRINKWARE_FILE = join(import.meta.dirname, "catalog", "premier-award-drinkware.json");
const POLAR_CAMEL_FILE = join(import.meta.dirname, "catalog", "polar-camel.json");
const OLD_CATALOG_BASE_URL = "https://recognition-direct.bs.run";
const UPLOAD_DIR = join(DATA_DIR, "uploads");
const ORDER_DIR = join(DATA_DIR, "orders");
const EXPRESS_ONE_FILE = join(DATA_DIR, "express-one-customers.json");
const EXPRESS_ONE_RELEASE_DIR = join(DATA_DIR, "express-one-releases");
const EXPRESS_ONE_EMAIL_DIR = join(DATA_DIR, "express-one-email-queue");
const EXPRESS_ONE_SHIPPING_ESTIMATE = 12.95;
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
  { key: "plate-1x4", title: '1" x 4" Solar Plate', type: "plate", size: '1" x 4"', image: "plate-any-text-4x1.png", unitPrice: 4 },
  { key: "plate-1-5x4", title: '1.5" x 4" Solar Plate', type: "plate", size: '1.5" x 4"', image: "plate-any-text-4x1-5.png", unitPrice: 4.5 },
  { key: "plate-1-5x6", title: '1.5" x 6" Solar Plate', type: "plate", size: '1.5" x 6"', image: "plate-any-text-6x1-5.png", unitPrice: 5 },
  { key: "plate-2x6", title: '2" x 6" Solar Plate', type: "plate", size: '2" x 6"', image: "plate-any-text-6x2.png", unitPrice: 6 },
  { key: "plate-3x6", title: '3" x 6" Solar Plate', type: "plate", size: '3" x 6"', image: "plate-any-text-6x3.png", unitPrice: 8 },
  { key: "plate-4x4", title: '4" x 4" Solar Plate', type: "plate", size: '4" x 4"', image: "plate-any-text-4x4.png", unitPrice: 8 },
  { key: "plate-custom", title: "Custom Solar Plate Size", type: "plate", size: "Custom", image: "plate-any-text-6x2.png" },
];
const SOLAR_CUSTOM_PLATE_SQUARE_INCH_RATE = 0.5;
const SOLAR_CUSTOM_PLATE_MAX_LONG_SIDE_INCHES = 24;
const SOLAR_CUSTOM_PLATE_MAX_SHORT_SIDE_INCHES = 12;
const solarProductByKey = new Map(SOLAR_PLACARD_PRODUCTS.map((product) => [product.key, product]));

let cachedToken = SHOPIFY_ACCESS_TOKEN;
let tokenExpiresAt = SHOPIFY_ACCESS_TOKEN ? Number.POSITIVE_INFINITY : 0;

await mkdir(UPLOAD_DIR, { recursive: true });
await mkdir(ORDER_DIR, { recursive: true });
await mkdir(EXPRESS_ONE_RELEASE_DIR, { recursive: true });
await mkdir(EXPRESS_ONE_EMAIL_DIR, { recursive: true });
const catalogData = JSON.parse((await readFile(CATALOG_FILE, "utf8")).replace(/^\uFEFF/, ""));
const premierAwardsData = JSON.parse((await readFile(PREMIER_AWARDS_FILE, "utf8")).replace(/^\uFEFF/, ""));
const premierSoccerAwardsData = JSON.parse((await readFile(PREMIER_SOCCER_AWARDS_FILE, "utf8")).replace(/^\uFEFF/, ""));
const premierAcrylicAwardsData = JSON.parse((await readFile(PREMIER_ACRYLIC_AWARDS_FILE, "utf8")).replace(/^\uFEFF/, ""));
const premierAwardPlaquesData = JSON.parse((await readFile(PREMIER_AWARD_PLAQUES_FILE, "utf8")).replace(/^\uFEFF/, ""));
const premierExecutiveAwardsData = JSON.parse((await readFile(PREMIER_EXECUTIVE_AWARDS_FILE, "utf8")).replace(/^\uFEFF/, ""));
const premierGlassCrystalAwardsData = JSON.parse((await readFile(PREMIER_GLASS_CRYSTAL_AWARDS_FILE, "utf8")).replace(/^\uFEFF/, ""));
const premierAwardClocksData = JSON.parse((await readFile(PREMIER_AWARD_CLOCKS_FILE, "utf8")).replace(/^\uFEFF/, ""));
const premierOfficeAccessoriesData = JSON.parse((await readFile(PREMIER_OFFICE_ACCESSORIES_FILE, "utf8")).replace(/^\uFEFF/, ""));
const premierCuttingBoardsData = JSON.parse((await readFile(PREMIER_CUTTING_BOARDS_FILE, "utf8")).replace(/^\uFEFF/, ""));
const premierBisonRiverKnivesData = JSON.parse((await readFile(PREMIER_BISON_RIVER_KNIVES_FILE, "utf8")).replace(/^\uFEFF/, ""));
const premierAwardDrinkwareData = JSON.parse((await readFile(PREMIER_AWARD_DRINKWARE_FILE, "utf8")).replace(/^\uFEFF/, ""));
const polarCamelData = JSON.parse((await readFile(POLAR_CAMEL_FILE, "utf8")).replace(/^\uFEFF/, ""));
const catalogByHandle = new Map(catalogData.products.map((product) => [
  product.url.replace(/^\/+/, "").split("?")[0].replace(/-+/g, "-"),
  product,
]));
const premierAwardCatalogs = new Map([
  ["baseball-softball", {
    id: "baseball-softball",
    route: "/baseball-softball-resin-trophies",
    title: "Baseball / Softball Resin Trophies",
    metaDescription: "Order personalized Baseball and Softball resin trophies with proof before production from Recognition Direct.",
    intro: "Choose a trophy, enter your personalization, and checkout online. We will send a proof before production.",
    galleryLabel: "Baseball and Softball trophy products",
    selectError: "Select a Baseball / Softball trophy.",
    orderType: "premier-baseball-softball-award-order",
    noteLabel: "Baseball / Softball trophy",
    tags: ["baseball-softball-trophies", "proof-required", "jds-premier"],
    products: premierAwardsData.products || [],
  }],
  ["soccer", {
    id: "soccer",
    route: "/soccer-resin-trophies",
    title: "Soccer Resin Trophies",
    metaDescription: "Order personalized soccer resin trophies with proof before production from Recognition Direct.",
    intro: "Choose a soccer trophy, enter your plate wording, and checkout online. We will send a proof before production.",
    galleryLabel: "Soccer trophy products",
    selectError: "Select a soccer trophy.",
    orderType: "premier-soccer-award-order",
    noteLabel: "soccer trophy",
    tags: ["soccer-trophies", "proof-required", "jds-premier"],
    products: premierSoccerAwardsData.products || [],
  }],
  ["acrylic", {
    id: "acrylic",
    route: "/acrylic-awards",
    title: "Acrylic Awards",
    metaDescription: "Order personalized acrylic awards with proof before production from Recognition Direct.",
    intro: "Choose an acrylic award, enter your personalization, and checkout online. We will send a proof before production.",
    galleryLabel: "Acrylic award products",
    searchLabel: "Search acrylic awards",
    searchPlaceholder: "Search by name, style, option, or SKU",
    itemPlural: "awards",
    plateLabel: "Personalized award text",
    platePlaceholder: "Enter award plate or engraving text. Example:\nTop Sales 2026\nPresented to Jane Smith",
    notesPlaceholder: "Tell us anything else we should know about layout, deadline, logo placement, or award wording.",
    submitLabel: "Add acrylic awards to checkout",
    selectError: "Select an acrylic award.",
    orderType: "premier-acrylic-award-order",
    noteLabel: "acrylic award",
    tags: ["acrylic-awards", "proof-required", "jds-premier"],
    products: premierAcrylicAwardsData.products || [],
  }],
  ["plaques", {
    id: "plaques",
    route: "/award-plaques",
    title: "Plaques",
    metaDescription: "Order personalized award plaques with proof before production from Recognition Direct.",
    intro: "Choose a plaque, enter your personalization, and checkout online. We will send a proof before production.",
    galleryLabel: "Plaque products",
    searchLabel: "Search plaques",
    searchPlaceholder: "Search by name, style, option, or SKU",
    itemPlural: "plaques",
    plateLabel: "Personalized plaque text",
    platePlaceholder: "Enter plaque or engraving text. Example:\nEmployee of the Year\nPresented to Jane Smith",
    notesPlaceholder: "Tell us anything else we should know about layout, deadline, logo placement, or plaque wording.",
    submitLabel: "Add plaques to checkout",
    selectError: "Select a plaque.",
    orderType: "premier-award-plaque-order",
    noteLabel: "plaque",
    tags: ["award-plaques", "proof-required", "jds-premier"],
    products: premierAwardPlaquesData.products || [],
  }],
  ["executive-awards", {
    id: "executive-awards",
    route: "/executive-awards",
    title: "Executive Awards",
    metaDescription: "Order personalized executive awards with proof before production from Recognition Direct.",
    intro: "Choose an executive award, enter your personalization, and checkout online. We will send a proof before production.",
    galleryLabel: "Executive award products",
    searchLabel: "Search executive awards",
    searchPlaceholder: "Search by name, style, option, or SKU",
    itemPlural: "awards",
    plateLabel: "Personalized award text",
    platePlaceholder: "Enter award plate or engraving text. Example:\nLeadership Award\nPresented to Jane Smith",
    notesPlaceholder: "Tell us anything else we should know about layout, deadline, logo placement, or award wording.",
    submitLabel: "Add executive awards to checkout",
    selectError: "Select an executive award.",
    orderType: "premier-executive-award-order",
    noteLabel: "executive award",
    tags: ["executive-awards", "proof-required", "jds-premier"],
    products: premierExecutiveAwardsData.products || [],
  }],
  ["glass-crystal-awards", {
    id: "glass-crystal-awards",
    route: "/glass-crystal-awards",
    title: "Glass & Crystal Awards",
    metaDescription: "Order personalized glass and crystal awards with proof before production from Recognition Direct.",
    intro: "Choose a glass or crystal award, enter your personalization, and checkout online. We will send a proof before production.",
    galleryLabel: "Glass and crystal award products",
    searchLabel: "Search glass and crystal awards",
    searchPlaceholder: "Search by name, style, option, or SKU",
    itemPlural: "awards",
    plateLabel: "Personalized award text",
    platePlaceholder: "Enter award plate or engraving text. Example:\nExcellence Award\nPresented to Jane Smith",
    notesPlaceholder: "Tell us anything else we should know about layout, deadline, logo placement, or award wording.",
    submitLabel: "Add glass & crystal awards to checkout",
    selectError: "Select a glass or crystal award.",
    orderType: "premier-glass-crystal-award-order",
    noteLabel: "glass or crystal award",
    tags: ["glass-crystal-awards", "proof-required", "jds-premier"],
    products: premierGlassCrystalAwardsData.products || [],
  }],
  ["clocks", {
    id: "clocks",
    route: "/award-clocks",
    title: "Clocks",
    metaDescription: "Order personalized award clocks with proof before production from Recognition Direct.",
    intro: "Choose a clock, enter your personalization, and checkout online. We will send a proof before production.",
    galleryLabel: "Clock products",
    searchLabel: "Search clocks",
    searchPlaceholder: "Search by name, style, option, or SKU",
    itemPlural: "clocks",
    plateLabel: "Personalized clock text",
    platePlaceholder: "Enter clock plate or engraving text. Example:\nRetirement Award\nPresented to Jane Smith",
    notesPlaceholder: "Tell us anything else we should know about layout, deadline, logo placement, or clock wording.",
    submitLabel: "Add clocks to checkout",
    selectError: "Select a clock.",
    orderType: "premier-award-clock-order",
    noteLabel: "clock",
    tags: ["award-clocks", "proof-required", "jds-premier"],
    products: premierAwardClocksData.products || [],
  }],
  ["office-accessories", {
    id: "office-accessories",
    route: "/office-accessories",
    title: "Office Accessories",
    metaDescription: "Order personalized office accessories with proof before production from Recognition Direct.",
    intro: "Choose an office accessory, enter your personalization, and checkout online. We will send a proof before production.",
    galleryLabel: "Office accessory products",
    searchLabel: "Search office accessories",
    searchPlaceholder: "Search by name, style, option, or SKU",
    itemPlural: "items",
    plateLabel: "Personalization text",
    platePlaceholder: "Enter personalization text. Example:\nJane Smith\nSales Manager",
    notesPlaceholder: "Tell us anything else we should know about layout, deadline, logo placement, or personalization.",
    submitLabel: "Add office accessories to checkout",
    selectError: "Select an office accessory.",
    orderType: "premier-office-accessory-order",
    noteLabel: "office accessory",
    tags: ["office-accessories", "proof-required", "jds-premier"],
    products: premierOfficeAccessoriesData.products || [],
  }],
  ["cutting-boards", {
    id: "cutting-boards",
    route: "/cutting-boards",
    title: "Cutting Boards",
    metaDescription: "Order personalized cutting boards and serving boards with proof before production from Recognition Direct.",
    intro: "Choose a cutting board or serving board, enter your personalization, and checkout online. We will send a proof before production.",
    galleryLabel: "Cutting board products",
    searchLabel: "Search cutting boards",
    searchPlaceholder: "Search by name, style, option, or SKU",
    itemPlural: "boards",
    plateLabel: "Personalization text",
    platePlaceholder: "Enter engraving text. Example:\nThe Martinez Family\nEst. 2026",
    notesPlaceholder: "Tell us anything else we should know about layout, deadline, logo placement, or engraving.",
    submitLabel: "Add cutting boards to checkout",
    selectError: "Select a cutting board.",
    orderType: "premier-cutting-board-order",
    noteLabel: "cutting board",
    tags: ["cutting-boards", "proof-required", "jds-premier"],
    products: premierCuttingBoardsData.products || [],
  }],
  ["bison-river-knives", {
    id: "bison-river-knives",
    route: "/bison-river-knives",
    title: "Bison River Knives",
    metaDescription: "Order personalized Bison River knives with proof before production from Recognition Direct.",
    intro: "Choose a Bison River knife or tool, enter your personalization, and checkout online. We will send a proof before production.",
    galleryLabel: "Bison River knife products",
    searchLabel: "Search Bison River knives",
    searchPlaceholder: "Search by name, style, option, or SKU",
    itemPlural: "items",
    plateLabel: "Personalization text",
    platePlaceholder: "Enter engraving text. Example:\nRoth Ward\nThank you 2026",
    notesPlaceholder: "Tell us anything else we should know about layout, deadline, logo placement, or engraving.",
    submitLabel: "Add Bison River items to checkout",
    selectError: "Select a Bison River item.",
    orderType: "premier-bison-river-knife-order",
    noteLabel: "Bison River item",
    tags: ["bison-river-knives", "proof-required", "jds-premier"],
    products: premierBisonRiverKnivesData.products || [],
  }],
  ["award-drinkware", {
    id: "award-drinkware",
    route: "/award-drinkware",
    title: "Award Drinkware",
    metaDescription: "Order personalized award drinkware with proof before production from Recognition Direct.",
    intro: "Choose award drinkware, enter your personalization, and checkout online. We will send a proof before production.",
    galleryLabel: "Award drinkware products",
    searchLabel: "Search award drinkware",
    searchPlaceholder: "Search by name, style, option, or SKU",
    itemPlural: "items",
    plateLabel: "Personalization text",
    platePlaceholder: "Enter engraving text. Example:\nJane Smith\nRecognition Direct",
    notesPlaceholder: "Tell us anything else we should know about layout, deadline, logo placement, or engraving.",
    submitLabel: "Add award drinkware to checkout",
    selectError: "Select an award drinkware item.",
    orderType: "premier-award-drinkware-order",
    noteLabel: "award drinkware",
    tags: ["award-drinkware", "proof-required", "jds-premier"],
    products: premierAwardDrinkwareData.products || [],
  }],
]);
for (const catalog of premierAwardCatalogs.values()) {
  catalog.bySku = new Map(catalog.products.map((product) => [product.sku, product]));
}
const polarCamelProducts = (polarCamelData.products || [])
  .filter((product) => !/sublimatable/i.test(product.title || ""))
  .map((product) => ({
    ...product,
    variants: (product.variants || []).filter((variant) => !/sublimatable/i.test([
      variant.title,
      variant.optionValue,
      variant.description,
      variant.sku,
    ].join(" "))),
  }))
  .filter((product) => (product.variants || []).length > 0)
  .sort((a, b) => {
  const typePriority = new Map([
    ["Tumbler", 0],
    ["Water Bottle", 1],
    ["Mug", 2],
    ["Beverage Holder", 3],
    ["Wine Tumbler", 4],
    ["Bowl", 5],
    ["Glassware", 6],
    ["Decanter", 7],
    ["Polar Camel Wine Chiller", 8],
    ["Straw", 9],
  ]);
  const accessoryPattern = /^(slider lid|magnetic lid|snap lid|handle|polar camel water bottle carabiner)|\bboot\b/i;
  const specialtyPattern = /\/|ghost|rose gold|prism|leatherette|silicone grip/i;
  const aAccessory = accessoryPattern.test(a.title || "") ? 20 : 0;
  const bAccessory = accessoryPattern.test(b.title || "") ? 20 : 0;
  const aSpecialty = specialtyPattern.test(a.title || "") ? 5 : 0;
  const bSpecialty = specialtyPattern.test(b.title || "") ? 5 : 0;
  const aPriority = (typePriority.get(a.type) ?? 10) + aAccessory + aSpecialty;
  const bPriority = (typePriority.get(b.type) ?? 10) + bAccessory + bSpecialty;
  if (aPriority !== bPriority) return aPriority - bPriority;
  const aVariantCount = (a.variants || []).length;
  const bVariantCount = (b.variants || []).length;
  if (aVariantCount !== bVariantCount) return bVariantCount - aVariantCount;
  return String(a.title || "").localeCompare(String(b.title || ""));
  });
const polarCamelProductByHandle = new Map(polarCamelProducts.map((product) => [product.handle, product]));
const polarCamelVariantBySku = new Map(polarCamelProducts.flatMap((product) => (
  (product.variants || []).map((variant) => [variant.sku, { product, variant }])
)));

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
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "X-Robots-Tag": "noindex, nofollow",
  });
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

const DEFAULT_EXPRESS_ONE_CUSTOMERS = [
  {
    id: "demo-express-one",
    accessCode: "demo",
    company: "Demo Express One Customer",
    contactName: "Sample Customer",
    email: "customer@example.com",
    phone: "619-000-0000",
    shippingBalance: 18.95,
    originalOrderPrice: 550,
    originalOrderDate: "2026-06-01",
    reorderUrl: `${APP_BASE_URL}/name-badges`,
    notes: "Replace this demo record with a real customer when you are ready.",
    items: [
      {
        id: "staff-white-1x3",
        title: 'White 1" x 3" Staff Name Badge',
        description: "White badge, no frame, magnetic fastener. Proof before production.",
        image: "/assets/name-badges/1x3-white-no-frame.png",
        originalQuantity: 500,
        quantityRemaining: 42,
        originalOrderPrice: 2750,
      },
    ],
  },
];

async function readJsonFile(pathname, fallback) {
  try {
    return JSON.parse(await readFile(pathname, "utf8"));
  } catch {
    await writeFile(pathname, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

async function expressOneCustomers() {
  const customers = await readJsonFile(EXPRESS_ONE_FILE, DEFAULT_EXPRESS_ONE_CUSTOMERS);
  return Array.isArray(customers) ? customers : DEFAULT_EXPRESS_ONE_CUSTOMERS;
}

async function writeExpressOneCustomers(customers) {
  await writeFile(EXPRESS_ONE_FILE, JSON.stringify(customers, null, 2));
}

async function expressOneCustomer(id, accessCode = "") {
  const customers = await expressOneCustomers();
  const customer = customers.find((entry) => entry.id === id);
  if (!customer) return null;
  if (customer.accessCode && customer.accessCode !== accessCode) return null;
  return customer;
}

function expressOneItemStatus(item) {
  const originalQuantity = Math.max(0, Number(item.originalQuantity || 0));
  const quantityRemaining = Math.max(0, Number(item.quantityRemaining || 0));
  const percentRemaining = originalQuantity > 0 ? (quantityRemaining / originalQuantity) * 100 : 0;
  return {
    originalQuantity,
    quantityRemaining,
    percentRemaining,
    lowInventory: originalQuantity > 0 && percentRemaining < 10,
  };
}

function expressOnePortalUrl(customer) {
  return `${APP_BASE_URL}/express-one/customer/${encodeURIComponent(customer.id)}?code=${encodeURIComponent(customer.accessCode || "")}`;
}

function expressOneReorderUrl(customer, item) {
  const baseUrl = customer.reorderUrl || `${APP_BASE_URL}/name-badges`;
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}express_one=reorder&customer=${encodeURIComponent(customer.id)}&item=${encodeURIComponent(item.id)}`;
}

function expressOneShippingPaymentLabel(value) {
  if (value === "pay-now") return "Customer wants to pay shipping now";
  if (value === "add-balance") return "Add shipping to QuickBooks balance";
  return value || "Not selected";
}

async function queueExpressOneLowInventoryEmail(customer, item) {
  if (!customer.email) return null;
  const status = expressOneItemStatus(item);
  if (!status.lowInventory) return null;
  const queued = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    type: "express-one-low-inventory",
    to: customer.email,
    customerId: customer.id,
    company: customer.company,
    itemId: item.id,
    itemTitle: item.title,
    quantityRemaining: status.quantityRemaining,
    percentRemaining: Number(status.percentRemaining.toFixed(1)),
    reorderUrl: expressOneReorderUrl(customer, item),
    subject: `Express One reorder reminder for ${item.title}`,
    body: `Your Express One inventory for ${item.title} is below 10%. You have ${status.quantityRemaining} remaining. Reorder here: ${expressOneReorderUrl(customer, item)}`,
  };
  await writeFile(join(EXPRESS_ONE_EMAIL_DIR, `${queued.id}.json`), JSON.stringify(queued, null, 2));
  return queued;
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
  const row = (label, priceBreaks) => `<div class="badge-price-chart__row">
    <strong>${escapeHtml(label)}</strong>
    <div class="badge-price-chart__prices">
      ${quantities.map((quantity, index) => `<span><b>${quantityLabels[index]}</b>${priceCell(priceBreaks, quantity)}</span>`).join("")}
    </div>
  </div>`;
  return `<div class="badge-price-chart" aria-label="Name badge quantity price chart">
    <h2>Quantity Pricing</h2>
    <div class="badge-price-chart__list">
      ${row("No Frame", NAME_BADGE_NO_FRAME_PRICE_BREAKS)}
      ${row("Silver / Gold Frame", NAME_BADGE_BASE_PRICE_BREAKS)}
      ${row("Magnetic add-on", NAME_BADGE_MAGNET_PRICE_BREAKS)}
      ${row("Epoxy Dome add-on", NAME_BADGE_DOME_PRICE_BREAKS)}
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
  if (value === "pickup-spring-valley") return "Pickup at Spring Valley";
  return "Ship";
}

function premierAwardTier(product, quantity) {
  const caseQuantity = Math.max(1, Number(product.caseQuantity || 1));
  const prices = product.prices || {};
  const tiers = [
    { minimumQuantity: caseQuantity * 40, unitPrice: prices.fortyCases, label: "40 case price" },
    { minimumQuantity: caseQuantity * 20, unitPrice: prices.twentyCases, label: "20 case price" },
    { minimumQuantity: caseQuantity * 10, unitPrice: prices.tenCases, label: "10 case price" },
    { minimumQuantity: caseQuantity * 5, unitPrice: prices.fiveCases, label: "5 case price" },
    { minimumQuantity: caseQuantity, unitPrice: prices.oneCase, label: "case price" },
    { minimumQuantity: 1, unitPrice: prices.lessThanCase, label: "less than case price" },
  ];
  const tier = tiers.find((entry) => quantity >= entry.minimumQuantity && Number.isFinite(entry.unitPrice));
  if (!tier) throw new Error("Pricing is not configured for this trophy.");
  return tier;
}

function premierAwardCatalog(id) {
  return premierAwardCatalogs.get(cleanText(id, 80)) || premierAwardCatalogs.get("baseball-softball");
}

function buildPremierAwardInput(formData) {
  const catalog = premierAwardCatalog(formData.get("catalog"));
  const product = catalog.bySku.get(field(formData, "sku", 80));
  if (!product) throw new Error(catalog.selectError);
  const quantity = Math.max(1, Math.floor(readPositiveNumber(formData.get("order_quantity"), "Quantity")));
  const tier = premierAwardTier(product, quantity);
  const unitPrice = Number(tier.unitPrice.toFixed(2));
  return {
    catalog,
    product,
    quantity,
    tier,
    unitPrice,
    totalPrice: Number((unitPrice * quantity).toFixed(2)),
  };
}

function polarCamelTier(variant, quantity) {
  const caseQuantity = Math.max(1, Number(variant.caseQuantity || 1));
  const prices = variant.prices || {};
  const tiers = [
    { minimumQuantity: caseQuantity * 40, unitPrice: prices.fortyCases, label: "40 case price" },
    { minimumQuantity: caseQuantity * 20, unitPrice: prices.twentyCases, label: "20 case price" },
    { minimumQuantity: caseQuantity * 10, unitPrice: prices.tenCases, label: "10 case price" },
    { minimumQuantity: caseQuantity * 5, unitPrice: prices.fiveCases, label: "5 case price" },
    { minimumQuantity: caseQuantity, unitPrice: prices.oneCase, label: "case price" },
    { minimumQuantity: 1, unitPrice: prices.lessThanCase, label: "less than case price" },
  ];
  const tier = tiers.find((entry) => quantity >= entry.minimumQuantity && Number.isFinite(entry.unitPrice));
  if (!tier) throw new Error("Pricing is not configured for this Polar Camel item.");
  return tier;
}

function buildPolarCamelInput(formData) {
  const selected = polarCamelVariantBySku.get(field(formData, "sku", 80));
  if (!selected) throw new Error("Select a Polar Camel item.");
  const quantity = Math.max(1, Math.floor(readPositiveNumber(formData.get("order_quantity"), "Quantity")));
  const tier = polarCamelTier(selected.variant, quantity);
  const unitPrice = Number(tier.unitPrice.toFixed(2));
  return {
    product: selected.product,
    variant: selected.variant,
    quantity,
    tier,
    unitPrice,
    totalPrice: Number((unitPrice * quantity).toFixed(2)),
  };
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

const SHIPPING_GROUPS = {
  pickup: {
    label: "Local Pickup",
    tag: "shipping-pickup",
    title: "Local Pickup",
    rate: 0,
    note: "No shipping charge. Customer selected local pickup.",
  },
  small: {
    label: "Small Package",
    tag: "shipping-small",
    title: "Small Package Shipping & Handling",
    rate: 12.95,
    note: "Good for small personalized items, transfers, badges, plates, and light packages.",
  },
  standard: {
    label: "Standard Package",
    tag: "shipping-standard",
    title: "Standard Shipping & Handling",
    rate: 19.95,
    note: "Good for most awards, drinkware, posters, small signs, and standard packages.",
  },
  large: {
    label: "Large Package",
    tag: "shipping-large",
    title: "Large Item Shipping & Handling",
    rate: 39.95,
    note: "Good for banners, stands, flags, yard signs, rigid signs, and larger packages.",
  },
  oversized: {
    label: "Oversized / Special Handling",
    tag: "shipping-oversized",
    title: "Oversized Shipping & Handling",
    rate: 75,
    note: "Used for bulky display items where packing and freight risk are higher.",
  },
};

function elevateShippingGroup(groupKey, quantity, thresholds = {}) {
  const order = ["small", "standard", "large", "oversized"];
  let index = Math.max(0, order.indexOf(groupKey));
  if (quantity >= (thresholds.oversized || 24)) index = Math.max(index, order.indexOf("oversized"));
  else if (quantity >= (thresholds.large || 12)) index = Math.max(index, order.indexOf("large"));
  else if (quantity >= (thresholds.standard || 6)) index = Math.max(index, order.indexOf("standard"));
  return order[index] || groupKey;
}

function shippingPlan(groupKey, deliveryMethod, quantity = 1, thresholds) {
  const isPickup = deliveryMethod !== "Ship";
  const key = isPickup ? "pickup" : elevateShippingGroup(groupKey, quantity, thresholds);
  return SHIPPING_GROUPS[key] || SHIPPING_GROUPS.standard;
}

function shippingAttributes(plan) {
  return [
    attribute("Shipping Handling Group", plan.label),
    attribute("Shipping Handling Charge", plan.rate > 0 ? `$${plan.rate.toFixed(2)}` : "Free pickup"),
    attribute("Shipping Handling Note", plan.note),
  ].filter(Boolean);
}

function shippingTags(plan) {
  return [plan.tag].filter(Boolean);
}

function draftOrderShippingLine(plan) {
  if (!plan.rate) return undefined;
  return {
    title: plan.title,
    priceWithCurrency: { amount: plan.rate.toFixed(2), currencyCode: "USD" },
  };
}

function classifyCatalogShipping(product, input, quantity) {
  const text = [
    product?.title,
    product?.url,
    input?.values ? Object.values(input.values).join(" ") : "",
  ].join(" ").toLowerCase();
  const squareFeetEach = Number(input?.squareFeetEach || 0);

  if (/(event tent|canopy|tradeshow|trade show|seg|tension fabric|fabric display|backdrop)/.test(text)) {
    return shippingPlan("oversized", input?.deliveryMethod || "Ship", quantity, { standard: 2, large: 4, oversized: 8 });
  }
  if (/(flag|retractable|banner stand|x-stand|x stand|a-frame|a frame|signicade|real estate post|table throw|table cover|pole banner|banner frame)/.test(text)) {
    return shippingPlan("large", input?.deliveryMethod || "Ship", quantity, { standard: 2, large: 4, oversized: 10 });
  }
  if (/(banner|coroplast|yard sign|foam|pvc|acm|aluminum|rigid|magnet|dry erase|poster)/.test(text) || squareFeetEach >= 6) {
    return shippingPlan(squareFeetEach >= 20 ? "large" : "standard", input?.deliveryMethod || "Ship", quantity, { standard: 5, large: 12, oversized: 25 });
  }
  if (/(dtf|transfer|decal|sticker|adhesive|vinyl|plate|small)/.test(text)) {
    return shippingPlan("small", input?.deliveryMethod || "Ship", quantity, { standard: 10, large: 30, oversized: 75 });
  }
  return shippingPlan("standard", input?.deliveryMethod || "Ship", quantity);
}

function classifyPremierAwardShipping(catalog, product, quantity, deliveryMethod) {
  const text = [catalog?.id, catalog?.title, product?.title, product?.displayName, product?.size, product?.optionValue].join(" ").toLowerCase();
  if (/(knife|bison river|office accessories)/.test(text)) return shippingPlan("small", deliveryMethod, quantity, { standard: 4, large: 12, oversized: 36 });
  if (/(plaque|clock|cutting board|executive|glass|crystal|acrylic)/.test(text)) return shippingPlan("standard", deliveryMethod, quantity, { standard: 4, large: 12, oversized: 30 });
  return shippingPlan("standard", deliveryMethod, quantity, { standard: 6, large: 18, oversized: 48 });
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
  const shipping = shippingPlan("large", deliveryMethod, quantity, { standard: 2, large: 5, oversized: 12 });
  const attributes = [
    ...buildAttributes(formData, artworkUrls),
    ...shippingAttributes(shipping),
  ];
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
    tags: ["custom-banner", "proof-required", isPickup ? field(formData, "delivery_method") : "ship", ...shippingTags(shipping)],
    allowDiscountCodesInCheckout: true,
    shippingLine: draftOrderShippingLine(shipping),
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
      { key: "Shipping Handling Group", value: shipping.label },
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
  const shipping = classifyCatalogShipping(product, { ...input, deliveryMethod }, quantity);
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
    ...shippingAttributes(shipping),
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
    tags: ["catalog-configuration", "proof-required", handle, isPickup ? field(formData, "delivery_method") : "ship", ...shippingTags(shipping)],
    allowDiscountCodesInCheckout: true,
    shippingLine: draftOrderShippingLine(shipping),
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
      { key: "Shipping Handling Group", value: shipping.label },
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

  const shipping = shippingPlan("small", deliveryMethod, input.quantity, { standard: 50, large: 250, oversized: 1000 });
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
    ...shippingAttributes(shipping),
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
    tags: ["name-badges", "proof-required", isPickup ? field(formData, "delivery_method") : "ship", ...shippingTags(shipping)],
    allowDiscountCodesInCheckout: true,
    shippingLine: draftOrderShippingLine(shipping),
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
      { key: "Shipping Handling Group", value: shipping.label },
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

function expressOneLoginHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Express One Customer Portal | Recognition Direct</title>
  <meta name="description" content="Express One customer portal for held name badge inventory and release orders.">
  <style>
    :root{--ink:#172033;--muted:#5d6675;--line:#d9dee7;--blue:#3154b8;--red:#c6262e;--soft:#f6f8fc}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:var(--ink);font:16px/1.45 Arial,Helvetica,sans-serif}
    .wrap{width:min(880px,calc(100% - 32px));margin:0 auto;padding:52px 0}
    .panel{border:1px solid var(--line);border-radius:8px;background:#fff;padding:24px;box-shadow:0 18px 45px rgba(24,33,47,.08)}
    h1{margin:0 0 10px;font-size:clamp(34px,5vw,58px);line-height:1}
    p{color:var(--muted)}
    form{display:grid;gap:14px;margin-top:20px}
    label{display:block;font-weight:800;font-size:13px;color:#344055}
    input{width:100%;min-height:46px;border:1px solid #b9c3d2;border-radius:4px;padding:10px;font:inherit}
    button,.button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;border:0;background:var(--blue);color:#fff;padding:0 18px;font-weight:900;text-decoration:none;cursor:pointer}
    .note{font-size:13px;color:var(--muted)}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="panel">
      <p class="note">Recognition Direct</p>
      <h1>Express One Portal</h1>
      <p>Customers with an Express One account can view held badge inventory, request releases, track shipping balance, and reorder when inventory is low.</p>
      <p class="note">Shipping balances are handled by Recognition Direct and can be invoiced through QuickBooks when needed.</p>
      <form action="${APP_BASE_URL}/express-one/open" method="get">
        <div>
          <label for="customer">Customer ID</label>
          <input id="customer" name="customer" placeholder="Example: demo-express-one" required>
        </div>
        <div>
          <label for="code">Access code</label>
          <input id="code" name="code" placeholder="Example: demo" required>
        </div>
        <button type="submit">Open portal</button>
      </form>
      <p class="note">Demo login: customer ID <strong>demo-express-one</strong>, access code <strong>demo</strong>.</p>
    </section>
  </main>
</body>
</html>`;
}

function expressOneDashboardHtml(customer) {
  const items = Array.isArray(customer.items) ? customer.items : [];
  const itemCards = items.map((item) => {
    const status = expressOneItemStatus(item);
    const percent = Math.max(0, Math.min(100, status.percentRemaining));
    const reorderUrl = expressOneReorderUrl(customer, item);
    return `<article class="item${status.lowInventory ? " low" : ""}">
      <div class="item-media"><img src="${escapeHtml(item.image || "/assets/name-badges/1x3-white-no-frame.png")}" alt="${escapeHtml(item.title || "Name badge")}"></div>
      <div class="item-body">
        <div class="item-head">
          <div>
            <small>Badge inventory</small>
            <h2>${escapeHtml(item.title || "Name Badge")}</h2>
          </div>
          <strong>${status.quantityRemaining} left</strong>
        </div>
        <p>${escapeHtml(item.description || "")}</p>
        <div class="meter" aria-label="${percent.toFixed(1)}% remaining"><span style="width:${percent.toFixed(1)}%"></span></div>
        <div class="stats">
          <span>Original qty: <b>${status.originalQuantity}</b></span>
          <span>Remaining: <b>${status.quantityRemaining}</b></span>
          <span>Used: <b>${Math.max(0, status.originalQuantity - status.quantityRemaining)}</b></span>
          <span>Original order price: <b>$${Number(item.originalOrderPrice || customer.originalOrderPrice || 0).toFixed(2)}</b></span>
        </div>
        ${status.lowInventory ? `<div class="alert"><b>Low inventory:</b> This item is below 10%. <a href="${escapeHtml(reorderUrl)}" target="_blank" rel="noopener">Start reorder</a></div>` : ""}
        <form action="${APP_BASE_URL}/api/express-one-release" method="post" enctype="multipart/form-data" class="release-form">
          <input type="hidden" name="customer_id" value="${escapeHtml(customer.id)}">
          <input type="hidden" name="code" value="${escapeHtml(customer.accessCode || "")}">
          <input type="hidden" name="item_id" value="${escapeHtml(item.id)}">
          <div>
            <label>Quantity to release</label>
            <input name="release_quantity" type="number" min="1" max="${status.quantityRemaining}" value="1" required data-release-quantity>
          </div>
          <div>
            <label>Shipping payment</label>
            <select name="shipping_payment">
              <option value="pay-now">Pay shipping for this release now</option>
              <option value="add-balance">Add shipping to my account balance</option>
            </select>
            <p class="help">Account balances are invoiced by Recognition Direct through QuickBooks.</p>
          </div>
          <div class="full">
            <label>Badge names</label>
            <div class="name-list" data-name-list>
              <div class="badge-entry" data-badge-entry>
                <strong>Badge 1</strong>
                <div class="badge-lines">
                  <input name="badge_line_1" type="text" placeholder="Line 1: Name">
                  <input name="badge_line_2" type="text" placeholder="Line 2: Title / Department optional">
                  <input name="badge_line_3" type="text" placeholder="Line 3: Optional">
                </div>
              </div>
            </div>
            <button type="button" class="add-name" data-add-name>Add another name</button>
            <p class="help">Add one badge entry per person. Your badge layout may not be set up for more than one line of text; Recognition Direct will confirm layout before production.</p>
          </div>
          <div class="full">
            <label>Upload names text file</label>
            <input name="names_file" type="file" accept=".txt,.csv,text/plain,text/csv">
            <p class="help">Accepted files: TXT or CSV.</p>
          </div>
          <div class="full">
            <label>Ship-to / pickup notes</label>
            <textarea name="delivery_notes" placeholder="Tell us where to ship, who it is for, or if pickup is preferred."></textarea>
          </div>
          <button type="submit">Request badge release</button>
        </form>
      </div>
    </article>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(customer.company)} Express One Portal | Recognition Direct</title>
  <style>
    :root{--ink:#172033;--muted:#5d6675;--line:#d9dee7;--blue:#3154b8;--red:#c6262e;--soft:#f6f8fc;--green:#18864b}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:var(--ink);font:16px/1.45 Arial,Helvetica,sans-serif}
    .wrap{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:34px 0 54px}
    .eyebrow{color:var(--red);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    h1{margin:6px 0 8px;font-size:clamp(34px,5vw,56px);line-height:1}
    p{color:var(--muted)}
    .summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:24px 0}
    .metric,.item,.panel{border:1px solid var(--line);border-radius:8px;background:#fff}
    .metric{padding:16px;background:#fbfcff}
    .metric small,.item small{display:block;color:var(--muted);font-size:11px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
    .metric strong{display:block;margin-top:5px;font-size:24px}
    .items{display:grid;gap:18px}
    .item{display:grid;grid-template-columns:280px minmax(0,1fr);overflow:hidden}
    .item.low{border-color:var(--red);box-shadow:0 0 0 1px rgba(198,38,46,.18)}
    .item-media{background:#f3f6fb;display:grid;place-items:center;padding:20px}
    .item-media img{display:block;max-width:100%;height:auto;border-radius:8px}
    .item-body{padding:20px;display:grid;gap:12px}
    .item-head{display:flex;align-items:start;justify-content:space-between;gap:16px}
    .item-head h2{margin:4px 0 0;font-size:24px}
    .item-head strong{font-size:26px;color:var(--green)}
    .meter{height:10px;border-radius:999px;background:#e8edf6;overflow:hidden}
    .meter span{display:block;height:100%;background:var(--blue)}
    .item.low .meter span{background:var(--red)}
    .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
    .stats span{border:1px solid var(--line);border-radius:6px;padding:8px;color:var(--muted);font-size:13px}
    .stats b{display:block;color:var(--ink);font-size:15px}
    .alert{border-left:4px solid var(--red);background:#fff5f5;padding:10px 12px}
    .alert a{color:var(--blue);font-weight:900}
    .release-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;border-top:1px solid var(--line);padding-top:14px}
    .full{grid-column:1/-1}
    label{display:block;margin-bottom:5px;font-size:13px;font-weight:900;color:#344055}
    input,select,textarea{width:100%;min-height:44px;border:1px solid #b9c3d2;border-radius:4px;padding:10px;font:inherit}
    textarea{min-height:90px;resize:vertical}
    .help{margin:6px 0 0;font-size:12px;color:var(--muted)}
    button,.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:0;background:var(--blue);color:#fff;padding:0 16px;font-weight:900;text-decoration:none;cursor:pointer}
    .name-list{display:grid;gap:8px}
    .badge-entry{border:1px solid var(--line);border-radius:6px;background:#fbfcff;padding:10px}
    .badge-entry strong{display:block;margin-bottom:8px;font-size:13px;color:#344055}
    .badge-lines{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .add-name{margin-top:8px;background:#fff;color:var(--blue);border:1px solid var(--blue)}
    @media(max-width:820px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.item{grid-template-columns:1fr}.stats,.release-form,.badge-lines{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="eyebrow">Express One Customer Portal</div>
    <h1>${escapeHtml(customer.company)}</h1>
    <p>${escapeHtml(customer.contactName || "")}${customer.email ? ` · ${escapeHtml(customer.email)}` : ""}${customer.phone ? ` · ${escapeHtml(customer.phone)}` : ""}</p>
    <section class="summary">
      <div class="metric"><small>Shipping balance</small><strong>$${Number(customer.shippingBalance || 0).toFixed(2)}</strong></div>
      <div class="metric"><small>Badge styles</small><strong>${items.length}</strong></div>
      <div class="metric"><small>Original order</small><strong>$${Number(customer.originalOrderPrice || 0).toFixed(2)}</strong></div>
      <div class="metric"><small>Reorder status</small><strong>${items.some((item) => expressOneItemStatus(item).lowInventory) ? "Review" : "Good"}</strong></div>
    </section>
    <section class="items">${itemCards || "<p>No Express One inventory is set up yet.</p>"}</section>
  </main>
  <script>
    document.addEventListener("click", function(event) {
      var button = event.target.closest("[data-add-name]");
      if (!button) return;
      var form = button.closest("form");
      var list = form ? form.querySelector("[data-name-list]") : null;
      if (!list) return;
      var count = list.querySelectorAll("[data-badge-entry]").length + 1;
      var entry = document.createElement("div");
      entry.className = "badge-entry";
      entry.setAttribute("data-badge-entry", "");
      entry.innerHTML = '<strong>Badge ' + count + '</strong><div class="badge-lines"><input name="badge_line_1" type="text" placeholder="Line 1: Name"><input name="badge_line_2" type="text" placeholder="Line 2: Title / Department optional"><input name="badge_line_3" type="text" placeholder="Line 3: Optional"></div>';
      list.appendChild(entry);
      var quantity = form.querySelector("[data-release-quantity]");
      if (quantity) quantity.value = String(Math.min(Number(quantity.max || count), count));
      var firstInput = entry.querySelector("input");
      if (firstInput) firstInput.focus();
    });
  </script>
</body>
</html>`;
}

function expressOneNotFoundHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Express One Portal</title></head><body style="font:16px Arial;padding:40px"><h1>Portal not found</h1><p>Please check the customer ID and access code.</p><p><a href="${APP_BASE_URL}/express-one">Return to Express One login</a></p></body></html>`;
}

function expressOneReleaseThanksHtml(id) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Release Request Received</title></head><body style="font:16px Arial;padding:40px"><h1>Release request received</h1><p>We saved request ${escapeHtml(id)} and will review the badge release.</p><p><a href="${APP_BASE_URL}/express-one">Back to Express One portal</a></p></body></html>`;
}

async function handleExpressOneOpen(req, res, url) {
  const customerId = cleanText(url.searchParams.get("customer"), 120);
  const code = cleanText(url.searchParams.get("code"), 120);
  const customer = await expressOneCustomer(customerId, code);
  if (!customer) return html(res, 404, expressOneNotFoundHtml());
  res.writeHead(303, { Location: expressOnePortalUrl(customer) });
  res.end();
}

async function handleExpressOneRelease(req, res) {
  const formData = await requestFormData(req);
  const customerId = field(formData, "customer_id", 120);
  const code = field(formData, "code", 120);
  const customers = await expressOneCustomers();
  const customerIndex = customers.findIndex((entry) => entry.id === customerId && (!entry.accessCode || entry.accessCode === code));
  const customer = customers[customerIndex];
  if (!customer) throw new Error("Express One customer was not found.");
  const itemId = field(formData, "item_id", 120);
  const itemIndex = (customer.items || []).findIndex((entry) => entry.id === itemId);
  const item = customer.items?.[itemIndex];
  if (!item) throw new Error("Express One inventory item was not found.");
  const status = expressOneItemStatus(item);
  const releaseQuantity = Math.max(1, Math.floor(readPositiveNumber(formData.get("release_quantity"), "Release quantity")));
  if (releaseQuantity > status.quantityRemaining) throw new Error("Release quantity is greater than inventory remaining.");
  const shippingPayment = field(formData, "shipping_payment", 80);
  const line1Values = formData.getAll("badge_line_1").map((value) => cleanText(value, 180));
  const line2Values = formData.getAll("badge_line_2").map((value) => cleanText(value, 180));
  const line3Values = formData.getAll("badge_line_3").map((value) => cleanText(value, 180));
  const badgeNames = line1Values.map((line1, index) => ({
    line1,
    line2: line2Values[index] || "",
    line3: line3Values[index] || "",
  })).filter((entry) => entry.line1 || entry.line2 || entry.line3);
  const namesFileUrl = await saveUpload(formData.get("names_file"));
  const releaseShippingEstimate = EXPRESS_ONE_SHIPPING_ESTIMATE;
  const newShippingBalance = shippingPayment === "add-balance"
    ? Number((Number(customer.shippingBalance || 0) + releaseShippingEstimate).toFixed(2))
    : Number(customer.shippingBalance || 0);
  const shippingPaymentLabel = expressOneShippingPaymentLabel(shippingPayment);
  const release = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "needs-review",
    customerId: customer.id,
    company: customer.company,
    contactName: customer.contactName,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    itemId: item.id,
    itemTitle: item.title,
    itemDescription: item.description,
    quantityRequested: releaseQuantity,
    quantityRemainingBeforeRelease: status.quantityRemaining,
    quantityRemainingAfterRelease: status.quantityRemaining - releaseQuantity,
    shippingPayment,
    shippingPaymentLabel,
    releaseShippingEstimate,
    currentShippingBalance: Number(customer.shippingBalance || 0),
    newShippingBalance,
    quickBooksAction: shippingPayment === "add-balance" ? "Add shipping to customer's QuickBooks invoice balance" : "Collect shipping payment for this release",
    quickBooksInvoiceStatus: shippingPayment === "add-balance" ? "pending-manual-invoice" : "not-needed-yet",
    badgeNames,
    namesFileUrl,
    deliveryNotes: field(formData, "delivery_notes", 2500),
  };
  customer.items[itemIndex] = { ...item, quantityRemaining: release.quantityRemainingAfterRelease };
  customer.shippingBalance = newShippingBalance;
  customers[customerIndex] = customer;
  await writeExpressOneCustomers(customers);
  await writeFile(join(EXPRESS_ONE_RELEASE_DIR, `${release.id}.json`), JSON.stringify(release, null, 2));
  await queueExpressOneLowInventoryEmail(customer, customer.items[itemIndex]);
  res.writeHead(303, { Location: `${APP_BASE_URL}/express-one/release-thanks?id=${encodeURIComponent(release.id)}` });
  res.end();
}

function buildSolarPlacardInput(formData) {
  const product = solarProductByKey.get(field(formData, "product_key", 80));
  if (!product) throw new Error("Select a solar placard or plate.");
  const quantity = Math.max(1, Math.floor(readPositiveNumber(formData.get("order_quantity"), "Quantity")));
  const customWidth = Number.parseFloat(field(formData, "custom_width"));
  const customHeight = Number.parseFloat(field(formData, "custom_height"));
  const customArea = product.key === "plate-custom" && Number.isFinite(customWidth) && Number.isFinite(customHeight) && customWidth > 0 && customHeight > 0
    ? Number((customWidth * customHeight).toFixed(2))
    : null;
  if (product.key === "plate-custom") {
    if (customArea === null) throw new Error("Enter a custom width and height in inches.");
    const shortSide = Math.min(customWidth, customHeight);
    const longSide = Math.max(customWidth, customHeight);
    if (longSide > SOLAR_CUSTOM_PLATE_MAX_LONG_SIDE_INCHES || shortSide > SOLAR_CUSTOM_PLATE_MAX_SHORT_SIDE_INCHES) {
      throw new Error('Custom solar plates cannot exceed 12" x 24" or 24" x 12".');
    }
  }
  const unitPrice = product.key === "plate-custom" && customArea !== null
    ? Number((customArea * SOLAR_CUSTOM_PLATE_SQUARE_INCH_RATE).toFixed(2))
    : Number.isFinite(product.unitPrice) ? product.unitPrice : null;
  if (unitPrice === null) throw new Error("Solar pricing is not configured for this item.");
  const totalPrice = unitPrice === null ? null : Number((unitPrice * quantity).toFixed(2));
  return { product, quantity, customArea, customWidth, customHeight, unitPrice, totalPrice };
}

async function handleSolarPlacardPrice(req, res) {
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: "Origin is not allowed." });

  const formData = await requestFormData(req);
  const input = buildSolarPlacardInput(formData);
  return json(res, 200, {
    unitPrice: input.unitPrice,
    totalPrice: input.totalPrice,
    customSquareInches: input.customArea,
  }, corsHeaders(req));
}

async function handleSolarPlacardCheckout(req, res) {
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: "Origin is not allowed." });

  const formData = await requestFormData(req);
  const email = field(formData, "email", 320);
  if (!email || !email.includes("@")) throw new Error("Enter a valid email address.");
  const input = buildSolarPlacardInput(formData);
  const { product, quantity, customArea, unitPrice, totalPrice } = input;
  const planUrl = await saveUpload(formData.get("plan_file"));
  const artworkUrl = await saveUpload(formData.get("artwork"));
  const deliveryMethod = deliveryMethodLabel(field(formData, "delivery_method"));
  const isPickup = deliveryMethod !== "Ship";
  const customSize = product.key === "plate-custom" && customArea !== null
    ? `${field(formData, "custom_width")} in x ${field(formData, "custom_height")} in`
    : "";
  const shipping = shippingPlan(product.type === "placard" ? "standard" : "small", deliveryMethod, quantity, { standard: 10, large: 40, oversized: 100 });
  const attributes = [
    attribute("Product", product.title),
    attribute("Product Type", product.type === "placard" ? "Solar Placard" : "Solar Plate"),
    attribute("Size", product.key === "plate-custom" ? customSize : product.size),
    attribute("Custom Square Inches", customArea !== null ? `${customArea.toFixed(2)} sq in` : ""),
    attribute("Custom Square Inch Rate", product.key === "plate-custom" ? `$${SOLAR_CUSTOM_PLATE_SQUARE_INCH_RATE.toFixed(2)}` : ""),
    attribute("Plate Text", field(formData, "plate_text", 3000)),
    attribute("PDF Plan Sheet / Placard Design", planUrl),
    attribute("Additional Artwork", artworkUrl),
    attribute("Delivery Method", deliveryMethod),
    attribute("Need-by Date", field(formData, "need_by")),
    attribute("Phone", field(formData, "phone")),
    attribute("Company", field(formData, "company")),
    attribute("Notes", field(formData, "notes", 2500)),
    ...shippingAttributes(shipping),
  ].filter(Boolean);

  const orderRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    type: "solar-placard-order",
    productKey: product.key,
    productTitle: product.title,
    productType: product.type,
    size: product.size,
    quantity,
    unitPrice,
    totalPrice,
    customWidth: field(formData, "custom_width"),
    customHeight: field(formData, "custom_height"),
    customSquareInches: customArea,
    customSquareInchRate: product.key === "plate-custom" ? SOLAR_CUSTOM_PLATE_SQUARE_INCH_RATE : null,
    plateText: field(formData, "plate_text", 3000),
    name: field(formData, "name"),
    company: field(formData, "company"),
    email,
    phone: field(formData, "phone"),
    deliveryMethod,
    needBy: field(formData, "need_by"),
    notes: field(formData, "notes", 2500),
    planUrl,
    artworkUrl,
    attributes,
  };
  await writeFile(join(ORDER_DIR, `${orderRecord.id}.json`), JSON.stringify(orderRecord, null, 2));

  if (MOCK_SHOPIFY) {
    res.writeHead(303, { Location: `${APP_BASE_URL}/mock-checkout?id=${encodeURIComponent(orderRecord.id)}` });
    return res.end();
  }

  const draftOrder = await createDraftOrder({
    email,
    note: `Recognition Direct solar placard/plate order ${orderRecord.id}. Delivery method: ${deliveryMethod}.`,
    tags: ["solar-placards", "proof-required", product.type, isPickup ? field(formData, "delivery_method") : "ship", ...shippingTags(shipping)],
    allowDiscountCodesInCheckout: true,
    shippingLine: draftOrderShippingLine(shipping),
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
      { key: "Shipping Handling Group", value: shipping.label },
    ],
  });

  orderRecord.shopifyDraftOrderId = draftOrder.id;
  orderRecord.checkoutUrl = draftOrder.invoiceUrl;
  await writeFile(join(ORDER_DIR, `${orderRecord.id}.json`), JSON.stringify(orderRecord, null, 2));
  res.writeHead(303, { Location: draftOrder.invoiceUrl });
  res.end();
}

async function handlePremierAwardPrice(req, res) {
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: "Origin is not allowed." });

  const formData = await requestFormData(req);
  const input = buildPremierAwardInput(formData);
  return json(res, 200, {
    sku: input.product.sku,
    unitPrice: input.unitPrice,
    totalPrice: input.totalPrice,
    tierLabel: input.tier.label,
    tierMinimumQuantity: input.tier.minimumQuantity,
    caseQuantity: input.product.caseQuantity,
  }, corsHeaders(req));
}

async function handlePremierAwardCheckout(req, res) {
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: "Origin is not allowed." });
  const wantsJson = (req.headers.accept || "").includes("application/json") || req.headers["x-requested-with"] === "fetch";

  const formData = await requestFormData(req);
  const email = field(formData, "email", 320);
  if (!email || !email.includes("@")) throw new Error("Enter a valid email address.");
  const input = buildPremierAwardInput(formData);
  const { catalog, product, quantity, tier, unitPrice, totalPrice } = input;
  const productDisplayName = product.displayName || product.title;
  const artworkUrl = await saveUpload(formData.get("artwork"));
  const namesFileUrl = await saveUpload(formData.get("names_file"));
  const deliveryMethod = deliveryMethodLabel(field(formData, "delivery_method"));
  const isPickup = deliveryMethod !== "Ship";
  const shipping = classifyPremierAwardShipping(catalog, product, quantity, deliveryMethod);
  const attributes = [
    attribute("Vendor", "JDS / Premier Sport Awards"),
    attribute("SKU", product.sku),
    attribute("Product", productDisplayName),
    attribute("Size", product.size),
    attribute("Option", product.optionValue),
    attribute("Case Quantity", String(product.caseQuantity)),
    attribute("Pricing Tier", tier.label),
    attribute("Plate / Personalization Text", field(formData, "plate_text", 5000)),
    attribute("Names File", namesFileUrl),
    attribute("Logo / Artwork", artworkUrl),
    attribute("Delivery Method", deliveryMethod),
    attribute("Need-by Date", field(formData, "need_by")),
    attribute("Phone", field(formData, "phone")),
    attribute("Company", field(formData, "company")),
    attribute("Notes", field(formData, "notes", 2500)),
    attribute("Proof Required", "Yes"),
    ...shippingAttributes(shipping),
  ].filter(Boolean);

  const orderRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    type: catalog.orderType,
    catalog: catalog.id,
    sku: product.sku,
    productTitle: productDisplayName,
    size: product.size,
    quantity,
    unitPrice,
    totalPrice,
    tierLabel: tier.label,
    caseQuantity: product.caseQuantity,
    name: field(formData, "name"),
    company: field(formData, "company"),
    email,
    phone: field(formData, "phone"),
    deliveryMethod,
    needBy: field(formData, "need_by"),
    plateText: field(formData, "plate_text", 5000),
    notes: field(formData, "notes", 2500),
    artworkUrl,
    namesFileUrl,
    attributes,
  };
  await writeFile(join(ORDER_DIR, `${orderRecord.id}.json`), JSON.stringify(orderRecord, null, 2));

  if (MOCK_SHOPIFY) {
    const checkoutUrl = `${APP_BASE_URL}/mock-checkout?id=${encodeURIComponent(orderRecord.id)}`;
    if (wantsJson) return json(res, 200, { checkoutUrl, orderId: orderRecord.id });
    res.writeHead(303, { Location: checkoutUrl });
    return res.end();
  }

  const draftOrder = await createDraftOrder({
    email,
    note: `Recognition Direct ${catalog.noteLabel} order ${orderRecord.id}. Delivery method: ${deliveryMethod}.`,
    tags: [...catalog.tags, isPickup ? field(formData, "delivery_method") : "ship", ...shippingTags(shipping)],
    allowDiscountCodesInCheckout: true,
    shippingLine: draftOrderShippingLine(shipping),
    lineItems: [{
      title: productDisplayName,
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
      { key: "Shipping Handling Group", value: shipping.label },
    ],
  });

  orderRecord.shopifyDraftOrderId = draftOrder.id;
  orderRecord.checkoutUrl = draftOrder.invoiceUrl;
  await writeFile(join(ORDER_DIR, `${orderRecord.id}.json`), JSON.stringify(orderRecord, null, 2));
  if (wantsJson) return json(res, 200, { checkoutUrl: draftOrder.invoiceUrl, orderId: orderRecord.id });
  res.writeHead(303, { Location: draftOrder.invoiceUrl });
  res.end();
}

async function handlePolarCamelPrice(req, res) {
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: "Origin is not allowed." });

  const formData = await requestFormData(req);
  const input = buildPolarCamelInput(formData);
  return json(res, 200, {
    sku: input.variant.sku,
    unitPrice: input.unitPrice,
    totalPrice: input.totalPrice,
    tierLabel: input.tier.label,
    tierMinimumQuantity: input.tier.minimumQuantity,
    caseQuantity: input.variant.caseQuantity,
  }, corsHeaders(req));
}

async function handlePolarCamelCheckout(req, res) {
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: "Origin is not allowed." });
  const wantsJson = (req.headers.accept || "").includes("application/json") || req.headers["x-requested-with"] === "fetch";

  const formData = await requestFormData(req);
  const email = field(formData, "email", 320);
  if (!email || !email.includes("@")) throw new Error("Enter a valid email address.");
  const input = buildPolarCamelInput(formData);
  const { product, variant, quantity, tier, unitPrice, totalPrice } = input;
  const artworkUrl = await saveUpload(formData.get("artwork"));
  const personalizationFileUrl = await saveUpload(formData.get("personalization_file"));
  const deliveryMethod = deliveryMethodLabel(field(formData, "delivery_method"));
  const isPickup = deliveryMethod !== "Ship";
  const shipping = shippingPlan("standard", deliveryMethod, quantity, { standard: 6, large: Math.max(12, Number(variant.caseQuantity || 12)), oversized: 48 });
  const attributes = [
    attribute("Vendor", "JDS Polar Camel"),
    attribute("SKU", variant.sku),
    attribute("Product", product.title),
    attribute(product.optionName || "Option", variant.optionValue),
    attribute("Product Type", product.type),
    attribute("Case Quantity", String(variant.caseQuantity)),
    attribute("Pricing Tier", tier.label),
    attribute("Personalization Text", field(formData, "personalization_text", 5000)),
    attribute("Personalization File", personalizationFileUrl),
    attribute("Logo / Artwork", artworkUrl),
    attribute("Delivery Method", deliveryMethod),
    attribute("Need-by Date", field(formData, "need_by")),
    attribute("Phone", field(formData, "phone")),
    attribute("Company", field(formData, "company")),
    attribute("Notes", field(formData, "notes", 2500)),
    attribute("Proof Required", "Yes"),
    ...shippingAttributes(shipping),
  ].filter(Boolean);

  const orderRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    type: "polar-camel-order",
    sku: variant.sku,
    productTitle: product.title,
    optionValue: variant.optionValue,
    productType: product.type,
    quantity,
    unitPrice,
    totalPrice,
    tierLabel: tier.label,
    caseQuantity: variant.caseQuantity,
    name: field(formData, "name"),
    company: field(formData, "company"),
    email,
    phone: field(formData, "phone"),
    deliveryMethod,
    needBy: field(formData, "need_by"),
    personalizationText: field(formData, "personalization_text", 5000),
    notes: field(formData, "notes", 2500),
    artworkUrl,
    personalizationFileUrl,
    attributes,
  };
  await writeFile(join(ORDER_DIR, `${orderRecord.id}.json`), JSON.stringify(orderRecord, null, 2));

  if (MOCK_SHOPIFY) {
    const checkoutUrl = `${APP_BASE_URL}/mock-checkout?id=${encodeURIComponent(orderRecord.id)}`;
    if (wantsJson) return json(res, 200, { checkoutUrl, orderId: orderRecord.id });
    res.writeHead(303, { Location: checkoutUrl });
    return res.end();
  }

  const draftOrder = await createDraftOrder({
    email,
    note: `Recognition Direct Polar Camel order ${orderRecord.id}. Delivery method: ${deliveryMethod}.`,
    tags: ["polar-camel", "proof-required", product.type, isPickup ? field(formData, "delivery_method") : "ship", ...shippingTags(shipping)],
    allowDiscountCodesInCheckout: true,
    shippingLine: draftOrderShippingLine(shipping),
    lineItems: [{
      title: `${product.title} - ${variant.optionValue}`,
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
      { key: "Shipping Handling Group", value: shipping.label },
    ],
  });

  orderRecord.shopifyDraftOrderId = draftOrder.id;
  orderRecord.checkoutUrl = draftOrder.invoiceUrl;
  await writeFile(join(ORDER_DIR, `${orderRecord.id}.json`), JSON.stringify(orderRecord, null, 2));
  if (wantsJson) return json(res, 200, { checkoutUrl: draftOrder.invoiceUrl, orderId: orderRecord.id });
  res.writeHead(303, { Location: draftOrder.invoiceUrl });
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
    const headers = { "Content-Type": contentType };
    if (contentType.includes("text/html")) headers["X-Robots-Tag"] = "noindex, nofollow";
    res.writeHead(200, headers);
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
    .badge-price-chart__list{display:grid;gap:10px}
    .badge-price-chart__row{display:grid;gap:8px;border:1px solid var(--line);border-radius:6px;padding:10px;background:#fbfcff}
    .badge-price-chart__row>strong{display:block;font-size:13px;line-height:1.25;color:var(--ink)}
    .badge-price-chart__prices{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
    .badge-price-chart__prices span{display:grid;gap:2px;min-width:0;border:1px solid #e1e6ef;border-radius:4px;background:#fff;padding:6px;text-align:center;font-size:12px;line-height:1.15}
    .badge-price-chart__prices b{display:block;color:#344055;font-size:10px;letter-spacing:.02em}
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
                <option value="pickup-spring-valley">Pickup at Spring Valley</option>
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

function premierAwardCardsHtml(products) {
  return products.map((product, index) => {
    const startingPrice = premierAwardTier(product, 1).unitPrice;
    return `
      <button class="award-card${index === 0 ? " active" : ""}" type="button" data-sku="${escapeHtml(product.sku)}">
        <img src="${escapeHtml(product.thumbnail || product.image)}" alt="${escapeHtml(product.imageAlt || product.displayName || product.title)}" loading="lazy">
        <strong>${escapeHtml(product.displayName || product.title)}</strong>
        <span>${escapeHtml([product.productType, product.size].filter(Boolean).join(" - "))}</span>
        <em>Starts at $${startingPrice.toFixed(2)} each</em>
      </button>`;
  }).join("");
}

function premierAwardsPageHtml(catalogId = "baseball-softball") {
  const catalog = premierAwardCatalog(catalogId);
  const products = catalog.products;
  const first = products[0];
  const itemPlural = catalog.itemPlural || "trophies";
  const plateLabel = catalog.plateLabel || "Personalized plate text";
  const platePlaceholder = catalog.platePlaceholder || "Enter one trophy plate per line. Example:\nMVP - Jackson Smith\nCoach Award - Sarah Lee";
  const notesPlaceholder = catalog.notesPlaceholder || "Tell us anything else we should know about layout, deadline, team, or award wording.";
  const submitLabel = catalog.submitLabel || "Add trophies to checkout";
  const searchLabel = catalog.searchLabel || "Search trophies";
  const searchPlaceholder = catalog.searchPlaceholder || "Search by name, size, or SKU";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(catalog.title)} | Recognition Direct</title>
  <meta name="description" content="${escapeHtml(catalog.metaDescription)}">
  <style>
    :root{--ink:#18212f;--muted:#5d6675;--line:#d9dee7;--accent:#c6262e;--blue:#3154b8}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:var(--ink);font:16px/1.45 Arial,Helvetica,sans-serif}
    .wrap{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:38px 0 54px}
    .eyebrow{margin:0 0 8px;color:var(--accent);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    h1{margin:0;font-size:clamp(38px,5vw,62px);line-height:1;letter-spacing:0}
    .intro{max-width:760px;margin:14px 0 26px;color:var(--muted);font-size:18px}
    .layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.72fr);gap:28px;align-items:start}
    .panel{border:1px solid var(--line);border-radius:8px;background:#fff;padding:18px}
    .gallery{background:linear-gradient(135deg,#fff,#eef2f8)}
    .toolbar{display:flex;gap:12px;align-items:end;margin-bottom:14px}
    .toolbar label{display:block;margin:0 0 5px;font-size:12px;font-weight:900;color:#344055}
    .toolbar input{width:100%;min-height:40px;border:1px solid #b9c3d2;border-radius:4px;padding:9px;font:inherit}
    .toolbar>div{flex:1}
    .award-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-height:760px;overflow:auto;padding-right:4px}
    .award-card{display:grid;gap:8px;align-content:start;width:100%;min-height:245px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:12px;text-align:left;cursor:pointer}
    .award-card:hover,.award-card.active{border-color:var(--blue);box-shadow:0 0 0 1px var(--blue) inset}
    .award-card img{display:block;width:100%;height:130px;object-fit:contain;background:#f8fafc;border-radius:4px}
    .award-card strong{font-size:14px;line-height:1.2}
    .award-card span{color:var(--muted);font-size:12px}
    .award-card em{color:var(--accent);font-style:normal;font-size:13px;font-weight:900}
    .selected{display:grid;gap:14px}
    .preview{display:block;width:100%;height:360px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#f8fafc}
    form{display:grid;gap:16px}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .full{grid-column:1/-1}
    label{display:block;margin:0 0 6px;font-size:13px;font-weight:900;color:#344055}
    input,select,textarea{width:100%;min-height:44px;border:1px solid #b9c3d2;border-radius:4px;padding:10px;font:inherit;background:#fff}
    textarea{min-height:112px;resize:vertical}
    .note{margin:8px 0 0;color:var(--muted);font-size:13px}
    .description{color:var(--muted);font-size:14px}
    .tier-table{width:100%;border-collapse:collapse;font-size:13px}
    .tier-table th,.tier-table td{padding:7px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
    .tier-table th:first-child,.tier-table td:first-child{text-align:left}
    .tier-table thead th{background:#f1f5ff}
    .estimate{border-radius:8px;background:#18212f;color:#fff;padding:16px}
    .estimate small{display:block;color:#d7dde8;text-transform:uppercase;font-weight:900;letter-spacing:.05em}
    .estimate strong{display:block;margin:4px 0;font-size:34px;line-height:1}
    .estimate span{color:#d7dde8}
    button.submit{min-height:50px;border:0;border-radius:4px;background:var(--accent);color:#fff;font:inherit;font-weight:900;cursor:pointer}
    [hidden]{display:none!important}
    @media(max-width:980px){.layout{grid-template-columns:1fr}.award-grid{grid-template-columns:repeat(2,minmax(0,1fr));max-height:none}.preview{height:280px}}
    @media(max-width:560px){.award-grid,.grid{grid-template-columns:1fr}.toolbar{display:block}.toolbar>div{margin-bottom:10px}}
  </style>
</head>
<body>
  <main class="wrap">
    <p class="eyebrow">Recognition Direct</p>
    <h1>${escapeHtml(catalog.title)}</h1>
    <p class="intro">${escapeHtml(catalog.intro)}</p>

    <div class="layout">
      <section class="panel gallery" aria-label="${escapeHtml(catalog.galleryLabel)}">
        <div class="toolbar">
          <div>
            <label for="award_search">${escapeHtml(searchLabel)}</label>
            <input id="award_search" data-search placeholder="${escapeHtml(searchPlaceholder)}">
          </div>
        </div>
        <div class="award-grid" data-award-grid>${premierAwardCardsHtml(products)}</div>
      </section>

      <section class="selected" data-selected-panel>
        <img class="preview" data-preview src="${escapeHtml(first.image)}" alt="${escapeHtml(first.imageAlt || first.displayName || first.title)}">
        <div class="panel">
          <h2 data-selected-title>${escapeHtml(first.displayName || first.title)}</h2>
          <p class="description" data-selected-description>${escapeHtml(first.description)}</p>
          <table class="tier-table" aria-label="Quantity price breaks">
            <thead><tr><th>Qty</th><th>Each</th></tr></thead>
            <tbody data-price-table></tbody>
          </table>
        </div>
        <form action="${APP_BASE_URL}/api/premier-award-checkout" method="post" enctype="multipart/form-data" data-award-form>
          <input type="hidden" name="catalog" value="${escapeHtml(catalog.id)}">
          <input type="hidden" name="sku" value="${escapeHtml(first.sku)}">
          <div class="panel grid">
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
            <div class="full">
              <label for="plate_text">${escapeHtml(plateLabel)}</label>
              <textarea id="plate_text" name="plate_text" placeholder="${escapeHtml(platePlaceholder)}"></textarea>
              <p class="note">You can also upload a names/text file below. We will send a proof before production.</p>
            </div>
            <div>
              <label for="names_file">Names / plate text file</label>
              <input id="names_file" name="names_file" type="file" accept=".txt,.csv,text/plain,text/csv">
            </div>
            <div>
              <label for="artwork">Logo / artwork upload</label>
              <input id="artwork" name="artwork" type="file" accept=".pdf,.ai,.eps,.psd,.jpg,.jpeg,.png">
            </div>
          </div>

          <div class="panel grid">
            <div>
              <label for="name">Name</label>
              <input id="name" name="name" required>
            </div>
            <div>
              <label for="company">Company / Team</label>
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
              <textarea id="notes" name="notes" placeholder="${escapeHtml(notesPlaceholder)}"></textarea>
            </div>
          </div>

          <div class="estimate">
            <small data-price-label>Checking price...</small>
            <strong data-price-total>$0.00</strong>
            <span data-price-message>You will receive a proof before production.</span>
          </div>
          <button class="submit" type="submit">${escapeHtml(submitLabel)}</button>
        </form>
      </section>
    </div>
  </main>
  <script>
    const products = ${JSON.stringify(products)};
    const form = document.querySelector('[data-award-form]');
    const cards = [...document.querySelectorAll('[data-sku]')];
    const preview = document.querySelector('[data-preview]');
    const selectedTitle = document.querySelector('[data-selected-title]');
    const selectedDescription = document.querySelector('[data-selected-description]');
    const priceTable = document.querySelector('[data-price-table]');
    const priceLabel = document.querySelector('[data-price-label]');
    const priceTotal = document.querySelector('[data-price-total]');
    const priceMessage = document.querySelector('[data-price-message]');
    const search = document.querySelector('[data-search]');
    const selectedPanel = document.querySelector('[data-selected-panel]');
    let selectedProduct = products[0];

    function money(value) {
      return '$' + Number(value).toFixed(2);
    }

    function tierFor(product, quantity) {
      const caseQuantity = Math.max(1, Number(product.caseQuantity || 1));
      const prices = product.prices || {};
      const tiers = [
        { minimumQuantity: caseQuantity * 40, unitPrice: prices.fortyCases, label: '40 case price' },
        { minimumQuantity: caseQuantity * 20, unitPrice: prices.twentyCases, label: '20 case price' },
        { minimumQuantity: caseQuantity * 10, unitPrice: prices.tenCases, label: '10 case price' },
        { minimumQuantity: caseQuantity * 5, unitPrice: prices.fiveCases, label: '5 case price' },
        { minimumQuantity: caseQuantity, unitPrice: prices.oneCase, label: 'case price' },
        { minimumQuantity: 1, unitPrice: prices.lessThanCase, label: 'less than case price' },
      ];
      return tiers.find((tier) => quantity >= tier.minimumQuantity && Number.isFinite(tier.unitPrice)) || tiers[tiers.length - 1];
    }

    function renderTiers(product) {
      const caseQuantity = Math.max(1, Number(product.caseQuantity || 1));
      const tiers = [
        { label: '1-' + Math.max(1, caseQuantity - 1), unitPrice: product.prices.lessThanCase },
        { label: caseQuantity + '+', unitPrice: product.prices.oneCase },
        { label: (caseQuantity * 5) + '+', unitPrice: product.prices.fiveCases },
        { label: (caseQuantity * 10) + '+', unitPrice: product.prices.tenCases },
        { label: (caseQuantity * 20) + '+', unitPrice: product.prices.twentyCases },
        { label: (caseQuantity * 40) + '+', unitPrice: product.prices.fortyCases },
      ].filter((tier) => Number.isFinite(tier.unitPrice));
      const uniquePrices = [...new Set(tiers.map((tier) => Number(tier.unitPrice).toFixed(2)))];
      if (uniquePrices.length === 1) {
        priceTable.innerHTML = '<tr><td>1+</td><td>' + money(tiers[0].unitPrice) + '</td></tr>';
        return;
      }
      priceTable.innerHTML = tiers.map((tier) => '<tr><td>' + tier.label + '</td><td>' + money(tier.unitPrice) + '</td></tr>').join('');
    }

    function updatePrice() {
      const quantity = Math.max(1, Number.parseInt(form.elements.order_quantity.value || '1', 10));
      const tier = tierFor(selectedProduct, quantity);
      const total = Number(tier.unitPrice) * quantity;
      priceLabel.textContent = money(tier.unitPrice) + ' each - ' + tier.label;
      priceTotal.textContent = money(total);
      priceMessage.textContent = 'Estimated total for ' + quantity + ' ${escapeHtml(itemPlural)}. Proof required before production.';
      sendHeight();
    }

    function scrollToSelectedPanel() {
      if (!selectedPanel || !window.matchMedia('(max-width: 980px)').matches) return;
      window.setTimeout(() => {
        window.parent?.postMessage({
          type: 'rd-awards-select',
          offsetTop: selectedPanel.offsetTop
        }, '*');
        selectedPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }

    function selectProduct(sku, shouldScroll = false) {
      selectedProduct = products.find((product) => product.sku === sku) || products[0];
      form.elements.sku.value = selectedProduct.sku;
      preview.src = selectedProduct.image;
      preview.alt = selectedProduct.imageAlt || selectedProduct.displayName || selectedProduct.title;
      selectedTitle.textContent = selectedProduct.displayName || selectedProduct.title;
      selectedDescription.textContent = selectedProduct.description;
      renderTiers(selectedProduct);
      cards.forEach((card) => card.classList.toggle('active', card.dataset.sku === selectedProduct.sku));
      updatePrice();
      if (shouldScroll) scrollToSelectedPanel();
    }

    function filterProducts() {
      const term = search.value.trim().toLowerCase();
      cards.forEach((card) => {
        const product = products.find((entry) => entry.sku === card.dataset.sku);
        const haystack = [product.sku, product.title, product.displayName, product.size, product.optionValue, product.productType].join(' ').toLowerCase();
        card.hidden = term && !haystack.includes(term);
      });
      sendHeight();
    }

    function sendHeight() {
      window.parent?.postMessage({ type: 'rd-awards-height', height: document.documentElement.scrollHeight }, '*');
    }

    cards.forEach((card) => card.addEventListener('click', () => selectProduct(card.dataset.sku, true)));
    form.elements.order_quantity.addEventListener('input', updatePrice);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      const originalText = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = 'Creating checkout...';
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'fetch'
          }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.checkoutUrl) {
          throw new Error(result.error || 'Unable to create checkout.');
        }
        window.top.location.href = result.checkoutUrl;
      } catch (error) {
        alert(error.message || 'Unable to create checkout. Please try again.');
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    });
    search.addEventListener('input', filterProducts);
    window.addEventListener('load', sendHeight);
    window.addEventListener('resize', sendHeight);
    selectProduct(products[0].sku);
  </script>
</body>
</html>`;
}

function polarCamelCardsHtml(products) {
  return products.map((product, index) => {
    const firstPricedVariant = (product.variants || []).find((variant) => {
      try {
        return Number.isFinite(polarCamelTier(variant, 1).unitPrice);
      } catch {
        return false;
      }
    }) || product.variants?.[0];
    const startingPrice = firstPricedVariant ? polarCamelTier(firstPricedVariant, 1).unitPrice : 0;
    const variantCount = (product.variants || []).length;
    const optionLabel = variantCount > 1 ? `${variantCount} colors/options` : "1 option";
    const visibleOptions = (product.variants || [])
      .slice(0, 6)
      .map((variant) => `<b>${escapeHtml(variant.optionValue || variant.sku)}</b>`)
      .join("");
    const moreOptions = variantCount > 6 ? `<b>+${variantCount - 6} more</b>` : "";
    return `
      <button class="product-card${index === 0 ? " active" : ""}" type="button" data-handle="${escapeHtml(product.handle)}">
        <img src="${escapeHtml(product.thumbnail || product.image)}" alt="${escapeHtml(product.title)}" loading="lazy">
        <strong>${escapeHtml(product.title)}</strong>
        <span>${escapeHtml(product.type || "Polar Camel")} - ${escapeHtml(optionLabel)}</span>
        <span class="option-preview">${visibleOptions}${moreOptions}</span>
        <em>Starts at $${startingPrice.toFixed(2)} each</em>
      </button>`;
  }).join("");
}

function polarCamelPageHtml() {
  const products = polarCamelProducts;
  const first = products[0];
  const firstVariant = first?.variants?.[0];
  const types = [...new Set(products.map((product) => product.type).filter(Boolean))].sort();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Polar Camel Drinkware | Recognition Direct</title>
  <meta name="description" content="Order personalized Polar Camel tumblers, mugs, bottles, bowls, and drinkware from Recognition Direct with proof before production.">
  <style>
    :root{--ink:#18212f;--muted:#5d6675;--line:#d9dee7;--accent:#c6262e;--blue:#3154b8;--soft:#f5f7fb}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:var(--ink);font:16px/1.45 Arial,Helvetica,sans-serif}
    .wrap{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:38px 0 54px}
    .eyebrow{margin:0 0 8px;color:var(--accent);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    h1{margin:0;font-size:clamp(36px,5vw,62px);line-height:1;letter-spacing:0}
    h2{margin:0 0 8px;font-size:24px;line-height:1.15}
    .intro{max-width:800px;margin:14px 0 26px;color:var(--muted);font-size:18px}
    .layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.72fr);gap:28px;align-items:start}
    .panel{border:1px solid var(--line);border-radius:8px;background:#fff;padding:18px}
    .gallery{background:linear-gradient(135deg,#fff,#eef2f8)}
    .toolbar{display:grid;grid-template-columns:1fr 220px;gap:12px;align-items:end;margin-bottom:14px}
    .toolbar label,label{display:block;margin:0 0 6px;font-size:13px;font-weight:900;color:#344055}
    input,select,textarea{width:100%;min-height:44px;border:1px solid #b9c3d2;border-radius:4px;padding:10px;font:inherit;background:#fff}
    textarea{min-height:112px;resize:vertical}
    .product-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-height:760px;overflow:auto;padding-right:4px}
    .product-card{display:grid;gap:8px;align-content:start;width:100%;min-height:242px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:12px;text-align:left;cursor:pointer}
    .product-card:hover,.product-card.active{border-color:var(--blue);box-shadow:0 0 0 1px var(--blue) inset}
    .product-card img{display:block;width:100%;height:128px;object-fit:contain;background:#f8fafc;border-radius:4px}
    .product-card strong{font-size:14px;line-height:1.2}
    .product-card span{color:var(--muted);font-size:12px}
    .product-card em{color:var(--accent);font-style:normal;font-size:13px;font-weight:900}
    .option-preview{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
    .option-preview b{display:inline-flex;align-items:center;min-height:22px;border:1px solid var(--line);border-radius:999px;background:#f8fafc;padding:2px 7px;color:#344055;font-size:11px;line-height:1.1}
    .selected{display:grid;gap:14px}
    .preview{display:block;width:100%;height:340px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#f8fafc}
    form{display:grid;gap:16px}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .full{grid-column:1/-1}
    .variant-picks{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    .variant-pick{display:inline-flex;align-items:center;gap:7px;width:auto;min-height:34px;border:1px solid var(--line);border-radius:999px;background:#fff;padding:6px 10px;color:var(--ink);font:inherit;font-size:13px;cursor:pointer}
    .variant-pick:hover,.variant-pick.active{border-color:var(--blue);box-shadow:0 0 0 1px var(--blue) inset}
    .swatch{display:inline-block;width:16px;height:16px;border:1px solid #9aa4b2;border-radius:50%;background:#f8fafc;flex:0 0 auto}
    .description{color:var(--muted);font-size:14px}
    .tier-table{width:100%;border-collapse:collapse;font-size:13px}
    .tier-table th,.tier-table td{padding:7px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
    .tier-table th:first-child,.tier-table td:first-child{text-align:left}
    .tier-table thead th{background:#f1f5ff}
    .note{margin:8px 0 0;color:var(--muted);font-size:13px}
    .estimate{border-radius:8px;background:#18212f;color:#fff;padding:16px}
    .estimate small{display:block;color:#d7dde8;text-transform:uppercase;font-weight:900;letter-spacing:.05em}
    .estimate strong{display:block;margin:4px 0;font-size:34px;line-height:1}
    .estimate span{color:#d7dde8}
    button.submit{min-height:50px;border:0;border-radius:4px;background:var(--accent);color:#fff;font:inherit;font-weight:900;cursor:pointer}
    [hidden]{display:none!important}
    @media(max-width:980px){.layout{grid-template-columns:1fr}.product-grid{grid-template-columns:repeat(2,minmax(0,1fr));max-height:none}.preview{height:280px}}
    @media(max-width:560px){.toolbar,.product-grid,.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="wrap">
    <p class="eyebrow">Recognition Direct</p>
    <h1>Polar Camel Drinkware</h1>
    <p class="intro">Choose a Polar Camel item, select the color or option, add personalization details, and checkout online. We will send a proof before production.</p>

    <div class="layout">
      <section class="panel gallery" aria-label="Polar Camel products">
        <div class="toolbar">
          <div>
            <label for="polar_search">Search Polar Camel</label>
            <input id="polar_search" data-search placeholder="Search by item, color, SKU, or type">
          </div>
          <div>
            <label for="polar_type">Category</label>
            <select id="polar_type" data-type-filter>
              <option value="">All Polar Camel</option>
              ${types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="product-grid" data-product-grid>${polarCamelCardsHtml(products)}</div>
      </section>

      <section class="selected">
        <img class="preview" data-preview src="${escapeHtml(firstVariant?.image || first?.image || "")}" alt="${escapeHtml(first?.title || "Polar Camel")}">
        <div class="panel">
          <h2 data-selected-title>${escapeHtml(first?.title || "Polar Camel")}</h2>
          <p class="description" data-selected-description>${escapeHtml(first?.description || "")}</p>
          <table class="tier-table" aria-label="Quantity price breaks">
            <thead><tr><th>Qty</th><th>Each</th></tr></thead>
            <tbody data-price-table></tbody>
          </table>
        </div>
        <form action="${APP_BASE_URL}/api/polar-camel-checkout" method="post" enctype="multipart/form-data" data-polar-form>
          <input type="hidden" name="sku" value="${escapeHtml(firstVariant?.sku || "")}">
          <div class="panel grid">
            <div class="full">
              <label for="variant_select" data-variant-label>${escapeHtml(first?.optionName || "Option")}</label>
              <select id="variant_select" data-variant-select></select>
              <div class="variant-picks" data-variant-picks aria-label="Available colors and options"></div>
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
                <option value="pickup-spring-valley">Pickup at Spring Valley</option>
              </select>
            </div>
            <div class="full">
              <label for="personalization_text">Personalization details</label>
              <textarea id="personalization_text" name="personalization_text" placeholder="Enter names, initials, logo placement, engraving notes, or one item per line."></textarea>
              <p class="note">Upload a logo or text file below if that is easier. We will send a proof before production.</p>
            </div>
            <div>
              <label for="personalization_file">Names / text file</label>
              <input id="personalization_file" name="personalization_file" type="file" accept=".txt,.csv,text/plain,text/csv">
            </div>
            <div>
              <label for="artwork">Logo / artwork upload</label>
              <input id="artwork" name="artwork" type="file" accept=".pdf,.ai,.eps,.psd,.jpg,.jpeg,.png">
            </div>
          </div>

          <div class="panel grid">
            <div>
              <label for="name">Name</label>
              <input id="name" name="name" required>
            </div>
            <div>
              <label for="company">Company / Team</label>
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
              <textarea id="notes" name="notes" placeholder="Tell us anything else we should know about layout, deadline, or personalization."></textarea>
            </div>
          </div>

          <div class="estimate">
            <small data-price-label>Checking price...</small>
            <strong data-price-total>$0.00</strong>
            <span data-price-message>You will receive a proof before production.</span>
          </div>
          <button class="submit" type="submit">Add Polar Camel item to checkout</button>
        </form>
      </section>
    </div>
  </main>
  <script>
    const products = ${JSON.stringify(products)};
    const form = document.querySelector('[data-polar-form]');
    const cards = [...document.querySelectorAll('[data-handle]')];
    const preview = document.querySelector('[data-preview]');
    const selectedTitle = document.querySelector('[data-selected-title]');
    const selectedDescription = document.querySelector('[data-selected-description]');
    const variantSelect = document.querySelector('[data-variant-select]');
    const variantLabel = document.querySelector('[data-variant-label]');
    const variantPicks = document.querySelector('[data-variant-picks]');
    const priceTable = document.querySelector('[data-price-table]');
    const priceLabel = document.querySelector('[data-price-label]');
    const priceTotal = document.querySelector('[data-price-total]');
    const priceMessage = document.querySelector('[data-price-message]');
    const search = document.querySelector('[data-search]');
    const typeFilter = document.querySelector('[data-type-filter]');
    let selectedProduct = products[0];
    let selectedVariant = selectedProduct?.variants?.[0];

    function money(value) { return '$' + Number(value || 0).toFixed(2); }
    function swatchStyle(value) {
      const name = String(value || '').toLowerCase();
      const colors = [
        ['stainless', 'linear-gradient(135deg,#f9fafb,#9ca3af 48%,#f3f4f6)'],
        ['black', '#111827'],
        ['white', '#ffffff'],
        ['red', '#cf2430'],
        ['royal blue', '#2457c5'],
        ['navy', '#102a56'],
        ['blue', '#3154b8'],
        ['pink', '#f472b6'],
        ['teal', '#0f9f9a'],
        ['light blue', '#8fd3ff'],
        ['light purple', '#c4a7e7'],
        ['purple', '#7c3aed'],
        ['dark gray', '#4b5563'],
        ['gray', '#6b7280'],
        ['orange', '#f97316'],
        ['maroon', '#7f1d1d'],
        ['green', '#15803d'],
        ['yellow', '#facc15'],
        ['coral', '#fb7185'],
        ['olive', '#6b7d2a'],
      ];
      const match = colors.find(([label]) => name.includes(label));
      return 'background:' + (match ? match[1] : '#f8fafc');
    }
    function tierFor(variant, quantity) {
      const caseQuantity = Math.max(1, Number(variant.caseQuantity || 1));
      const prices = variant.prices || {};
      const tiers = [
        { minimumQuantity: caseQuantity * 40, unitPrice: prices.fortyCases, label: '40 case price' },
        { minimumQuantity: caseQuantity * 20, unitPrice: prices.twentyCases, label: '20 case price' },
        { minimumQuantity: caseQuantity * 10, unitPrice: prices.tenCases, label: '10 case price' },
        { minimumQuantity: caseQuantity * 5, unitPrice: prices.fiveCases, label: '5 case price' },
        { minimumQuantity: caseQuantity, unitPrice: prices.oneCase, label: 'case price' },
        { minimumQuantity: 1, unitPrice: prices.lessThanCase, label: 'less than case price' },
      ];
      return tiers.find((tier) => quantity >= tier.minimumQuantity && Number.isFinite(tier.unitPrice)) || tiers.find((tier) => Number.isFinite(tier.unitPrice));
    }
    function renderTiers(variant) {
      const caseQuantity = Math.max(1, Number(variant.caseQuantity || 1));
      const rows = [
        { label: '1-' + Math.max(1, caseQuantity - 1), unitPrice: variant.prices.lessThanCase },
        { label: caseQuantity + '+', unitPrice: variant.prices.oneCase },
        { label: (caseQuantity * 5) + '+', unitPrice: variant.prices.fiveCases },
        { label: (caseQuantity * 10) + '+', unitPrice: variant.prices.tenCases },
        { label: (caseQuantity * 20) + '+', unitPrice: variant.prices.twentyCases },
        { label: (caseQuantity * 40) + '+', unitPrice: variant.prices.fortyCases },
      ].filter((tier) => Number.isFinite(tier.unitPrice));
      priceTable.innerHTML = rows.map((tier) => '<tr><td>' + tier.label + '</td><td>' + money(tier.unitPrice) + '</td></tr>').join('');
    }
    function updatePrice() {
      const quantity = Math.max(1, Number.parseInt(form.elements.order_quantity.value || '1', 10));
      const tier = tierFor(selectedVariant, quantity);
      const unitPrice = Number(tier?.unitPrice || 0);
      priceLabel.textContent = money(unitPrice) + ' each - ' + (tier?.label || 'price');
      priceTotal.textContent = money(unitPrice * quantity);
      priceMessage.textContent = 'Estimated total for ' + quantity + ' item' + (quantity === 1 ? '' : 's') + '. Proof required before production.';
      sendHeight();
    }
    function selectVariant(sku) {
      selectedVariant = selectedProduct.variants.find((variant) => variant.sku === sku) || selectedProduct.variants[0];
      form.elements.sku.value = selectedVariant.sku;
      variantSelect.value = selectedVariant.sku;
      variantPicks.querySelectorAll('[data-sku]').forEach((button) => button.classList.toggle('active', button.dataset.sku === selectedVariant.sku));
      preview.src = selectedVariant.image || selectedProduct.image;
      preview.alt = selectedVariant.title || selectedProduct.title;
      selectedDescription.textContent = selectedVariant.description || selectedProduct.description || '';
      renderTiers(selectedVariant);
      updatePrice();
    }
    function selectProduct(handle) {
      selectedProduct = products.find((product) => product.handle === handle) || products[0];
      selectedVariant = selectedProduct.variants[0];
      selectedTitle.textContent = selectedProduct.title;
      variantLabel.textContent = selectedProduct.optionName || 'Option';
      variantSelect.innerHTML = selectedProduct.variants.map((variant) => '<option value="' + variant.sku + '">' + variant.optionValue + ' - ' + variant.sku + '</option>').join('');
      variantPicks.innerHTML = selectedProduct.variants.map((variant) => '<button class="variant-pick" type="button" data-sku="' + variant.sku + '"><span class="swatch" style="' + swatchStyle(variant.optionValue) + '"></span>' + variant.optionValue + '</button>').join('');
      variantPicks.querySelectorAll('[data-sku]').forEach((button) => button.addEventListener('click', () => selectVariant(button.dataset.sku)));
      cards.forEach((card) => card.classList.toggle('active', card.dataset.handle === selectedProduct.handle));
      selectVariant(selectedVariant.sku);
    }
    function filterProducts() {
      const term = search.value.trim().toLowerCase();
      const selectedType = typeFilter.value;
      cards.forEach((card) => {
        const product = products.find((entry) => entry.handle === card.dataset.handle);
        const variants = (product.variants || []).map((variant) => [variant.sku, variant.optionValue, variant.title].join(' ')).join(' ');
        const haystack = [product.title, product.type, product.handle, variants].join(' ').toLowerCase();
        card.hidden = (selectedType && product.type !== selectedType) || (term && !haystack.includes(term));
      });
      sendHeight();
    }
    function sendHeight() {
      window.parent?.postMessage({ type: 'rd-polar-camel-height', height: document.documentElement.scrollHeight }, '*');
    }
    cards.forEach((card) => card.addEventListener('click', () => selectProduct(card.dataset.handle)));
    variantSelect.addEventListener('change', () => selectVariant(variantSelect.value));
    form.elements.order_quantity.addEventListener('input', updatePrice);
    search.addEventListener('input', filterProducts);
    typeFilter.addEventListener('change', filterProducts);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      const originalText = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = 'Creating checkout...';
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.checkoutUrl) throw new Error(result.error || 'Unable to create checkout.');
        window.top.location.href = result.checkoutUrl;
      } catch (error) {
        alert(error.message || 'Unable to create checkout. Please try again.');
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    });
    window.addEventListener('load', sendHeight);
    window.addEventListener('resize', sendHeight);
    selectProduct(products[0].handle);
  </script>
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
    .product-card img{display:block;width:auto;max-width:100%;height:auto;max-height:180px;margin:0 auto;object-fit:contain;background:#ef2d32;border-radius:4px}
    .product-card strong{font-size:15px;line-height:1.2}
    .product-card em{color:var(--accent);font-style:normal;font-weight:900}
    .product-card small{color:var(--muted);font-size:12px}
    .pill{position:absolute;top:10px;left:10px;z-index:1;border-radius:999px;background:#18212f;color:#fff;padding:4px 8px;font-size:11px;font-weight:900;text-transform:uppercase}
    .selected{display:grid;gap:14px}
    .preview{display:block;width:auto;max-width:100%;height:auto;max-height:520px;margin:0 auto;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#ef2d32}
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
    <p class="intro">Choose a solar placard size and upload the PDF plan sheet that contains the design, or choose a solar plate and enter the text you want printed. You will receive a proof before production.</p>

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
        <form action="${APP_BASE_URL}/api/solar-placard-checkout" method="post" enctype="multipart/form-data" data-solar-form>
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
                <option value="pickup-spring-valley">Pickup at Spring Valley</option>
              </select>
            </div>
            <div data-custom-size hidden>
              <label for="custom_width">Custom width in inches</label>
              <input id="custom_width" name="custom_width" type="number" min="0.1" max="${SOLAR_CUSTOM_PLATE_MAX_LONG_SIDE_INCHES}" step="0.1">
            </div>
            <div data-custom-size hidden>
              <label for="custom_height">Custom height in inches</label>
              <input id="custom_height" name="custom_height" type="number" min="0.1" max="${SOLAR_CUSTOM_PLATE_MAX_LONG_SIDE_INCHES}" step="0.1">
            </div>
            <div class="full" data-custom-size hidden>
              <p class="note">Custom solar plates can be up to 12&quot; x 24&quot; or 24&quot; x 12&quot; max.</p>
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
      <span data-price-message>You will receive a proof before production.</span>
          </div>
          <button class="submit" type="submit">Add solar item to checkout</button>
        </form>
      </section>
    </div>
  </main>
  <script>
    const products = ${JSON.stringify(SOLAR_PLACARD_PRODUCTS)};
    const customSquareInchRate = ${SOLAR_CUSTOM_PLATE_SQUARE_INCH_RATE};
    const customMaxLongSide = ${SOLAR_CUSTOM_PLATE_MAX_LONG_SIDE_INCHES};
    const customMaxShortSide = ${SOLAR_CUSTOM_PLATE_MAX_SHORT_SIDE_INCHES};
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
      const customWidth = Number.parseFloat(form.elements.custom_width.value || '');
      const customHeight = Number.parseFloat(form.elements.custom_height.value || '');
      if (selectedProduct.key === 'plate-custom' && Number.isFinite(customWidth) && Number.isFinite(customHeight) && customWidth > 0 && customHeight > 0) {
        const area = customWidth * customHeight;
        const shortSide = Math.min(customWidth, customHeight);
        const longSide = Math.max(customWidth, customHeight);
        if (longSide > customMaxLongSide || shortSide > customMaxShortSide) {
          priceLabel.textContent = 'Size too large';
          priceTotal.textContent = 'Adjust size';
          priceMessage.textContent = 'Maximum custom plate size is 12" x 24" or 24" x 12".';
          return;
        }
        const unitPrice = area * customSquareInchRate;
        priceLabel.textContent = money(customSquareInchRate) + ' per square inch';
        priceTotal.textContent = money(unitPrice * quantity);
        priceMessage.textContent = area.toFixed(2) + ' sq in each. Estimated total based on custom size and quantity.';
      } else if (selectedProduct.key === 'plate-custom') {
        priceLabel.textContent = money(customSquareInchRate) + ' per square inch';
        priceTotal.textContent = 'Enter size';
        priceMessage.textContent = 'Enter custom width and height in inches to estimate the price.';
      } else if (Number.isFinite(selectedProduct.unitPrice)) {
        priceLabel.textContent = money(selectedProduct.unitPrice) + ' each';
        priceTotal.textContent = money(selectedProduct.unitPrice * quantity);
        priceMessage.textContent = 'Estimated total based on selected item and quantity. You will receive a proof before production.';
      } else {
        priceLabel.textContent = 'Pricing review required';
        priceTotal.textContent = 'Quote';
        priceMessage.textContent = 'Submit this item and we will confirm pricing before production.';
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
    form.elements.custom_width.addEventListener('input', updatePrice);
    form.elements.custom_height.addEventListener('input', updatePrice);
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
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/solar-placard-")) return json(res, 204, {}, corsHeaders(req));
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/premier-award-")) return json(res, 204, {}, corsHeaders(req));
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/polar-camel-")) return json(res, 204, {}, corsHeaders(req));
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/express-one-")) return json(res, 204, {}, corsHeaders(req));
    if (req.method === "GET" && url.pathname === "/api/catalog-product") return await handleCatalogProduct(req, res, url);
    if (req.method === "POST" && url.pathname === "/api/catalog-price") return await handleCatalogPrice(req, res);
    if (req.method === "POST" && url.pathname === "/api/name-badge-price") return await handleNameBadgePrice(req, res);
    if (req.method === "POST" && url.pathname === "/api/solar-placard-price") return await handleSolarPlacardPrice(req, res);
    if (req.method === "POST" && url.pathname === "/api/premier-award-price") return await handlePremierAwardPrice(req, res);
    if (req.method === "POST" && url.pathname === "/api/polar-camel-price") return await handlePolarCamelPrice(req, res);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/custom-13oz-vinyl-banner")) {
      return await servePublicFile(res, "custom-13oz-vinyl-banner.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/name-badges") return html(res, 200, nameBadgePageHtml());
    if (req.method === "GET" && url.pathname === "/custom-name-badges") return html(res, 200, customNameBadgePageHtml());
    if (req.method === "GET" && url.pathname === "/custom-name-badges/thanks") return html(res, 200, customNameBadgeThanksHtml(url));
    if (req.method === "GET" && url.pathname === "/express-one") return html(res, 200, expressOneLoginHtml());
    if (req.method === "GET" && url.pathname === "/express-one/open") return await handleExpressOneOpen(req, res, url);
    if (req.method === "GET" && url.pathname === "/express-one/release-thanks") return html(res, 200, expressOneReleaseThanksHtml(url.searchParams.get("id") || ""));
    if (req.method === "GET" && url.pathname.startsWith("/express-one/customer/")) {
      const customerId = decodeURIComponent(url.pathname.slice("/express-one/customer/".length));
      const customer = await expressOneCustomer(customerId, url.searchParams.get("code") || "");
      return customer ? html(res, 200, expressOneDashboardHtml(customer)) : html(res, 404, expressOneNotFoundHtml());
    }
    if (req.method === "GET" && url.pathname === "/solar-placards") return html(res, 200, solarPlacardsPageHtml());
    if (req.method === "GET" && url.pathname === "/solar-placards/thanks") return html(res, 200, solarPlacardsThanksHtml(url));
    if (req.method === "GET" && url.pathname === "/baseball-softball-resin-trophies") return html(res, 200, premierAwardsPageHtml("baseball-softball"));
    if (req.method === "GET" && url.pathname === "/soccer-resin-trophies") return html(res, 200, premierAwardsPageHtml("soccer"));
    if (req.method === "GET" && url.pathname === "/acrylic-awards") return html(res, 200, premierAwardsPageHtml("acrylic"));
    if (req.method === "GET" && url.pathname === "/award-plaques") return html(res, 200, premierAwardsPageHtml("plaques"));
    if (req.method === "GET" && url.pathname === "/executive-awards") return html(res, 200, premierAwardsPageHtml("executive-awards"));
    if (req.method === "GET" && url.pathname === "/glass-crystal-awards") return html(res, 200, premierAwardsPageHtml("glass-crystal-awards"));
    if (req.method === "GET" && url.pathname === "/award-clocks") return html(res, 200, premierAwardsPageHtml("clocks"));
    if (req.method === "GET" && url.pathname === "/office-accessories") return html(res, 200, premierAwardsPageHtml("office-accessories"));
    if (req.method === "GET" && url.pathname === "/cutting-boards") return html(res, 200, premierAwardsPageHtml("cutting-boards"));
    if (req.method === "GET" && url.pathname === "/bison-river-knives") return html(res, 200, premierAwardsPageHtml("bison-river-knives"));
    if (req.method === "GET" && url.pathname === "/award-drinkware") return html(res, 200, premierAwardsPageHtml("award-drinkware"));
    if (req.method === "GET" && url.pathname === "/polar-camel") return html(res, 200, polarCamelPageHtml());
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
    if (req.method === "POST" && url.pathname === "/api/solar-placard-checkout") return await handleSolarPlacardCheckout(req, res);
    if (req.method === "POST" && url.pathname === "/api/premier-award-checkout") return await handlePremierAwardCheckout(req, res);
    if (req.method === "POST" && url.pathname === "/api/polar-camel-checkout") return await handlePolarCamelCheckout(req, res);
    if (req.method === "POST" && url.pathname === "/api/express-one-release") return await handleExpressOneRelease(req, res);
    return json(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    return json(res, 400, { error: error.message || "Unable to create checkout." });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Recognition Direct banner checkout listening on ${APP_BASE_URL}`);
});
