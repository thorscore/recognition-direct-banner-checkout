import http from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {createCheckoutShipping,normalizeSavedCart} from './shipping/checkout-shipping.mjs';
import {validateRateSnapshot} from './shipping/rate-snapshot.mjs';
import {shippingOperations} from './shipping/operations.mjs';
import {fixture,CASES,PLACES} from './fixtures.mjs';
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const fail=(status,message,code)=>{throw Object.assign(Error(message),{status,code});};
export function createPreview({snapshot,key,dataDir,expiresAt,now=Date.now,secure=true}){
 if(typeof key!=='string'||key.length<48||!Number.isSafeInteger(expiresAt))throw Error('Private preview configuration required.');
 validateRateSnapshot(snapshot,{now:now(),allowExpired:true});
 mkdirSync(dataDir,{recursive:true});
 const db=new DatabaseSync(join(dataDir,'preview.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS carts(id TEXT PRIMARY KEY, owner TEXT NOT NULL, body TEXT NOT NULL)');
 const ops=shippingOperations({path:join(dataDir,'operations.sqlite'),now});
 const sign=s=>createHmac('sha256',key).update(s).digest('base64url');
 const tokens={owner:sign('private-preview-access:owner'),customer:sign('private-preview-access:customer')};
 const pack=o=>{const b=Buffer.from(JSON.stringify(o)).toString('base64url');return b+'.'+sign(b);};
 const unpack=s=>{try{const [b,h,...extra]=String(s??'').split('.');if(extra.length||!equal(h,sign(b)))return null;const v=JSON.parse(Buffer.from(b,'base64url'));return v.exp>now()?v:null;}catch{return null;}};
 const csrf=s=>sign('csrf:'+s.id+':'+s.role);
 const read=id=>{const r=db.prepare('SELECT * FROM carts WHERE id=?').get(id);return r?{owner:r.owner,cart:JSON.parse(r.body)}:null;};
 const save=(cart,owner)=>db.prepare('INSERT INTO carts VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(cart.id,owner,JSON.stringify(cart));
 const buildDraftInput=cart=>({lineItems:cart.items.flatMap(i=>i.draftInput.lineItems)});
 const engines=new Map();
 function engine(cart){const practice=cart.previewCase==='review';const k=practice?'practice':'normal';if(!engines.has(k))engines.set(k,createCheckoutShipping({rateTable:practice?[]:snapshot.rateTable,nativeEvidence:snapshot.nativeEvidence,drinkwareEvidence:snapshot.drinkwareEvidence??[],key,operations:ops,now,buildDraftInput}));return engines.get(k);}
 function view(cart){const subtotalCents=cart.items.reduce((n,i)=>n+i.draftInput.lineItems.reduce((s,l)=>s+Math.round(Number(l.originalUnitPriceWithCurrency?.amount??0)*100)*l.quantity,0),0);let quote=null;try{quote=engine(cart).checked(cart);}catch{}
  return {id:cart.id,caseId:cart.previewCase,title:CASES.find(c=>c.id===cart.previewCase)?.title,items:cart.items.map(i=>({title:i.summary.title,quantity:i.draftInput.lineItems.reduce((n,l)=>n+l.quantity,0)})),subtotalCents,quote,reviewId:cart.reviewId??null,shippingStatus:cart.shippingStatus??'',checkout:cart.checkout??null,destination:cart.lastDestination??null,contact:cart.lastContact??null};}
 function evidence(r){
  const entry=read(r.target);if(entry?.cart.previewCase!=='review'||r.context.destination.zip!=='91962'||r.context.destination.provinceCode!=='CA'||r.context.destination.address1!==PLACES.pinevalley.address1)return null;
  // Deliberately held supported package, so approval uses an actual recorded quote.
  // Midnight PT is a conservative timestamp: never pretend a quote was refreshed.
  const observation=snapshot.observations.filter(q=>q.id==='T051'||q.previewApprovalPractice===true).sort((a,b)=>b.observedOn.localeCompare(a.observedOn))[0];
  if(!observation||observation.destinationZip!=='91962'||observation.originZip!=='91977')return null;
  const observedAt=Date.parse(observation.observedOn+'T00:00:00-08:00');if(now()-observedAt>86400000||observedAt>now())return null;
  return {source:'Shopify Shipping calculator',originZip:'91977',observedAt,parcels:[{packageIn:observation.packageIn,packedWeightLb:observation.packedWeightLb,allocations:r.context.lines.map(l=>({lineId:l.id,quantity:l.quantity})),quotes:observation.rates}],reference:observation.id};
 }
 const attempts=new Map();
 const server=http.createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
  const send=(status,data,type='application/json')=>{res.writeHead(status,{...headers,'Content-Type':type});res.end(type==='application/json'?JSON.stringify(data):data);};
  try{
   const url=new URL(req.url,'https://preview.invalid'),path=url.pathname;
   if(req.method==='GET'&&path==='/health')return send(200,{ok:true,mode:'private-shipping-preview',createsOrders:false,chargesPayments:false,markupBasisPoints:0,handlingCents:0});
   if(req.method==='GET'&&path==='/robots.txt')return send(200,'User-agent: *\nDisallow: /\n','text/plain');
   if(req.method==='GET'&&['/','/app.mjs','/delivery-form.mjs','/style.css'].includes(path)){const file=path==='/'?'index.html':path.slice(1);return send(200,readFileSync(new URL('public/'+file,import.meta.url)),path==='/'?'text/html; charset=utf-8':path.endsWith('mjs')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');}
   if(now()>=expiresAt)fail(410,'This private preview has expired. Ask Roth for a refreshed test link.','PREVIEW_EXPIRED');
   let body={};if(req.method==='POST'){
    const origin=req.headers.origin;if(origin&&origin!==`${secure?'https':'http'}://${req.headers.host}`)fail(403,'Open the private preview directly.','ORIGIN_INVALID');
    if(!String(req.headers['content-type']??'').startsWith('application/json'))fail(415,'Use the preview form.');
    let text='';for await(const part of req){text+=part;if(text.length>16000)fail(413,'The request is too large.');}try{body=JSON.parse(text||'{}');}catch{fail(400,'The form could not be read.');}
   }
   if(req.method==='POST'&&path==='/api/access'){
    const address=req.socket.remoteAddress,k=address,record=attempts.get(k)??{count:0,until:now()+60000};if(record.until<=now()){record.count=0;record.until=now()+60000;}record.count++;attempts.set(k,record);if(record.count>30)fail(429,'Wait a minute before trying this private link again.');
    const role=equal(body.token,tokens.owner)?'owner':equal(body.token,tokens.customer)?'customer':null;if(!role)fail(403,'Use the complete private preview link.','ACCESS_DENIED');
    const session={id:randomUUID(),role,exp:Math.min(now()+7*86400000,expiresAt)};res.setHeader('Set-Cookie',`rd_shipping_preview=${pack(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0,Math.floor((session.exp-now())/1000))}${secure?'; Secure':''}`);return send(200,{role,csrf:csrf(session)});
   }
   const cookie=String(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('rd_shipping_preview='))?.split('=').slice(1).join('=');
   const session=unpack(cookie);if(!session||!['customer','owner'].includes(session.role))fail(401,'Open your private preview link to begin.','SIGN_IN_REQUIRED');
   if(req.method==='POST'&&!equal(req.headers['x-preview-csrf'],csrf(session)))fail(403,'Reload this preview and try again.','CSRF_INVALID');
   const owner=()=>{if(session.role!=='owner')fail(403,'Only the owner can approve shipping.','OWNER_REQUIRED');};
   const ownCart=id=>{const r=read(id);if(!r)fail(404,'This sample cart has reset. Choose a sample to start again.','CART_RESET');if(r.owner!==session.id&&session.role!=='owner')fail(403,'This cart belongs to a different preview session.');return r;};
   if(req.method==='GET'&&path==='/api/session')return send(200,{role:session.role,csrf:csrf(session),cases:CASES.map(({id,title})=>({id,title})),places:PLACES,expiresAt,firstRateExpiry:snapshot.rateTable.map(r=>r.expiresOn).sort()[0],ratesSnapshot:snapshot.id});
   if(req.method==='POST'&&path==='/api/carts'){if(db.prepare('SELECT COUNT(*) AS n FROM carts').get().n>=500)fail(429,'Preview capacity reached.');const cart=fixture(body.caseId);save(cart,session.id);return send(201,view(cart));}
   const match=path.match(/^\/api\/carts\/([a-f0-9-]+)(?:\/(quote|checkout))?$/);
   if(match){const {cart,owner:cartOwner}=ownCart(match[1]);if(req.method==='GET'&&!match[2])return send(200,view(cart));
    if(req.method==='POST'&&match[2]==='quote'){
     const destination=body.destination,contact=body.contact;
     if(cart.previewCase==='review'&&(destination?.zip!=='91962'||destination?.provinceCode!=='CA'||destination?.address1!==PLACES.pinevalley.address1))fail(409,'Approval practice uses the recorded Pine Valley quote. Choose Pine Valley above.','PRACTICE_DESTINATION');
     delete cart.shippingEstimatePreview;delete cart.checkout;delete cart.reviewId;cart.lastDestination=destination;cart.lastContact=contact;
     try{cart.shippingEstimatePreview=engine(cart).quote(cart,destination,contact);cart.shippingStatus='ready';save(cart,cartOwner);return send(200,view(cart));}
     catch(e){cart.shippingStatus=e.code??'SHIPPING_QUOTE_REQUIRED';cart.reviewId=e.reviewId??null;save(cart,cartOwner);return send(e.status??409,{...view(cart),error:cart.previewCase==='large48'?'48 × 36 signs stay quote-only. The 50 × 38-inch box footprint is assumed; packed depth and weight still need confirmation.':e.message,code:e.code});}
    }
    if(req.method==='POST'&&match[2]==='checkout'){
     const prepared=engine(cart).prepare(cart,body.quoteId);
     cart.checkout={id:randomUUID(),shippingCents:prepared.snapshot.result.shippingCents,subtotalCents:view(cart).subtotalCents,shopifyInputPrepared:true,lineItemsCount:prepared.input.lineItems.length,recipientNameComplete:!!prepared.input.shippingAddress?.lastName||prepared.snapshot.result.delivery!=='ship',createsDraft:false,createsOrder:false,chargesPayment:false,markupBasisPoints:0,handlingCents:0,checkedAt:now()};save(cart,cartOwner);return send(200,view(cart));
    }
   }
   if(req.method==='GET'&&path==='/api/reviews'){owner();return send(200,{reviews:ops.list().map(r=>({id:r.id,target:r.target,status:r.status,revision:r.revision,reason:r.reason,destination:r.context.destination,items:read(r.target)?view(read(r.target).cart).items:[],evidence:evidence(r),approval:r.approval}))});}
   const approval=path.match(/^\/api\/reviews\/([a-f0-9-]+)\/approve$/);
   if(req.method==='POST'&&approval){owner();const r=ops.read(approval[1]);if(!r)fail(404,'Shipping review not found.');const entry=read(r.target);if(entry?.cart.previewCase==='large48')fail(409,'48 × 36 signs remain quote-only.');const e=evidence(r);if(!e)fail(409,'A fresh complete-cart Shopify quote is needed before this case can be approved.','EVIDENCE_REQUIRED');if(body.reviewedWholeCart!==true)fail(400,'Review the package and rate, then check the confirmation box.');const approved=ops.approve(r.id,{...e,revision:body.revision,reviewedWholeCart:true,approvedBy:'private-preview-owner'});return send(200,{id:approved.id,status:approved.status,shippingCents:approved.approval.result.shippingCents,createsOrder:false,chargesPayment:false});}
   return send(404,{error:'This action is unavailable in the private shipping preview.'});
  }catch(e){return send(e.status??500,{error:e.status?e.message:'The preview could not complete this action. Your sample cart is saved.',code:e.code??'PREVIEW_ERROR'});}
 });
 return {server,tokens,ops,close:()=>{ops.close();db.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const snapshot=JSON.parse(gunzipSync(Buffer.from(process.env.PREVIEW_RATES_GZIP,'base64')));
 const app=createPreview({snapshot,key:process.env.PREVIEW_ACCESS_KEY,dataDir:process.env.PREVIEW_DATA_DIR??'/tmp/rd-shipping-preview',expiresAt:Number(process.env.PREVIEW_EXPIRES_AT),secure:process.env.PREVIEW_LOCAL!=='1'});
 app.server.listen(Number(process.env.PORT??10000),'0.0.0.0',()=>console.log('Private shipping preview ready; order and payment transports absent.'));
}

