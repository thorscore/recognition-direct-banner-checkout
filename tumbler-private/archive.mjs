export const PRODUCT='15411785826600';
export const MARKER='rd-20oz-private-20261124';
export const APP='https://checkout.recognition-direct.com';
const utf8 = new TextEncoder();
const crcTable = Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes) { let crc=0xffffffff; for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8); return (crc^0xffffffff)>>>0; }
const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
export function productionFilename(name,fallback='upload') {
  const last=String(name||'').replaceAll('\\','/').split('/').at(-1).normalize('NFC').replace(/[\u0000-\u001f<>:"|?*]/g,'_').slice(0,160);
  return !last||/^\.+$/.test(last)?fallback:last;
}
export function storedZip(entries) {
  const chunks=[],central=[];let offset=0,centralSize=0;
  for(const entry of entries) {
    const name=utf8.encode(entry.path),bytes=entry.bytes,crc=crc32(bytes);
    if(name.length>65535||bytes.length>20*1024*1024)throw Error('Production file is too large for this private test.');
    const head=new Uint8Array(30+name.length),view=new DataView(head.buffer);
    view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(12,0x21,true);view.setUint32(14,crc,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,name.length,true);head.set(name,30);
    chunks.push(head,bytes);
    const index=new Uint8Array(46+name.length),v=new DataView(index.buffer);
    v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,0x21,true);v.setUint32(16,crc,true);v.setUint32(20,bytes.length,true);v.setUint32(24,bytes.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);index.set(name,46);central.push(index);centralSize+=index.length;offset+=head.length+bytes.length;
  }
  const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
  const blob=new Blob([...chunks,...central,end],{type:'application/zip'});
  if(blob.size>20*1024*1024)throw Error('Combined original files must be under 20 MB for this private test.');
  return blob;
}
export async function buildProductionPack({configurationId,variantId,sku,color,quantity,unitCents,personalization='',notes='',artwork,nameList,limitedLaunch=false}) {
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(configurationId)||!/^\d+$/.test(String(variantId))||!Number.isSafeInteger(quantity)||quantity<1||quantity>4||!Number.isSafeInteger(unitCents)||unitCents<=0)throw Error('Invalid private production configuration.');
  const entries=[],files=[];
  for(const [role,file] of [['logo',artwork],['name-list',nameList]])if(file?.size>0) {
    const bytes=new Uint8Array(await file.arrayBuffer()),path='originals/'+role+'/'+productionFilename(file.name);
    entries.push({path,bytes});files.push({role,path,originalName:file.name,bytes:bytes.length,sha256:await sha256(bytes)});
  }
  const manifest={schema:limitedLaunch?'rd-tumbler-production-v1':'rd-private-tumbler-production-v1',privatePreview:!limitedLaunch,...(limitedLaunch?{limitedLaunch:'20oz-v1'}:{}),proofRequired:true,productionReleaseAllowed:false,configurationId,savedConfiguration:APP+'/custom-order-cart?cart='+configurationId,productId:PRODUCT,variantId:String(variantId),sku,color,quantity,unitCents,personalization,notes,files};
  entries.push({path:'production-manifest.json',bytes:utf8.encode(JSON.stringify(manifest,null,2)+'\n')});
  entries.push({path:'READ-ME.txt',bytes:utf8.encode('PRIVATE TEST — DO NOT PRODUCE.\nOriginal artwork is inside originals/. Individual Shopify image attachments may be re-encoded.\nCheck payment and proof approval in Shopify before any real production.\nThis package does not approve a proof, release production, or confirm payment.\n')});
  const zip=storedZip(entries),file=new File([zip],'RD-private-production-originals.zip',{type:'application/zip'});
  return {file,manifest,sha256:await sha256(await file.arrayBuffer())};
}
