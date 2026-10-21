export const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ATTRIBUTION_CONSENT_COOKIE = "rd_acquisition_consent";
const storeHosts = new Set(["recognition-direct.com", "www.recognition-direct.com"]);
const internalHosts = new Set([...storeHosts, "checkout.recognition-direct.com", "recognition-direct.bs.run", "shop.app"]);

function publicPage(value) {
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !storeHosts.has(url.hostname) || url.username || url.password || url.port) return "";
    if (!/^\/(?:$|(?:products|pages|collections)\/[a-z0-9-]+\/?$|blogs\/[a-z0-9-]+(?:\/[a-z0-9-]+)?\/?$)/.test(url.pathname)) return "";
    return `https://recognition-direct.com${url.pathname}`;
  } catch { return ""; }
}

function campaignToken(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_. -]{0,99}$/i.test(value) ? value : "";
}

function referrerHost(value) {
  if (typeof value !== "string" || value.length > 253 || !/^[a-z0-9.-]+$/i.test(value)) return "";
  const host = value.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host.includes("..") || internalHosts.has(host) || host.endsWith(".myshopify.com")) return "";
  return host;
}

function touch(value, now) {
  if (!value || typeof value !== "object") return null;
  const at = Date.parse(value.at);
  const landingPage = publicPage(value.landingPage);
  if (!Number.isFinite(at) || at < now - ATTRIBUTION_TTL_MS || at > now + 5 * 60 * 1000 || !landingPage) return null;
  return {
    at: new Date(at).toISOString(), landingPage,
    referrerHost: referrerHost(value.referrerHost),
    utmSource: campaignToken(value.utmSource),
    utmMedium: campaignToken(value.utmMedium),
    utmCampaign: campaignToken(value.utmCampaign),
  };
}

export function readOrderAttribution(value, now = Date.now()) {
  try {
    if (typeof value === "string") {
      if (value.length > 4096) return null;
      value = JSON.parse(value);
    }
    if (value?.version !== 1) return null;
    if (value.consent === "denied") return { version: 1, consent: "denied" };
    if (value.consent !== "allowed") return null;
    const first = touch(value.first, now);
    const last = touch(value.last, now);
    if (!first || !last || first.at > last.at) return null;
    return { version: 1, consent: "allowed", first, last, orderPage: publicPage(value.orderPage) };
  } catch { return null; }
}

export function mergeOrderAttribution(previous, incoming, now = Date.now()) {
  const next = readOrderAttribution(incoming, now);
  if (next?.consent === "denied") return null;
  const before = readOrderAttribution(previous, now);
  if (!next || next.consent !== "allowed") return before?.consent === "allowed" ? before : null;
  if (!before || before.consent !== "allowed") return next;
  return {
    ...next,
    first: before.first.at <= next.first.at ? before.first : next.first,
    last: (before.last.referrerHost || before.last.utmSource) && !next.last.referrerHost && !next.last.utmSource
      ? before.last : before.last.at > next.last.at ? before.last : next.last,
  };
}

function sourceLabel(value) {
  if (value.utmSource) return `${value.utmSource}${value.utmMedium ? ` / ${value.utmMedium}` : " / unspecified"} (campaign link)`;
  if (value.referrerHost) return `${value.referrerHost} (referral)`;
  return "Direct / unknown (no external referrer captured)";
}

export function orderAttributionAttributes(value, now = Date.now()) {
  const data = readOrderAttribution(value, now);
  if (data?.consent !== "allowed") return [];
  return [
    { key: "Acquisition Capture", value: "Consent-based browser report; not Shopify native attribution" },
    ...[["First", data.first], ["Last Known", data.last]].flatMap(([label, visit]) => [
      { key: `Acquisition ${label} Source`, value: sourceLabel(visit) },
      { key: `Acquisition ${label} Landing Page`, value: visit.landingPage },
      { key: `Acquisition ${label} Time`, value: visit.at },
      ...(visit.utmCampaign ? [{ key: `Acquisition ${label} Campaign`, value: visit.utmCampaign }] : []),
    ]),
    ...(data.orderPage ? [{ key: "Acquisition Order Page", value: data.orderPage }] : []),
  ];
}

export function clearOrderAttribution(cart) {
  delete cart.attribution;
  for (const item of cart.items || []) {
    delete item.attribution;
    if (item.draftInput?.customAttributes) item.draftInput.customAttributes = item.draftInput.customAttributes.filter(a => !/^_?Acquisition /.test(a.key));
    for (const line of item.draftInput?.lineItems || []) {
      if (line.customAttributes) line.customAttributes = line.customAttributes.filter(a => !/^_?Acquisition /.test(a.key));
    }
  }
}
