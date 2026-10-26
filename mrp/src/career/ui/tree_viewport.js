// UI-only camera. Native scrolling works with touch, trackpads and keyboard;
// mouse dragging on empty map space and explicit zoom controls add map navigation.
const bound = new WeakMap();
export function bindTreeViewport(root, st = {}, key = 'treeView') {
  const viewport=root?.querySelector?.('[data-tree-viewport]');
  const canvas=root?.querySelector?.('[data-tree-canvas]');
  const stage=root?.querySelector?.('[data-tree-stage]');
  if(!viewport||!canvas||!stage)return;
  if(bound.has(viewport)){bound.get(viewport)();return;}
  const width=Number(canvas.dataset.width),height=Number(canvas.dataset.height);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
  const camera=st[key] ||= {zoom:1,left:0,top:0};
  if(!Number.isFinite(camera.zoom)||camera.zoom<=0)camera.zoom=1;
  camera.zoom=Math.min(1.6,camera.zoom);
  for(const axis of ['left','top'])if(!Number.isFinite(camera[axis])||camera[axis]<0)camera[axis]=0;
  const pop=root.querySelector('[data-tree-popover]'),selected=canvas.querySelector('[data-tree-selected]');
  const win=viewport.ownerDocument?.defaultView||globalThis.window;
  const preferredMaxHeight=pop&&win?.getComputedStyle?parseFloat(win.getComputedStyle(pop).maxHeight)||Infinity:Infinity;
  const place=()=>{
    if(!pop||!selected)return;
    const a=selected.getBoundingClientRect(),container=viewport.getBoundingClientRect(),r=(pop.offsetParent||root).getBoundingClientRect();
    // The map can extend below the screen when the office itself is scrolled.
    // Clamp to its *visible* intersection, including mobile keyboard/pinch offsets.
    const vv=win?.visualViewport,left=vv?.offsetLeft||0,top=vv?.offsetTop||0;
    const v={left:Math.max(container.left,left),top:Math.max(container.top,top),right:Math.min(container.right,left+(vv?.width||win?.innerWidth||Infinity)),bottom:Math.min(container.bottom,top+(vv?.height||win?.innerHeight||Infinity))};
    const visible=v.right-v.left>16&&v.bottom-v.top>16&&a.bottom>v.top&&a.top<v.bottom&&a.right>v.left&&a.left<v.right;
    pop.hidden=!visible;if(!visible)return;
    pop.style.maxHeight=`${Math.min(preferredMaxHeight,v.bottom-v.top-16)}px`;
    pop.style.maxWidth=`${v.right-v.left-16}px`;
    pop.style.overflowY='auto';
    const w=pop.offsetWidth,h=pop.offsetHeight;
    let x=a.right+12;if(x+w>v.right-8)x=a.left-w-12;
    x=Math.max(v.left+8,Math.min(x,v.right-w-8));
    const y=Math.max(v.top+8,Math.min(a.top,v.bottom-h-8));
    pop.style.left=`${x-r.left}px`;pop.style.top=`${y-r.top}px`;
  };
  const apply=()=>{canvas.style.transform=`scale(${camera.zoom})`;canvas.style.transformOrigin='0 0';stage.style.width=`${width*camera.zoom}px`;stage.style.height=`${height*camera.zoom}px`;stage.style.overflow='hidden';root.querySelectorAll('[data-tree-scale]').forEach(n=>n.textContent=`${Math.round(camera.zoom*100)}%`);};
  apply();viewport.scrollLeft=camera.left;viewport.scrollTop=camera.top;place();
  // Redraw replaces the clicked node. Give the new inspector a real keyboard
  // origin so Escape stays in this tree instead of closing the whole office.
  if(pop&&!pop.hidden)pop.querySelector('[data-tree-close]')?.focus?.({preventScroll:true});
  viewport.addEventListener('scroll',()=>{camera.left=viewport.scrollLeft;camera.top=viewport.scrollTop;place();},{passive:true});
  const zoom=(value,fit=false)=>{
    if(!Number.isFinite(value)||(fit&&value<=0))return;
    const old=camera.zoom;
    const cx=(viewport.scrollLeft+viewport.clientWidth/2)/old;
    const cy=(viewport.scrollTop+viewport.clientHeight/2)/old;
    // A fit may be below the normal minimum. Zoom-out must never enlarge it.
    const minimum=fit?Math.min(.01,value):Math.min(.01,old);
    camera.zoom=Math.max(minimum,Math.min(1.6,value));
    apply();
    viewport.scrollLeft=cx*camera.zoom-viewport.clientWidth/2;
    viewport.scrollTop=cy*camera.zoom-viewport.clientHeight/2;
    camera.left=viewport.scrollLeft;camera.top=viewport.scrollTop;
    place();
  };
  root.querySelectorAll('[data-tree-zoom]').forEach(b=>b.addEventListener('click',()=>{
    const op=b.dataset.treeZoom;
    if(op==='fit'){
      const w=viewport.clientWidth,h=viewport.clientHeight;
      if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return;
      zoom(Math.min(w/width,h/height),true);
    }else zoom(op==='in'?camera.zoom+.15:op==='out'?camera.zoom-.15:1);
  }));
  viewport.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();zoom(camera.zoom+(e.deltaY<0?.1:-.1));},{passive:false});
  let drag=null;
  viewport.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0||e.target.closest('button,a,input,select,[data-tree-popover]'))return;drag={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(e.pointerId);viewport.style.cursor='grabbing';});
  viewport.addEventListener('pointermove',e=>{if(!drag)return;viewport.scrollLeft=drag.left+drag.x-e.clientX;viewport.scrollTop=drag.top+drag.y-e.clientY;});
  const end=()=>{drag=null;viewport.style.cursor='';};viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
  viewport.addEventListener('keydown',e=>{if(e.target!==viewport)return;if(e.key==='+'||e.key==='='){e.preventDefault();zoom(camera.zoom+.15);}if(e.key==='-'){e.preventDefault();zoom(camera.zoom-.15);}});
  const eventRoot=viewport.closest?.('[data-tree-shell]')||viewport.parentElement||root;
  eventRoot.addEventListener('keydown',e=>{if(e.key==='Escape'&&pop&&!pop.hidden){e.preventDefault();e.stopPropagation();pop.querySelector('[data-tree-close]')?.click();}});
  // office.after is called again on resize; never duplicate event listeners.
  bound.set(viewport,place);
}
