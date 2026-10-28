import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExpressOneStore,seedPreview } from '../express-one-store.mjs';
import { ExpressOneAlerts,alertConfig } from '../express-one-alerts.mjs';

const env = {EXPRESS_ONE_EMAIL_ENABLED:'true',EXPRESS_ONE_SMTP_USER:'sender@example.test',EXPRESS_ONE_SMTP_PASS:'PRIVATE-PASSWORD',EXPRESS_ONE_STAFF_EMAIL:'staff@example.test'};
const staff = {role:'staff',subject:'test-staff'};
function fixture(t,options = {}) {
  const store = new ExpressOneStore(options.path); seedPreview(store);
  const account = store.accountForIdentity({issuer:'preview',subject:'preview-customer'});
  const customer = {role:'customer',subject:'preview-customer',accountId:account.id};
  const stock = store.snapshot(customer).stock[0], messages = [];
  const transport = options.transport || {sendMail:async message => {messages.push(message);return {accepted:['staff@example.test']};}};
  const alerts = new ExpressOneAlerts(store,{env,base:new URL('https://portal.example.test'),transport,...options});
  t.after(async()=>{await alerts.close();store.close();});
  const input = {stockId:stock.id,names:[{name:'PRIVATE-NAME'}],delivery:'ship',notes:'PRIVATE-ADDRESS',requestKey:randomUUID()};
  return {store,customer,stock,alerts,messages,input,request:()=>store.createRequest(customer,input)};
}

test('email configuration is off by default, never sends in preview, and requires encrypted authenticated SMTP',()=>{
  assert.equal(alertConfig({},false).enabled,false);
  assert.equal(alertConfig(env,true).enabled,false);
  for(const invalid of [{EXPRESS_ONE_SMTP_PASS:''},{EXPRESS_ONE_SMTP_PORT:'25'},{EXPRESS_ONE_STAFF_EMAIL:'a@example.test\r\nBcc:evil@example.test'},{EXPRESS_ONE_SMTP_HOST:'smtp://bad'}]) {
    const config=alertConfig({...env,...invalid},false);assert.equal(config.enabled,false);assert.equal(config.state,'configuration-error');
  }
  for(const port of [465,587]) {
    const config=alertConfig({...env,EXPRESS_ONE_SMTP_PORT:String(port)},false);
    assert.equal(config.smtp.secure,port===465);assert.equal(config.smtp.requireTLS,true);assert.equal(config.smtp.tls.rejectUnauthorized,true);
    assert.equal(config.smtp.disableFileAccess,true);assert.equal(config.smtp.disableUrlAccess,true);assert.equal(config.smtp.maxRecipients,1);
    assert.equal(config.smtp.logger,false);assert.equal(config.smtp.debug,false);
  }
});

test('request and alert commit together; duplicate submissions queue only one alert',t=>{
  const {store,customer,alerts,input}=fixture(t);
  const first=store.createRequest(customer,input),second=store.createRequest(customer,input);
  assert.equal(first.id,second.id);assert.equal(alerts.status(staff).requests.length,1);
  store.db.exec("CREATE TRIGGER reject_alert BEFORE INSERT ON request_alerts BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.throws(()=>store.createRequest(customer,{...input,requestKey:'rollback'}));
  assert.equal(store.snapshot(customer).requests.length,1);assert.equal(store.snapshot(customer).stock[0].reserved,1);
  assert.throws(()=>alerts.status(customer),/Staff/);
});

test('alerts send once to the configured staff inbox, omit names and addresses, and leave requests unapproved',async t=>{
  const {alerts,request,messages,store,customer}=fixture(t);const result=request();
  await Promise.all([alerts.wake(),alerts.wake()]);await alerts.wake();
  assert.equal(messages.length,1);assert.equal(messages[0].to,'staff@example.test');
  assert.match(messages[0].text,/Sample Medical Group/);assert.match(messages[0].text,/https:\/\/portal.example.test\/express-one#requests/);
  assert.doesNotMatch(JSON.stringify(messages),/PRIVATE|code=|access_token|client_secret/);
  assert.match(messages[0].messageId,new RegExp(result.id));
  assert.equal(alerts.status(staff).requests[0].status,'sent');
  assert.equal(store.snapshot(customer).requests[0].status,'requested');assert.equal(store.snapshot(customer).stock[0].remaining,40);
});

test('disabled and preview workers preserve pending alerts without contacting a mail server',async t=>{
  for(const options of [{env:{}},{preview:true}]) {
    const {alerts,request,messages}=fixture(t,options);request();await alerts.wake();
    assert.equal(messages.length,0);assert.equal(alerts.status(staff).requests[0].status,'pending');
    await assert.rejects(alerts.test(staff),/Connect/);
  }
});

test('cancelled or already approved requests do not send stale approval alerts',async t=>{
  const {alerts,request,store,customer,messages}=fixture(t);const result=request();
  store.changeRequest(customer,{id:result.id,action:'cancel'});await alerts.wake();
  assert.equal(messages.length,0);assert.equal(alerts.status(staff).requests[0].status,'skipped');
});

test('safe connection failures retry with backoff, persist no raw errors, and stop after five attempts',async t=>{
  let now=1000,calls=0;
  const {alerts,request,store}=fixture(t,{now:()=>now,transport:{sendMail:async()=>{calls++;throw Object.assign(new Error('PRIVATE-PASSWORD recipient PRIVATE-NAME'),{code:'ECONNECTION'});}}});
  request();await alerts.wake();await alerts.wake();assert.equal(calls,1);
  for(let index=0;index<4;index++){now+=4000000;await alerts.wake();}
  assert.equal(calls,5);const status=alerts.status(staff);assert.equal(status.requests[0].status,'failed');assert.equal(status.requests[0].attempts,5);
  assert.doesNotMatch(JSON.stringify(status),/PRIVATE/);
  assert.equal(store.db.prepare('SELECT error_category FROM request_alerts').get().error_category,'ECONNECTION');
});

test('SMTP timeouts and interrupted sends require an inbox check and never automatically resend',async t=>{
  let calls=0;
  const {alerts,request,store}=fixture(t,{transport:{sendMail:async()=>{calls++;throw Object.assign(new Error('PRIVATE'),{code:'ETIMEDOUT',command:'DATA'});}}});
  const result=request();await alerts.wake();await alerts.wake();assert.equal(calls,1);
  assert.equal(alerts.status(staff).requests[0].status,'uncertain');await assert.rejects(alerts.retry(staff,result.id),/Only failed/);
  store.db.prepare("UPDATE request_alerts SET status='sending' WHERE request_id=?").run(result.id);
  const restarted=new ExpressOneAlerts(store,{env,base:new URL('https://portal.example.test'),transport:{sendMail:async()=>{calls++;}}});
  await restarted.wake();await restarted.close();assert.equal(calls,1);assert.equal(alerts.status(staff).requests[0].errorCategory,'interrupted');
});

test('rejected recipient preserves request and staff may retry a failed alert without recreating badges',async t=>{
  const {alerts,request,store,customer}=fixture(t,{transport:{sendMail:async()=>({accepted:[]})}});const result=request();await alerts.wake();
  assert.equal(alerts.status(staff).requests[0].status,'failed');await assert.rejects(alerts.retry(customer,result.id),/Staff/);
  await alerts.retry(staff,result.id);await alerts.wake();assert.equal(store.snapshot(customer).requests.length,1);
  assert.equal(store.snapshot(customer).stock[0].reserved,1);
});

test('test emails are staff-only, rate limited, use a fixed recipient, and never change inventory',async t=>{
  const {alerts,store,messages,customer}=fixture(t);
  await assert.rejects(alerts.test(customer),/Staff/);
  const result=await alerts.test(staff);assert.equal(result.accepted,true);assert.equal(messages[0].to,'staff@example.test');
  await assert.rejects(alerts.test(staff),/one minute/);
  assert.equal(store.snapshot(customer).requests.length,0);assert.equal(store.snapshot(customer).stock[0].reserved,0);
});

test('pending alert queue survives database reopen without backfilling historical requests',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'express-one-alerts-')),path=join(directory,'portal.sqlite');
  let store;
  try {
    store=new ExpressOneStore(path);seedPreview(store);
    const account=store.accountForIdentity({issuer:'preview',subject:'preview-customer'}),actor={role:'customer',subject:'preview-customer',accountId:account.id};
    const input={stockId:store.snapshot(actor).stock[0].id,names:[{name:'Test'}],delivery:'ship',requestKey:'historical'};
    const old=store.createRequest(actor,input);store.db.prepare('DELETE FROM request_alerts WHERE request_id=?').run(old.id);
    store.createRequest(actor,{...input,requestKey:'persistent'});
    store.close();store=null;store=new ExpressOneStore(path);assert.equal(store.snapshot(actor).requests.length,2);assert.equal(store.alertRows(staff).length,1);assert.equal(store.alertRows(staff)[0].status,'pending');
  } finally {store?.close();assert.ok(directory.startsWith(join(tmpdir(),'express-one-alerts-')));await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
