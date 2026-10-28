import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ExpressOneStore, PortalError, seedPreview } from './express-one-store.mjs';
import { PortalSessions, ShopifyPortalIdentity, checkPortalHost, checkMutation, portalActor, portalOperator, portalConfig, signInFailure } from './express-one-auth.mjs';
import { ExpressOneAlerts } from './express-one-alerts.mjs';

const root = import.meta.dirname;
const escape = value => String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const page = (title,body,script = false) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} | Recognition Direct</title><link rel="stylesheet" href="/express-one/assets/portal.css">${script ? '<script src="/express-one/assets/portal.js" defer></script>':''}</head><body>${body}</body></html>`;

function loginPage(session,preview,profilePreview) {
  return page('Express One sign in',`<header class="brand"><strong>Recognition Direct</strong><span>Express One</span></header><main class="login"><h1>Express One</h1><p>Badge inventory and release requests</p>${preview ? '<p class="preview-label">Private preview / sample data</p>':''}<form method="post" action="/express-one/${preview ? 'preview-session':'sign-in'}"><input type="hidden" name="csrf" value="${escape(session.csrf)}">${preview ? `${profilePreview ? '<button name="actor" value="profile">Open Fairfield form preview</button>':''}<button name="actor" value="customer">Open customer preview</button><button class="secondary" name="actor" value="staff">Open staff preview</button><button class="secondary" name="actor" value="other">Open second customer preview</button>`:'<button>Continue with Shopify</button>'}</form><a href="mailto:info@recognition-direct.com">info@recognition-direct.com</a><p><a href="tel:+16194650055">(619) 465-0055</a></p></main>`);
}

function signInErrorPage(failure,reference) {
  const [heading,message] = failure.reason === 'authorization_expired'
    ? ['Your sign-in expired','Start again and complete the email-code step in the same browser within five minutes.']
    : ['session_missing','authorization_missing'].includes(failure.reason)
      ? ['Your sign-in session is no longer available','Start again in this browser, keep the sign-in in one tab, and allow cookies.']
      : ['Sign-in could not be verified','Please start again. If this continues, contact Recognition Direct with the reference below.'];
  return page('Sign-in help',`<header class="brand"><strong>Recognition Direct</strong><span>Express One</span></header><main class="login"><h1>${heading}</h1><p>${message}</p><p><a href="/express-one">Start a fresh sign-in</a></p><p><a href="mailto:info@recognition-direct.com">info@recognition-direct.com</a></p><small>Reference: ${escape(reference)}</small></main>`);
}

function dashboard(preview) {
  return page('Express One',`<header class="brand"><strong>Recognition Direct</strong><span>Express One</span><div class="header-end">${preview ? '<span class="preview-label">Private preview / sample data</span>':''}<button id="switch-view" class="secondary" hidden>View as customer</button><button id="sign-out" class="secondary">Sign out</button></div></header>
  <main class="workspace"><div class="page-head"><div><p id="account-name" class="eyebrow"></p><h1 id="page-title">Badge inventory</h1></div><button id="add-stock" hidden>Add prepaid stock</button></div>
  <p id="notice" role="status" class="notice" hidden></p><p id="error" role="alert" class="error" hidden></p>
  <section id="staff-alerts" class="staff-alerts" hidden><div><strong>Staff email alerts</strong><p id="alert-status"></p></div><button id="test-email" class="secondary">Send test email</button></section>
  <section id="order-profile" class="order-profile" hidden></section>
  <section class="metrics" aria-label="Account summary"><div><span>Badges on hand</span><strong id="metric-stock">-</strong></div><div><span>Reserved for requests</span><strong id="metric-reserved">-</strong></div><div><span>Uninvoiced shipping</span><strong id="metric-shipping">-</strong></div></section>
  <nav class="tabs" role="tablist" aria-label="Express One views"><button role="tab" id="tab-inventory" aria-selected="true" aria-controls="inventory">Inventory</button><button role="tab" id="tab-requests" aria-selected="false" aria-controls="requests">Requests</button><button role="tab" id="tab-shipping" aria-selected="false" aria-controls="shipping">Shipping & invoices</button></nav>
  <section id="inventory" role="tabpanel" aria-labelledby="tab-inventory"><div id="inventory-table"></div></section>
  <section id="requests" role="tabpanel" aria-labelledby="tab-requests" hidden><h2>Release requests</h2><div id="request-table"></div></section>
  <section id="shipping" role="tabpanel" aria-labelledby="tab-shipping" hidden><div class="page-head"><h2>Shipping ledger</h2><button id="record-invoice" hidden>Record invoice</button></div><div id="shipping-table"></div><h2>Recorded invoices</h2><div id="invoice-table"></div></section>
  </main>
  <dialog id="release-dialog"><form id="release-form"><h2>Request badges</h2><p id="release-style"></p><input type="hidden" name="stockId"><div id="standard-names"><label for="badge-names">Badge names</label><textarea id="badge-names" name="names" placeholder="Alex Morgan&#10;Taylor Smith"></textarea></div><section id="property-names" hidden><h3>Badge names & quantities</h3><div id="badge-rows"></div><button class="secondary" id="add-name-row" type="button">Add name</button><p id="badge-total" role="status">0 badges</p></section><label id="names-file-label" for="names-file">Names file (TXT or CSV)</label><input type="file" id="names-file" name="namesFile" accept=".txt,.csv"><section id="property-fields" hidden><h3>Property & contact information</h3><div id="property-inputs" class="property-inputs"></div></section><label for="delivery">Delivery</label><select id="delivery" name="delivery"><option value="ship">Ship</option><option value="pickup-la-mesa">La Mesa pickup</option><option value="pickup-pine-valley">Pine Valley pickup</option></select><label for="delivery-notes" id="delivery-notes-label">Shipping address / pickup notes</label><textarea id="delivery-notes" name="notes" maxlength="1500"></textarea><p class="form-error" role="alert"></p><div class="form-actions"><button class="secondary" type="button" data-close>Cancel</button><button type="submit">Submit request</button></div></form></dialog>
  <dialog id="review-dialog"><form id="review-form"><h2 id="review-title">Review release</h2><input type="hidden" name="id"><input type="hidden" name="action"><div id="shipping-fields"><label for="shipping-cost">Actual shipping charge ($)</label><input id="shipping-cost" name="shippingCost" type="number" min="0" max="10000" step="0.01"><label for="tracking">Tracking number (optional)</label><input id="tracking" name="tracking" maxlength="200"></div><div id="reason-fields"><label for="reason">Reason</label><textarea id="reason" name="reason" maxlength="300"></textarea></div><p class="form-error" role="alert"></p><div class="form-actions"><button class="secondary" type="button" data-close>Cancel</button><button id="review-submit" type="submit">Save</button></div></form></dialog>
  <dialog id="stock-dialog"><form id="stock-form"><h2>Add prepaid stock</h2><label for="stock-account">Customer</label><select id="stock-account" name="accountId" required></select><label for="stock-title">Badge style</label><input id="stock-title" name="title" maxlength="180" required><label for="stock-quantity">Quantity</label><input id="stock-quantity" name="quantity" type="number" min="1" max="100000" step="1" required><label for="paid-order">Paid order reference</label><input id="paid-order" name="paidOrder" maxlength="120" required><label class="check"><input type="checkbox" name="paymentVerified" required>Payment and badge stock verified</label><p class="form-error" role="alert"></p><div class="form-actions"><button class="secondary" type="button" data-close>Cancel</button><button type="submit">Add stock</button></div></form></dialog>
  <dialog id="invoice-dialog"><form id="invoice-form"><h2>Record shipping invoice</h2><label for="invoice-account">Customer / depleted-stock shipping</label><select id="invoice-account" name="accountId" required></select><label for="invoice-reference">Existing invoice reference</label><input id="invoice-reference" name="reference" maxlength="120" required><p class="form-error" role="alert"></p><div class="form-actions"><button class="secondary" type="button" data-close>Cancel</button><button type="submit">Record invoice</button></div></form></dialog>`,true);
}

function json(res,status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); }
function html(res,status,body) { res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'}); res.end(body); }
function redirect(res,path) { res.writeHead(303,{Location:path}); res.end(); }
async function readBody(req) {
  let length = 0; const chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > 100000) throw new PortalError('Request is too large.',413); chunks.push(chunk); }
  const body = Buffer.concat(chunks).toString('utf8');
  try {
    if (req.headers['content-type']?.startsWith('application/json')) {
      const parsed = JSON.parse(body);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
      return parsed;
    }
    if (req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(body));
  } catch { throw new PortalError('Invalid request data.'); }
  throw new PortalError('Unsupported request format.',415);
}
export function shippingCents(value) {
  if (typeof value !== 'string' || !/^\d{1,5}(?:\.\d{1,2})?$/.test(value)) throw new PortalError('Enter the actual shipping charge with up to two decimals.');
  const [whole,fraction = ''] = value.split('.');
  return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}

export async function createExpressOneHandler({ env = process.env, databasePath, identityProvider, previewProfile, onSignInFailure = entry => console.warn(JSON.stringify(entry)) } = {}) {
  const config = portalConfig(env);
  if (!config.preview && (!config.issuer || !config.clientId || !config.clientSecret)) throw new Error('Configure Shopify customer sign-in before enabling Express One.');
  const path = databasePath || join(root,'data','express-one-v2.sqlite');
  if (path !== ':memory:') await mkdir(dirname(path),{recursive:true});
  const store = new ExpressOneStore(path), sessions = new PortalSessions(config);
  const provider = identityProvider || new ShopifyPortalIdentity(config);
  if (config.preview) seedPreview(store);
  if (previewProfile) {
    if (!config.preview) throw new Error('Profile sample data is local-preview only.');
    const actor = {role:'staff',subject:'preview-staff'};
    let account = store.accountForIdentity({issuer:'preview',subject:'preview-profile'});
    if (!account) {
      account = store.createAccount(actor,{issuer:'preview',subject:'preview-profile',company:previewProfile.company});
      store.addStock(actor,{accountId:account.id,title:`${previewProfile.profile.title} / SAMPLE STOCK`,quantity:40,paidOrder:'SAMPLE-NOT-REAL-INVENTORY',paymentVerified:true});
    }
    store.setOrderProfile(actor,account.id,previewProfile.profile);
    for (const [key,path] of Object.entries(previewProfile.images || {})) store.setProfileImage(actor,account.id,key,await readFile(path));
  }
  const alerts = new ExpressOneAlerts(store,{env,preview:config.preview,base:config.base});
  alerts.start();
  const attempts = new Map();
  const assets = new Map([['/express-one/assets/portal.js',['express-one.js','application/javascript']],['/express-one/assets/portal.css',['express-one.css','text/css']],['/assets/name-badges/1x3-white-no-frame.png',['name-badges/1x3-white-no-frame.png','image/png']]]);
  const handler = async (req,res) => {
    const url = new URL(req.url,config.base);
    if (!url.pathname.startsWith('/express-one') && !url.pathname.startsWith('/api/express-one') && !assets.has(url.pathname)) return false;
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Robots-Tag','noindex, nofollow'); res.setHeader('Referrer-Policy','strict-origin');
    const signInOrigin = config.issuer ? new URL(config.issuer).origin:'';
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self' ${signInOrigin}; frame-ancestors 'none'; base-uri 'none'`);
    try {
      checkPortalHost(req,config);
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [file,type] = assets.get(url.pathname); res.writeHead(200,{'Content-Type':type}); res.end(await readFile(join(root,'public',file))); return true;
      }
      const isPage = req.method === 'GET' && ['/express-one','/express-one/','/express-one/callback'].includes(url.pathname);
      const session = sessions.get(req,res,isPage && url.pathname !== '/express-one/callback');
      if (isPage && url.pathname !== '/express-one/callback') { html(res,200,session.identity ? dashboard(config.preview):loginPage(session,config.preview,Boolean(previewProfile))); return true; }
      if (req.method === 'GET' && url.pathname === '/express-one/callback') {
        let stage = 'identity-verification';
        try { const identity = await provider.complete(session,url); stage = 'identity-save'; store.rememberIdentity(identity); stage = 'session-rotation'; sessions.rotate(session,identity,res); redirect(res,'/express-one'); }
        catch (error) {
          const failure = signInFailure(error), reference = randomUUID().slice(0,8);
          try { onSignInFailure({event:'express-one-sign-in-failed',reference,stage,...failure}); } catch {}
          sessions.logout(session,res); html(res,401,signInErrorPage(failure,reference));
        }
        return true;
      }
      if (req.method === 'POST') {
        const body = await readBody(req); checkMutation(req,config,session,body);
        if (['/express-one/sign-in','/express-one/preview-session'].includes(url.pathname)) {
          const now = Date.now();
          for (const [key,value] of attempts) if (value.expires < now) attempts.delete(key);
          const key = req.socket.remoteAddress, attempt = attempts.get(key) || {count:0,expires:now+60000};
          if (++attempt.count > 20 || attempts.size > 2000) throw new PortalError('Too many sign-in attempts. Please wait.',429);
          attempts.set(key,attempt);
          if (url.pathname === '/express-one/preview-session') {
            const subjects = {customer:'preview-customer',staff:'preview-staff',other:'preview-other',...(previewProfile ? {profile:'preview-profile'}:{})};
            if (!config.preview || !Object.hasOwn(subjects,body.actor)) throw new PortalError('Not found.',404);
            sessions.rotate(session,{issuer:'preview',subject:subjects[body.actor]},res); redirect(res,'/express-one');
          } else redirect(res,(await provider.begin(session)).href);
          return true;
        }
        if (url.pathname === '/express-one/sign-out') { sessions.logout(session,res); json(res,200,{ok:true}); return true; }
        if (url.pathname === '/express-one/api/view') {
          if (!portalOperator(session,config)) throw new PortalError('Staff access required.',403);
          if (!['staff','customer'].includes(body.view)) throw new PortalError('Choose a valid view.');
          if (body.view === 'customer' && !store.accountForIdentity(session.identity)) throw new PortalError('No customer test account is linked to your login.',404);
          session.view = body.view; json(res,200,{ok:true}); return true;
        }
        const actor = portalActor(session,config,store);
        let result;
        if (url.pathname === '/express-one/api/requests') { result = store.createRequest(actor,body); void alerts.wake(); }
        else if (url.pathname === '/express-one/api/request-action') result = store.changeRequest(actor,{id:body.id,action:body.action,reason:body.reason,tracking:body.tracking,shippingCents:body.action === 'fulfill' ? shippingCents(body.shippingCost):undefined});
        else if (url.pathname === '/express-one/api/stock') result = store.addStock(actor,body);
        else if (url.pathname === '/express-one/api/invoices') result = store.recordInvoice(actor,body);
        else if (url.pathname === '/express-one/api/test-email') result = await alerts.test(actor);
        else if (url.pathname === '/express-one/api/retry-alert') result = await alerts.retry(actor,body.id);
        else throw new PortalError('Not found.',404);
        json(res,200,result); return true;
      }
      if (req.method === 'GET' && url.pathname === '/express-one/api/state') {
        const actor = portalActor(session,config,store);
        json(res,200,{role:actor.role,csrf:session.csrf,preview:config.preview,canSwitchView:portalOperator(session,config) && Boolean(store.accountForIdentity(session.identity)),...(actor.role === 'staff' ? {alerts:alerts.status(actor)}:{}),...store.snapshot(actor)}); return true;
      }
      const imageRoute = url.pathname.match(/^\/express-one\/api\/badge-image\/([a-f0-9-]{36})\/(gold|silver|logo)$/);
      if (req.method === 'GET' && imageRoute) {
        const body = store.profileImage(portalActor(session,config,store),imageRoute[1],imageRoute[2]);
        res.writeHead(200,{'Content-Type':'image/png','Cross-Origin-Resource-Policy':'same-origin'}); res.end(body); return true;
      }
      throw new PortalError('Not found.',404);
    } catch (error) {
      const status = error instanceof PortalError ? error.status:500;
      json(res,status,{error:error instanceof PortalError ? error.message:'The portal could not complete this request.'});
      return true;
    }
  };
  handler.store = store; handler.sessions = sessions; handler.alerts = alerts; handler.close = async () => { await alerts.close(); store.close(); }; handler.config = config;
  return handler;
}
