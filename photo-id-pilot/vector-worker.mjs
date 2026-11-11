import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import sharp from 'sharp';
import {prepareSvgMarkup} from '../public/badge-preview/svg-source.js';
const EDGE=3600,MAX_PIXELS=16_000_000;
const stop=code=>{throw Object.assign(new Error(code),{code});};
async function svg(bytes){
 let markup;try{markup=prepareSvgMarkup(bytes.toString('utf8'));}catch{stop('SVG_SELF_CONTAINED_REQUIRED');}
 const inspect=markup.replace(/<!--[\s\S]*?-->/g,'').replace(/\/\*[\s\S]*?\*\//g,'');
 if(!/<svg[\s>]/i.test(inspect)||/<\s*(?:[\w.-]+:)?(?:script|foreignObject|iframe|object|embed|audio|video)\b/i.test(inspect)||/\s+(?:[\w.-]+:)?on[\w-]+\s*=/i.test(inspect)||/\bxml:base\s*=|@import|@font-face|\\|<\?xml-stylesheet/i.test(inspect))stop('SVG_SELF_CONTAINED_REQUIRED');
 let pixels=0;
 for(const match of inspect.matchAll(/\b(?:[\w.-]+:)?href\s*=\s*(["'])([\s\S]*?)\1/gi)){
  const ref=match[2];if(/^#[A-Za-z_][\w:.-]*$/.test(ref))continue;
  const image=ref.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);if(!image)stop('SVG_SELF_CONTAINED_REQUIRED');
  const metadata=await sharp(Buffer.from(image[2],'base64'),{limitInputPixels:MAX_PIXELS}).metadata();pixels+=metadata.width*metadata.height;if(!Number.isFinite(pixels)||pixels>MAX_PIXELS||(metadata.pages??1)!==1)stop('ARTWORK_PAGE_TOO_LARGE');
 }
 for(const match of inspect.matchAll(/url\s*\(\s*([^)]*)\)/gi)){if(!/^(?:#[A-Za-z_][\w:.-]*|"#[A-Za-z_][\w:.-]*"|'#[A-Za-z_][\w:.-]*')$/.test(match[1].trim()))stop('SVG_SELF_CONTAINED_REQUIRED');}
 const safe=Buffer.from(markup),metadata=await sharp(safe,{density:72,limitInputPixels:MAX_PIXELS}).metadata();if(!metadata.width||!metadata.height||Math.max(metadata.width,metadata.height)>1_000_000)stop('ARTWORK_PAGE_TOO_LARGE');
 // Physical SVG units can scale differently between librsvg versions. Probe
 // dimensions without allocating pixels, then render only a bounded surface.
 let low=1,high=Math.min(100000,Math.max(72,Math.ceil(72*EDGE/Math.max(metadata.width,metadata.height)))),density=0;
 while(low<=high){const probe=Math.floor((low+high)/2),m=await sharp(safe,{density:probe,limitInputPixels:false}).metadata();if(m.width>0&&m.height>0&&Math.max(m.width,m.height)<=EDGE&&m.width*m.height<=MAX_PIXELS){density=probe;low=probe+1;}else high=probe-1;}
 if(!density)stop('ARTWORK_PAGE_TOO_LARGE');
 const raster=await sharp(safe,{density,limitInputPixels:MAX_PIXELS}).png().timeout({seconds:15}).toBuffer();
 return sharp(raster,{limitInputPixels:MAX_PIXELS}).resize({width:EDGE,height:EDGE,fit:'inside',withoutEnlargement:true}).png().toBuffer();
}
async function pdf(bytes){
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const require=createRequire(import.meta.url),packageRoot=dirname(require.resolve('pdfjs-dist/package.json'));
 const loading=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,enableXfa:false,useWasm:false,useSystemFonts:false,useWorkerFetch:false,standardFontDataUrl:join(packageRoot,'standard_fonts')+'/',cMapUrl:join(packageRoot,'cmaps')+'/',cMapPacked:true,maxImageSize:MAX_PIXELS,verbosity:0});
 try{
  const document=await loading.promise;if(document.numPages<1||document.numPages>1000)stop('ARTWORK_PAGE_TOO_LARGE');const page=await document.getPage(1),original=page.getViewport({scale:1});if(!Number.isFinite(original.width)||!Number.isFinite(original.height)||original.width<=0||original.height<=0)stop('ARTWORK_PAGE_TOO_LARGE');
  const viewport=page.getViewport({scale:EDGE/Math.max(original.width,original.height)}),width=Math.max(1,Math.ceil(viewport.width)),height=Math.max(1,Math.ceil(viewport.height));if(width*height>MAX_PIXELS)stop('ARTWORK_PAGE_TOO_LARGE');
  const {canvas,context}=document.canvasFactory.create(width,height);
  await page.render({canvas:null,canvasContext:context,viewport,annotationMode:pdfjs.AnnotationMode.DISABLE,background:'rgba(0,0,0,0)'}).promise;
  const normalized=canvas.toBuffer('image/png');document.canvasFactory.destroy({canvas,context});return normalized;
 }catch(e){if(e?.code)throw e;stop('PDF_UNLOCKED_REQUIRED');}finally{await loading.destroy().catch(()=>{});}
}
try{const bytes=Buffer.from(workerData.bytes),normalized=await(workerData.format==='svg'?svg(bytes):pdf(bytes)),m=await sharp(normalized).metadata();parentPort.postMessage({ok:true,normalized,width:m.width,height:m.height});}catch(e){parentPort.postMessage({ok:false,code:e?.code??'ARTWORK_COULD_NOT_BE_READ'});}
