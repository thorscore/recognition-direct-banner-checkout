import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
const catalog = JSON.parse((await readFile(new URL("../catalog/catalog-inventory.json", import.meta.url), "utf8")).replace(/^\uFEFF/, ""));
const acrylic = catalog.products.find(product => product.url === "/acrylic-prints");
const defaults = { size: "16x24", acrylic: "1_4_plexiglass", hardware: "acrylic+standoff" };

function quoteContext(unitPrice = 109.2, responseOverrides = {}) {
  const calls = [];
  const payload = {version:"test-catalog-version"};
  const page = `<div data-page="${Buffer.from(encodeURIComponent(JSON.stringify(payload))).toString("base64")}"></div>`;
  const context = vm.createContext({
    Buffer,
    OLD_CATALOG_BASE_URL:"https://recognition-direct.bs.run",
    fetch:async (url, options) => {
      calls.push({url,options});
      if (!options) return {ok:true,text:async()=>page,headers:{getSetCookie:()=>["XSRF-TOKEN=test-token; Path=/", "session=test-session; Path=/"]}};
      return {ok:true,json:async()=>({props:{quoteResult:{quote:[{unit_price:unitPrice}]}}}),...responseOverrides};
    },
  });
  vm.runInContext(source.slice(source.indexOf("function cookieHeader("), source.indexOf("function adjustedCatalogUnitPrice(")), context);
  return {context,calls};
}

test("all three existing sizes use the current full-white-backed item and four standoffs", async () => {
  for (const [size, price] of [["16x24",109.2],["20x30",157.18],["24x36",215.8]]) {
    const {context,calls} = quoteContext(price);
    const result = await context.quoteCatalogProduct(acrylic, 1, {...defaults,size});
    assert.equal(result.unitPrice, price);
    assert.equal(calls[0].url, "https://recognition-direct.bs.run/clear-acrylic-white-backing");
    const body = JSON.parse(calls[1].options.body);
    assert.equal(body.id,243);
    assert.equal(body.quantity,"1");
    assert.deepEqual(body.values,{_size:size,hardware:"acrylic+standoff",cornerstyle:"none"});
  }
});

test("quotation preserves quantity without changing caller data or catalog identity", async () => {
  const {context,calls} = quoteContext();
  const before = JSON.stringify(acrylic);
  const values = {...defaults};
  await context.quoteCatalogProduct(acrylic, 25, values);
  assert.equal(JSON.parse(calls[1].options.body).quantity,"25");
  assert.equal(JSON.stringify(acrylic),before);
  assert.deepEqual(values,defaults);
  assert.equal(acrylic.id,81);
  assert.equal(acrylic.minimum,109.2);
});

test("unsupported dimensions and changed material/hardware fail before supplier requests", async () => {
  for (const values of [
    {...defaults,size:"1x1"},
    {...defaults,size:"48x95"},
    {...defaults,size:""},
    {...defaults,acrylic:"other"},
    {...defaults,hardware:"0"},
  ]) {
    const {context,calls} = quoteContext();
    await assert.rejects(context.quoteCatalogProduct(acrylic,1,values),/Choose/);
    assert.equal(calls.length,0);
  }
});

test("unexpected client properties cannot change the supplier configuration", async () => {
  const {context,calls} = quoteContext();
  await context.quoteCatalogProduct(acrylic,1,{...defaults,_size:"6x6",cornerstyle:"1",id:244});
  assert.deepEqual(JSON.parse(calls[1].options.body).values,{_size:"16x24",hardware:"acrylic+standoff",cornerstyle:"none"});
});

test("missing, zero and non-finite acrylic quote prices do not become free orders", async () => {
  for (const price of [0,-1,"invalid",undefined]) {
    const {context} = quoteContext(price);
    if (price === undefined) {
      const missing = quoteContext(1,{json:async()=>({props:{quoteResult:{quote:[]}}})});
      await assert.rejects(missing.context.quoteCatalogProduct(acrylic,1,defaults),/Select valid product options/);
    } else await assert.rejects(context.quoteCatalogProduct(acrylic,1,defaults),/Select valid product options/);
  }
});

test("supplier failures remain errors instead of falling back to the display price", async () => {
  const {context} = quoteContext(1,{ok:false,status:503});
  await assert.rejects(context.quoteCatalogProduct(acrylic,1,defaults),/Old catalog quote failed \(503\)/);
});

test("unrelated catalog products keep their original quote target and options", async () => {
  const {context,calls} = quoteContext(26.4);
  const product = {id:5,url:"/aluminum-sign"};
  const values = {size:"12x18",sides:"1"};
  assert.equal((await context.quoteCatalogProduct(product,2,values)).unitPrice,26.4);
  assert.equal(calls[0].url,"https://recognition-direct.bs.run/aluminum-sign");
  assert.deepEqual(JSON.parse(calls[1].options.body),{id:5,quantity:"2",values});
});
