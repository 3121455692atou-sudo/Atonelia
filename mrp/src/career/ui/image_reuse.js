// Keep actual decoded image elements across ordinary redraw/navigation. This is
// a bounded presentation cache of already requested public art, not a preloader.
const pools = new WeakMap();
const swaps = new WeakMap();
export const IMAGE_REUSE_LIMIT = 40;
const images = root => [...(root?.tagName === 'IMG' ? [root] : []),...(root?.querySelectorAll?.('img') || [])];
const key = image => {
  const src = image.getAttribute('src'); if (!src) return null;
  // An invalid/missing base must never turn an image into a fatal page error.
  let url=src;try{url=new URL(src,image.ownerDocument.baseURI).href;}catch{/* Compare the literal source in this document. */}
  return JSON.stringify([url,image.getAttribute('srcset') || '',image.getAttribute('data-pp-image-key') || '',image.getAttribute('data-image-identity') || '']);
};
function poolFor(doc) { let pool=pools.get(doc);if(!pool){pool=new Map();pools.set(doc,pool);}return pool; }
export function rememberImage(image) {
  if (!image?.ownerDocument || !key(image)) return;
  const pool=poolFor(image.ownerDocument);pool.delete(image);pool.set(image,true);
  while(pool.size>IMAGE_REUSE_LIMIT)pool.delete(pool.keys().next().value);
}
export function rememberImages(root) { for(const image of images(root))rememberImage(image); }
export function releaseImages(root) {
  for(const image of images(root)){swaps.delete(image);rememberImage(image);image.remove();}
}
export function syncImageAttributes(live,fresh) {
  const identity=fresh.getAttribute('data-image-identity');
  const hold=identity&&live.getAttribute('data-image-identity')===identity&&live.complete&&live.naturalWidth>0&&live.getAttribute('src')!==fresh.getAttribute('src');
  for(const a of [...live.attributes])if(!fresh.hasAttribute(a.name))live.removeAttribute(a.name);
  for(const a of [...fresh.attributes])if(!(hold&&['src','alt'].includes(a.name))&&live.getAttribute(a.name)!==a.value)live.setAttribute(a.name,a.value);
}
export function reusableImage(fresh,{oldRoot=null,taken=new Set()}={}) {
  const wanted=key(fresh);if(!wanted)return fresh;
  const pool=poolFor(fresh.ownerDocument);
  const eligible=image=>!taken.has(image)&&(!image.isConnected||oldRoot?.contains?.(image))&&
    (!(image.complete&&image.naturalWidth===0)||oldRoot?.contains?.(image));
  const identity=fresh.getAttribute('data-image-identity');
  const recent=[...pool.keys()].reverse();
  const live=recent.find(image=>eligible(image)&&key(image)===wanted)||
    (identity?recent.find(image=>eligible(image)&&image.getAttribute('data-image-identity')===identity&&image.complete&&image.naturalWidth>0):null);
  if(!live){taken.add(fresh);rememberImage(fresh);return fresh;}
  taken.add(live);syncImageAttributes(live,fresh);rememberImage(live);return live;
}
export function reuseImagesIn(oldRoot,nextRoot) {
  const old=images(oldRoot),taken=new Set();old.forEach(rememberImage);
  for(const fresh of images(nextRoot)){
    const live=reusableImage(fresh,{oldRoot,taken});if(live!==fresh)fresh.replaceWith(live);
  }
  // Detached cached images must not retain whole abandoned panels or closures.
  for(const image of old)if(!taken.has(image))image.remove();
}
export function parseHTMLForHost(host,html) {
  const doc=host?.ownerDocument,template=doc?.createElement?.('template');
  if(!template?.content)return null;
  template.innerHTML=html;
  // Template contents belong to a separate inert Document (often about:blank).
  // Adopt the NEW fragment before moving any live image into it: otherwise its
  // base URI/cache identity changes, and a decoded live image crosses documents.
  return doc.adoptNode?doc.adoptNode(template.content):template.content;
}
export function renderWithImageReuse(host,html) {
  const fragment=parseHTMLForHost(host,html);
  if(!fragment || !host.replaceChildren){host.innerHTML=html;return;}
  reuseImagesIn(host,fragment);
  host.replaceChildren(fragment);rememberImages(host);settleImageSwaps(host);
}

// A real expression/character variant change never erases the currently visible
// bitmap first. Install the decoded replacement element, not a fresh src request.
export function settleImageSwaps(root) {
  for(const image of images(root)){
    const src=image.getAttribute('data-image-src'),identity=image.getAttribute('data-image-identity');
    if(!src||!identity||src===image.getAttribute('src')){swaps.delete(image);continue;}
    if(swaps.get(image)?.src===src)continue;
    const doc=image.ownerDocument,ImageClass=doc.defaultView?.Image;if(typeof ImageClass!=='function')continue;
    const record={src,identity};swaps.set(image,record);
    const install=probe=>{
      if(!(probe.complete&&probe.naturalWidth>0))return;
      rememberImage(probe);
      if(swaps.get(image)!==record||root.isConnected===false||image.isConnected===false||!root.contains(image)||image.getAttribute('data-image-src')!==src||image.getAttribute('data-image-identity')!==identity)return;
      for(const a of [...image.attributes])if(a.name!=='src')probe.setAttribute(a.name,a.value);
      probe.setAttribute('alt',image.getAttribute('data-image-alt')||image.getAttribute('alt')||'');
      // Do not restart a one-shot effect just because its new expression arrived.
      const cls=probe.getAttribute('class');if(cls)probe.setAttribute('class',cls.split(/\s+/).filter(c=>!c.startsWith('pp-fx-')).join(' '));
      swaps.delete(image);rememberImage(image);image.replaceWith(probe);rememberImage(probe);
    };
    const ready=[...poolFor(doc).keys()].reverse().find(other=>other!==image&&!other.isConnected&&other.complete&&other.naturalWidth>0&&other.getAttribute('src')===src&&other.getAttribute('data-image-identity')===identity);
    if(ready){install(ready);continue;}
    const probe=new ImageClass();probe.decoding='async';
    probe.setAttribute('data-image-identity',identity);
    const slot=image.getAttribute('data-pp-image-key');if(slot)probe.setAttribute('data-pp-image-key',slot);
    probe.src=src;
    Promise.resolve().then(()=>probe.decode?.()).then(()=>install(probe)).catch(()=>{});
  }
}
