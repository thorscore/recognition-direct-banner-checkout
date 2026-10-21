import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("real multipart requests carry consented capture through an isolated mock cart and honor revocation", { timeout: 20000 }, async () => {
  const root = new URL("../", import.meta.url);
  const directory = await mkdtemp(join(tmpdir(), "rd-attribution-test-"));
  let child;
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".mjs") || ["catalog", "public"].includes(entry.name)) await cp(new URL(entry.name, root), join(directory, entry.name), { recursive: true });
    }
    const portServer = createServer();
    portServer.listen(0, "127.0.0.1");
    await once(portServer, "listening");
    const port = portServer.address().port;
    await new Promise(resolve => portServer.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [join(directory, "server.mjs")], {
      cwd: directory,
      env: { ...process.env, PORT: String(port), APP_BASE_URL: base, MOCK_SHOPIFY: "true", SHOPIFY_CLIENT_ID: "", SHOPIFY_CLIENT_SECRET: "", SHOPIFY_ACCESS_TOKEN: "" },
      windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((resolve, reject) => {
      child.stdout.on("data", chunk => { if (String(chunk).includes("listening on")) resolve(); });
      child.stderr.on("data", chunk => reject(new Error(String(chunk))));
      child.on("error", reject);
      child.on("exit", code => reject(new Error(`Mock server exited: ${code}`)));
    });
    assert.equal((await (await fetch(`${base}/health`)).json()).orderAttributionVersion, 1);
    assert.match(await (await fetch(`${base}/order-attribution.js`)).text(), /visitorConsentCollected/);
    const visit = { at: new Date().toISOString(), landingPage: "https://recognition-direct.com/pages/name-badges-san-diego?email=PRIVATE", referrerHost: "chatgpt.com" };
    const attribution = { version: 1, consent: "allowed", first: visit, last: visit, orderPage: "https://recognition-direct.com/pages/name-badges-san-diego" };
    async function add(cartId, metadata) {
      const form = new FormData();
      for (const [key, value] of Object.entries({ email: "test@example.invalid", order_quantity: "1", badge_frame: "no-frame", badge_fastener: "pin", badge_finish: "standard", badge_size: "1x3", badge_color: "white", delivery_method: "pickup-la-mesa", rd_attribution: JSON.stringify(metadata) })) form.set(key, value);
      const response = await fetch(`${base}/api/name-badge-checkout${cartId ? `?cart=${cartId}` : ""}`, { method: "POST", body: form, headers: { Origin: "https://recognition-direct.com", Accept: "application/json" } });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      return result.cartId;
    }
    const cartId = await add(null, attribution);
    const cartPath = join(directory, "data", "custom-carts", `${cartId}.json`);
    let cart = JSON.parse(await readFile(cartPath));
    assert.equal(cart.attribution.first.referrerHost, "chatgpt.com");
    assert.equal(cart.items[0].draftInput.lineItems[0].customAttributes.find(a => a.key === "_Acquisition First Landing Page").value, "https://recognition-direct.com/pages/name-badges-san-diego");
    assert.doesNotMatch(JSON.stringify(cart.attribution), /PRIVATE/);
    const originalPrice = cart.items[0].draftInput.lineItems[0].originalUnitPriceWithCurrency.amount;
    assert.equal(await add(cartId, attribution), cartId);
    cart = JSON.parse(await readFile(cartPath));
    assert.equal(cart.items.length, 2);
    assert.equal(cart.items[1].draftInput.lineItems[0].originalUnitPriceWithCurrency.amount, originalPrice);
    const response = await fetch(`${base}/api/custom-order-cart/checkout?cart=${cartId}`, { method: "POST", redirect: "manual", headers: { Cookie: "rd_acquisition_consent=denied" } });
    assert.equal(response.status, 303);
    assert.match(response.headers.get("location"), /\/mock-checkout\?/);
    cart = JSON.parse(await readFile(cartPath));
    assert.equal(cart.attribution, undefined);
    assert.equal(cart.status, "checked_out");
    assert.equal(cart.items[0].draftInput.lineItems[0].customAttributes.some(a => /^_?Acquisition /.test(a.key)), false);
    assert.equal(cart.items[0].draftInput.lineItems[0].originalUnitPriceWithCurrency.amount, originalPrice);
    assert.equal(cart.shopifyDraftOrderId, undefined);

    const allowedId = await add(null, attribution);
    await fetch(`${base}/api/custom-order-cart/checkout?cart=${allowedId}`, { method: "POST", redirect: "manual", headers: { Cookie: "rd_acquisition_consent=allowed" } });
    const allowedCart = JSON.parse(await readFile(join(directory, "data", "custom-carts", `${allowedId}.json`)));
    assert.equal(allowedCart.attribution.first.referrerHost, "chatgpt.com");
    assert.equal(allowedCart.shopifyDraftOrderId, undefined);
  } finally {
    if (child && child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
    await rm(directory, { recursive: true, force: true });
  }
});
