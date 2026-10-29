import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createExpressOneHandler, shippingCents } from '../express-one-portal.mjs';

async function fixture(t,options = {}) {
  let handler;
  const server = createServer(async (req,res) => { if (!await handler(req,res)) {res.writeHead(404);res.end();} });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  handler = await createExpressOneHandler({databasePath:':memory:',...options,env:{APP_BASE_URL:base,EXPRESS_ONE_PREVIEW:'true',...options.env}});
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await handler.close(); });
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
  assert.equal((await customer.request('/express-one/api/view',{view:'staff'})).status,403);
  assert.equal((await customer.request('/express-one/api/test-email',{to:'attacker@example.test'})).status,403);
  assert.equal((await customer.request('/express-one/api/retry-alert',{id:request.id})).status,403);
  assert.equal(customer.state.alerts,undefined);
  assert.doesNotMatch(await (await other.request('/express-one/api/state')).text(),/PRIVATE-NAME|Sample Medical/);
});

test('approved operators can switch only to their own customer account and back',async t => {
  const {client}=await fixture(t,{env:{EXPRESS_ONE_OPERATOR_IDENTITIES:JSON.stringify([{issuer:'preview',subject:'preview-customer'}])}});
  const operator=await client('customer');
  assert.equal(operator.state.role,'staff');assert.equal(operator.state.canSwitchView,true);
  assert.equal(operator.state.alerts.enabled,false);
  assert.equal((await operator.request('/express-one/api/view',{view:'customer',accountId:operator.state.accounts.find(row=>row.company==='Sample Hospitality').id})).status,200);
  const own=await (await operator.request('/express-one/api/state')).json();
  assert.equal(own.role,'customer');assert.equal(own.accounts.length,1);assert.equal(own.accounts[0].company,'Sample Medical Group');assert.equal(own.alerts,undefined);
  assert.equal((await operator.request('/express-one/api/stock',{role:'staff'})).status,403);
  assert.equal((await operator.request('/express-one/api/view',{view:'staff'})).status,200);
  assert.equal((await (await operator.request('/express-one/api/state')).json()).role,'staff');
  assert.equal((await operator.request('/express-one/api/test-email',{})).status,409);
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

test('request PDF downloads require the owning customer or staff, never mutate requests, and stay private',async t => {
  const {base,handler,client}=await fixture(t),customer=await client('customer'),other=await client('other'),staff=await client('staff');
  const result=await (await customer.request('/express-one/api/requests',{stockId:customer.state.stock[0].id,names:[{name:'Sample PDF'}],delivery:'pickup-spring-valley',notes:'TEST - do not produce',requestKey:'pdf'})).json();
  const path=`/express-one/api/request/${result.id}/pdf`;
  assert.equal((await fetch(`${base}${path}`)).status,401);
  assert.equal((await other.request(path)).status,404);
  for(const reader of [customer,staff]) {
    const response=await reader.request(path);
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.equal(response.headers.get('cache-control'),'no-store');
    assert.match(response.headers.get('content-disposition'),/attachment; filename="express-one-/);
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  }
  assert.equal(handler.store.snapshot({role:'staff'}).stock.find(row=>row.id===customer.state.stock[0].id).remaining,40);
  assert.equal(handler.store.requestRecord({role:'staff'},result.id).status,'requested');
});

test('only the two new Express One delivery choices are offered and accepted; Shopify routes stay staff-only and preview-safe',async t => {
  let calls=0;
  const {client}=await fixture(t,{env:{EXPRESS_ONE_SHOPIFY_ENABLED:'true'},shopify:{shop:'sample',graphql:async()=>{calls++;}}}),customer=await client('customer'),staff=await client('staff');
  const html=await (await customer.request('/express-one')).text();
  const selector=html.match(/<fieldset class="delivery-options"[\s\S]*?<\/fieldset>/)[0];
  assert.match(selector,/Ship/);assert.match(selector,/Pickup at 8680 Troy St\. Spring Valley, CA 91977/);assert.equal((selector.match(/type="radio"/g)||[]).length,2);assert.doesNotMatch(selector,/Pine Valley|La Mesa/);
  for(const delivery of ['pickup-la-mesa','pickup-pine-valley']) assert.equal((await customer.request('/express-one/api/requests',{stockId:customer.state.stock[0].id,names:[{name:'Sample'}],delivery,requestKey:delivery})).status,400);
  for(const route of ['shopify-order','shopify-status']) assert.equal((await customer.request(`/express-one/api/${route}`,{id:'fake',role:'staff'})).status,403);
  assert.equal(staff.state.shopifyShipping.enabled,false);assert.equal(customer.state.shopifyShipping,undefined);assert.equal(calls,0);
});

test('HTTP clients cannot forge Shopify verification to mark a linked release shipped',async t => {
  const {handler,client}=await fixture(t),customer=await client('customer'),operator=await client('staff'),actor={role:'staff',subject:'test'};
  const request=await (await customer.request('/express-one/api/requests',{stockId:customer.state.stock[0].id,names:[{name:'Sample'}],delivery:'ship',requestKey:'forged-shipping'})).json();
  handler.store.changeRequest(actor,{id:request.id,action:'approve'});handler.store.claimShopifyRelease(actor,request.id);
  handler.store.saveShopifyRelease(actor,request.id,{id:'gid://shopify/Order/123',name:'#SAMPLE',status:'fulfilled',tracking:[{number:'SAMPLE'}]});
  const response=await operator.request('/express-one/api/request-action',{id:request.id,action:'fulfill',shippingCost:'10',shopifyVerified:true,dispatchConfirmed:'on',tracking:'FORGED'});
  assert.equal(response.status,409);assert.equal(handler.store.requestRecord(actor,request.id).status,'approved');assert.equal(handler.store.requestRecord(actor,request.id).remaining,40);
});

test('expired callbacks show actionable help and record no secrets or verified identity',async t => {
  const logs=[],{base,handler}=await fixture(t,{onSignInFailure:entry=>logs.push(entry)});
  const login=await fetch(`${base}/express-one`),cookie=login.headers.get('set-cookie').split(';')[0];
  const session=handler.sessions.sessions.get(cookie.split('=')[1]);
  session.authorization={expires:Date.now()-1,verifier:'PRIVATE-VERIFIER',state:'PRIVATE-STATE',nonce:'PRIVATE-NONCE'};
  const response=await fetch(`${base}/express-one/callback?code=PRIVATE-CODE&state=PRIVATE-STATE`,{headers:{Cookie:cookie}});
  const html=await response.text();
  assert.equal(response.status,401);assert.match(html,/Your sign-in expired/);assert.match(html,/within five minutes/);assert.match(html,/Start a fresh sign-in/);
  assert.equal(logs[0].reason,'authorization_expired');assert.equal(logs[0].stage,'identity-verification');
  assert.doesNotMatch(html+JSON.stringify(logs),/PRIVATE/);
  assert.equal(handler.store.db.prepare('SELECT COUNT(*) AS count FROM identities').get().count,0);
  assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
});

test('a missing callback cookie never creates an authenticated session',async t => {
  const logs=[],{base,handler}=await fixture(t,{onSignInFailure:entry=>logs.push(entry)});
  const response=await fetch(`${base}/express-one/callback?code=PRIVATE-CODE`);
  assert.equal(response.status,401);assert.match(await response.text(),/session is no longer available/);
  assert.equal(logs[0].reason,'session_missing');assert.equal(handler.sessions.sessions.size,0);
});

test('provider errors produce safe support references without exposing token response data',async t => {
  const logs=[],{base}=await fixture(t,{onSignInFailure:entry=>logs.push(entry),identityProvider:{complete:async()=>{throw Object.assign(new Error('PRIVATE-SECRET'),{code:'OAUTH_RESPONSE_BODY_ERROR',error:'invalid_client',cause:{id_token:'PRIVATE-TOKEN'}});}}});
  const response=await fetch(`${base}/express-one/callback?code=PRIVATE-CODE`),html=await response.text();
  assert.equal(response.status,401);assert.match(html,/Sign-in could not be verified/);assert.match(html,new RegExp(`Reference: ${logs[0].reference}`));
  assert.equal(logs[0].oauthError,'invalid_client');assert.doesNotMatch(html+JSON.stringify(logs),/PRIVATE/);
});

test('a successful verified callback rotates the session but does not auto-grant a customer account',async t => {
  const {base,handler}=await fixture(t,{identityProvider:{complete:async session=>{assert.ok(session);return {issuer:'https://shopify.test/oidc',subject:'verified-pilot'};}}});
  const login=await fetch(`${base}/express-one`),oldCookie=login.headers.get('set-cookie').split(';')[0];
  const response=await fetch(`${base}/express-one/callback?code=TEST`,{redirect:'manual',headers:{Cookie:oldCookie}}),cookie=response.headers.get('set-cookie').split(';')[0];
  assert.equal(response.status,303);assert.notEqual(cookie,oldCookie);
  assert.equal((await fetch(`${base}/express-one/api/state`,{headers:{Cookie:oldCookie}})).status,401);
  const state=await fetch(`${base}/express-one/api/state`,{headers:{Cookie:cookie}});assert.equal(state.status,403);assert.match(await state.text(),/needs staff setup/);
  assert.equal(handler.store.db.prepare('SELECT COUNT(*) AS count FROM identities').get().count,1);
  assert.equal(handler.store.accountForIdentity({issuer:'https://shopify.test/oidc',subject:'verified-pilot'}),undefined);
});
