// Narrow keyed reconciliation for one existing post-training session. Other
// office pages retain their original replacement semantics (image reuse only).
import {rememberImage,rememberImages,releaseImages,reusableImage,settleImageSwaps,parseHTMLForHost} from './image_reuse.js';
import {preparePostPlanFeedbackRender} from './post_plan_feedback.js';
const nodeKey = node => {
  if(node.nodeType!==1)return null;
  const key=node.getAttribute('data-pp-key');if(key)return `node:${key}`;
  if(!['BUTTON','INPUT','SELECT','TEXTAREA'].includes(node.tagName))return null;
  const action=[...node.attributes].find(a=>a.name.startsWith('data-pp-'));
  if(!action)return null;
  let scope=node.parentNode;while(scope&&!(scope.nodeType===1&&scope.hasAttribute('data-pp-key')))scope=scope.parentNode;
  return `${scope?.getAttribute('data-pp-key')||'root'}:${node.tagName}:${action.name}:${action.value}`;
};
const compatible = (a,b) => a.nodeType===b.nodeType&&(a.nodeType!==1||a.tagName===b.tagName);
function attributes(old,next) {
  const portrait=old.tagName==='IMG'&&next.hasAttribute('data-image-identity')&&old.getAttribute('data-image-identity')===next.getAttribute('data-image-identity')&&old.complete&&old.naturalWidth>0;
  const held=portrait&&old.getAttribute('src')!==next.getAttribute('src');
  let phase=null;
  if(old.matches?.('.pp-card-art')&&next.matches?.('.pp-card-art')){
    const a=old.querySelector('img'),b=next.querySelector('img');
    if(a&&b&&a.getAttribute('src')===b.getAttribute('src'))phase=['pp-art-ready','pp-art-failed','pp-art-pending'].find(k=>old.classList.contains(k));
  }
  for(const a of [...old.attributes])if(!next.hasAttribute(a.name)&&!(old.tagName==='DETAILS'&&a.name==='open'))old.removeAttribute(a.name);
  for(const a of [...next.attributes]){
    if(held&&['src','alt'].includes(a.name))continue;
    let value=a.value;
    if(a.name==='class'&&phase)value=value.replace(/\bpp-art-(pending|ready|failed)\b/g,phase);
    if(old.getAttribute(a.name)!==value)old.setAttribute(a.name,value);
  }
}
export function patchPostPlanNode(old,next) {
  const registry=new Map(),used=new Set(),taken=new Set();
  const collect=node=>{const k=nodeKey(node);if(k)registry.set(k,node);for(const child of node.childNodes||[])collect(child);};collect(old);
  function patch(live,fresh){
    used.add(live);
    if(live.nodeType===3){if(live.data!==fresh.data)live.data=fresh.data;return;}
    if(live.nodeType!==1)return;
    attributes(live,fresh);
    if(live.tagName==='IMG'){taken.add(live);rememberImage(live);return;}
    const pool=[...live.childNodes];let cursor=live.firstChild;
    for(const child of [...fresh.childNodes]){
      const k=nodeKey(child);let node=k?registry.get(k):pool.find(n=>!used.has(n)&&!nodeKey(n)&&compatible(n,child));
      if(node&&(!compatible(node,child)||used.has(node)||node.contains?.(live)))node=null;
      if(!node){node=child.cloneNode(false);if(node.tagName==='IMG')node=reusableImage(node,{taken});}
      if(node!==cursor)live.insertBefore(node,cursor);
      patch(node,child);cursor=node.nextSibling;
    }
    for(const extra of pool)if(extra.parentNode===live&&!used.has(extra)){releaseImages(extra);extra.remove();}
    if(['INPUT','TEXTAREA','SELECT'].includes(live.tagName)&&live.value!==fresh.value)live.value=fresh.value;
    if(live.tagName==='INPUT'&&live.checked!==fresh.checked)live.checked=fresh.checked;
  }
  patch(old,next);rememberImages(old);settleImageSwaps(old);
}
export function patchPostPlanOffice(host,html,state) {
  const old=host.querySelector?.('.post-plan');
  if(!old||!html.includes('data-pp-session='))return false;
  const fragment=parseHTMLForHost(host,html);if(!fragment)return false;
  const next=fragment.querySelector('.post-plan');
  if(!next||old.getAttribute('data-pp-session')!==next.getAttribute('data-pp-session')||old.getAttribute('data-pp-theme')!==next.getAttribute('data-pp-theme'))return false;
  // Remove transient nodes/classes before diffing, but retain the newly queued
  // accepted/selection cue. Ordinary render never manufactures another reward.
  preparePostPlanFeedbackRender(state);patchPostPlanNode(old,next);return true;
}
