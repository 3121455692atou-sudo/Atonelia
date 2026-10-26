// Presentation-only asset warm-up. IDs are the public selected deck, never a future draw.
import { POST_CARD_ART } from '../data/post_card_art.js';
import { rememberImage } from './image_reuse.js';
const mounts = new WeakMap();
const warmed = new WeakMap();

function warmDeck(doc, cardIds) {
  const ImageClass = doc?.defaultView?.Image;
  if (typeof ImageClass !== 'function' || !cardIds?.length) return;
  let cache = warmed.get(doc);
  if (!cache) { cache = new Map(); warmed.set(doc, cache); }
  // Warm a bounded part of a large pack; visible cards also load themselves.
  const ids = [...new Set(['basic', ...cardIds.slice(0, 12)])];
  for (const id of ids) {
    const path = POST_CARD_ART[id];
    if (!path) continue;
    const url = new URL(path, doc.baseURI).href;
    if (cache.has(url)) continue;
    cache.set(url, true);
    if (cache.size > 24) cache.delete(cache.keys().next().value);
    const image = new ImageClass();
    image.decoding = 'async'; image.loading = 'eager'; image.src = url;
    // Decode in the background; neither saving nor revealing a hand waits for it.
    // A failed request is NOT reported as loaded: visible-image listeners own that label.
    try { image.decode?.()?.catch?.(() => {}); } catch { /* Keep truthful visible fallback. */ }
  }
}

function unlisten(image, record) {
  image.removeEventListener?.('load',record.loaded);image.removeEventListener?.('error',record.failed);
}
export function disposePostPlanArt(state) {
  const r=mounts.get(state);if(!r)return;
  r.active=false;
  for(const [image,record] of r.listeners)unlisten(image,record);
  r.portrait=null;mounts.delete(state);
}
function paintCard(image,ok) {
  const frame=image.parentElement;
  const phase=ok?'pp-art-ready':'pp-art-failed';
  for(const other of ['pp-art-pending','pp-art-ready','pp-art-failed'])if(other!==phase)frame?.classList?.remove(other);
  if(!frame?.classList?.contains?.(phase))frame?.classList?.add(phase);
  const label=frame?.querySelector?.('.pp-art-loading');
  if(label)label.textContent=ok?'卡面载入中':'卡面未载入\n规则仍可用';
  if(ok)rememberImage(image);
}
export function mountPostPlanArt(state,root,cardIds=[]) {
  if(!root||root.isConnected===false){disposePostPlanArt(state);return;}
  let r=mounts.get(state);
  if(r?.root!==root){disposePostPlanArt(state);r=null;}
  if(!r){r={root,active:true,listeners:new Map(),portrait:null};mounts.set(state,r);}
  const current=new Set(root.querySelectorAll?.('img[data-pp-art]')||[]);
  for(const [image,record] of r.listeners)if(!current.has(image)){unlisten(image,record);r.listeners.delete(image);}
  for(const image of current){
    if(image.complete){const record=r.listeners.get(image);if(record){unlisten(image,record);r.listeners.delete(image);}paintCard(image,image.naturalWidth>0);continue;}
    if(r.listeners.has(image))continue;
    const show=ok=>{
      if(!r.active||root.isConnected===false||mounts.get(state)!==r||!r.listeners.has(image))return;
      const record=r.listeners.get(image);unlisten(image,record);r.listeners.delete(image);paintCard(image,ok);
    };
    const record={loaded:()=>show(image.naturalWidth>0),failed:()=>show(false)};r.listeners.set(image,record);
    image.addEventListener?.('load',record.loaded,{once:true});image.addEventListener?.('error',record.failed,{once:true});
  }
  warmDeck(root.ownerDocument,cardIds);
}
