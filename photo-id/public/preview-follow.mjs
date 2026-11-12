const storefrontOrigins=new Set(['https://recognition-direct.com','https://www.recognition-direct.com']);

export function mirrorCropPreview(source,canvas,panel,note,help='Adjust the sliders below to update this preview.'){
 if(!source){panel.hidden=true;return;}
 canvas.width=source.width;canvas.height=source.height;
 canvas.getContext('2d').drawImage(source,0,0);
 panel.hidden=false;note.textContent=help;
}

export function installPreviewFaces({document,MutationObserver}){
 const canvases=document.getElementById('canvases'),controls=document.getElementById('previewFaceControls');if(!canvases||!controls)return;
 const choices=['front','back','both'],buttons=choices.map(side=>document.getElementById('preview'+side[0].toUpperCase()+side.slice(1)));let requested='front';
 function refresh(){const two=canvases.querySelectorAll('figure').length>1,side=two?requested:'front';controls.hidden=!two;canvases.dataset.previewSide=side;buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(choices[i]===side)));}
 buttons.forEach((button,i)=>button.addEventListener('click',()=>{requested=choices[i];refresh();}));
 document.addEventListener('focusin',event=>{if(event.target.closest('#backfields'))requested='back';else if(event.target.closest('.fields'))requested='front';else return;refresh();});
 new MutationObserver(refresh).observe(canvases,{childList:true});refresh();
}

export function previewOffset({visibleTop,layoutTop,layoutHeight,previewHeight,width}){
 if(![visibleTop,layoutTop,layoutHeight,previewHeight,width].every(Number.isFinite)||width<=760)return 0;
 return Math.round(Math.max(0,Math.min(visibleTop-layoutTop+14,layoutHeight-previewHeight-22)));
}

export function installPreviewFollow({window,document,ResizeObserver}){
 if(window.parent===window)return;
 const layout=document.getElementById('badgeLayout'),preview=document.getElementById('badgePreview');
 if(!layout||!preview)return;
 let viewport=null,scheduled=false,lastOffset=-1,lastHeight=-1;
 function update(){
  scheduled=false;if(!viewport)return;
  const offset=previewOffset({visibleTop:viewport.top,layoutTop:layout.getBoundingClientRect().top+window.scrollY,layoutHeight:layout.offsetHeight,previewHeight:preview.offsetHeight,width:window.innerWidth});
  if(offset!==lastOffset){preview.style.setProperty('--preview-offset',offset+'px');lastOffset=offset;}
 }
 function schedule(){if(!scheduled){scheduled=true;window.requestAnimationFrame(update);}}
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||!storefrontOrigins.has(event.origin)||event.data?.type!=='rd-photo-id-viewport')return;
  const {top,height}=event.data;if(!Number.isFinite(top)||Math.abs(top)>100000||!Number.isFinite(height)||height<100||height>10000)return;
  viewport={top,height};document.body.classList.add('preview-follow-embedded');
  if(height!==lastHeight){preview.style.setProperty('--preview-viewport-height',height+'px');lastHeight=height;}
  schedule();
 });
 window.addEventListener('resize',schedule,{passive:true});
 const observer=new ResizeObserver(schedule);observer.observe(layout);observer.observe(preview);
}

if(typeof window!=='undefined'&&typeof document!=='undefined'){installPreviewFollow({window,document,ResizeObserver});installPreviewFaces({document,MutationObserver});}
