export const ORIENTATIONS=Object.freeze(['landscape','portrait']);
export function normalizeOrientation(value='landscape'){
 if(value==='horizontal')return 'landscape';
 if(value==='vertical')return 'portrait';
 if(!ORIENTATIONS.includes(value))throw Error('BADGE_ORIENTATION_INVALID');
 return value;
}
export function cardGeometry(value={}){
 const orientation=normalizeOrientation(typeof value==='string'?value:value.orientation);
 const portrait=orientation==='portrait',widthInches=portrait?2.125:3.375,heightInches=portrait?3.375:2.125;
 return {orientation,widthInches,heightInches,width:widthInches*288,height:heightInches*288,pixelsPerInch:288,trimWidth:widthInches*72,trimHeight:heightInches*72,cornerRadius:36};
}
