import {randomUUID} from 'node:crypto';
import {digest} from './checkout-shipping.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code,status:409});};
const locked=new Set(['creating','needs-review','ready']);
export function assertCartWritable(cart){if(cart?.checkoutAttempt&&locked.has(cart.checkoutAttempt.state))fail('CHECKOUT_NEEDS_STATUS_CHECK');}
export function verifiedInvoice(result){
  if(!/^gid:\/\/shopify\/DraftOrder\/[1-9]\d*$/.test(result?.id??''))fail('CREATE_RESULT_UNCERTAIN');
  let u;try{u=new URL(result.invoiceUrl);}catch{fail('CREATE_RESULT_UNCERTAIN');}
  if(u.protocol!=='https:'||!['recognition-direct.com','f375fe-2d.myshopify.com'].includes(u.hostname)||u.username||u.password||!/^\/(?:\d+\/)?invoices\/[a-z0-9_-]+\/?$/i.test(u.pathname))fail('CREATE_RESULT_UNCERTAIN');
  return {id:result.id,invoiceUrl:u.href};
}
export function checkoutCoordinator({read,write,shipping,transport,verifyPrepared,now=Date.now}){
  const locks=new Map();
  async function exclusive(id,fn){const prior=locks.get(id)??Promise.resolve();let release;const next=new Promise(r=>release=r);locks.set(id,next);await prior;try{return await fn();}finally{release();if(locks.get(id)===next)locks.delete(id);}}
  return Object.freeze({exclusive,async checkout(id,quoteId,{previewOnly=false}={}){return exclusive(id,async()=>{
    const c=await read(id);if(!c)fail('CART_NOT_FOUND');
    if(c.checkoutAttempt?.state==='ready')return {existing:true,result:verifiedInvoice(c.checkoutAttempt.result)};
    assertCartWritable(c);if(c.status!=='open')fail('CART_CLOSED');
    const prepared=shipping.prepare(c,quoteId);
    const calculation=verifyPrepared?await verifyPrepared(prepared,c):null;
    if(verifyPrepared)shipping.checked(c);
    if(previewOnly)return {previewOnly:true,createsDraft:false,createsOrder:false,chargesPayment:false,input:prepared.input,snapshot:prepared.snapshot,calculation};
    c.checkoutAttempt={id:randomUUID(),state:'creating',startedAt:now(),quote:structuredClone(prepared.snapshot),inputHash:digest(prepared.input)};
    await write(c,{checkoutOwner:c.checkoutAttempt.id});
    try{
      const result=verifiedInvoice(await transport(prepared.input));
      c.checkoutAttempt.state='ready';c.checkoutAttempt.result=result;c.status='checked_out';c.shopifyDraftOrderId=result.id;c.checkoutUrl=result.invoiceUrl;
      await write(c,{checkoutOwner:c.checkoutAttempt.id});return {existing:false,result};
    }catch(error){
      c.checkoutAttempt.state=error.definitive===true&&!error.draftId?'not-created':'needs-review';
      c.checkoutAttempt.error=error.code??'CREATE_RESULT_UNCERTAIN';if(error.draftId)c.checkoutAttempt.draftId=error.draftId;
      await write(c,{checkoutOwner:c.checkoutAttempt.id});throw error;
    }
  });}});
}
