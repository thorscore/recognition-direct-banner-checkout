// Owner-only hosted preview. Read-only payment verification; production release is absent.
import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {crc32,MARKER,PRODUCT} from './archive.mjs';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const clone=structuredClone, hash=value=>sha(JSON.stringify(value));
const uuid=value=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value??'');
const fail=code=>{throw Object.assign(Error(code),{code});};
const need=(ok,code)=>{if(!ok)fail(code);};
const staff=actor=>need(actor?.role==='staff'&&actor.simulation===true,'STAFF_REQUIRED');
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function properties(line){
 need(Array.isArray(line.properties),'LINE_PROPERTIES_REQUIRED');const result={};
 for(const p of line.properties){need(typeof p.name==='string'&&typeof p.value==='string'&&!Object.hasOwn(result,p.name),'LINE_PROPERTIES_INVALID');result[p.name]=p.value;}
 return result;
}
function eventLines(lines){
 need(Array.isArray(lines),'EVENT_LINES_REQUIRED');
 return lines.map(line=>{need(typeof line.price==='string'&&/^\d{1,8}\.\d{2}$/.test(line.price),'EVENT_PRICE_INVALID');const [a,b]=line.price.split('.');return {id:String(line.id),product_id:String(line.product_id),variant_id:String(line.variant_id),sku:line.sku,quantity:line.quantity,unitCents:Number(a)*100+Number(b),properties:line.properties};});
}
const lineIdentity=line=>({...line,properties:Object.entries(properties(line)).sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>({name,value}))});
export function readStoredArchive(bytes){
 need(Buffer.isBuffer(bytes)&&bytes.length<=20*1024*1024,'ARCHIVE_SIZE_INVALID');
 const files=new Map();let p=0;
 while(p+30<=bytes.length&&bytes.readUInt32LE(p)===0x04034b50){
  const size=bytes.readUInt32LE(p+18),n=bytes.readUInt16LE(p+26),extra=bytes.readUInt16LE(p+28),start=p+30+n+extra;
  need(bytes.readUInt16LE(p+8)===0&&start+size<=bytes.length,'ARCHIVE_FORMAT_INVALID');
  const name=bytes.subarray(p+30,p+30+n).toString('utf8');
  need(name&&!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').includes('..')&&!files.has(name),'ARCHIVE_PATH_INVALID');
  const data=bytes.subarray(start,start+size);need(crc32(data)===bytes.readUInt32LE(p+14),'ARCHIVE_CRC_INVALID');files.set(name,data);p=start+size;
 }
 need(files.size>=2&&p+4<=bytes.length&&bytes.readUInt32LE(p)===0x02014b50&&bytes.readUInt32LE(bytes.length-22)===0x06054b50,'ARCHIVE_FORMAT_INVALID');
 return files;
}
export function checkOriginals(bytes,props,record,line){
 need(sha(bytes)===props._rd_original_pack_sha256,'ARCHIVE_HASH_MISMATCH');
 const entries=readStoredArchive(bytes);let m;try{m=JSON.parse(entries.get('production-manifest.json').toString());}catch{fail('MANIFEST_INVALID');}
 need(m.schema==='rd-private-tumbler-production-v1'&&m.privatePreview===true&&m.proofRequired===true&&m.productionReleaseAllowed===false,'MANIFEST_PRIVATE_REQUIRED');
 need(m.configurationId===record.cartId&&m.productId===PRODUCT&&m.variantId===String(line.variant_id)&&m.sku===record.sku&&m.quantity===record.quantity&&m.unitCents===record.unitCents&&m.personalization===record.personalizationText&&m.notes===record.notes&&m.color===record.color,'MANIFEST_DESIGN_MISMATCH');
 need(Array.isArray(m.files)&&m.files.length===record.originals.length,'ORIGINALS_INCOMPLETE');
 const seen=new Set();for(const f of m.files){
  const original=record.originals.find(o=>o.role===f.role);
  need(original&&!seen.has(f.role)&&entries.has(f.path),'ORIGINAL_MISSING');seen.add(f.role);
  need(f.bytes===original.bytes.length&&f.sha256===sha(original.bytes)&&sha(entries.get(f.path))===f.sha256,'ORIGINAL_HASH_MISMATCH');
 }
 need(entries.size===m.files.length+2&&entries.has('READ-ME.txt'),'ARCHIVE_EXTRA_FILES');
 return {manifest:m,archiveSha256:sha(bytes),files:m.files.map(f=>({role:f.role,name:f.originalName,sha256:f.sha256,bytes:f.bytes}))};
}
export class NativeTumblerWorkflow {
 constructor({executionMode,databasePath,shop,secret,readOrder,readCart,readRecord,readArchive,ownerEmail,messageBuilder,now=Date.now}){
  need(((executionMode==='simulation'&&shop==='rd-tumbler-simulation.myshopify.com')||(executionMode==='private-preview'&&shop==='f375fe-2d.myshopify.com'))&&typeof secret==='string'&&secret.length>=24,'PRIVATE_CONFIGURATION_REQUIRED');
  need([readOrder,readCart,readRecord,readArchive].every(x=>typeof x==='function'),'READ_ADAPTERS_REQUIRED');
  Object.assign(this,{shop,secret,readOrder,readCart,readRecord,readArchive,now,mode:executionMode,ownerEmail,messageBuilder});this.db=new DatabaseSync(databasePath);this.tail=Promise.resolve();
  this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
   CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,body_hash TEXT NOT NULL,result TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,line_id TEXT NOT NULL,record_id TEXT UNIQUE NOT NULL,record TEXT NOT NULL,UNIQUE(order_id,line_id));
   CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,revision INTEGER NOT NULL,record TEXT NOT NULL,UNIQUE(job_id,revision));
   CREATE TABLE IF NOT EXISTS proof_documents(job_id TEXT NOT NULL,revision INTEGER NOT NULL,sha256 TEXT NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(job_id,revision));
   CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,event TEXT NOT NULL,record TEXT NOT NULL);`);
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 serial(fn){const next=this.tail.then(fn);this.tail=next.catch(()=>{});return next;}
 audit(event,data){this.db.prepare('INSERT INTO audit(event,record) VALUES(?,?)').run(event,JSON.stringify({at:this.now(),...data}));}
 job(id){const row=this.db.prepare('SELECT record FROM jobs WHERE id=?').get(id);need(row,'JOB_NOT_FOUND');return JSON.parse(row.record);}
 save(job){this.db.prepare('UPDATE jobs SET record=? WHERE id=?').run(JSON.stringify(job),job.id);}
 list(){return this.db.prepare('SELECT record FROM jobs ORDER BY id').all().map(r=>JSON.parse(r.record));}
 close(){this.db.close();}
 verifiedHeader(headers,raw){
  const h=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
  need(Buffer.isBuffer(raw)&&raw.length<=256*1024,'WEBHOOK_SIZE_INVALID');
  const signature=createHmac('sha256',this.secret).update(raw).digest('base64');
  need(typeof h['x-shopify-hmac-sha256']==='string'&&equal(signature,h['x-shopify-hmac-sha256']),'WEBHOOK_SIGNATURE_INVALID');
  need(h['x-shopify-shop-domain']===this.shop,'WEBHOOK_SHOP_MISMATCH');
  need(uuid(h['x-shopify-webhook-id']),'WEBHOOK_ID_INVALID');
  need(['orders/paid','orders/cancelled','refunds/create'].includes(h['x-shopify-topic']),'WEBHOOK_TOPIC_UNSUPPORTED');return h;
 }
 async current(orderId){
  const result=await this.readOrder(orderId);
  need((this.mode==='simulation'?result?.simulation===true:result?.executionMode==='private-preview')&&String(result.order?.id)===orderId&&result.shop===this.shop&&Number.isSafeInteger(result.observedAt)&&result.observedAt<=this.now()&&this.now()-result.observedAt<60000,'FRESH_ORDER_READ_REQUIRED');
  return result.order;
 }
 paid(order){
  need((this.mode!=='simulation'||order.test===true)&&order.quantitiesUnchanged!==false&&order.financial_status==='paid'&&order.cancelled_at===null&&order.fulfillment_status===null&&order.refunds.length===0,'PAID_UNFULFILLED_ORDER_REQUIRED');
  need(order.currency==='USD'&&order.totalOutstandingCents===0&&order.totalRefundedCents===0&&order.discountCents===0,'ORDER_MONEY_UNVERIFIED');
  need(['SHIP','PICK_UP'].includes(order.delivery?.method)&&Number.isSafeInteger(order.shippingCents)&&order.shippingCents>=0&&Number.isSafeInteger(order.taxCents)&&order.taxCents>=0,'DELIVERY_UNVERIFIED');
  if(order.delivery.method==='PICK_UP')need(order.shippingCents===0&&order.delivery.locationId==='97024180520','PICKUP_UNVERIFIED');
  need(order.totalCents===order.subtotalCents+order.shippingCents+order.taxCents&&order.captureCents===order.totalCents,'CAPTURE_TOTAL_MISMATCH');
 }
 async matchingRecord(props,line){
  need(uuid(props._rd_custom_cart_id),'CONFIGURATION_REFERENCE_INVALID');
  const cart=await this.readCart(props._rd_custom_cart_id);need(cart?.id===props._rd_custom_cart_id&&Array.isArray(cart.items),'SAVED_CART_NOT_FOUND');
  const candidates=[];for(const item of cart.items){
   if(props._rd_configuration_id&&item.orderId!==props._rd_configuration_id)continue;
   const record=await this.readRecord(item.orderId);
   if(record?.cartId===cart.id&&record.type==='polar-camel-order'&&record.sku===line.sku&&record.quantity===line.quantity&&record.unitCents===line.unitCents&&record.personalizationText===props['Personalization Text']&&record.notes===(props.Notes||''))candidates.push(record);
  }
  need(candidates.length===1,'SAVED_CONFIGURATION_AMBIGUOUS_OR_MISSING');return candidates[0];
 }
 async process(headers,raw){return this.serial(async()=>{
  const h=this.verifiedHeader(headers,raw),id=h['x-shopify-webhook-id'],digest=sha(raw),prior=this.db.prepare('SELECT * FROM receipts WHERE id=?').get(id);
  if(prior){need(prior.body_hash===digest,'WEBHOOK_ID_CONFLICT');return {...JSON.parse(prior.result),duplicate:true};}
  let event;try{event=JSON.parse(raw);}catch{fail('WEBHOOK_JSON_INVALID');}
  const orderId=String(h['x-shopify-topic']==='refunds/create'?event.order_id:event.id);
  need(/^[1-9][0-9]{0,15}$/.test(orderId),'ORDER_ID_INVALID');const order=await this.current(orderId);
  if(h['x-shopify-topic']!=='orders/paid'){
   need(order.cancelled_at!==null||order.refunds.length>0||order.totalRefundedCents>0,'ADVERSE_EVENT_NOT_CONFIRMED');
   const jobs=this.list().filter(j=>j.orderId===orderId);
   const result={status:'held',jobIds:jobs.map(j=>j.id),simulated:this.mode==='simulation'};this.transaction(()=>{for(const job of jobs){job.state='held';job.holdReason='Order cancelled or refunded';job.productionEligible=false;if(job.proof)job.proof.status='revoked';this.save(job);}this.db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(id,digest,JSON.stringify(result));this.audit('payment-revoked',{orderId});});return result;
  }
  need((this.mode!=='simulation'||event.test===true)&&event.financial_status==='paid'&&Number.isFinite(Date.parse(event.updated_at))&&Date.parse(event.updated_at)<=Date.parse(order.updated_at)&&isDeepStrictEqual(eventLines(event.line_items).map(lineIdentity),order.line_items.map(lineIdentity)),'ORDER_EVENT_READ_MISMATCH');
  const marked=order.line_items.filter(line=>properties(line)._rd_tumbler_preview===MARKER);
  if(!marked.length){const result={status:'ignored',jobIds:[],simulated:this.mode==='simulation'};this.transaction(()=>this.db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(id,digest,JSON.stringify(result)));return result;}
  this.paid(order);need(marked.length===order.line_items.length&&marked.reduce((n,l)=>n+l.quantity,0)<=4,'PRIVATE_CART_SCOPE_INVALID');
  const pending=[],used=new Set();let subtotal=0;
  for(const line of marked){
   const props=properties(line);
   need(String(line.product_id)===PRODUCT&&Number.isSafeInteger(line.quantity)&&line.quantity>0&&Number.isSafeInteger(line.unitCents)&&line.unitCents>0&&props['Proof Required']==='Yes','PRIVATE_LINE_INVALID');
   need(uuid(props._rd_preview_submission)&&/^[a-f0-9]{64}$/.test(props._rd_original_pack_sha256),'PRIVATE_LINE_REFERENCE_INVALID');
   need(/^https:\/\/cdn\.shopify\.com\/s\/files\/1\/0865\/5762\/2568\/uploads\/[a-f0-9]{32}\.zip$/.test(props['Production originals']||''),'ARCHIVE_LOCATION_INVALID');
   const record=await this.matchingRecord(props,line);need(!used.has(record.id),'SOURCE_RECORD_REUSED');used.add(record.id);
   const pack=checkOriginals(await this.readArchive(props['Production originals']),props,record,line);
   const priorRow=this.db.prepare('SELECT record FROM jobs WHERE record_id=? OR (order_id=? AND line_id=?)').all(record.id,orderId,String(line.id));
   need(priorRow.every(r=>{const j=JSON.parse(r.record);return j.recordId===record.id&&j.orderId===orderId&&j.lineId===String(line.id)&&j.sourceHash===hash(record)&&j.archiveSha256===pack.archiveSha256;}),'SOURCE_RECORD_ALREADY_CLAIMED');
   const job={id:`${this.mode==='simulation'?'sim':'private'}-${orderId}-${line.id}`,simulation:this.mode==='simulation',orderId,orderName:order.name,lineId:String(line.id),recordId:record.id,cartId:record.cartId,sourceHash:hash(record),design:clone(pack.manifest),originals:pack.files,archiveUrl:props['Production originals'],archiveSha256:pack.archiveSha256,payment:{verified:true,simulated:this.mode==='simulation',totalCents:order.totalCents},delivery:clone(order.delivery),shippingCents:order.shippingCents,taxCents:order.taxCents,markupCents:0,handlingCents:0,state:'awaiting_staff_proof',proof:null,productionEligible:false,productionReleaseAllowed:false};
   if(!priorRow.length)pending.push(job);subtotal+=line.quantity*line.unitCents;
  }
  need(subtotal===order.subtotalCents,'SUBTOTAL_MISMATCH');
  const jobIds=marked.map(line=>`${this.mode==='simulation'?'sim':'private'}-${orderId}-${line.id}`),result={status:'linked',jobIds,simulated:this.mode==='simulation'};
  this.transaction(()=>{for(const j of pending)this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?)').run(j.id,j.orderId,j.lineId,j.recordId,JSON.stringify(j));this.db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(id,digest,JSON.stringify(result));this.audit('paid-linked',{orderId,jobIds});});return result;
 });}
 async fresh(job){
  const order=await this.current(job.orderId);this.paid(order);
  const record=await this.readRecord(job.recordId);need(hash(record)===job.sourceHash,'DESIGN_CHANGED_REVIEW_REQUIRED');
  need(order.totalCents===job.payment.totalCents&&order.shippingCents===job.shippingCents&&order.taxCents===job.taxCents&&isDeepStrictEqual(order.delivery,job.delivery),'ORDER_CHANGED_REVIEW_REQUIRED');
  const line=order.line_items.find(l=>String(l.id)===job.lineId);need(line,'ORDER_LINE_MISSING');
  const props=properties(line);need(line.sku===job.design.sku&&line.quantity===job.design.quantity&&line.unitCents===job.design.unitCents&&String(line.variant_id)===job.design.variantId&&props['Personalization Text']===job.design.personalization&&props._rd_original_pack_sha256===job.archiveSha256,'ORDER_LINE_CHANGED_REVIEW_REQUIRED');
  checkOriginals(await this.readArchive(job.archiveUrl),props,record,line);return order;
 }
 async attachProof(actor,jobId,pdf){return this.serial(async()=>{
  staff(actor);const job=this.job(jobId);need(job.state!=='held','JOB_HELD');await this.fresh(job);
  need(Buffer.isBuffer(pdf)&&pdf.length>100&&pdf.length<10*1024*1024&&pdf.subarray(0,5).toString()==='%PDF-','PDF_REQUIRED');
  job.proof={revision:(job.proof?.revision||0)+1,sha256:sha(pdf),bytes:pdf.length,status:'prepared',expiresAt:null,tokenHash:null};job.state='proof_prepared';job.productionEligible=false;
  this.transaction(()=>{this.save(job);this.db.prepare('INSERT INTO proof_documents VALUES(?,?,?,?)').run(jobId,job.proof.revision,sha(pdf),pdf);this.audit('proof-prepared',{jobId,revision:job.proof.revision,sha256:job.proof.sha256});});return clone(job.proof);
 });}
 async sendProof(actor,jobId,pdf,recipient){return this.serial(async()=>{
  staff(actor);need(this.ownerEmail?recipient===this.ownerEmail:/^[a-z0-9._+-]+@example\.com$/i.test(recipient),'PRIVATE_RECIPIENT_REQUIRED');const job=this.job(jobId);await this.fresh(job);
  need(job.proof?.status==='prepared'&&job.proof.sha256===sha(pdf),'CURRENT_PROOF_REQUIRED');
  const token=randomBytes(32).toString('hex');job.proof.status='sent';job.proof.tokenHash=sha(token);job.proof.expiresAt=this.now()+7*86400000;job.state='awaiting_customer_approval';
  const email={simulation:true,sent:false,recipient,subject:`SIMULATION | ${job.orderName} | PDF proof v${job.proof.revision}`,attachment:{name:`tumbler-proof-v${job.proof.revision}.pdf`,sha256:sha(pdf),bytes:pdf.length},revision:job.proof.revision,jobId,...this.messageBuilder?.({job,token,pdf,recipient})};
  this.transaction(()=>{this.save(job);this.db.prepare('INSERT INTO outbox VALUES(?,?,?,?)').run(`${job.id}-v${job.proof.revision}`,job.id,job.proof.revision,JSON.stringify(email));this.audit('proof-email-simulated',{jobId,revision:job.proof.revision});});return {token,email};
 });}
 proofAccess(jobId,token,revision,digest){
  const job=this.job(jobId),p=job.proof;
  need(p&&typeof token==='string'&&equal(sha(token),p.tokenHash||'')&&p.expiresAt>this.now(),'PROOF_LINK_INVALID_OR_EXPIRED');
  need(p.revision===revision&&p.sha256===digest,'PROOF_SUPERSEDED');return job;
 }
 async approve({jobId,token,revision,digest,checked}){return this.serial(async()=>{
  const job=this.proofAccess(jobId,token,revision,digest);need(checked===true,'PROOF_REVIEW_CHECKBOX_REQUIRED');await this.fresh(job);
  if(job.proof.status==='approved')return {status:'approved',duplicate:true,message:'Thank you for your approval. Your test approval has been recorded.',productionReleased:false};
  need(job.proof.status==='sent'&&job.state==='awaiting_customer_approval','PROOF_NOT_AWAITING_APPROVAL');
  job.proof.status='approved';job.proof.approvedAt=this.now();job.state=this.mode==='simulation'?'approved_simulation_only':'approved_private_hold';job.productionEligible=true;
  this.transaction(()=>{this.save(job);this.audit('proof-approved',{jobId,revision,digest});});return {status:'approved',duplicate:false,message:'Thank you for your approval. Your test approval has been recorded.',productionReleased:false};
 });}
 async requestChanges({jobId,token,revision,digest,note}){return this.serial(async()=>{
  const job=this.proofAccess(jobId,token,revision,digest);await this.fresh(job);need(job.proof.status==='sent'&&typeof note==='string'&&note.trim().length>0&&note.length<=2000,'CHANGE_REQUEST_INVALID');
  job.proof.status='changes_requested';job.proof.changeRequest=note.trim();job.state='changes_requested';job.productionEligible=false;this.transaction(()=>{this.save(job);this.audit('proof-changes-requested',{jobId,revision});});return {status:'changes_requested'};
 });}
 async productionPacket(actor,jobId){staff(actor);const job=this.job(jobId);await this.fresh(job);need(job.state===(this.mode==='simulation'?'approved_simulation_only':'approved_private_hold')&&job.proof?.status==='approved','APPROVED_CURRENT_PROOF_REQUIRED');return {simulation:this.mode==='simulation',privatePreview:true,productionReleaseAllowed:false,jobId,orderName:job.orderName,delivery:job.delivery,design:job.design,originals:job.originals,archiveUrl:job.archiveUrl,archiveSha256:job.archiveSha256,approvedProof:{revision:job.proof.revision,sha256:job.proof.sha256},markupCents:0,handlingCents:0};}
 releaseProduction(){fail('SIMULATION_CANNOT_RELEASE_PRODUCTION');}
}
