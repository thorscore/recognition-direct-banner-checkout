// Keep only the latest adjustment while one preview is being built. This bounds
// server work and prevents an old response from replacing the current design.
export function createPreviewQueue({render,onError,delay=100,setTimer=setTimeout,clearTimer=clearTimeout}){
 let revision=0,requestedKey=null,pending=null,running=false,timer=null,ready=false;
 async function pump(){
  if(running||!ready||!pending)return;
  const item=pending;pending=null;running=true;
  const current=()=>item.revision===revision;
  try{await render(item.snapshot,current);}
  catch(error){if(current()){requestedKey=null;onError(error);}}
  finally{running=false;if(ready&&pending)void pump();}
 }
 return {
  schedule(snapshot){
   if(!snapshot||snapshot.key===requestedKey)return;
   requestedKey=snapshot.key;pending={snapshot,revision:++revision};ready=false;
   clearTimer(timer);timer=setTimer(()=>{timer=null;ready=true;void pump();},delay);
  },
  cancel(){revision++;requestedKey=null;pending=null;ready=false;clearTimer(timer);timer=null;}
 };
}

export function previewSnapshot(job,personIndex){
 if(!job)return null;
 const document=structuredClone(job.document),person=document.people[personIndex];
 if(!person)return null;
 const visual={layout:document.layout,orientation:document.orientation??'landscape',organization:document.organization,color:document.color,secondaryColor:document.secondaryColor,logo:document.logo,logoScale:document.logoScale,logoCrop:document.logoCrop,printSides:document.printSides,backMode:document.backMode,backHeading:document.backHeading,backText:document.backText,backArtwork:document.backArtwork,attachment:document.attachment,punch:document.punch,person:{firstLine:person.firstLine,secondLine:person.secondLine,organization:person.organization,photo:person.photo,crop:person.crop}};
 return {jobId:job.id,personIndex,document,key:JSON.stringify([job.id,personIndex,visual])};
}
