import sharp from 'sharp';
import {Worker} from 'node:worker_threads';
import {fail} from './auth.mjs';
export const MAX_ARTWORK_BYTES=10*1024*1024;
let active=0;
const rasterTypes=new Set(['image/png','image/jpeg','image/webp']);
const rasterSignature=(b,t)=>t==='image/png'?b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):t==='image/jpeg'?b.subarray(0,3).equals(Buffer.from('ffd8ff','hex')):b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP';
function kind(bytes,type,filename,role){
 if(!['portrait','logo','back'].includes(role)||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_ARTWORK_BYTES)fail(422,'ARTWORK_FILE_INVALID');
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
 const selected=kind(bytes,type,filename,role);let normalized,metadata;
 try{
  if(selected.kind==='raster'){
   const input=sharp(bytes,{limitInputPixels:16_000_000,animated:false,failOn:'error'});metadata=await input.metadata();if(!metadata.width||!metadata.height||metadata.width*metadata.height>16_000_000||(metadata.pages??1)!==1)throw Error();normalized=await input.rotate().png().timeout({seconds:15}).toBuffer();
  }else{const result=await vector(bytes,selected.kind);normalized=result.normalized;}
  metadata=await sharp(normalized,{limitInputPixels:16_000_000}).metadata();if(!metadata.width||!metadata.height||metadata.width*metadata.height>16_000_000)throw Error();
  const preview=await sharp(normalized).resize({width:900,height:900,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  return {type:selected.type,normalized,preview,width:metadata.width,height:metadata.height,previewKind:selected.kind};
 }catch(e){if(['SVG_SELF_CONTAINED_REQUIRED','PDF_UNLOCKED_REQUIRED','ARTWORK_PAGE_TOO_LARGE','ARTWORK_PREVIEW_TIMEOUT','ARTWORK_PREVIEW_BUSY'].includes(e?.code))fail(e.status??422,e.code);fail(422,'ARTWORK_COULD_NOT_BE_READ');}
}
