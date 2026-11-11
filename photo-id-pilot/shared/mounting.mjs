export const SLOT_REQUIRED_ATTACHMENTS=Object.freeze(['lanyard','reel','strap']);
export const requiresSlot=attachment=>SLOT_REQUIRED_ATTACHMENTS.includes(attachment);
// Geometry is derived on the server; no customer-supplied shape can override it.
export const punchGeometry=state=>requiresSlot(state.attachment)&&state.punch==='punch'?'slot':null;
export const punchLabel=state=>state.punch==='punch'?(requiresSlot(state.attachment)?'Punched slot — free':'Punch requested — free; shape and position to confirm'):state.punch==='unpunched'?'Unpunched':'Choose a current punch option';
export function chooseAttachment(state,next){
 const wasRequired=requiresSlot(state.attachment);state.attachment=next;
 if(requiresSlot(next))state.punch='punch';else if(wasRequired)state.punch='unpunched';
 state.punchGeometry=punchGeometry(state);return state;
}
export function choosePunch(state,value){
 if(!['unpunched','punch'].includes(value))throw Error('PUNCH_INVALID');
 state.punch=requiresSlot(state.attachment)?'punch':value;state.punchGeometry=punchGeometry(state);return state;
}
