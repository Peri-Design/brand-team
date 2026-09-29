'use strict';
(() => {
  // Image strings are immutable and shared; avoid duplicating a large data URL
  // on every keystroke. Only serializable editing state belongs in this journal.
  const stripSlotImages = slotMedia => slotMedia?Object.fromEntries(Object.entries(slotMedia).map(([slot,media])=>[slot,media?{...media,image:null}:null])):slotMedia;
  const small = state => ({...state,image:null,...(state.webLogo?{webLogo:{...state.webLogo,image:null}}:{}),...(state.slotMedia?{slotMedia:stripSlotImages(state.slotMedia)}:{})});
  const copy = state => {const result=structuredClone(small(state));result.image=state.image;if(state.webLogo)result.webLogo.image=state.webLogo.image;if(state.slotMedia)for(const slot of Object.keys(state.slotMedia))if(state.slotMedia[slot])result.slotMedia[slot].image=state.slotMedia[slot].image;return result;};
  const binaryImages = state => [state.image,state.webLogo?.image,...Object.values(state.slotMedia||{}).map(media=>media?.image)].filter(Boolean);
  const sameImages = (a,b) => {const left=binaryImages(a),right=binaryImages(b);return left.length===right.length&&left.every((image,index)=>image===right[index]);};
  const fingerprint = state => JSON.stringify({...small(state),selected:null});
  class ProjectHistory {
    constructor(state, limit=40){this.limit=limit;this.entries=[copy(state)];this.index=0;this.group=null;this.time=0;}
    get canUndo(){return this.index>0;}
    get canRedo(){return this.index<this.entries.length-1;}
    record(state,group=null,time=Date.now()){
      const current=this.entries[this.index];
      if(sameImages(current,state)&&fingerprint(current)===fingerprint(state)){current.selected=state.selected;return;}
      const merge=group&&group===this.group&&time-this.time<800&&this.index>0&&!this.canRedo;
      this.entries.length=this.index+1;
      if(merge)this.entries[this.index]=copy(state);
      else{this.entries.push(copy(state));this.index++;}
      this.group=group;this.time=time;
      const imageBytes=()=>[...new Set(this.entries.flatMap(binaryImages))].reduce((n,s)=>n+s.length*2,0);
      while(this.entries.length>2&&(this.entries.length>this.limit+1||imageBytes()>96*1024*1024)){this.entries.shift();this.index--;}
    }
    breakGroup(){this.group=null;}
    peek(delta){const i=this.index+delta;return i>=0&&i<this.entries.length?copy(this.entries[i]):null;}
    move(delta){const next=this.peek(delta);if(!next)return null;this.index+=delta;this.breakGroup();return next;}
  }
  if(typeof module!=='undefined')module.exports=ProjectHistory;
  else window.ProjectHistory=ProjectHistory;
})();
