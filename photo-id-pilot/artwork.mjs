import sharp from 'sharp';
import {Worker} from 'node:worker_threads';
import {fail} from './auth.mjs';
export const MAX_ARTWORK_BYTES=10*1024*1024;
export const MAX_PHOTO_PIXELS=50_000_000;
const MAX_STANDARD_PIXELS=16_000_000;
let active=0;
let largePhotoActive=0;
const rasterTypes=new Set(['image/png','image/jpeg','image/webp']);
const rasterSignature=(b,t)=>t==='image/png'?b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):t==='image/jpeg'?b.subarray(0,3).equals(Buffer.from('ffd8ff','hex')):b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP';
function kind(bytes,type,filename,role){
 if(!['portrait','logo','back'].includes(role)||!Buffer.isBuffer(bytes))fail(422,'ARTWORK_FILE_INVALID');
 if(!bytes.length)fail(422,'ARTWORK_FILE_EMPTY');
 if(bytes.length>MAX_ARTWORK_BYTES)fail(413,'ARTWORK_FILE_TOO_LARGE');
 if(rasterTypes.has(type)&&rasterSignature(bytes,type))return {kind:'raster',type};
 if(role==='portrait')fail(422,'USE_JPG_PNG_WEBP');
 if(/\.eps$/i.test(filename))fail(422,'VECTOR_EXPORT_REQUIRED');
 if(/\.ai$/i.test(filename)&&!/%PDF-\d\.\d/.test(bytes.subarray(0,1024).toString('latin1')))fail(422,'PDF_COMPATIBLE_AI_REQUIRED');
 if((type==='application/pdf'||/\.(pdf|ai)$/i.test(filename))&&/%PDF-\d\.\d/.test(bytes.subarray(0,1024).toString('latin1')))return {kind:'pdf',type:'application/pdf'};
 if(type==='image/svg+xml'||/\.svg$/i.test(filename))return {kind:'svg',type:'image/svg+xml'};
 fail(422,'VECTOR_EXPORT_REQUIRED');
}
function vector(bytes,format){
 if(active>=1)fail(429,'ARTWORK_PREVIEW_BUSY');active++;
 return new Promise((resolve,reject)=>{
  let worker;try{worker=new Worker(new URL('./vector-worker.mjs',import.meta.url),{workerData:{bytes,format},env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16}});}catch{active--;reject(Object.assign(new Error('ARTWORK_COULD_NOT_BE_READ'),{code:'ARTWORK_COULD_NOT_BE_READ'}));return;}let settled=false;
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);active--;void worker.terminate();error?reject(error):resolve(result);};
  const error=code=>Object.assign(new Error(code),{status:422,code});
  const timer=setTimeout(()=>finish(error('ARTWORK_PREVIEW_TIMEOUT')),25_000);timer.unref();
  worker.once('message',m=>{if(!m?.ok)return finish(error(['SVG_SELF_CONTAINED_REQUIRED','PDF_UNLOCKED_REQUIRED','ARTWORK_PAGE_TOO_LARGE'].includes(m?.code)?m.code:'ARTWORK_COULD_NOT_BE_READ'));finish(null,{normalized:Buffer.from(m.normalized),width:m.width,height:m.height});});
  worker.once('error',()=>finish(error('ARTWORK_COULD_NOT_BE_READ')));worker.once('exit',()=>{if(!settled)finish(error('ARTWORK_COULD_NOT_BE_READ'));});
 });
}
export async function normalizeArtwork({bytes,type,filename='',role}){
 const selected=kind(bytes,type,filename,role);let normalized,metadata,preview,largePhoto=false,ownsLargePhotoSlot=false;
 const pixelLimit=role==='portrait'?MAX_PHOTO_PIXELS:MAX_STANDARD_PIXELS;
 try{
  if(selected.kind==='raster'){
   const input=sharp(bytes,{limitInputPixels:pixelLimit,animated:false,failOn:'error'});metadata=await input.metadata();
   if(!metadata.width||!metadata.height)throw Error();
   if(metadata.width*metadata.height>pixelLimit)fail(422,role==='portrait'?'PHOTO_TOO_MANY_PIXELS':'ARTWORK_PAGE_TOO_LARGE');
   if((metadata.pages??1)!==1)fail(422,role==='portrait'?'PHOTO_MULTIPLE_FRAMES':'ARTWORK_FILE_INVALID');
   largePhoto=role==='portrait'&&metadata.width*metadata.height>MAX_STANDARD_PIXELS;
   if(largePhoto){
    if(largePhotoActive)fail(429,'PHOTO_PROCESSING_BUSY');
    largePhotoActive++;ownsLargePhotoSlot=true;
    // Keep full pixel dimensions for proofs/production. A camera JPEG remains
    // efficiently compressed, auto-oriented and stripped of private metadata.
    // Exact original bytes are stored separately by the upload store.
    normalized=await (selected.type==='image/jpeg'?input.rotate().toColourspace('srgb').jpeg({quality:95}):input.rotate().png()).timeout({seconds:15}).toBuffer();
    // Resize directly from the camera file, using JPEG shrink-on-load where
    // possible, rather than repeatedly decoding a full-size PNG in the editor.
    preview=await sharp(bytes,{limitInputPixels:pixelLimit,animated:false,failOn:'error'}).rotate().resize({width:900,height:900,fit:'inside',withoutEnlargement:true}).png().timeout({seconds:15}).toBuffer();
   }else normalized=await input.rotate().png().timeout({seconds:15}).toBuffer();
  }else{const result=await vector(bytes,selected.kind);normalized=result.normalized;}
  metadata=await sharp(normalized,{limitInputPixels:pixelLimit}).metadata();if(!metadata.width||!metadata.height||metadata.width*metadata.height>pixelLimit)throw Error();
  preview??=await sharp(normalized).resize({width:900,height:900,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  return {type:selected.type,normalized,preview,width:metadata.width,height:metadata.height,previewKind:selected.kind,largePhoto};
 }catch(e){
  if(['SVG_SELF_CONTAINED_REQUIRED','PDF_UNLOCKED_REQUIRED','ARTWORK_PAGE_TOO_LARGE','ARTWORK_PREVIEW_TIMEOUT','ARTWORK_PREVIEW_BUSY','PHOTO_TOO_MANY_PIXELS','PHOTO_MULTIPLE_FRAMES','PHOTO_PROCESSING_BUSY','ARTWORK_FILE_INVALID'].includes(e?.code))fail(e.status??422,e.code);
  if(/pixel limit/i.test(e?.message??''))fail(422,role==='portrait'?'PHOTO_TOO_MANY_PIXELS':'ARTWORK_PAGE_TOO_LARGE');
  if(role==='portrait')fail(422,/timeout/i.test(e?.message??'')?'PHOTO_PROCESSING_TIMEOUT':'PHOTO_COULD_NOT_BE_READ');
  fail(422,'ARTWORK_COULD_NOT_BE_READ');
 }finally{if(ownsLargePhotoSlot)largePhotoActive--;}
}
