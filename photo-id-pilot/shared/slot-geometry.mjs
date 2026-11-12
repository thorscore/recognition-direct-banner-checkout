import {REFERENCE_CANVAS,logoBounds} from './model.mjs';
import {requiresSlot} from './mounting.mjs';
import {layoutFor} from './layout.mjs';
import {cardGeometry} from './card-geometry.mjs';
export const SLOT_VERSION='owner-rounded-capsule-slot-2026-11-06.v2';
export const SLOT_SPEC=Object.freeze({widthInches:9/16,heightInches:1/8,topEdgeGapInches:1/8,horizontallyCentered:true,endShape:'capsule',endRadiusInches:1/16,overallWidthIncludesRoundedEnds:true,interpretation:'Gap is measured from badge top edge to slot top edge'});
export const SUPPORTED_ORIENTATIONS=Object.freeze(['horizontal','landscape','portrait','vertical']);
export function slotBounds({orientation='horizontal',side='front'}={}){
 if(!SUPPORTED_ORIENTATIONS.includes(orientation)||!['front','back'].includes(side))throw Error('UNSUPPORTED_PROOF_ORIENTATION');
 const {widthInches:width,heightInches:height}=cardGeometry(orientation),x=(width-SLOT_SPEC.widthInches)/2,y=SLOT_SPEC.topEdgeGapInches;
 if(x<0||y<0||x+SLOT_SPEC.widthInches>width||y+SLOT_SPEC.heightInches>height)throw Error('SLOT_OUTSIDE_CARD');
 return {x,y,width:SLOT_SPEC.widthInches,height:SLOT_SPEC.heightInches,centerX:x+SLOT_SPEC.widthInches/2,centerY:y+SLOT_SPEC.heightInches/2};
}
export function mountingGeometry(attachment,punch,document={}){
 if(!['none','lanyard','reel','strap','magnet','pin'].includes(attachment)||!['unpunched','punch'].includes(punch))throw Error('MOUNTING_OPTION_INVALID');
 const required=requiresSlot(attachment),punched=required||punch==='punch';
 return {attachment,punch:punched?'punch':'unpunched',required,slot:punched?{version:SLOT_VERSION,...SLOT_SPEC,...slotBounds({orientation:document.orientation??'horizontal'})}:null};
}
export function slotInPixels(slot=slotBounds(),pixelsPerInch=REFERENCE_CANVAS.pixelsPerInch){return {x:slot.x*pixelsPerInch,y:slot.y*pixelsPerInch,width:slot.width*pixelsPerInch,height:slot.height*pixelsPerInch};}
export function slotCapsulePixels(pixelsPerInch=REFERENCE_CANVAS.pixelsPerInch){const bounds=slotInPixels(slotBounds(),pixelsPerInch);return {...bounds,rx:bounds.height/2,ry:bounds.height/2};}
export function safeLogoArea(punched=true,document={}){
 const original=layoutFor(document).logo;if(!punched)return {...original};
 const bottom=original.y+original.height,slot=slotInPixels(slotBounds({orientation:document.orientation??'horizontal'})),y=Math.max(original.y,slot.y+slot.height+8);
 if(y>=bottom)throw Error('LOGO_SPACE_REQUIRES_LAYOUT_REVIEW');
 return {...original,y,height:bottom-y};
}
export function logoPosition(width,height,percent=100,punched=true,document={}){
 const original=logoBounds(width,height,percent,layoutFor(document).logo),slot=slotInPixels(slotBounds({orientation:document.orientation??'horizontal'}));
 const intersects=original.x<slot.x+slot.width&&original.x+original.width>slot.x&&original.y<slot.y+slot.height&&original.y+original.height>slot.y;
 if(!punched||!intersects)return {...original,movedForSlot:false};
 const area=safeLogoArea(true,document),scale=Math.min(area.width/width,area.height/height)*Math.max(25,Math.min(150,percent))/150,w=width*scale,h=height*scale;
 return {x:area.x+(area.width-w)/2,y:area.y+(area.height-h)/2,width:w,height:h,movedForSlot:true};
}
export function proposedGeometryApproval(source){
 if(source?.status!=='approved-for-test-review'||!source.proofHash||!Number.isSafeInteger(source.revision))throw Error('APPROVED_SOURCE_PROOF_REQUIRED');
 return {sourceProofId:source.proofId,sourceProofHash:source.proofHash,sourceSavedRevision:source.revision,proposedProofVersion:3,status:'new-proposed-test-proof-awaiting-review',priorApprovalApplies:false,productionReleased:false,slotVersion:SLOT_VERSION};
}
