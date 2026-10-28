import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createExpressOneHandler, shippingCents } from '../express-one-portal.mjs';

async function fixture(t) {
  let handler;
  const server = createServer(async (req,res) => { if (!await handler(req,res)) {res.writeHead(404);res.end();} });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  handler = await createExpressOneHandler({env:{APP_BASE_URL:base,EXPRESS_ONE_PREVIEW:'true'},databasePath:':memory:'});
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); handler.close(); });
  async function client(role) {
    const login = await fetch(`${base}/express-one`);
    let cookie = login.headers.get('set-cookie').split(';')[0];
    const csrf = handler.sessions.sessions.get(cookie.slice(cookie.indexOf('=')+1)).csrf;
    const response = await fetch(`${base}/express-one/preview-session`,{method:'POST',redirect:'manual',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({actor:role,csrf})});
    assert.equal(response.status,303); cookie = response.headers.get('set-cookie').split(';')[0];
    const stateResponse = await fetch(`${base}/express-one/api/state`,{headers:{Cookie:cookie}});
    const state = await stateResponse.json(); assert.equal(stateResponse.status,200);
    return {cookie,state,request:(path,body,extra = {}) => fetch(`${base}${path}`,{method:body ? 'POST':'GET',redirect:'manual',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':state.csrf,...extra},body:body ? JSON.stringify(body):undefined})};
  }
  return {base,handler,client};
}
test('private HTTP workflow reserves, approves and ships a sample request without checkout or public uploads',async t => {
  const {client} = await fixture(t), customer = await client('customer'), staff = await client('staff');
  const input = {stockId:customer.state.stock[0].id,names:[{name:'HTTP Test',title:'Staff'}],delivery:'ship',notes:'Test only',requestKey:'HTTP-1'};
  const response = await customer.request('/express-one/api/requests',input), request = await response.json(); assert.equal(response.status,200);
  let state = await (await customer.request('/express-one/api/state')).json(); assert.equal(state.stock[0].remaining,40); assert.equal(state.stock[0].reserved,1);
  assert.equal((await staff.request('/express-one/api/request-action',{id:request.id,action:'approve'})).status,200);
  assert.equal((await staff.request('/express-one/api/request-action',{id:request.id,action:'fulfill',shippingCost:'14.25',tracking:'SAMPLE'})).status,200);
  state = await (await customer.request('/express-one/api/state')).json(); assert.equal(state.stock[0].remaining,39); assert.equal(state.shipping[0].cents,1425); assert.equal(state.requests[0].status,'shipped');
  assert.doesNotMatch(JSON.stringify(state),/accessCode|namesFileUrl|code=|invoiceUrl|checkoutUrl/);
});
test('HTTP authorization ignores forged body roles and customer IDs',async t => {
  const {client} = await fixture(t), customer = await client('customer'), other = await client('other');
  const body = {stockId:customer.state.stock[0].id,names:[{name:'PRIVATE-NAME'}],delivery:'ship',requestKey:'private-1',role:'staff',accountId:customer.state.accounts[0].id};
  const request = await (await customer.request('/express-one/api/requests',body)).json();
  assert.equal((await other.request('/express-one/api/requests',{...body,requestKey:'stolen'})).status,404);
  assert.equal((await other.request('/express-one/api/request-action',{id:request.id,action:'cancel'})).status,404);
  assert.equal((await customer.request('/express-one/api/request-action',{id:request.id,action:'approve',role:'staff'})).status,403);
  assert.equal((await customer.request('/express-one/api/stock',{role:'staff'})).status,403);
  assert.doesNotMatch(await (await other.request('/express-one/api/state')).text(),/PRIVATE-NAME|Sample Medical/);
});
test('CSRF, cross-origin, no-session and legacy URL-code attempts cannot mutate inventory',async t => {
  const {base,client} = await fixture(t), customer = await client('customer');
  const body = {stockId:customer.state.stock[0].id,names:[{name:'Test'}],delivery:'ship',requestKey:'csrf'};
  assert.equal((await customer.request('/express-one/api/requests',body,{'X-CSRF-Token':'invalid'})).status,403);
  assert.equal((await customer.request('/express-one/api/requests',body,{Origin:'https://evil.example'})).status,403);
  assert.equal((await fetch(`${base}/express-one/api/state`)).status,401);
  assert.equal((await customer.request('/express-one/customer/demo-express-one?code=demo')).status,404);
  assert.equal((await customer.request('/api/express-one-release',{customer_id:'demo-express-one',code:'demo'})).status,404);
  assert.equal((await (await customer.request('/express-one/api/state')).json()).stock[0].reserved,0);
});
test('logout revokes the session; private responses have no-store and restrictive security headers',async t => {
  const {client} = await fixture(t), customer = await client('customer');
  const response = await customer.request('/express-one/api/state');
  assert.equal(response.headers.get('cache-control'),'no-store'); assert.equal(response.headers.get('referrer-policy'),'strict-origin'); assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal((await customer.request('/express-one/sign-out',{})).status,200);
  assert.equal((await customer.request('/express-one/api/state')).status,401);
});
test('actual shipping amount rejects scientific notation, rounding, negatives and non-numeric input',() => {
  assert.equal(shippingCents('12.95'),1295); assert.equal(shippingCents('0'),0);
  for (const value of ['12.955','1e2','-1','Infinity',null,12.95]) assert.throws(() => shippingCents(value));
});
test('live portal cannot start without Shopify sign-in configuration',async () => {
  await assert.rejects(createExpressOneHandler({env:{APP_BASE_URL:'https://portal.example'},databasePath:':memory:'}),/Configure Shopify/);
});

test('badge example images require sign-in and the owning account',async t => {
  const {base,handler,client}=await fixture(t),customer=await client('customer'),other=await client('other'),staff=await client('staff');
  const accountId=customer.state.accounts[0].id;
  handler.store.setOrderProfile({role:'staff',subject:'test'},accountId,{kind:'property-domed',title:'Sample profile',description:'Domed magnetic badges.',supportEmail:'info@recognition-direct.com',supportPhone:'619-465-0055',sourceName:'Sample source.doc'});
  const png=Buffer.from('89504e470d0a1a0a0000','hex');handler.store.setProfileImage({role:'staff',subject:'test'},accountId,'gold',png);
  const path=`/express-one/api/badge-image/${accountId}/gold`;
  assert.equal((await fetch(`${base}${path}`)).status,401);
  assert.equal((await other.request(path)).status,404);
  const response=await customer.request(path);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  assert.equal((await staff.request(path)).status,200);
});
