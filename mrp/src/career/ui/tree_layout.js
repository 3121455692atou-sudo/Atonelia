// Presentation-only graph geometry. No engine data or economic state is changed here.
// Semantic lanes are separated; every prerequisite participates in longest-path layering.
export function layoutTree(nodes, edges, groups, {width=164,height=104}={}) {
  const byId=new Map(nodes.map(n=>[n.id,n])), rank=new Map();
  const parents=new Map(nodes.map(n=>[n.id,edges.filter(e=>e.to===n.id&&e.kind!=='exclusive').map(e=>e.from).filter(id=>byId.has(id))]));
  // Repeatable route changes may legitimately form cycles. Condense strongly
  // connected components before layering, rather than crashing the whole page.
  const index=new Map(),low=new Map(),stack=[],onStack=new Set(),component=new Map(),components=[];let serial=0;
  const visit=id=>{index.set(id,serial);low.set(id,serial++);stack.push(id);onStack.add(id);
    for(const p of parents.get(id)){if(!index.has(p)){visit(p);low.set(id,Math.min(low.get(id),low.get(p)));}else if(onStack.has(p))low.set(id,Math.min(low.get(id),index.get(p)));}
    if(low.get(id)===index.get(id)){const members=[];let p;do{p=stack.pop();onStack.delete(p);component.set(p,components.length);members.push(p);}while(p!==id);components.push(members);}
  };nodes.forEach(n=>{if(!index.has(n.id))visit(n.id);});
  const componentRank=new Map();const depth=c=>{if(componentRank.has(c))return componentRank.get(c);const ps=components[c].flatMap(id=>parents.get(id)).map(id=>component.get(id)).filter(p=>p!==c);const d=Math.max(0,...ps.map(p=>depth(p)+1));componentRank.set(c,d);return d;};
  nodes.forEach(n=>rank.set(n.id,depth(component.get(n.id))));
  const keys=[...groups.map(g=>g.id).filter(k=>nodes.some(n=>n.group===k)),...new Set(nodes.map(n=>n.group).filter(k=>!groups.some(g=>g.id===k)))];
  const maxRank=Math.max(0,...rank.values()), layerY=[], rowGap=58, gap=26, laneGap=82;
  let y=76;
  for(let r=0;r<=maxRank;r++){layerY[r]=y;const rows=Math.max(1,...keys.map(k=>Math.ceil(nodes.filter(n=>n.group===k&&rank.get(n.id)===r).length/2)));y+=rows*(height+rowGap)+18;}
  const rects=new Map(), lanes=[];let x=34;
  for(const key of keys){
    const members=nodes.filter(n=>n.group===key), maxCount=Math.max(...Array.from({length:maxRank+1},(_,r)=>members.filter(n=>rank.get(n.id)===r).length));
    const cols=Math.min(2,maxCount), laneWidth=cols*width+(cols-1)*gap;
    lanes.push({id:key,label:groups.find(g=>g.id===key)?.label||key,x:x-16,y:22,w:laneWidth+32,h:y-26});
    for(let r=0;r<=maxRank;r++){
      const row=members.filter(n=>rank.get(n.id)===r);
      row.sort((a,b)=>{const mean=n=>{const ps=parents.get(n.id).map(p=>rects.get(p)).filter(Boolean);return ps.length?ps.reduce((v,p)=>v+p.x,0)/ps.length:nodes.indexOf(n);};return mean(a)-mean(b)||nodes.indexOf(a)-nodes.indexOf(b);});
      row.forEach((n,i)=>{const count=Math.min(2,row.length-i+i%2), center=count===1?(laneWidth-width)/2:0;rects.set(n.id,{x:x+(i%2)*(width+gap)+center,y:layerY[r]+Math.floor(i/2)*(height+rowGap),w:width,h:height,rank:r,group:key});});
    }x+=laneWidth+laneGap;
  }
  return {rects,lanes,width:Math.max(320,x-laneGap+34),height:y+12,edges:routeEdges(rects,edges)};
}
const hit=(a,b,r,pad=8)=>{const l=r.x-pad,t=r.y-pad,rr=r.x+r.w+pad,bb=r.y+r.h+pad;return a.x===b.x?a.x>l&&a.x<rr&&Math.max(a.y,b.y)>t&&Math.min(a.y,b.y)<bb:a.y>t&&a.y<bb&&Math.max(a.x,b.x)>l&&Math.min(a.x,b.x)<rr;};
export function segmentHitsRect(a,b,r,pad=0){return hit(a,b,r,pad);}
const compact=ps=>ps.filter((p,i)=>!i||i===ps.length-1||!((ps[i-1].x===p.x&&p.x===ps[i+1].x)||(ps[i-1].y===p.y&&p.y===ps[i+1].y)));
const path=ps=>ps.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ');
class Heap {a=[];push(v){const a=this.a;let i=a.push(v)-1;while(i){const p=(i-1)>>1;if(a[p].f<=v.f)break;a[i]=a[p];i=p;}a[i]=v;}pop(){const a=this.a,r=a[0],v=a.pop();if(a.length){let i=0;while(true){let j=i*2+1;if(j>=a.length)break;if(j+1<a.length&&a[j+1].f<a[j].f)j++;if(a[j].f>=v.f)break;a[i]=a[j];i=j;}a[i]=v;}return r;}}
export function routeEdges(rects, edges) {
  const list=edges.filter(e=>rects.has(e.from)&&rects.has(e.to)&&e.from!==e.to), rectList=[...rects.values()];
  const ends=list.map((e,i)=>{const a=rects.get(e.from),b=rects.get(e.to),same=list.filter(x=>x.to===e.to&&x.kind===e.kind),out=list.filter(x=>x.from===e.from&&x.kind===e.kind);
    const dx=(same.indexOf(e)-(same.length-1)/2)*10, sx=(out.indexOf(e)-(out.length-1)/2)*10;
    const exclusive=e.kind==='exclusive';
    return {e,i,a:{x:a.x+a.w/2+sx,y:exclusive?a.y:a.y+a.h},b:{x:b.x+b.w/2+dx,y:b.y},s:{x:a.x+a.w/2+sx,y:exclusive?a.y-20:a.y+a.h+20},t:{x:b.x+b.w/2+dx,y:b.y-20}};
  });
  const xs=[...new Set([12,...rectList.flatMap(r=>[r.x-18,r.x+r.w+18]),...ends.flatMap(e=>[e.s.x,e.t.x])])].sort((a,b)=>a-b);
  const ys=[...new Set([10,...rectList.flatMap(r=>[r.y-20,r.y+r.h+20]),...ends.flatMap(e=>[e.s.y,e.t.y])])].sort((a,b)=>a-b);
  const nx=xs.length,ny=ys.length,used=new Map(),blocked=new Map();
  const point=n=>({x:xs[n%nx],y:ys[Math.floor(n/nx)]}), edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
  const valid=(a,b)=>{const k=edgeKey(a,b);if(!blocked.has(k))blocked.set(k,!rectList.some(r=>hit(point(a),point(b),r)));return blocked.get(k);};
  return ends.map(({e,a,b,s,t})=>{
    const start=ys.indexOf(s.y)*nx+xs.indexOf(s.x),goal=ys.indexOf(t.y)*nx+xs.indexOf(t.x),heap=new Heap(),cost=new Map(),prev=new Map();
    const heuristic=n=>Math.abs(point(n).x-t.x)+Math.abs(point(n).y-t.y);
    heap.push({n:start,dir:0,g:0,f:heuristic(start)});cost.set(start*3,0);let found=null;
    while(heap.a.length){const cur=heap.pop(),key=cur.n*3+cur.dir;if(cur.g!==cost.get(key))continue;if(cur.n===goal){found=key;break;}
      const xx=cur.n%nx,yy=Math.floor(cur.n/nx),next=[];if(xx)next.push([cur.n-1,1]);if(xx<nx-1)next.push([cur.n+1,1]);if(yy)next.push([cur.n-nx,2]);if(yy<ny-1)next.push([cur.n+nx,2]);
      for(const [n,dir]of next){if(!valid(cur.n,n))continue;const p=point(cur.n),q=point(n),g=cur.g+Math.abs(p.x-q.x)+Math.abs(p.y-q.y)+(cur.dir&&cur.dir!==dir?24:0)+(used.get(edgeKey(cur.n,n))||0)*38,k=n*3+dir;if(g>=(cost.get(k)??Infinity))continue;cost.set(k,g);prev.set(k,key);heap.push({n,dir,g,f:g+heuristic(n)});}
    }
    if(found===null)throw new Error(`无法为树图前置布线：${e.from} → ${e.to}`);
    const ns=[];for(let k=found;k!==undefined;k=prev.get(k))ns.push(Math.floor(k/3));ns.reverse();for(let i=1;i<ns.length;i++){const k=edgeKey(ns[i-1],ns[i]);used.set(k,(used.get(k)||0)+1);}
    const points=compact([a,...ns.map(point),b]);return {...e,points,d:path(points)};
  });
}
