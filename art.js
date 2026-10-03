'use strict';
// 画像素材のローダー。マゼンタ背景を透過に変換し、足りない素材は null のまま（描画側でコード描画に切り替える）
const ART={tex:{},obj:{},walk:{},mon:{},bg:{}};
function keyMagenta(c){
  const g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height),p=d.data;
  for(let i=0;i<p.length;i+=4){
    const r=p[i],gg=p[i+1],b=p[i+2],m=Math.min(r,b)-gg;
    if(m>70){p[i+3]=0;}
    else if(m>25){const a=1-(m-25)/45;p[i+3]=Math.round(p[i+3]*a);const k=gg+(Math.max(r,b)-gg)*.3;p[i]=Math.min(r,k);p[i+2]=Math.min(b,k);}
  }
  g.putImageData(d,0,0);
}
function bboxOf(c,x0=0,y0=0,w=c.width,h=c.height){
  const d=c.getContext('2d').getImageData(x0,y0,w,h).data;let a=w,b=h,e=-1,f=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>24){if(x<a)a=x;if(x>e)e=x;if(y<b)b=y;if(y>f)f=y;}
  return e<0?null:{x:x0+a,y:y0+b,w:e-a+1,h:f-b+1};
}
function loadImage(path){
  return new Promise(res=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>res(null);im.src=path;});
}
function scaled(im,w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  // 大きな縮小は段階的に行って、ジャギーを防ぐ
  let src=im,sw=im.width,sh=im.height;
  while(sw/2>w*1.3){const t=document.createElement('canvas');sw=Math.round(sw/2);sh=Math.round(sh/2);t.width=sw;t.height=sh;const tg=t.getContext('2d');tg.imageSmoothingQuality='high';tg.drawImage(src,0,0,sw,sh);src=t;}
  g.drawImage(src,0,0,w,h);return c;
}
async function artTex(name,size=512){const im=await loadImage(`art/tiles/tex_${name}.png`);if(im)ART.tex[name]=scaled(im,size,size);}
async function artObj(name,max=320){
  const im=await loadImage(`art/tiles/obj_${name}.png`);if(!im)return;
  const k=Math.min(1,max/Math.max(im.width,im.height));const c=scaled(im,Math.round(im.width*k),Math.round(im.height*k));
  keyMagenta(c);const bb=bboxOf(c);if(!bb)return;
  const t=document.createElement('canvas');t.width=bb.w;t.height=bb.h;t.getContext('2d').drawImage(c,bb.x,bb.y,bb.w,bb.h,0,0,bb.w,bb.h);
  ART.obj[name]=t;
}
// 生成画像の横向き2行は、コマごとに左右の向きが混ざっていることがある。
// 各コマの向きを判定し、左向き行＝[歩きA,立ち,歩きB]、右向き行＝その左右反転、に組み直す
function cellSig(c,x,y,w,h,flip){
  const bb=bboxOf(c,x,y,w,h);if(!bb)return null;
  const N=24,t=document.createElement('canvas');t.width=N;t.height=N;const g=t.getContext('2d');
  if(flip){g.translate(N,0);g.scale(-1,1);}
  g.drawImage(c,bb.x,bb.y,bb.w,bb.h,0,0,N,N);
  const d=g.getImageData(0,0,N,N).data,v=new Float32Array(N*N*4);
  for(let i=0;i<d.length;i+=4){const a=d[i+3]/255;v[i]=a*d[i]/255;v[i+1]=a*d[i+1]/255;v[i+2]=a*d[i+2]/255;v[i+3]=a*1.5;}
  return v;
}
const sigDist=(a,b)=>{let s=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d;}return s;};
function fixSideRows(c,cw,ch){
  const ref=cellSig(c,cw,ch,cw,ch,false),refF=cellSig(c,cw,ch,cw,ch,true);if(!ref)return;
  const same={};
  for(const r of [1,2])for(let q=0;q<3;q++){
    const s=cellSig(c,q*cw,r*ch,cw,ch,false);if(!s)return;
    same[r+','+q]=sigDist(s,ref)<=sigDist(s,refF);
  }
  const leftIsRef=[0,1,2].filter(q=>same['1,'+q]).length>=2;
  const isLeft=(r,q)=>same[r+','+q]===leftIsRef;
  // 元コマを退避
  const src=document.createElement('canvas');src.width=cw*3;src.height=ch*3;
  src.getContext('2d').drawImage(c,0,ch,cw*3,ch*2,0,0,cw*3,ch*2);
  const pick=q=>isLeft(1,q)?{r:1,q,f:false}:isLeft(2,q)?{r:2,q,f:false}:{r:1,q,f:true};
  let cells=[pick(0),pick(1),pick(2)];
  if(!(isLeft(1,0)&&isLeft(1,2))&&isLeft(2,0)&&isLeft(2,2))cells[0]={r:2,q:0,f:false},cells[2]={r:2,q:2,f:false};
  const g=c.getContext('2d');g.clearRect(0,ch,cw*3,ch*2);
  const put=(cell,dq,dr,flip)=>{
    g.save();g.translate(dq*cw+(flip?cw:0),dr*ch);if(flip)g.scale(-1,1);
    g.drawImage(src,cell.q*cw,(cell.r-1)*ch,cw,ch,0,0,cw,ch);g.restore();
  };
  cells.forEach((cell,dq)=>{put(cell,dq,1,cell.f);put(cell,dq,2,!cell.f);});
}
async function artWalk(name){
  const im=await loadImage(`art/chars/walk_${name}.png`);if(!im)return;
  const cw=256,ch=256,c=scaled(im,cw*3,ch*4);keyMagenta(c);
  fixSideRows(c,cw,ch);
  // 全コマ共通の足元位置・大きさで正規化する
  let top=1e9,bot=0,bw=0;const cells=[];
  for(let r=0;r<4;r++)for(let q=0;q<3;q++){
    const bb=bboxOf(c,q*cw,r*ch,cw,ch);cells.push(bb);
    if(bb){top=Math.min(top,bb.y-r*ch);bot=Math.max(bot,bb.y+bb.h-r*ch);bw=Math.max(bw,bb.w);}
  }
  ART.walk[name]={c,cw,ch,top,bot,h:bot-top};
}
async function artMon(name){
  const im=await loadImage(`art/mon/mon_${name}.png`);if(!im)return;
  const c=scaled(im,512,512);keyMagenta(c);const bb=bboxOf(c);if(!bb)return;
  const t=document.createElement('canvas');t.width=bb.w;t.height=bb.h;t.getContext('2d').drawImage(c,bb.x,bb.y,bb.w,bb.h,0,0,bb.w,bb.h);
  ART.mon[name]=t;
}
async function artBg(name,w){
  const im=await loadImage(`art/bg/bg_${name}.jpg`);if(!im)return;
  ART.bg[name]=scaled(im,w,Math.round(w*im.height/im.width));
}
const ART_READY=Promise.all([
  ...['grass','dirt','water','stone','floor','carpet','castlewall','cavefloor','cavewall','rock'].map(n=>artTex(n)),
  ...['tree','pine','mountain','house_red','house_blue','inn','shop','castle','town_icon','cave','chest_closed','chest_open','fountain','flowers','bench','well','barrel','bed','counter','throne','pillar','banner','door'].map(n=>artObj(n)),
  ...['hero','war','mage','king','soldier','v1','v2','kid','lady','keeper'].map(n=>artWalk(n)),
  ...['slime','bat','goblin','skel','shroom','dragon'].map(n=>artMon(n)),
  artBg('field',1280),artBg('cave',1280),artBg('lair',1280),artBg('title',1280),
]);
// 画像をボックスに収めて描く（アンカーは下端中央）
function drawFit(g,c,cx,by,maxW,maxH,alpha=1){
  const k=Math.min(maxW/c.width,maxH/c.height),w=c.width*k,h=c.height*k;
  if(alpha!==1)g.globalAlpha=alpha;g.drawImage(c,cx-w/2,by-h,w,h);if(alpha!==1)g.globalAlpha=1;
}
function drawCover(g,c,x,y,w,h){
  const k=Math.max(w/c.width,h/c.height),sw=w/k,sh=h/k;
  g.drawImage(c,(c.width-sw)/2,(c.height-sh)/2,sw,sh,x,y,w,h);
}
