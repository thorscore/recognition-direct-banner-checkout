import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {LAUNCH_VERSION,LAUNCH_NOTE} from './launch.mjs';
import {PRODUCT} from './archive.mjs';
import {variants} from './variants.mjs';
import {sha,checkOriginals,readStoredArchive} from './workflow.mjs';
const uuid=id=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id??'');
const fail=code=>{throw Object.assign(Error(code),{code,status:409});};
export function sourceReader({dataDir,base,cacheDir,fetcher=fetch}){
 const recordJson=async id=>{if(!uuid(id))fail('SAVED_RECORD_REFERENCE_INVALID');return JSON.parse(await readFile(join(dataDir,'orders',id+'.json'),'utf8'));};
 const cart=async id=>{if(!uuid(id))fail('SAVED_CART_REFERENCE_INVALID');return JSON.parse(await readFile(join(dataDir,'custom-carts',id+'.json'),'utf8'));};
 async function original(url){const u=new URL(url);if(u.origin!==new URL(base).origin||!/^\/uploads\/[a-f0-9-]{36}\.(png|jpg|jpeg|webp|pdf|ai|eps|psd|txt|csv)$/i.test(u.pathname)||u.search||u.hash)fail('ORIGINAL_REFERENCE_INVALID');const bytes=await readFile(join(dataDir,u.pathname.slice(1)));if(bytes.length>20*1024*1024)fail('ORIGINAL_TOO_LARGE');return bytes;}
 async function record(id){
  const r=await recordJson(id),a=r.nativeTumblerLaunch,launchAuthorized=a?.version===LAUNCH_VERSION&&a.productId===PRODUCT&&a.sku===r.sku&&a.quantity===r.quantity&&variants.some(v=>v.sku===r.sku&&v.variantId===a.variantId);if(r.id!==id||r.type!=='polar-camel-order'||(!launchAuthorized&&!r.notes?.includes('PRIVATE SHIPPING PREVIEW — DO NOT PAY OR PRODUCE.')))fail('PRIVATE_SAVED_RECORD_REQUIRED');
  if(!Number.isSafeInteger(r.quantity)||r.quantity<1||r.quantity>4||!Number.isFinite(r.unitPrice)||r.unitPrice<=0)fail('PRIVATE_SAVED_RECORD_INVALID');
  const originals=[];for(const [role,url] of [['logo',r.artworkUrl],['name-list',r.personalizationFileUrl]])if(url)originals.push({role,bytes:await original(url)});
  // Multipart form text uses CRLF; browser textarea/archive text uses LF.
  // Normalize only text for comparison. Uploaded original bytes remain untouched.
  return {...(launchAuthorized?{launchAuthorized:true}:{}),id:r.id,cartId:r.cartId,type:r.type,sku:r.sku,color:r.optionValue,quantity:r.quantity,unitCents:Math.round(r.unitPrice*100),personalizationText:(r.personalizationText||'').replace(/\r\n/g,'\n'),notes:(r.notes||'').replace(/\r\n/g,'\n').replace(/(?:^|\n)PRIVATE SHIPPING PREVIEW — DO NOT PAY OR PRODUCE\.$/,'').replace(new RegExp('(?:^|\n)'+LAUNCH_NOTE.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'),''),originals};
 }
 async function archive(url){
  if(!/^https:\/\/cdn\.shopify\.com\/s\/files\/1\/0865\/5762\/2568\/uploads\/[a-f0-9]{32}\.zip$/.test(url??''))fail('ARCHIVE_LOCATION_INVALID');
  const name=sha(url)+'.zip',path=join(cacheDir,name);try{return await readFile(path);}catch(e){if(e.code!=='ENOENT')throw e;}
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok||!response.body)fail('ORIGINAL_ARCHIVE_UNAVAILABLE');const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>20*1024*1024)fail('ORIGINAL_ARCHIVE_TOO_LARGE');chunks.push(chunk);}const bytes=Buffer.concat(chunks);readStoredArchive(bytes);await mkdir(cacheDir,{recursive:true});await writeFile(path,bytes,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});return bytes;
 }
 async function connect(input){
  if(!uuid(input?.cartId)||!uuid(input?.recordId)||!/^\d+$/.test(String(input?.variantId))||!/^[a-f0-9]{64}$/.test(input?.archiveHash||''))fail('PRIVATE_SOURCE_REFERENCE_INVALID');
  const c=await cart(input.cartId);if(c.items.filter(i=>i.orderId===input.recordId).length!==1)fail('PRIVATE_SOURCE_CART_MISMATCH');
  const r=await record(input.recordId);if(r.cartId!==input.cartId)fail('PRIVATE_SOURCE_CART_MISMATCH');
  const bytes=await archive(input.archiveUrl),line={variant_id:String(input.variantId)},checked=checkOriginals(bytes,{_rd_original_pack_sha256:input.archiveHash},r,line,!!r.launchAuthorized);
  return {reference:{cartId:r.cartId,recordId:r.id,variantId:String(input.variantId),archiveUrl:input.archiveUrl,archiveHash:input.archiveHash},record:r,archive:bytes,manifest:checked.manifest};
 }
 async function annotate(job){
  // Only verified real private events touch the specific associated source record.
  if(job.simulation)return;const r=await recordJson(job.recordId);
  r[job.customerLaunch?'nativeTumblerHandoff':'nativePrivateHandoff']={shopifyOrderId:'gid://shopify/Order/'+job.orderId,jobId:job.id,proofState:job.proof?.status??'awaiting_staff_proof',proofRevision:job.proof?.revision??null,approvedProofSha256:job.proof?.status==='approved'?job.proof.sha256:null,productionReleased:false,privatePreview:!job.customerLaunch,shippingCents:job.shippingCents,totalCents:job.payment.totalCents};
  const path=join(dataDir,'orders',r.id+'.json'),temp=path+'.native-private.tmp';await writeFile(temp,JSON.stringify(r,null,2));await rename(temp,path);
 }
 return {cart,record,archive,connect,annotate};
}
