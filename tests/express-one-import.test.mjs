import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {buildImportPlan,stageImport} from '../express-one-import.mjs';
import {createImportReviewServer} from '../express-one-import-preview.mjs';

const cell = (address,value,extra={}) => ({cell:address,row:Number(address.replace(/\D/g,'')),col:address.charCodeAt(0)-64,value,...extra});
const book = (file='Account.xlsx',balance=8,extras=[]) => ({file,sha256:'a'.repeat(64),sheets:[{name:'Sheet1',rows:14,cells:[cell('F1','Balance'),cell('A2','Company'),cell('B2','Test Customer'),cell('B7','contact@example.com'),cell('B12','Magnetic badges'),cell('C2','2024-01-01T00:00:00'),cell('D2',20),cell('F2',20),cell('C3','2024-01-02T00:00:00'),cell('E3',12),cell('F3',balance),...extras]}]});
const plan = books => buildImportPlan({source:'private-source',books});

test('uses the final balance rather than lifetime purchases, with source provenance and no identity grant',()=>{
  const result=plan([book()]),account=result.accounts[0],style=account.styles[0];
  assert.equal(style.openingQuantity,8);assert.equal(style.finalBalanceSource.cell,'F3');
  assert.equal(style.finalBalanceSource.sha256,'a'.repeat(64));assert.equal(account.status,'staged');
  assert.equal(account.identityVerified,false);assert.equal(account.subject,undefined);assert.equal(result.summary.activeAccounts,0);
});
test('zero is preserved while negative and missing final balances stay held',()=>{
  const zero=plan([book('zero.xlsx',0)]).accounts[0].styles[0];
  assert.equal(zero.finalBalance,0);
  const negative=plan([book('negative.xlsx',-2)]).accounts[0].styles[0];
  assert.equal(negative.finalBalance,-2);assert.equal(negative.openingQuantity,null);assert.equal(negative.importStatus,'hold');
  const empty=book();empty.sheets[0].cells=empty.sheets[0].cells.filter(item=>!/^F\d+$/.test(item.cell)||item.cell==='F1');
  assert.equal(plan([empty]).accounts[0].styles[0].finalBalance,null);
});
test('overlapping ledgers are grouped but never summed into available stock',()=>{
  const result=plan([book('earlier.xlsx'),book('latest.xlsx')]);
  assert.equal(result.accounts.length,1);assert.equal(result.accounts[0].styles.length,2);
  assert.ok(result.accounts[0].styles.every(style=>style.importStatus==='hold'&&style.openingQuantity===null));
});
test('reviewed distinct styles keep separate opening quantities without combining them',()=>{
  const result=buildImportPlan({books:[book('magnet.xlsx'),book('pin.xlsx')]},{distinctStyleCompanies:['Test Customer']});
  assert.ok(result.accounts[0].styles.every(style=>style.openingQuantity===8&&style.importStatus==='prepared'));
});
test('future dates, balance discrepancies and separate pin sections are retained and flagged',()=>{
  const result=plan([book('sections.xlsx',9,[cell('C8','Pin'),cell('C9','2027-02-01T00:00:00'),cell('D9',50),cell('F9',19)])]);
  const style=result.accounts[0].styles[0];
  assert.ok(['future-dates','balance-rollforward','multiple-sections'].every(code=>style.issues.some(issue=>issue.code===code)));
  assert.equal(style.finalBalance,19);assert.equal(style.openingQuantity,null);assert.equal(style.history.at(-1).date,'2027-02-01');
});
test('reference sheets and populated templates do not become prepaid stock',()=>{
  const reference=book('pricing.xlsx');reference.sheets[0].cells=reference.sheets[0].cells.filter(item=>item.cell!=='F1');
  const result=plan([reference,book('xxxExpress One Blank 0411.xlsx')]);
  assert.equal(result.summary.templates,1);assert.equal(result.summary.references,1);assert.equal(result.summary.ledgers,0);
  assert.equal(result.accounts[0].styles.length,0);assert.equal(result.accounts[0].contact.email.value,'contact@example.com');
});
test('source email text cannot be treated as a verified customer identity',()=>{
  const input=book();input.sheets[0].cells.find(item=>item.cell==='B7').value='Invoiced added back in';
  const account=plan([input]).accounts[0];assert.ok(account.issues.some(issue=>issue.code==='invalid-email'));assert.equal(account.identityVerified,false);
});
test('staging is idempotent, preserves prior versions and has no live inventory tables',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'eo-import-')),path=join(dir,'staging.sqlite');
  try{
    const first=plan([book()]);stageImport(first,path);stageImport(first,path);
    const next=plan([book('Account.xlsx',7)]);const latest=stageImport(next,path);
    const db=new DatabaseSync(path,{readOnly:true});
    try{
      assert.equal(db.prepare('SELECT COUNT(*) n FROM account_drafts').get().n,2);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM import_batches').get().n,2);
      assert.equal(db.prepare('SELECT batch_id FROM import_state').get().batch_id,latest.batchId);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('accounts','stock','shipping','identities')").get().n,0);
    }finally{db.close();}
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('local read-only review rejects writes, wrong hosts and unpublished source downloads',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'eo-review-')),path=join(dir,'staging.sqlite');let server;
  try{
    const result=plan([book()]);stageImport(result,path);server=await createImportReviewServer(path,{port:0});
    const base=`http://127.0.0.1:${server.address().port}`;
    const summary=await fetch(`${base}/api/accounts`);assert.equal(summary.headers.get('cache-control'),'no-store');assert.equal(summary.headers.get('access-control-allow-origin'),null);
    assert.equal((await summary.json()).summary.activeAccounts,0);
    assert.equal((await fetch(`${base}/api/accounts/${result.accounts[0].id}`)).status,200);
    assert.equal((await fetch(`${base}/api/accounts`,{method:'POST',body:'{}'})).status,405);
    assert.equal((await fetch(`${base}/account-drafts.sqlite`)).status,404);
    const wrongHost = await new Promise((resolve,reject)=>{const req=request(base+'/',{headers:{Host:'evil.example'}},response=>{response.resume();response.once('end',()=>resolve(response.statusCode));});req.once('error',reject);req.end();});
    assert.equal(wrongHost,403);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
