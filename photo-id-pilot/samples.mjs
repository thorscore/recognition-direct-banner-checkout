import {samplePortrait,sampleLogo} from './fixtures.mjs';
import {fail} from './auth.mjs';
export const SAMPLE_MARKER='PRIVATE PHOTO ID PILOT SAMPLE (2026-11-11)';
export function createPilotSamples(store){
 const pending=new Map();
 return async function sample(side){
  if(!['front-only','front-and-back'].includes(side))fail(422,'SAMPLE_SIDE_REQUIRED');
  if(pending.has(side))return pending.get(side);
  const operation=(async()=>{
   const existing=store.list().find(j=>j.document.printSides===side&&j.document.logoNotes.startsWith(SAMPLE_MARKER));if(existing)return existing;
   const [portrait,logo]=await Promise.all([samplePortrait(),sampleLogo()]);
   const j=store.create(),d=j.document,two=side==='front-and-back';
   const p=await store.upload(j.id,{role:'portrait',type:'image/png',bytes:portrait}),l=await store.upload(j.id,{role:'logo',type:'image/png',bytes:logo});
   d.organization='SAMPLE COMPANY';d.logo=l.id;d.logoScale=150;d.printSides=side;d.delivery=two?'troy':'ship';d.attachment=two?'magnet':'lanyard';d.punch=two?'unpunched':'punch';d.lanyardColor='blue';
   d.logoNotes=SAMPLE_MARKER+'\nFictional test: check the portrait crop, logo size, name placement, printed sides, attachment, and delivery in the PDF proof.';
   d.people[0].firstLine=two?'JAMIE':'ALEX';d.people[0].secondLine=two?'RIVERA':'TAYLOR';d.people[0].photo=p.id;
   if(two)d.backText='PRIVATE PILOT SAMPLE\nIf found, please return to Sample Company.';
   return store.save(j.id,{expectedRevision:j.revision,document:d});
  })();pending.set(side,operation);try{return await operation;}finally{pending.delete(side);}
 };
}
