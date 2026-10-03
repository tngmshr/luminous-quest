'use strict';
// ルミナスクエスト 体験版 — SFC風RPG（素材なし・全部コード描画）
const W=256,H=224,SC=6,TS=32;
const cv=document.getElementById('c');cv.width=W*SC;cv.height=H*SC;
const ctx=cv.getContext('2d');
const FONT="8px 'MS Gothic','Yu Gothic','Noto Sans JP',monospace";
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const nowMs=()=>performance.now();

// ================= 入力 =================
const KM={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right',z:'ok',Enter:'ok',' ':'ok',x:'cancel',Escape:'cancel',Backspace:'cancel'};
const held={};let waiter=null;const fq=[];
function inKey(k,down){
  if(down){
    if(held[k])return;held[k]=true;
    if(waiter&&waiter.ok.includes(k)){const w=waiter;waiter=null;w.res(k);}else fq.push(k);
  }else held[k]=false;
}
function waitKey(ok,timeout){
  return new Promise(res=>{
    waiter={ok,res};
    if(timeout)setTimeout(()=>{if(waiter&&waiter.res===res){waiter=null;res('timeout');}},timeout);
  });
}
addEventListener('keydown',e=>{
  const key=e.key.length===1?e.key.toLowerCase():e.key;
  if(key==='m'){toggleMute();return;}
  const k=KM[key];if(!k)return;e.preventDefault();initAudio();inKey(k,true);
});
addEventListener('keyup',e=>{const key=e.key.length===1?e.key.toLowerCase():e.key;const k=KM[key];if(k)inKey(k,false);});
document.querySelectorAll('#pad .b').forEach(b=>{
  const k=b.dataset.k;
  b.addEventListener('pointerdown',e=>{e.preventDefault();initAudio();inKey(k,true);});
  ['pointerup','pointerleave','pointercancel'].forEach(t=>b.addEventListener(t,()=>inKey(k,false)));
});

// ================= 音 =================
let AC=null,master=null,muted=/[?&]mute/.test(location.search)||(()=>{try{return localStorage.getItem('luminous_mute')==='1';}catch(e){return false;}})(),bgmGain=null,curTrack=null,loopTimer=null,pendingBgm=null;
const NOTE={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function midiHz(m){return 440*Math.pow(2,(m-69)/12);}
function parseTrack(s){return s.trim().split(/\s+/).map(t=>{
  const [n,d]=t.split(':');let m=null;
  if(n!=='R'){const r=/^([A-G])([#b]?)(\d)$/.exec(n);m=12*(+r[3]+1)+NOTE[r[1]]+(r[2]==='#'?1:r[2]==='b'?-1:0);}
  return {m,d:+d};});}
const TR={
 town:{u:.2,v:[
  {w:'square',v:.07,s:"E5:2 G5:2 E5:2 C5:2 D5:2 F5:2 D5:2 B4:2 C5:2 E5:2 G5:2 C6:2 B5:4 G5:2 R:2 A5:2 G5:2 F5:2 E5:2 F5:2 E5:2 D5:2 C5:2 D5:2 E5:2 F5:2 G5:2 E5:4 C5:4"},
  {w:'triangle',v:.16,s:"C3:4 G3:4 C3:4 G3:4 G2:4 D3:4 G2:4 D3:4 C3:4 G3:4 C3:4 G3:4 F2:4 C3:4 G2:4 G3:4"}]},
 field:{u:.17,v:[
  {w:'square',v:.07,s:"A4:2 C5:2 E5:2 A5:2 G5:2 E5:2 C5:2 E5:2 F5:2 A5:2 C6:2 A5:2 G5:4 E5:2 D5:2 E5:2 G5:2 B5:2 G5:2 A5:2 E5:2 C5:2 E5:2 F5:2 E5:2 D5:2 C5:2 B4:2 A4:4 R:2"},
  {w:'triangle',v:.16,s:"A2:4 E3:4 A2:4 E3:4 F2:4 C3:4 F2:4 C3:4 G2:4 D3:4 G2:4 D3:4 A2:4 E3:4 A2:4 E3:4"}]},
 cave:{u:.3,v:[
  {w:'triangle',v:.12,s:"E4:4 R:2 F4:2 E4:4 B3:4 C4:4 R:2 D4:2 C4:4 G3:4 E4:4 R:2 G4:2 F4:4 D4:4 B3:4 C4:2 B3:2 A3:8"},
  {w:'sine',v:.2,s:"E2:8 E2:8 C2:8 C2:8 E2:8 E2:8 B1:8 A1:8"}]},
 battle:{u:.11,v:[
  {w:'square',v:.07,s:"E5:2 E5:1 E5:1 G5:2 E5:2 B5:2 A5:2 G5:2 E5:2 D5:2 D5:1 D5:1 F5:2 D5:2 A5:2 G5:2 F5:2 D5:2 C5:2 C5:1 C5:1 E5:2 C5:2 G5:2 F5:2 E5:2 C5:2 B4:2 B4:1 B4:1 D5:2 F5:2 B5:4 R:4"},
  {w:'triangle',v:.17,s:"E2:2 E3:2 E2:2 E3:2 E2:2 E3:2 E2:2 E3:2 D2:2 D3:2 D2:2 D3:2 D2:2 D3:2 D2:2 D3:2 C2:2 C3:2 C2:2 C3:2 C2:2 C3:2 C2:2 C3:2 B1:2 B2:2 B1:2 B2:2 B1:2 B2:2 B1:2 B2:2 E2:2 E3:2 E2:2 E3:2 E2:2 E3:2 E2:2 E3:2 D2:2 D3:2 D2:2 D3:2 D2:2 D3:2 D2:2 D3:2 C2:2 C3:2 C2:2 C3:2 C2:2 C3:2 C2:2 C3:2 B1:2 B2:2 B1:2 B2:2 B1:2 B2:2 B1:2 B2:2"}]},
 boss:{u:.12,v:[
  {w:'square',v:.08,s:"D5:2 D5:2 A4:2 D5:2 F5:2 E5:2 D5:2 C#5:2 D5:2 D5:2 A4:2 D5:2 G5:2 F5:2 E5:2 A4:2 Bb4:2 Bb4:2 F4:2 Bb4:2 D5:2 C5:2 Bb4:2 A4:2 A4:2 G4:2 A4:2 C#5:2 E5:4 A5:4"},
  {w:'sawtooth',v:.05,s:"D2:2 D3:2 D2:2 D3:2 D2:2 D3:2 D2:2 D3:2 D2:2 D3:2 D2:2 D3:2 D2:2 D3:2 D2:2 D3:2 Bb1:2 Bb2:2 Bb1:2 Bb2:2 Bb1:2 Bb2:2 Bb1:2 Bb2:2 A1:2 A2:2 A1:2 A2:2 A1:2 A2:2 A1:2 A2:2"}]},
};
for(const k in TR)TR[k].v.forEach(v=>v.n=parseTrack(v.s));
function tone(w,f,t,d,v,dest){
  const o=AC.createOscillator(),g=AC.createGain();o.type=w;o.frequency.value=f;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);
  g.gain.setValueAtTime(v,t+Math.max(.01,d-.04));g.gain.linearRampToValueAtTime(0,t+d);
  o.connect(g);g.connect(dest);o.start(t);o.stop(t+d+.02);
}
function playLoop(name,dest,t0){
  const t=TR[name];let len=0;
  for(const v of t.v){let tt=t0;for(const n of v.n){const d=n.d*t.u;if(n.m!=null)tone(v.w,midiHz(n.m),tt,d*.92,v.v,dest);tt+=d;}len=Math.max(len,tt-t0);}
  return len;
}
function initAudio(){
  if(AC){if(AC.state==='suspended')AC.resume();return;}
  try{AC=new (window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=muted?0:.35;master.connect(AC.destination);if(pendingBgm)bgm(pendingBgm);}catch(e){}
}
function bgm(name){
  pendingBgm=name;if(!AC)return;if(curTrack===name&&loopTimer)return;
  stopBgm();curTrack=name;if(!name||!TR[name])return;
  const g=AC.createGain();g.connect(master);bgmGain=g;let t0=AC.currentTime+.1;
  const next=()=>{if(bgmGain!==g)return;const len=playLoop(name,g,t0);t0+=len;loopTimer=setTimeout(next,Math.max(50,(t0-AC.currentTime-.5)*1000));};
  next();
}
function stopBgm(){
  clearTimeout(loopTimer);loopTimer=null;
  if(bgmGain){const g=bgmGain;bgmGain=null;try{g.gain.setTargetAtTime(0,AC.currentTime,.05);}catch(e){}setTimeout(()=>{try{g.disconnect();}catch(e){}},700);}
  curTrack=null;
}
function toggleMute(){muted=!muted;try{localStorage.setItem('luminous_mute',muted?'1':'0');}catch(e){}if(master)master.gain.value=muted?0:.35;}
function sweep(w,f1,f2,d,v,delay=0){
  if(!AC)return;const t=AC.currentTime+delay,o=AC.createOscillator(),g=AC.createGain();o.type=w;
  o.frequency.setValueAtTime(f1,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f2),t+d);
  g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(master);o.start(t);o.stop(t+d+.02);
}
function seq(notes,w='square',v=.12,step=.1){if(!AC)return;let t=AC.currentTime+.02;for(const [m,d] of notes){if(m)tone(w,midiHz(m),t,d*step*.95,v,master);t+=d*step;}}
function se(k){
  if(!AC)return;
  if(k==='ok')sweep('square',880,1200,.06,.08);
  else if(k==='hit')sweep('sawtooth',300,60,.18,.18);
  else if(k==='crit'){sweep('sawtooth',500,40,.3,.22);sweep('square',900,100,.25,.12,.05);}
  else if(k==='hurt')sweep('square',200,50,.2,.2);
  else if(k==='heal'){seq([[72,1],[76,1],[79,1],[84,2]],'triangle',.18,.07);}
  else if(k==='magic'){sweep('sawtooth',200,1500,.35,.12);sweep('square',1500,200,.3,.1,.2);}
  else if(k==='lvup')seq([[67,2],[67,2],[67,2],[67,4],[63,4],[65,4],[67,2],[65,2],[67,8]],'square',.1,.09);
  else if(k==='win')seq([[72,2],[72,2],[72,2],[72,6],[68,6],[70,6],[72,3],[70,1],[72,10]],'square',.1,.09);
  else if(k==='lose')seq([[60,4],[59,4],[58,4],[57,12]],'triangle',.2,.14);
  else if(k==='chest')seq([[72,1],[76,1],[79,1],[84,1],[88,3]],'square',.1,.07);
  else if(k==='inn')seq([[72,3],[76,3],[79,3],[84,6],[79,3],[84,12]],'triangle',.2,.12);
  else if(k==='enc'){sweep('square',200,900,.25,.1);sweep('square',900,100,.35,.1,.25);}
}

// ================= データ =================
const CLS={
  hero:{b:{hp:24,mp:4,atk:10,def:6,spd:7},g:{hp:7,mp:2.5,atk:2.2,def:1.6,spd:1.4},sp:[[1,'heal'],[4,'bolt']]},
  war:{b:{hp:32,mp:0,atk:13,def:9,spd:5},g:{hp:9,mp:0,atk:2.8,def:2.2,spd:1},sp:[]},
  mage:{b:{hp:17,mp:10,atk:6,def:4,spd:8},g:{hp:5,mp:4,atk:1,def:1,spd:1.6},sp:[[1,'fire'],[3,'blaze']]},
};
const SP={
  heal:{n:'ヒール',mp:3,t:'ally',pw:[25,35]},
  fire:{n:'ファイア',mp:2,t:'one',pw:[12,18]},
  blaze:{n:'ファイラ',mp:5,t:'all',pw:[14,22]},
  bolt:{n:'ライトニング',mp:6,t:'one',pw:[32,42]},
};
const ITEMS={herb:{n:'やくそう',kind:'hp',v:30},ether:{n:'せいすい',kind:'mp',v:12}};
// 装備。s=部位(w:ぶき a:よろい s:たて) v=上がる値 p=値段 who=装備できる職業
const EQ={
  stick:{n:'ぼくとう',s:'w',v:3,p:12,who:'hero war mage'},
  rod:{n:'まどうのつえ',s:'w',v:5,p:45,who:'mage'},
  bsword:{n:'ブロンズソード',s:'w',v:8,p:70,who:'hero war'},
  axe:{n:'バトルアックス',s:'w',v:13,p:150,who:'war'},
  clothes:{n:'たびびとのふく',s:'a',v:3,p:15,who:'hero war mage'},
  robe:{n:'まどうしのローブ',s:'a',v:6,p:55,who:'mage'},
  leather:{n:'かわのよろい',s:'a',v:7,p:60,who:'hero war'},
  chain:{n:'くさりかたびら',s:'a',v:12,p:150,who:'hero war'},
  wshield:{n:'きのたて',s:'s',v:3,p:30,who:'hero war'},
  bshield:{n:'ブロンズシールド',s:'s',v:6,p:90,who:'hero war'},
};
const SLOTN={w:'ぶき',a:'よろい',s:'たて'};
const canEquip=(m,k)=>EQ[k].who.split(' ').includes(m.cls);
const LVEXP=[0,0,6,16,32,55,85,125,175,240],MAXLV=9;
const EN={
  slime:{n:'スライム',hp:7,atk:6,def:2,spd:4,exp:3,g:4,kind:'slime'},
  bat:{n:'おおこうもり',hp:10,atk:9,def:2,spd:9,exp:5,g:6,kind:'bat'},
  goblin:{n:'ゴブリン',hp:17,atk:12,def:4,spd:5,exp:8,g:10,kind:'goblin'},
  skel:{n:'がいこつ',hp:26,atk:17,def:7,spd:6,exp:14,g:16,kind:'skel'},
  shroom:{n:'どくキノコ',hp:22,atk:15,def:6,spd:5,exp:12,g:15,kind:'shroom'},
  boss:{n:'やみのドラゴン',hp:220,atk:22,def:10,spd:8,exp:150,g:300,kind:'dragon',boss:true},
};
const ZONES={
  // easy: 1人旅のあいだだけ使う弱い群れ
  easy:[['slime'],['slime'],['slime','slime'],['bat'],['bat','slime']],
  field:[['slime','slime'],['slime','slime','bat'],['bat'],['bat','slime'],['goblin'],['goblin','slime'],['bat','bat']],
  cave:[['bat','bat'],['skel'],['shroom'],['goblin','bat'],['skel','bat'],['shroom','goblin'],['goblin','goblin']],
};

const PAL={
  hero:{hair:'#7a4a1a',skin:'#f0c090',body:'#2860d0',leg:'#304080',trim:'#f0c020',cape:'#c02020'},
  war:{hair:'#222',skin:'#e0b080',body:'#b03030',leg:'#503030',trim:'#ddd',hat:'helm'},
  mage:{hair:'#d0a0f0',skin:'#f4d0a8',body:'#7040b0',leg:'#503080',trim:'#f0c020',hat:'wiz'},
  king:{hair:'#ddd',skin:'#f0c090',body:'#c01830',leg:'#802030',trim:'#fff',hat:'crown'},
  sol:{hair:'#444',skin:'#e8b888',body:'#8090a8',leg:'#506078',trim:'#ddd',hat:'helm'},
  v1:{hair:'#a06020',skin:'#f0c090',body:'#40a060',leg:'#305030',trim:'#fff'},
  v2:{hair:'#222',skin:'#e8b888',body:'#d0a030',leg:'#604020',trim:'#fff'},
  kid:{hair:'#e0a030',skin:'#f4d0a8',body:'#e06060',leg:'#405080',trim:'#fff'},
  lady:{hair:'#c04070',skin:'#f4d0a8',body:'#e080b0',leg:'#a05080',trim:'#fff'},
  keeper:{hair:'#666',skin:'#e8b888',body:'#fff',leg:'#885',trim:'#a33'},
};

const ROWS={
field:[
"~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
"~~~~^^^^^^^~~~~~~~~~~~~~~~~~",
"~~~^^^^D^^^^~~~~TTT~~~~~~~~~",
"~~~^^^..^^^~~~TT...T~~~~~~~~",
"~~~~^^....^^~~T.....TT~~~~~~",
"~~~~~^......^~~T..T..T~~~~~~",
"~~~~~~.......~~TT...TT~~~~~~",
"~~~~~...........TTTT~~~~~~~~",
"~~~~....TT.........T~~~~~~~~",
"~~~~...TTTT.......TT~~~~~~~~",
"~~~.....TT..........~~~~~~~~",
"~~~......H...........~~~~~~~",
"~~~~.......TT.....T..~~~~~~~",
"~~~~~.....TTT...TTT..~~~~~~~",
"~~~~~~.....T....TT..~~~~~~~~",
"~~~~~~~.........T..~~~~~~~~~",
"~~~~~~~~~.......~~~~~~~~~~~~",
"~~~~~~~~~~~~~~~~~~~~~~~~~~~~"],
town:[
"TTTTTTTTTTTTTTTTTTTT",
"TpppppprrrrrrppppppT",
"TpppppprrrrrrppppppT",
"TppppppwwdwwwppppppT",
"TppppppppppppppppppT",
"TprrrrpppppppprrrrpT",
"TprrrrpppppppprrrrpT",
"TpwwdwppppppppwdwwpT",
"TppppppppppppppppppT",
"TppeeppppFppppppeepT",
"TppppppppppppppppppT",
"TppppppppppppppppppT",
"TppppppppppppppppppT",
"TCpppppppppppppppppT",
"TTTTTTTTTppTTTTTTTTT"],
castle:[
"############",
"#fffftfffff#",
"#ffffkfffff#",
"#ffffkfffff#",
"#ffffkfffff#",
"#ffffkfffff#",
"#ffffkfffff#",
"#ffffkfffff#",
"#ffffkfffff#",
"#####S######"],
inn:[
"#########",
"#bfffffb#",
"#fffffff#",
"#fcccccf#",
"#fffffff#",
"#fffffff#",
"####S####"],
cave:[
"XXXXXXXXXXXXXXXX",
"XXXXXXxxxxXXXXXX",
"XXXXXxxxxxxXXXXX",
"XXXXXxxxxxxXXXXX",
"XXXXXXXxxXXXXXXX",
"XXXXXXXxxXXXXXXX",
"XXXXxxxxxxxxXXXX",
"XXXXxXXxxXXxXXXX",
"XXXXxXXxxXXxXXXX",
"XXXXCXXxxXXCXXXX",
"XXXXXXXxxXXXXXXX",
"XXXXXXxxxxXXXXXX",
"XXXXXXxxxxXXXXXX",
"XXXXXXXxxXXXXXXX",
"XXXXXXXxxXXXXXXX",
"XXXXXXXxxXXXXXXX",
"XXXXXXXSXXXXXXXX"],
};
ROWS.shop=ROWS.inn;
const MAPS={
  field:{fill:'~',enc:'field',bgm:'field',bg:'field',portals:{'9,11':{to:'town',x:9,y:13,dir:'up'},'7,2':{to:'cave',x:7,y:15,dir:'up'}},npcs:[]},
  town:{fill:'T',bgm:'town',portals:{'9,14':{to:'field',x:9,y:12,dir:'down'},'10,14':{to:'field',x:9,y:12,dir:'down'},'9,3':{to:'castle',x:5,y:8,dir:'up'},'4,7':{to:'inn',x:4,y:5,dir:'up'},'15,7':{to:'shop',x:4,y:5,dir:'up'}},npcs:[
    {id:'war',x:11,y:10,pal:'war',dir:'left',act:'war'},
    {id:'mage',x:5,y:12,pal:'mage',dir:'down',act:'mage'},
    {x:13,y:9,pal:'v1',dir:'down',wander:1,say:['この まちは ルミナスの ひかりに まもられて きたんだ。\nでも さいきん ひかりが よわまって きている…','ぼうけんに でるなら みせで ぶきと ぼうぐを\nかっていきな。 ずいぶん らくに なるぜ。']},
    {x:3,y:10,pal:'v2',dir:'right',wander:1,say:['きたの ほこらには おそろしい まものが すんでいるそうだ。\nなかまを そろえてから いくんだよ。']},
    {x:16,y:12,pal:'kid',dir:'up',wander:1,say:['ぼくも おおきくなったら ゆうしゃに なるんだ!\nスライムなら ぼくでも たおせるよ!']},
    {x:8,y:4,pal:'sol',dir:'down',say:['ここは ルミナスじょう。\nおうさまが ゆうしゃどのを おまちです。']}]},
  castle:{bgm:'town',portals:{'5,9':{to:'town',x:9,y:4,dir:'down'}},npcs:[
    {id:'king',x:5,y:2,pal:'king',dir:'down',act:'king'},
    {x:3,y:5,pal:'sol',dir:'right',say:['ゆうしゃどのの ごぶうんを おいのりしております!']},
    {x:7,y:5,pal:'sol',dir:'left',say:['やどやで ひとばん やすめば\nHPも MPも ぜんかいふくするぞ。']},
    {x:8,y:7,pal:'lady',dir:'left',wander:1,say:['やみのドラゴンは ほのおの いきを はくそうです。\nヒールの じゅもんを わすれずに…']}]},
  inn:{bgm:'town',portals:{'4,6':{to:'town',x:4,y:8,dir:'down'}},npcs:[{x:4,y:2,pal:'keeper',dir:'down',act:'inn'}]},
  shop:{bgm:'town',portals:{'4,6':{to:'town',x:15,y:8,dir:'down'}},npcs:[{x:4,y:2,pal:'keeper',dir:'down',act:'shop'}]},
  cave:{fill:'X',enc:'cave',bgm:'cave',bg:'cave',portals:{'7,16':{to:'field',x:7,y:3,dir:'down'}},npcs:[]},
};
for(const n in MAPS){const m=MAPS[n];m.name=n;const rows=ROWS[n];m.h=rows.length;m.w=Math.max(...rows.map(r=>r.length));
  m.t=rows.map(r=>r.padEnd(m.w,m.fill||'#').split(''));
  m.npcs.forEach(p=>{p.hx=p.x;p.hy=p.y;});}
const BLOCK=new Set('T^~#rwcbtXCOF'.split(''));
const CHESTS={'town,1,13':{item:'ether',n:2},'cave,4,9':{item:'herb',n:3},'cave,11,9':{eq:'chain'}};

// ================= ゲーム状態 =================
let G=null,CUR=null,scene='title',busy=true,mv=null,fadeA=0,flashA=0,msgState=null;
const overlays=[];
const START_EQ={hero:{w:'stick',a:'clothes'},war:{w:'stick',a:'clothes'},mage:{a:'clothes'}};
function newMember(name,cls,lv=1){
  const m={name,cls,lv,exp:LVEXP[lv]||0,hp:1,mp:0,eq:{...START_EQ[cls]}};applyStats(m);m.hp=m.mhp;m.mp=m.mmp;return m;
}
const eqv=(m,s)=>m.eq&&m.eq[s]?EQ[m.eq[s]].v:0;
function calcStats(m){const c=CLS[m.cls],l=m.lv-1,f=k=>Math.floor(c.b[k]+c.g[k]*l);return {mhp:f('hp'),mmp:f('mp'),atk:f('atk')+eqv(m,'w'),def:f('def')+eqv(m,'a')+eqv(m,'s'),spd:f('spd')};}
function applyStats(m){Object.assign(m,calcStats(m));}
function spellsOf(m){return CLS[m.cls].sp.filter(s=>m.lv>=s[0]).map(s=>s[1]);}
function newGame(){
  G={map:'castle',x:5,y:3,dir:'up',party:[newMember('ユウ','hero')],gold:0,items:{herb:0,ether:0},bag:[],flags:{},opened:{},enc:rnd(10,17),playMs:0,chain:null};
  G.chain=[{x:5,y:3,dir:'up'}];
}
function resetChain(){G.chain=G.party.map(()=>({x:G.x,y:G.y,dir:G.dir}));}

// ================= タイル描画 =================
function mk(w,h,fn){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'));return c;}
function speck(g,col,n,seed){let s=seed;g.fillStyle=col;for(let i=0;i<n;i++){s=(s*1103515245+12345)&0x7fffffff;const x=s%16;s=(s*1103515245+12345)&0x7fffffff;const y=s%16;g.fillRect(x,y,1,1);}}
const fill=(g,c)=>{g.fillStyle=c;g.fillRect(0,0,16,16);};
const circle=(g,x,y,r)=>{g.beginPath();g.arc(x,y,r,0,7);g.fill();};
const poly=(g,pts)=>{g.beginPath();g.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)g.lineTo(pts[i],pts[i+1]);g.closePath();g.fill();};
const TILE={};
TILE['.']=g=>{fill(g,'#38a038');speck(g,'#2a8a2e',14,1);speck(g,'#52c052',10,7);};
TILE.T=g=>{TILE['.'](g);g.fillStyle='#5a3a1a';g.fillRect(7,10,3,5);g.fillStyle='#145a1e';circle(g,8,7,7);g.fillStyle='#1f7a2c';circle(g,6,5,3.5);};
TILE['^']=g=>{TILE['.'](g);g.fillStyle='#8a7a5a';poly(g,[0,16,8,1,16,16]);g.fillStyle='#6a5a3a';poly(g,[8,1,16,16,9,16]);g.fillStyle='#fff';poly(g,[6,5,8,1,10,5]);};
TILE['~']=g=>{fill(g,'#2a5acf');g.fillStyle='#5a8aef';g.fillRect(2,4,5,1);g.fillRect(9,10,5,1);g.fillRect(1,13,3,1);};
TILE.H=g=>{TILE['.'](g);g.fillStyle='#ddd';g.fillRect(3,6,10,8);g.fillRect(2,4,3,10);g.fillRect(11,4,3,10);g.fillStyle='#c02020';poly(g,[1,4,3.5,0,6,4]);poly(g,[10,4,12.5,0,15,4]);g.fillStyle='#432';g.fillRect(6,9,4,5);};
TILE.D=g=>{TILE['^'](g);g.fillStyle='#111';g.fillRect(5,9,6,7);circle(g,8,9,3);};
TILE['#']=g=>{fill(g,'#6a6a78');g.fillStyle='#4a4a58';for(const y of [0,5,10])g.fillRect(0,y,16,1);for(let r=0;r<3;r++)g.fillRect(r%2?4:10,r*5,1,5);};
TILE.f=g=>{fill(g,'#c8a468');g.fillStyle='#a8844a';for(const y of [0,4,8,12])g.fillRect(0,y,16,1);};
TILE.p=g=>{fill(g,'#b8a888');speck(g,'#988868',16,3);speck(g,'#d8c8a8',8,9);g.fillStyle='#a89878';g.fillRect(0,7,16,1);g.fillRect(8,0,1,7);g.fillRect(4,8,1,8);};
TILE.r=g=>{fill(g,'#c0392b');g.fillStyle='#8a2418';for(const y of [3,7,11,15])g.fillRect(0,y,16,1);g.fillStyle='#e05a46';for(const y of [0,4,8,12])g.fillRect(0,y,16,1);};
TILE.w=g=>{fill(g,'#e8dcc0');g.fillStyle='#a89870';g.fillRect(0,14,16,2);g.fillStyle='#5aa0e0';g.fillRect(5,4,6,6);g.fillStyle='#8a5a2a';g.fillRect(8,4,1,6);g.fillRect(5,7,6,1);};
TILE.d=g=>{TILE.w(g);fill(g,'#e8dcc0');g.fillStyle='#7a4a20';g.fillRect(3,2,10,14);g.fillStyle='#5a3a10';g.fillRect(3,2,10,1);g.fillStyle='#fc0';g.fillRect(10,9,2,2);};
TILE.c=g=>{TILE.f(g);g.fillStyle='#9a6a30';g.fillRect(0,5,16,10);g.fillStyle='#c08a48';g.fillRect(0,3,16,4);};
TILE.b=g=>{TILE.f(g);g.fillStyle='#8a5a2a';g.fillRect(1,1,14,14);g.fillStyle='#d04040';g.fillRect(2,6,12,8);g.fillStyle='#fff';g.fillRect(3,2,10,4);};
TILE.k=g=>{fill(g,'#b02030');g.fillStyle='#e0b020';g.fillRect(0,0,2,16);g.fillRect(14,0,2,16);};
TILE.t=g=>{TILE.k(g);g.fillStyle='#e0b020';g.fillRect(3,1,10,14);g.fillStyle='#b02030';g.fillRect(5,6,6,6);g.fillStyle='#fff3a0';g.fillRect(3,1,10,2);};
TILE.S=g=>{TILE.f(g);g.fillStyle='#5a3a20';g.fillRect(2,2,12,12);g.fillStyle='#8a5a30';for(const y of [4,7,10])g.fillRect(3,y,10,2);};
TILE.e=g=>{TILE.p(g);for(const [x,y,c] of [[3,4,'#f06090'],[10,3,'#f0e040'],[6,10,'#f0e040'],[12,11,'#f06090']]){g.fillStyle='#2a8a2e';g.fillRect(x,y+1,1,3);g.fillStyle=c;g.fillRect(x-1,y,3,2);}};
TILE.x=g=>{fill(g,'#5a4a3a');speck(g,'#4a3a2a',18,5);speck(g,'#6a5a4a',10,11);};
TILE.X=g=>{fill(g,'#2a2230');g.fillStyle='#403848';circle(g,4,4,3);circle(g,11,10,4);circle(g,13,3,2);g.fillStyle='#1a1420';g.fillRect(0,15,16,1);};
function chestTile(open){return g=>{g.fillStyle='#7a4a1a';g.fillRect(2,5,12,9);g.fillStyle='#a06a2a';g.fillRect(2,5,12,3);g.fillStyle=open?'#222':'#f0c020';if(open)g.fillRect(3,6,10,2);else g.fillRect(7,8,2,3);g.fillStyle='#432';g.fillRect(2,13,12,1);};}
const tcache={};
function tileCanvas(ch,mapName){
  let key=ch;
  if(ch==='C'||ch==='O')key=ch+(mapName==='cave'?'x':'f');
  if(tcache[key])return tcache[key];
  const c=mk(16,16,g=>{
    if(ch==='C'||ch==='O'){(mapName==='cave'?TILE.x:TILE.f)(g);chestTile(ch==='O')(g);}
    else (TILE[ch]||TILE['.'])(g);});
  return tcache[key]=c;
}

// ================= キャラ / モンスター描画 =================
function drawChar(g,x,y,dir,fr,p){
  g.fillStyle='rgba(0,0,0,.25)';g.fillRect(x+3,y+14,10,2);
  g.fillStyle=p.leg;g.fillRect(x+4,y+11,3,4-(fr?1:0));g.fillRect(x+9,y+11,3,4-(fr?0:1));
  g.fillStyle=p.body;g.fillRect(x+3,y+7,10,5);
  if(p.cape&&dir==='up'){g.fillStyle=p.cape;g.fillRect(x+3,y+6,10,7);}
  g.fillStyle=p.trim||p.body;g.fillRect(x+3,y+10,10,1);
  g.fillStyle=p.skin;g.fillRect(x+2,y+8,2,3);g.fillRect(x+12,y+8,2,3);
  g.fillRect(x+4,y+1,8,7);
  g.fillStyle=p.hair;
  if(dir==='up')g.fillRect(x+4,y+1,8,7);
  else if(dir==='down'){g.fillRect(x+4,y,8,3);g.fillRect(x+3,y+1,1,4);g.fillRect(x+12,y+1,1,4);}
  else{const bx=dir==='left'?x+8:x+4;g.fillRect(x+4,y,8,3);g.fillRect(bx,y+1,4,6);}
  g.fillStyle='#111';
  if(dir==='down'){g.fillRect(x+6,y+4,1,2);g.fillRect(x+9,y+4,1,2);}
  else if(dir==='left')g.fillRect(x+5,y+4,1,2);
  else if(dir==='right')g.fillRect(x+10,y+4,1,2);
  if(p.hat==='crown'){g.fillStyle='#f0c020';g.fillRect(x+4,y-1,8,2);g.fillRect(x+4,y-2,2,1);g.fillRect(x+7,y-2,2,1);g.fillRect(x+10,y-2,2,1);}
  if(p.hat==='helm'){g.fillStyle='#aab';g.fillRect(x+3,y,10,3);}
  if(p.hat==='wiz'){g.fillStyle=p.body;g.fillRect(x+3,y,10,2);g.fillRect(x+6,y-3,4,3);}
}
function drawEnemy(g,kind,cx,cy,t,s,extra){
  g.save();g.translate(cx,cy);
  if(kind==='slime'){
    g.scale(s,s*(1+.06*Math.sin(t*4)));
    g.fillStyle='#3a6ae0';g.beginPath();g.moveTo(-14,12);g.quadraticCurveTo(-16,-6,0,-16);g.quadraticCurveTo(16,-6,14,12);g.closePath();g.fill();
    g.fillStyle='#7aa0ff';g.beginPath();g.ellipse(-5,-7,4,3,0,0,7);g.fill();
    g.fillStyle='#fff';g.fillRect(-7,-2,5,5);g.fillRect(2,-2,5,5);g.fillStyle='#000';g.fillRect(-5,0,2,3);g.fillRect(4,0,2,3);g.fillRect(-4,8,8,2);
  }else if(kind==='bat'){
    g.scale(s,s);g.translate(0,Math.sin(t*3)*3);const f=Math.sin(t*12)*7;
    g.fillStyle='#5a2a7a';poly(g,[-4,-2,-22,-10+f,-18,4,-12,0]);poly(g,[4,-2,22,-10+f,18,4,12,0]);
    g.fillStyle='#7a3a9a';circle(g,0,0,8);poly(g,[-6,-6,-5,-14,-1,-7]);poly(g,[6,-6,5,-14,1,-7]);
    g.fillStyle='#f33';g.fillRect(-4,-2,3,3);g.fillRect(2,-2,3,3);g.fillStyle='#fff';g.fillRect(-2,4,1,3);g.fillRect(2,4,1,3);
  }else if(kind==='goblin'){
    g.scale(s,s);g.translate(0,Math.sin(t*3)*1.5);
    g.fillStyle='#6a4a2a';g.fillRect(-6,2,12,12);g.fillStyle='#4a8a3a';circle(g,0,-5,9);poly(g,[-8,-6,-16,-10,-8,-1]);poly(g,[8,-6,16,-10,8,-1]);
    g.fillStyle='#ff0';g.fillRect(-5,-7,3,3);g.fillRect(2,-7,3,3);g.fillStyle='#000';g.fillRect(-4,-6,1,2);g.fillRect(3,-6,1,2);g.fillStyle='#fff';g.fillRect(-3,-1,2,3);g.fillRect(1,-1,2,3);
    g.fillStyle='#8a5a2a';g.fillRect(10,-8,4,20);g.fillStyle='#4a8a3a';g.fillRect(-9,4,3,8);g.fillRect(6,4,3,8);
  }else if(kind==='skel'){
    g.scale(s,s);g.translate(0,Math.sin(t*3)*1.5);
    g.fillStyle='#e8e8d8';circle(g,0,-8,8);g.fillRect(-5,-3,10,4);g.fillStyle='#000';g.fillRect(-5,-10,4,4);g.fillRect(1,-10,4,4);g.fillRect(-1,-4,2,3);
    g.fillStyle='#e8e8d8';g.fillRect(-1,2,2,12);for(const y of [4,7,10])g.fillRect(-7,y,14,2);g.fillRect(-10,4,2,10);g.fillRect(8,4,2,10);g.fillStyle='#aab';g.fillRect(11,-6,2,18);
  }else if(kind==='shroom'){
    g.scale(s,s*(1+.04*Math.sin(t*3)));
    g.fillStyle='#e8d8b0';g.fillRect(-5,0,10,13);g.fillStyle='#9a3ab0';g.beginPath();g.ellipse(0,-2,15,11,0,Math.PI,0);g.fill();g.fillRect(-15,-2,30,3);
    g.fillStyle='#fff';circle(g,-7,-6,3);circle(g,5,-8,3);circle(g,10,-3,2);g.fillStyle='#000';g.fillRect(-4,4,2,3);g.fillRect(2,4,2,3);
  }else if(kind==='dragon'){
    g.scale(s,s);g.translate(0,Math.sin(t*2)*1.5);const f=Math.sin(t*4)*4;
    g.fillStyle='#4a1a6a';poly(g,[-6,-2,-26,-14+f,-22,6,-10,6]);poly(g,[6,-2,26,-14+f,22,6,10,6]);
    g.fillStyle='#6a2a8a';g.beginPath();g.ellipse(0,5,13,11,0,0,7);g.fill();g.fillStyle='#c08ad0';g.beginPath();g.ellipse(0,8,7,7,0,0,7);g.fill();
    g.fillStyle='#4a1a6a';poly(g,[8,12,20,16,24,10,14,8]);
    g.fillStyle='#7a3a9a';circle(g,0,-9,8);g.fillRect(-5,-8,10,7);
    g.fillStyle='#fff';poly(g,[-7,-14,-10,-22,-4,-15]);poly(g,[7,-14,10,-22,4,-15]);
    g.fillStyle='#f33';g.fillRect(-5,-11,3,3);g.fillRect(2,-11,3,3);
    if(extra&&extra.fire){g.fillStyle='rgba(255,150,0,.8)';circle(g,0,-2,7);g.fillStyle='rgba(255,240,100,.9)';circle(g,0,-2,4);}
    else{g.fillStyle='#fff';g.fillRect(-3,-3,1,2);g.fillRect(2,-3,1,2);}
  }
  g.restore();
}

// ================= UI =================
function win(x,y,w,h){ctx.fillStyle='#001040';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeRect(x+1.5,y+1.5,w-3,h-3);ctx.strokeStyle='#6070c0';ctx.strokeRect(x+3.5,y+3.5,w-7,h-7);}
function txt(s,x,y,c='#fff'){ctx.fillStyle=c;ctx.fillText(s,x,y);}
const strw=s=>[...s].reduce((a,c)=>a+(c.charCodeAt(0)<256?.5:1),0)*8;
function wrap(text,max=27){
  const out=[];
  for(const para of text.split('\n')){
    let line='',w=0;
    for(const c of para){const cw=c.charCodeAt(0)<256?.5:1;if(w+cw>max){out.push(line);line='';w=0;}line+=c;w+=cw;}
    out.push(line);
  }
  return out;
}
const msgOverlay=now=>{
  if(!msgState)return;const st=msgState;win(8,150,240,66);
  let shown=st.instant?1e9:Math.floor((now-st.t0)/28);
  st.shown=shown;let left=shown;
  st.page.forEach((l,i)=>{const n=Math.min(l.length,Math.max(0,left));txt(l.slice(0,n),18,160+i*13);left-=l.length;});
  if(!st.noArrow&&shown>=st.total&&Math.floor(now/400)%2===0)txt('▼',232,203);
};
overlays.push(msgOverlay);
async function say(text,opts={}){
  const arr=Array.isArray(text)?text:[text];
  for(const t of arr){
    const lines=wrap(t);
    for(let p=0;p<lines.length;p+=4){
      const page=lines.slice(p,p+4);
      msgState={page,t0:nowMs(),total:page.join('').length,instant:false,noArrow:false};
      while(true){
        await waitKey(['ok','cancel']);
        if(msgState.shown<msgState.total){msgState.instant=true;await sleep(0);continue;}
        break;
      }
      se('ok');
    }
  }
  if(!opts.keep)msgState=null;
}
function openMsg(text){const page=wrap(text).slice(0,4);msgState={page,t0:0,total:0,instant:true,noArrow:true,shown:0};}
async function menu(items,o={}){
  const n=items.length,x=o.x??8,y=o.y??8,w=o.w||Math.max(...items.map(strw))+28,h=n*12+12;
  let i=o.start||0;const dis=o.disabled||[];
  const ov=now=>{win(x,y,w,h);items.forEach((t,j)=>txt(t,x+18,y+8+j*12,dis.includes(j)?'#889':'#fff'));if(Math.floor(now/300)%2===0||true)txt('▶',x+8,y+8+i*12);};
  overlays.push(ov);let res=-1;
  while(true){
    const k=await waitKey(['up','down','ok','cancel']);
    if(k==='up'){i=(i+n-1)%n;se('ok');}
    else if(k==='down'){i=(i+1)%n;se('ok');}
    else if(k==='ok'){if(dis.includes(i))continue;se('ok');res=i;break;}
    else if(o.cancel!==false){res=-1;break;}
  }
  overlays.splice(overlays.indexOf(ov),1);return res;
}
async function ask(text,no){openMsg(text);const r=await menu(['はい','いいえ'],{x:184,y:96,start:no?1:0});msgState=null;return r===0;}
async function pickAlly(pred){
  const ms=G.party.filter(pred||(()=>true));
  const i=await menu(ms.map(m=>`${m.name} HP${m.hp}/${m.mhp}`),{x:8,y:60});
  return i<0?null:ms[i];
}
async function fadeTo(v,ms=280){const a=fadeA,t0=nowMs();while(true){const t=Math.min(1,(nowMs()-t0)/ms);fadeA=a+(v-a)*t;if(t>=1)break;await new Promise(requestAnimationFrame);}}
const run=fn=>{busy=true;fn().catch(e=>console.error(e)).finally(()=>{busy=false;fq.length=0;});};

// ================= マップ / フィールド =================
function setMap(name){CUR=MAPS[name];G.map=name;}
function blocked(x,y){
  if(x<0||y<0||x>=CUR.w||y>=CUR.h)return true;
  const ch=CUR.t[y][x];if(BLOCK.has(ch))return true;
  return !!npcAt(x,y);
}
function npcHidden(n){return n.id&&G.flags[n.id];}
function npcAt(x,y){
  for(const n of CUR.npcs){if(npcHidden(n))continue;if((n.x===x&&n.y===y)||(n.mv&&n.mv.x1===x&&n.mv.y1===y))return n;}
  if(CUR.name==='cave'&&!G.flags.boss&&x===7&&y===2)return {boss:1};
  return null;
}
const DIRS={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
function startMove(k){
  const [dx,dy]=DIRS[k],lead=G.chain[0];lead.dir=k;G.dir=k;
  const nx=lead.x+dx,ny=lead.y+dy;
  if(blocked(nx,ny))return;
  const to=G.chain.map((c,i)=>{
    if(i===0)return {x:nx,y:ny,dir:k};
    const p=G.chain[i-1];let d=c.dir;
    if(p.x>c.x)d='right';else if(p.x<c.x)d='left';else if(p.y>c.y)d='down';else if(p.y<c.y)d='up';
    return {x:p.x,y:p.y,dir:d};});
  mv={t0:nowMs(),dur:190,to};
}
let stepN=0;
function encTile(){return CUR.enc==='cave'||CUR.t[G.y][G.x]==='.';}
function finishStep(){
  G.chain=mv.to;mv=null;G.x=G.chain[0].x;G.y=G.chain[0].y;G.dir=G.chain[0].dir;stepN++;
  const pt=CUR.portals&&CUR.portals[G.x+','+G.y];
  if(pt){run(()=>changeMap(pt));return;}
  if(G.map==='cave'&&G.y<=4&&!G.flags.boss){run(bossEvent);return;}
  if(CUR.enc&&encTile()&&--G.enc<=0){G.enc=rnd(10,17);run(randomBattle);}
}
async function changeMap(pt,quick){
  if(!quick)await fadeTo(1,220);
  setMap(pt.to);G.x=pt.x;G.y=pt.y;G.dir=pt.dir||'down';resetChain();mv=null;G.enc=rnd(10,17);
  bgm(CUR.bgm);await fadeTo(0,220);
}
function npcUpdate(now){
  for(const n of CUR.npcs){
    if(npcHidden(n))continue;
    if(n.mv){if(now-n.mv.t0>=320){n.x=n.mv.x1;n.y=n.mv.y1;n.mv=null;}}
    else if(n.wander&&!busy&&now>(n.next||0)){
      n.next=now+rnd(1200,3500);
      const k=['up','down','left','right'][rnd(0,3)],[dx,dy]=DIRS[k],nx=n.x+dx,ny=n.y+dy;n.dir=k;
      const pl=G.chain.some(c=>c.x===nx&&c.y===ny)||(mv&&mv.to.some(c=>c.x===nx&&c.y===ny));
      if(!pl&&!blocked(nx,ny)&&Math.abs(nx-n.hx)<=2&&Math.abs(ny-n.hy)<=2&&CUR.t[ny][nx]!=='S'&&!(CUR.portals&&CUR.portals[nx+','+ny]))n.mv={t0:now,x0:n.x,y0:n.y,x1:nx,y1:ny};
    }
  }
}
function fieldUpdate(now,dt){
  G.playMs+=dt;npcUpdate(now);
  if(busy){fq.length=0;return;}
  if(mv){if(now-mv.t0>=mv.dur)finishStep();return;}
  const k=held.up?'up':held.down?'down':held.left?'left':held.right?'right':null;
  // 決定: 目の前の人・宝箱を調べる（何もなければメニュー）／キャンセル: メニュー
  if(fq.includes('ok')){fq.length=0;run(async()=>{if(!await doTalk(true))await openCommand();});return;}
  if(fq.includes('cancel')){fq.length=0;run(openCommand);return;}
  if(k)startMove(k);
  fq.length=0;
}
const BASE={
  field:{'.':'grass','T':'grass','H':'grass','~':'water','^':'rock','D':'rock'},
  town:{'p':'stone','e':'stone','C':'stone','r':'stone','w':'stone','d':'stone','F':'stone','T':'grass'},
  castle:{'f':'floor','b':'floor','c':'floor','S':'floor','C':'floor','k':'carpet','t':'carpet','#':'castlewall'},
  inn:{'f':'floor','b':'floor','c':'floor','S':'floor','C':'floor','k':'carpet','t':'carpet','#':'castlewall'},
  shop:{'f':'floor','b':'floor','c':'floor','S':'floor','C':'floor','k':'carpet','t':'carpet','#':'castlewall'},
  cave:{'x':'cavefloor','C':'cavefloor','S':'cavefloor','X':'cavewall'},
};
const DECO={
  town:[{o:'inn',x:2,y:5,w:4,h:3,fb:'rwd'},{o:'shop',x:14,y:5,w:4,h:3,fb:'rwd'},{o:'castle',x:7,y:1,w:6,h:3,fb:'rwd'}],
  inn:[{o:'counter',x:2,y:3,w:5,h:1}],shop:[{o:'counter',x:2,y:3,w:5,h:1}],
};
const WALKSHEET={hero:'hero',war:'war',mage:'mage',king:'king',sol:'soldier',v1:'v1',v2:'v2',kid:'kid',lady:'lady',keeper:'keeper'};
const DROW={down:0,left:1,right:2,up:3};
function drawWalk(g,sheetName,dir,frame,cx,by,H=40){
  const s=ART.walk[sheetName];if(!s)return false;
  const k=H/s.h,r=DROW[dir]||0;
  g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(cx,by-1,9,3.2,0,0,7);g.fill();
  g.drawImage(s.c,frame*s.cw,r*s.ch+s.top,s.cw,s.h,cx-s.cw*k/2,by-s.h*k,s.cw*k,s.h*k);return true;
}
function drawField(now){
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
  ctx.save();ctx.setTransform(SC/2,0,0,SC/2,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const WW=W*2,HH=H*2;
  const m=CUR,mw=m.w*TS,mh=m.h*TS;
  let lx=G.chain[0].x*TS,ly=G.chain[0].y*TS,tt=0;
  if(mv){tt=Math.min(1,(now-mv.t0)/mv.dur);lx=G.chain[0].x*TS+(mv.to[0].x-G.chain[0].x)*TS*tt;ly=G.chain[0].y*TS+(mv.to[0].y-G.chain[0].y)*TS*tt;}
  const cx=Math.round(mw<=WW?-(WW-mw)/2:clamp(lx+TS/2-WW/2,0,mw-WW));
  const cy=Math.round(mh<=HH?-(HH-mh)/2:clamp(ly+TS/2-HH/2,0,mh-HH));
  const x0=Math.max(0,Math.floor(cx/TS)),x1=Math.min(m.w-1,Math.floor((cx+WW)/TS)),y0=Math.max(0,Math.floor(cy/TS)),y1=Math.min(m.h-1,Math.floor((cy+HH)/TS));
  const base=BASE[m.name]||{},ents=[],obj=ART.obj;
  const deco=(DECO[m.name]||[]).filter(d=>obj[d.o]);
  const covered=new Set();deco.forEach(d=>{for(let j=0;j<d.h;j++)for(let i=0;i<d.w;i++)covered.add((d.x+i)+','+(d.y+j));});
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const ch=m.t[y][x],dx=x*TS-cx,dy=y*TS-cy,tn=base[ch],tex=tn&&ART.tex[tn];
    if(tex){
      ctx.drawImage(tex,(x&3)*128,(y&3)*128,128,128,dx,dy,TS,TS);
      if(tn==='water'){
        ctx.fillStyle='rgba(255,255,255,.35)';
        for(const [ax,ay,w,h] of [[0,-1,TS,3],[0,1,TS,-3],[-1,0,3,TS],[1,0,-3,TS]]){
          const nx=x+(ax),ny=y+(ay);const nb=m.t[ny]&&m.t[ny][nx];
          if(nb&&nb!=='~'){ctx.fillRect(ax===1?dx+TS+w:dx,ay===1?dy+TS+h:dy,Math.abs(w),Math.abs(h));}
        }
        const sh=Math.sin(now/600+x*1.7+y*.9);ctx.fillStyle=`rgba(255,255,255,${.06+.05*sh})`;ctx.fillRect(dx+6,dy+10+sh*3,TS-12,2);
      }
    }else{
      let c=ch;if(c==='C'&&G.opened[m.name+','+x+','+y])c='O';
      if(!(covered.has(x+','+y)&&'rwd'.includes(ch)))ctx.drawImage(tileCanvas(c,m.name),dx,dy,TS,TS);
    }
    const ax=dx+TS/2,ab=dy+TS-2;
    const put=(o,w,h,yy=ab,alpha)=>{if(obj[o])ents.push({y:y*TS+TS,f:()=>drawFit(ctx,obj[o],ax,yy,w,h)});return !!obj[o];};
    if(ch==='T'&&tex){put((x*7+y*3)%4===0&&obj.pine?'pine':'tree',46,50,ab+2)||0;}
    else if(ch==='^')put('mountain',46,44,ab+2);
    else if(ch==='H')put('town_icon',46,42);
    else if(ch==='D')put('cave',44,40,ab+2);
    else if(ch==='C'){const o=G.opened[m.name+','+x+','+y]?'chest_open':'chest_closed';if(obj[o])ents.push({y:y*TS+TS-1,f:()=>drawFit(ctx,obj[o],ax,ab,26,24)});}
    else if(ch==='e')put('flowers',34,26);
    else if(ch==='t')put('throne',34,40);
    else if(ch==='b')put('bed',30,28);
    else if(ch==='F')put('fountain',46,48,ab+2);
    else if(ch==='S'&&m.name!=='cave')put('door',28,36,ab+4);
  }
  for(const d of deco){
    const o=obj[d.o],bx=(d.x+d.w/2)*TS-cx,bb=(d.y+d.h)*TS-cy;
    ents.push({y:(d.y+d.h)*TS-1,f:()=>drawFit(ctx,o,bx,bb+2,d.w*TS*1.15,d.h*TS*(d.o==='castle'?1.7:1.55))});
  }
  for(const n of m.npcs){
    if(npcHidden(n))continue;let px=n.x*TS,py=n.y*TS;
    if(n.mv){const t=Math.min(1,(now-n.mv.t0)/320);px=(n.x+(n.mv.x1-n.x)*t)*TS;py=(n.y+(n.mv.y1-n.y)*t)*TS;}
    const fr=n.mv?((n.mv.x1+n.mv.y1)%2?0:2):1;
    ents.push({y:py+TS,f:()=>{if(!drawWalk(ctx,WALKSHEET[n.pal],n.dir||'down',fr,Math.round(px-cx)+TS/2,Math.round(py-cy)+TS-2)){ctx.save();ctx.scale(2,2);drawChar(ctx,Math.round((px-cx)/2),Math.round((py-cy)/2),n.dir||'down',n.mv?Math.floor(now/150)%2:0,PAL[n.pal]);ctx.restore();}}});
  }
  if(m.name==='cave'&&!G.flags.boss)ents.push({y:2*TS+TS,f:()=>{const bob=Math.sin(now/500)*2;if(ART.mon.dragon)drawFit(ctx,ART.mon.dragon,7*TS+TS/2-cx,2*TS+TS+4-cy+bob,60,56);else{ctx.save();ctx.scale(2,2);drawEnemy(ctx,'dragon',7*TS/2+8-cx/2,2*TS/2+8-cy/2,now/1000,.55);ctx.restore();}}});
  G.party.forEach((p,i)=>{
    const c=G.chain[i];let px=c.x*TS,py=c.y*TS;
    if(mv){const to=mv.to[i];px+=(to.x-c.x)*TS*tt;py+=(to.y-c.y)*TS*tt;}
    const dir=mv?mv.to[i].dir:c.dir,fr=mv?(stepN%2?0:2):1;
    ents.push({y:py+TS+(i===0?.1:0),f:()=>{if(!drawWalk(ctx,p.cls,dir,fr,Math.round(px-cx)+TS/2,Math.round(py-cy)+TS-2)){ctx.save();ctx.scale(2,2);drawChar(ctx,Math.round((px-cx)/2),Math.round((py-cy)/2),dir,mv?Math.floor(tt*2):0,PAL[p.cls]);ctx.restore();}}});
  });
  ents.sort((a,b)=>a.y-b.y).forEach(e=>e.f());
  ctx.restore();
}

// ================= フィールドコマンド =================
async function openCommand(){
  const items=['はなす','じゅもん','どうぐ','そうび','つよさ','セーブ'];
  const gw=()=>{win(8,84,72,24);txt(G.gold+' G',16,92);};overlays.push(gw);
  let sel=0;
  try{while(true){
    sel=await menu(items,{x:8,y:8,start:sel,w:72});if(sel<0)break;
    if(sel===0){await doTalk();break;}
    else if(sel===1)await fieldSpell();
    else if(sel===2)await fieldItem();
    else if(sel===3)await fieldEquip();
    else if(sel===4)await showStatus();
    else if(sel===5)await doSave();
  }}finally{overlays.splice(overlays.indexOf(gw),1);}
}
async function doTalk(quiet){
  const d=G.chain[0].dir;G.dir=d;
  const [dx,dy]=DIRS[d];let x=G.x+dx,y=G.y+dy,ch=CUR.t[y]&&CUR.t[y][x];
  let n=npcAt(x,y);
  if(!n&&ch==='c'){n=npcAt(x+dx,y+dy);}
  if(n&&n.boss)return true;
  if(n){
    if(n.mv){n.x=n.mv.x1;n.y=n.mv.y1;n.mv=null;}
    n.dir={up:'down',down:'up',left:'right',right:'left'}[d];
    if(n.act)await ACT[n.act](n);else await say(n.say);
    n.next=nowMs()+2500;
    return true;
  }
  if(ch==='C'){await openChest(x,y);return true;}
  if(quiet)return false;
  await say('そのほうこうには だれも いない。');return true;
}
async function openChest(x,y){
  const key=CUR.name+','+x+','+y;
  if(G.opened[key]){await say('たからばこは からっぽだ。');return;}
  G.opened[key]=1;se('chest');const c=CHESTS[key];
  if(c.gold){G.gold+=c.gold;await say(`たからばこを あけた!\n${c.gold}ゴールドを てにいれた!`);}
  else if(c.eq){G.bag.push(c.eq);await say([`たからばこを あけた!\n${EQ[c.eq].n}を てにいれた!`,'（メニューの「そうび」で そうび できます）']);}
  else{G.items[c.item]+=c.n;await say(`たからばこを あけた!\n${ITEMS[c.item].n}を ${c.n}こ てにいれた!`);}
}
async function fieldSpell(){
  const ms=G.party.filter(m=>spellsOf(m).includes('heal'));
  if(!ms.length){await say('いま つかえる じゅもんは ない。');return;}
  const m=ms.length===1?ms[0]:(await pickAlly(p=>ms.includes(p)));if(!m)return;
  const sp=SP.heal;if(m.mp<sp.mp){await say('MPが たりない!');return;}
  const t=await pickAlly(p=>p.hp>0);if(!t)return;
  if(t.hp>=t.mhp){await say('こうかが ないようだ。');return;}
  m.mp-=sp.mp;const v=rnd(...sp.pw);t.hp=Math.min(t.mhp,t.hp+v);se('heal');
  await say(`${m.name}は ヒールを となえた!\n${t.name}の HPが ${v}かいふくした!`);
}
async function fieldItem(){
  const list=Object.keys(ITEMS).filter(k=>G.items[k]>0);
  if(!list.length){await say('どうぐを なにも もっていない。');return;}
  const i=await menu(list.map(k=>`${ITEMS[k].n} ×${G.items[k]}`),{x:8,y:60});if(i<0)return;
  const k=list[i],it=ITEMS[k],t=await pickAlly();if(!t)return;
  if(it.kind==='hp'?t.hp>=t.mhp:t.mp>=t.mmp){await say('こうかが ないようだ。');return;}
  G.items[k]--;se('heal');
  if(it.kind==='hp'){const v=Math.min(it.v,t.mhp-t.hp);t.hp+=v;await say(`${t.name}の HPが ${v}かいふくした!`);}
  else{const v=Math.min(it.v,t.mmp-t.mp);t.mp+=v;await say(`${t.name}の MPが ${v}かいふくした!`);}
}
async function showStatus(){
  const m=await pickAlly();if(!m)return;
  const ov=()=>{win(56,8,196,184);
    txt(`${m.name}  レベル${m.lv}`,68,18);
    [['HP',`${m.hp}/${m.mhp}`],['MP',`${m.mp}/${m.mmp}`],['こうげき',m.atk],['しゅび',m.def],['すばやさ',m.spd],['けいけんち',m.exp],['つぎまで',m.lv>=MAXLV?'-':LVEXP[m.lv+1]-m.exp]].forEach((r,i)=>{txt(r[0],68,34+i*12);txt(String(r[1]),176,34+i*12);});
    ['w','a','s'].forEach((s,i)=>txt(`${SLOTN[s]}: ${m.eq[s]?EQ[m.eq[s]].n:'なし'}`,68,124+i*12));
    txt('じゅもん: '+(spellsOf(m).map(s=>SP[s].n).join(' ')||'なし'),68,164);};
  overlays.push(ov);await waitKey(['ok','cancel']);overlays.splice(overlays.indexOf(ov),1);
}
// ---- そうび ----
const statOf=s=>s==='w'?'atk':'def',statN=s=>s==='w'?'こうげき':'しゅび';
function eqPreview(m,k){const s=EQ[k].s,cur=m[statOf(s)];return `${statN(s)}${cur}→${cur-eqv(m,s)+EQ[k].v}`;}
function equipItem(m,k){const s=EQ[k].s;if(m.eq[s])G.bag.push(m.eq[s]);m.eq[s]=k;applyStats(m);}
async function fieldEquip(){
  const m=await pickAlly();if(!m)return;
  const ov=()=>{win(120,8,128,52);txt(`${m.name}`,132,18);txt(`こうげき ${m.atk}`,132,32);txt(`しゅび   ${m.def}`,132,44);};
  overlays.push(ov);
  try{let si=0;while(true){
    const slots=['w','a','s'];
    si=await menu(slots.map(s=>`${SLOTN[s]}: ${m.eq[s]?EQ[m.eq[s]].n:'なし'}`),{x:8,y:68,start:si,w:136});if(si<0)break;
    const s=slots[si],cands=G.bag.map((k,i)=>[k,i]).filter(([k])=>EQ[k].s===s&&canEquip(m,k));
    const opts=cands.map(([k])=>`${EQ[k].n} ${eqPreview(m,k)}`);if(m.eq[s])opts.push('はずす');
    if(!opts.length){await say(`${m.name}が そうびできる ${SLOTN[s]}を もっていない。`);continue;}
    const c=await menu(opts,{x:8,y:68});if(c<0)continue;
    if(c<cands.length){const [k,bi]=cands[c];G.bag.splice(bi,1);equipItem(m,k);se('ok');await say(`${m.name}は ${EQ[k].n}を そうびした!`);}
    else{G.bag.push(m.eq[s]);const old=m.eq[s];m.eq[s]=null;applyStats(m);await say(`${m.name}は ${EQ[old].n}を はずした。`);}
  }}finally{overlays.splice(overlays.indexOf(ov),1);}
}
async function doSave(){
  try{localStorage.setItem('luminous_save',JSON.stringify(G));await say('ぼうけんのしょに きろくした!');}
  catch(e){await say('きろくに しっぱいした…');}
}

// ================= NPCイベント =================
function joinMember(name,cls,id){
  const hero=G.party[0];G.party.push(newMember(name,cls,hero.lv));G.flags[id]=1;
  G.chain.push({...G.chain[G.chain.length-1]});se('lvup');
}
const ACT={
  async war(n){
    await say(['おれは ガイ。 けんの うでには ちょっと じしんが あるんだ。','あんたが ゆうしゃ ユウだな?\nドラゴンたいじ おれも つれていってくれ!']);
    if(!await ask('ガイを なかまに しますか?')){await say('そうか…。 きがかわったら また こえを かけてくれ。');return;}
    joinMember('ガイ','war','war');await say('ガイが なかまに くわわった!');
  },
  async mage(n){
    await say(['わたしは ミラ。 まほうつかいよ。','ファイアの ほのおで まものを やきはらって みせるわ。\nわたしも ぼうけんに つれていって!']);
    if(!await ask('ミラを なかまに しますか?')){await say('ざんねん…。 きが かわったら また きてね。');return;}
    joinMember('ミラ','mage','mage');await say('ミラが なかまに くわわった!');
  },
  async king(){
    if(!G.flags.kingTalk){await kingIntro();return;}
    if(G.flags.boss)await say('ひかりは もどった! ほんとうに ありがとう、ユウよ!');
    else if(G.party.length<3)await say('なかまを あつめるのは おおきな ちからになる。\nまちの ひとびとに こえを かけてみよ。');
    else await say('きたの ほこらの ドラゴンを たのんだぞ!\nやくそうと せいすいを わすれずにな。');
  },
  async inn(){
    await say('いらっしゃい! ここは やどやです。',{keep:true});
    if(!await ask('おとまりですか? ひとばん 10ゴールドです。')){await say('またの おこしを!');return;}
    if(G.gold<10){await say('おかねが たりないようです…');return;}
    G.gold-=10;await fadeTo(1,400);stopBgm();se('inn');await sleep(1700);
    G.party.forEach(m=>{m.hp=m.mhp;m.mp=m.mmp;});bgm(CUR.bgm);await fadeTo(0,400);
    await say('おはようございます! ゆっくり やすめましたか?\nHPと MPが ぜんかいふくしました!');
  },
  async shop(){
    await say('いらっしゃいませ! ぶきと ぼうぐと どうぐの みせへ ようこそ!');
    const goods=[['herb',8],['ether',30]];
    const WEP=['stick','rod','bsword','axe'],ARM=['clothes','robe','leather','wshield','bshield'];
    const gw=()=>{win(176,120,72,24);txt(G.gold+' G',184,128);};overlays.push(gw);
    try{let top=0;while(true){
      top=await menu(['ぶきを かう','ぼうぐを かう','どうぐを かう','うる','やめる'],{x:8,y:8,start:top});
      if(top<0||top===4)break;
      if(top===2){while(true){
        const s=await menu(goods.map(g=>`${ITEMS[g[0]].n} ${g[1]}G`),{x:8,y:8});if(s<0)break;
        const g=goods[s];
        if(G.gold<g[1]){await say('おかねが たりないようです…');continue;}
        G.gold-=g[1];G.items[g[0]]++;se('chest');await say(`${ITEMS[g[0]].n}ですね。 まいどあり!`);
      }}
      else if(top===3)await shopSell();
      else await shopGear(top===0?WEP:ARM);
    }}finally{overlays.splice(overlays.indexOf(gw),1);}
    await say('また きてくださいね!');
  },
};
async function shopGear(list){
  while(true){
    const s=await menu(list.map(k=>`${EQ[k].n} ${EQ[k].p}G`),{x:8,y:8});if(s<0)return;
    const k=list[s],it=EQ[k];
    const dis=[];G.party.forEach((m,i)=>{if(!canEquip(m,k))dis.push(i);});
    if(dis.length===G.party.length){await say(`${it.n}は いまの なかまには そうびできませんね。`);continue;}
    const i=await menu(G.party.map((m,j)=>dis.includes(j)?`${m.name} そうびできない`:`${m.name} ${eqPreview(m,k)}`),{x:8,y:68,disabled:dis});
    if(i<0)continue;
    if(G.gold<it.p){await say('おかねが たりないようです…');continue;}
    const m=G.party[i];
    if(!await ask(`${it.n}は ${it.p}ゴールドです。\n${m.name}に そうびさせますか?`))continue;
    G.gold-=it.p;se('chest');
    const old=m.eq[it.s];equipItem(m,k);
    await say(`${m.name}は ${it.n}を そうびした!`);
    if(old){
      const bi=G.bag.lastIndexOf(old),v=Math.floor(EQ[old].p/2);
      if(await ask(`いままでの ${EQ[old].n}を ${v}ゴールドで かいとりましょうか?`,true)){G.bag.splice(bi,1);G.gold+=v;se('chest');await say('まいどあり!');}
      else await say(`${EQ[old].n}は ふくろに しまった。`);
    }
  }
}
async function shopSell(){
  while(true){
    if(!G.bag.length){await say('うれる ものを もっていないようですね。');return;}
    const s=await menu(G.bag.map(k=>`${EQ[k].n} ${Math.floor(EQ[k].p/2)}G`),{x:8,y:8});if(s<0)return;
    const k=G.bag[s],v=Math.floor(EQ[k].p/2);
    if(!await ask(`${EQ[k].n}を ${v}ゴールドで かいとります。\nよろしいですか?`))continue;
    G.bag.splice(s,1);G.gold+=v;se('chest');await say('まいどあり!');
  }
}
async function kingIntro(){
  await say(['おお ユウよ! よくぞ きてくれた!','この せかいを てらす ルミナスの ひかりが きえかけておる。\nげんいんは きたの ほこらに ひそむ やみのドラゴンじゃ。','どうか ドラゴンを たおして ひかりを とりもどして おくれ!','これは たびの しきんじゃ。\nうけとるがよい。']);
  G.gold+=200;G.items.herb+=3;se('chest');
  await say(['ユウは 200ゴールドと やくそうを 3こ てにいれた!','まずは まちの みせで ぶきと ぼうぐを ととのえ、\nなかまを さがすと よいぞ。','はなしたい あいてや たからばこの まえで\nけっていボタンを おすのじゃ。 では ゆけ ユウよ!']);
  G.flags.kingTalk=1;
}

// ================= 戦闘 =================
let B=null;
const phys=(a,d)=>Math.max(1,Math.round((a-d*.5)*(.8+Math.random()*.4)));
function randomBattle(){
  const z=ZONES[CUR.enc==='field'&&G.party.length===1?'easy':CUR.enc],kinds=z[rnd(0,z.length-1)];
  return (async()=>{
    se('enc');for(let i=0;i<4;i++){flashA=.9;await sleep(70);flashA=0;await sleep(70);}
    stopBgm();await fadeTo(1,150);
    const r=await battle(kinds,{bg:CUR.bg});
    await afterBattle(r);
  })();
}
async function afterBattle(r){
  scene='field';
  if(r==='lose'){await changeFromDefeat();return;}
  bgm(CUR.bgm);await fadeTo(0,250);
}
async function changeFromDefeat(){
  scene='field';setMap('castle');G.x=5;G.y=3;G.dir='up';resetChain();mv=null;
  G.party.forEach(m=>{m.hp=m.mhp;m.mp=m.mmp;});bgm('town');await fadeTo(0,300);
  await say(['ユウたちは おうさまの まえで めざめた…。','おお ユウよ! しんでしまうとは なさけない!\nだが ひかりの ちからで いのちを とりとめたようじゃ。','ゴールドの はんぶんは ひかりに かえったが…\nさあ もういちど たたかうのじゃ!']);
}
const aliveEn=()=>B.en.filter(e=>!e.dead),aliveP=()=>G.party.filter(p=>p.hp>0);
async function blog(t,wait=450){
  B.log.push(t);B.t0=nowMs();B.len=t.length;
  await waitKey(['ok'],wait+t.length*14);
}
async function battle(kinds,o={}){
  scene='battle';
  B={en:kinds.map(k=>({...EN[k],key:k,mhp:EN[k].hp,dead:false,flash:0,dying:0})),log:[],shake:0,bg:o.bg||'field',boss:!!EN[kinds[0]].boss,active:null,breath:0,t0:0,len:0};
  const cnt={},seen={};B.en.forEach(e=>cnt[e.key]=(cnt[e.key]||0)+1);
  B.en.forEach(e=>{if(cnt[e.key]>1){seen[e.key]=(seen[e.key]||0)+1;e.label=e.n+'ABC'[seen[e.key]-1];}else e.label=e.n;});
  bgm(B.boss?'boss':'battle');await fadeTo(0,200);
  await blog(B.boss?`${B.en[0].n}が たちはだかった!`:`${[...new Set(B.en.map(e=>e.n))].join('と ')}が あらわれた!`,500);
  let result=null;
  while(!result){
    // ---- コマンド入力
    const members=aliveP(),acts=[];let i=0;
    while(i<members.length){
      const a=await chooseAction(members[i],i>0);
      if(a===null){i--;continue;}
      acts[i]=a;i++;
    }
    B.active=null;B.log=[];
    // ---- 行動順
    const q=acts.map(a=>({side:'p',actor:a.actor,a,pri:a.type==='defend'?1000:a.actor.spd*(.6+Math.random()*.8)}));
    for(const e of aliveEn()){q.push({side:'e',actor:e,pri:e.spd*(.6+Math.random()*.8)});if(e.boss&&Math.random()<.3)q.push({side:'e',actor:e,pri:e.spd*Math.random()});}
    q.sort((a,b)=>b.pri-a.pri);
    for(const x of q){
      if(x.side==='p'){if(x.actor.hp<=0)continue;const r=await playerAct(x.a);if(r==='flee'){result='flee';break;}}
      else{if(x.actor.dead)continue;await enemyAct(x.actor);}
      if(!aliveEn().length){result='win';break;}
      if(!aliveP().length){result='lose';break;}
    }
    G.party.forEach(m=>m.guard=false);
  }
  B.active=null;
  if(result==='win')await victory();
  else if(result==='lose'){await blog('ユウたちは ぜんめつした…',900);se('lose');G.gold=Math.floor(G.gold/2);stopBgm();await sleep(900);await fadeTo(1,500);}
  else{await fadeTo(1,200);}
  B=null;return result;
}
async function chooseAction(m,canBack){
  B.active=m;
  while(true){
    const cmds=B.boss?['たたかう','じゅもん','どうぐ','ぼうぎょ']:['たたかう','じゅもん','どうぐ','ぼうぎょ','にげる'];
    const c=await menu(cmds,{x:8,y:60,w:64});
    if(c<0){if(canBack)return null;continue;}
    if(c===0){const t=await pickEnemy();if(!t)continue;return {actor:m,type:'attack',target:t};}
    if(c===1){
      const sps=spellsOf(m);if(!sps.length){await blog(`${m.name}は じゅもんを つかえない!`,300);continue;}
      const si=await menu(sps.map(s=>`${SP[s].n} ${SP[s].mp}`),{x:76,y:60,disabled:sps.map((s,j)=>SP[s].mp>m.mp?j:-1).filter(j=>j>=0)});if(si<0)continue;
      const s=sps[si],sp=SP[s];
      if(sp.t==='one'){const t=await pickEnemy();if(!t)continue;return {actor:m,type:'spell',s,target:t};}
      if(sp.t==='ally'){const t=await pickAlly(p=>p.hp>0);if(!t)continue;return {actor:m,type:'spell',s,target:t};}
      return {actor:m,type:'spell',s};
    }
    if(c===2){
      const list=Object.keys(ITEMS).filter(k=>G.items[k]>0);if(!list.length){await blog('どうぐを もっていない!',300);continue;}
      const ii=await menu(list.map(k=>`${ITEMS[k].n} ×${G.items[k]}`),{x:76,y:60});if(ii<0)continue;
      const t=await pickAlly(p=>p.hp>0);if(!t)continue;return {actor:m,type:'item',k:list[ii],target:t};
    }
    if(c===3)return {actor:m,type:'defend'};
    if(c===4)return {actor:m,type:'flee'};
  }
}
async function pickEnemy(){
  const ae=aliveEn();if(ae.length===1)return ae[0];
  const i=await menu(ae.map(e=>e.label),{x:76,y:60});return i<0?null:ae[i];
}
async function hitEnemy(t,dmg,crit){
  se(crit?'crit':'hit');t.hp-=dmg;t.flash=nowMs()+260;
  await blog(`${t.label}に ${dmg}の ダメージ!`,320);
  if(t.hp<=0){t.dead=true;t.dying=nowMs();await blog(`${t.label}を たおした!`,300);}
}
async function hurtParty(p,dmg){
  if(p.guard)dmg=Math.max(1,Math.floor(dmg/2));
  se('hurt');B.shake=nowMs()+250;p.hp=Math.max(0,p.hp-dmg);
  await blog(`${p.name}は ${dmg}の ダメージを うけた!`,320);
  if(p.hp<=0)await blog(`${p.name}は たおれた!`,400);
}
async function playerAct(a){
  const m=a.actor;
  if(a.type==='defend'){await blog(`${m.name}は みを まもっている。`,250);m.guard=true;return;}
  if(a.type==='flee'){
    await blog(`${m.name}たちは にげだした!`,300);
    if(Math.random()<.6)return 'flee';
    await blog('しかし まわりこまれてしまった!',400);return;
  }
  if(a.type==='attack'){
    let t=a.target;if(t.dead)t=aliveEn()[rnd(0,aliveEn().length-1)];
    await blog(`${m.name}の こうげき!`,200);
    const crit=rnd(1,16)===1;let dmg;
    if(crit){await blog('かいしんの いちげき!',250);dmg=Math.round(m.atk*(.9+Math.random()*.3));}else dmg=phys(m.atk,t.def);
    await hitEnemy(t,dmg,crit);return;
  }
  if(a.type==='item'){
    const it=ITEMS[a.k];
    if(G.items[a.k]<=0){await blog('しかし なにも おこらなかった!',300);return;}
    G.items[a.k]--;await blog(`${m.name}は ${it.n}を つかった!`,250);se('heal');
    if(it.kind==='hp'){const v=Math.min(it.v,a.target.mhp-a.target.hp);a.target.hp+=v;await blog(`${a.target.name}の HPが ${v}かいふくした!`,300);}
    else{const v=Math.min(it.v,a.target.mmp-a.target.mp);a.target.mp+=v;await blog(`${a.target.name}の MPが ${v}かいふくした!`,300);}
    return;
  }
  if(a.type==='spell'){
    const sp=SP[a.s];
    if(m.mp<sp.mp){await blog('MPが たりない!',300);return;}
    m.mp-=sp.mp;await blog(`${m.name}は ${sp.n}を となえた!`,250);
    if(sp.t==='ally'){se('heal');const t=a.target.hp>0?a.target:m;const v=Math.min(rnd(...sp.pw),t.mhp-t.hp);t.hp+=v;await blog(`${t.name}の HPが ${v}かいふくした!`,300);return;}
    se('magic');
    if(sp.t==='one'){let t=a.target;if(t.dead)t=aliveEn()[0];if(!t)return;await hitEnemy(t,rnd(...sp.pw),false);}
    else for(const t of aliveEn()){await hitEnemy(t,rnd(...sp.pw),false);}
  }
}
async function enemyAct(e){
  const ps=aliveP();if(!ps.length)return;
  if(e.boss){
    const r=Math.random();
    if(r<.3){
      await blog(`${e.n}は ほのおの いきを はいた!`,250);B.breath=nowMs()+900;se('magic');
      for(const p of aliveP())await hurtParty(p,rnd(8,12));return;
    }
    if(r<.45){
      await blog(`${e.n}の きょうれつな いちげき!`,250);
      const p=aliveP()[rnd(0,aliveP().length-1)];await hurtParty(p,Math.round(phys(e.atk,p.def)*1.4));return;
    }
  }
  const p=ps[rnd(0,ps.length-1)];
  await blog(`${e.label}の こうげき!`,200);
  await hurtParty(p,phys(e.atk,p.def));
}
async function victory(){
  stopBgm();se('win');
  const exp=B.en.reduce((a,e)=>a+e.exp,0),gold=B.en.reduce((a,e)=>a+e.g,0);
  await blog('まものを やっつけた!',600);
  await blog(`${exp}ポイントの けいけんちを かくとく!`,500);
  await blog(`${gold}ゴールドを てにいれた!`,500);
  G.gold+=gold;
  for(const m of G.party){
    if(m.hp<=0){m.hp=1;continue;}
    m.exp+=exp;
    while(m.lv<MAXLV&&m.exp>=LVEXP[m.lv+1]){
      const old=calcStats(m);m.lv++;const nw=calcStats(m);se('lvup');
      m.hp+=nw.mhp-old.mhp;m.mp+=nw.mmp-old.mmp;applyStats(m);
      await blog(`${m.name}は レベル${m.lv}に あがった!`,700);
      await blog(`さいだいHP+${nw.mhp-old.mhp} ちから+${nw.atk-old.atk} みのまもり+${nw.def-old.def}`,500);
      for(const [lv,s] of CLS[m.cls].sp)if(lv===m.lv)await blog(`${m.name}は ${SP[s].n}を おぼえた!`,600);
    }
  }
  if(B.boss)G.flags.boss=1;
}
function drawBattle(now){
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
  ctx.save();if(B.shake>now)ctx.translate(rnd(-2,2),rnd(-2,2));
  // 背景
  const bgi=ART.bg[B.boss?'lair':B.bg];
  if(bgi){ctx.save();ctx.beginPath();ctx.rect(4,54,248,96);ctx.clip();ctx.imageSmoothingQuality='high';drawCover(ctx,bgi,4,54,248,96);ctx.restore();}
  else{
  const bgc={field:['#5a9ae0','#9ad0f0','#3a8a3a'],cave:['#1a1420','#2a2030','#3a3040']}[B.boss?'cave':B.bg];
  const gr=ctx.createLinearGradient(0,52,0,150);gr.addColorStop(0,B.boss?'#200808':bgc[0]);gr.addColorStop(1,B.boss?'#401010':bgc[1]);
  ctx.fillStyle=gr;ctx.fillRect(4,54,248,96);ctx.fillStyle=B.boss?'#301818':bgc[2];ctx.fillRect(4,118,248,32);}
  ctx.strokeStyle='#fff';ctx.strokeRect(4.5,54.5,247,95);
  const n=B.en.length,xs=n===1?[170]:n===2?[144,196]:[118,170,222];
  B.en.forEach((e,i)=>{
    let a=1;if(e.dead){a=1-(now-e.dying)/400;if(a<=0)return;}
    if(e.flash>now&&Math.floor(now/50)%2===0)return;
    ctx.globalAlpha=a;const big=e.boss;
    const mi=ART.mon[e.kind];
    if(mi){const bob=Math.sin(now/450+i*1.3)*(big?1.5:2);
      if(B.breath>now&&big){ctx.fillStyle='rgba(255,140,0,.35)';ctx.fillRect(4,54,248,96);}
      ctx.imageSmoothingQuality='high';
      const mw=big?120:n===1?80:n===2?62:50,mh=big?92:n===1?72:n===2?64:56;
      drawFit(ctx,mi,xs[i],big?147+bob:143+bob,mw,mh);}
    else drawEnemy(ctx,e.kind,xs[i],big?104:112,now/1000+i,big?2.4:1.3,{fire:B.breath>now});
    ctx.globalAlpha=1;
  });
  ctx.restore();
  // パーティ状態
  win(4,4,248,46);
  G.party.forEach((m,i)=>{
    const x=12+i*82,c=m.hp<=0?'#889':m===B.active?'#ff8':m.hp<m.mhp*.25?'#f66':'#fff';
    txt(`${m.name} Lv${m.lv}`,x,12,c);txt(`HP ${String(m.hp).padStart(3,' ')}`,x,24,c);txt(`MP ${String(m.mp).padStart(3,' ')}`,x,36,c);
  });
  // メッセージ
  win(8,154,240,62);
  const lines=B.log.slice(-4);
  lines.forEach((l,i)=>{
    const last=i===lines.length-1;
    const nc=last?Math.floor((now-B.t0)/14):l.length;
    txt(l.slice(0,Math.max(0,nc)),18,162+i*13);
  });
}

// ================= ボス / エンディング =================
async function bossEvent(){
  mv=null;
  await say(['…ほこらの おくから おそろしい うなりごえが ひびく!','「ひかりを ねらう おろかものめ…\nこの やみに のみこまれるが よい!」']);
  await fadeTo(1,200);stopBgm();
  const r=await battle(['boss'],{bg:'cave'});
  if(r==='win'){await afterBattle('win');await ending();}
  else if(r==='flee'){scene='field';G.y=Math.max(G.y,6);G.chain=G.party.map((_,i)=>({x:G.x,y:G.y,dir:'down'}));bgm('cave');await fadeTo(0,250);}
  else await afterBattle('lose');
}
async function ending(){
  await say(['やみのドラゴンは さいごの さけびを あげて きえていった…','ほこらに まぶしい ひかりが みちあふれる!']);
  await fadeTo(1,800);stopBgm();
  scene='end';G.endMs=G.playMs;await fadeTo(0,600);bgm('town');
  await waitKey(['ok']);await fadeTo(1,500);scene='title';startTitle();
}
function drawEnd(now){
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
  const mins=Math.floor(G.endMs/60000),sec=Math.floor(G.endMs/1000)%60;
  ctx.textAlign='center';
  txt('ひかりは せかいに もどった…',128,50,'#ff8');
  txt('ユウたちの ぼうけんは まだ はじまったばかり!',128,74);
  txt('～ ルミナスクエスト 体験版 おわり ～',128,110,'#8cf');
  txt(`プレイじかん ${mins}ぷん ${sec}びょう`,128,140);
  txt(G.party.map(m=>`${m.name}Lv${m.lv}`).join('  '),128,156);
  txt('あそんでくれて ありがとう!',128,180);
  if(Math.floor(now/500)%2===0)txt('PUSH Z / ENTER',128,204,'#aaa');
  ctx.textAlign='left';
}

// ================= タイトル =================
const stars=Array.from({length:60},(_,i)=>({x:(i*97)%256,y:(i*53)%160,p:i*.7}));
function drawTitle(now){
  if(ART.bg.title){drawCover(ctx,ART.bg.title,0,0,W,H);const gg=ctx.createLinearGradient(0,30,0,120);gg.addColorStop(0,'rgba(0,0,20,.55)');gg.addColorStop(1,'rgba(0,0,20,0)');ctx.fillStyle=gg;ctx.fillRect(0,30,W,90);
  const g2=ctx.createLinearGradient(0,150,0,H);g2.addColorStop(0,'rgba(0,0,20,0)');g2.addColorStop(1,'rgba(0,0,20,.7)');ctx.fillStyle=g2;ctx.fillRect(0,150,W,74);}
  else{
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#04041a');g.addColorStop(1,'#1a2a5a');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  stars.forEach(s=>{ctx.fillStyle=Math.sin(now/500+s.p)>0?'#fff':'#889';ctx.fillRect(s.x,s.y,1,1);});
  ctx.fillStyle='#142';ctx.beginPath();ctx.moveTo(0,H);ctx.lineTo(0,170);ctx.quadraticCurveTo(70,140,130,172);ctx.quadraticCurveTo(190,150,256,168);ctx.lineTo(256,H);ctx.fill();
  ctx.fillStyle='rgba(255,240,150,.25)';ctx.beginPath();ctx.arc(128,70,38+Math.sin(now/400)*2,0,7);ctx.fill();}
  ctx.textAlign='center';ctx.font="bold 22px 'MS Gothic','Yu Gothic',monospace";
  txt('ルミナスクエスト',128+1,56+1,'#640');txt('ルミナスクエスト',128,56,'#ffd84a');
  ctx.font=FONT;txt('～ ひかりを もとめて ～',128,88,'#cde');txt('体験版',128,102,'#8cf');
  if(!title.menu&&Math.floor(now/500)%2===0)txt('PUSH Z / ENTER',128,170,'#fff');
  txt('© 体験版 — 約10ぷんで あそべます',128,212,'#889');ctx.textAlign='left';
}
const title={menu:false};
async function startTitle(){
  scene='load';await ART_READY;
  scene='title';busy=true;title.menu=false;bgm('town');
  while(true){
    await waitKey(['ok']);title.menu=true;
    const has=!!localStorage.getItem('luminous_save');
    const i=await menu(has?['はじめから','つづきから']:['はじめから'],{x:92,y:120,w:76});
    if(i<0){title.menu=false;continue;}
    if(i===1){try{G=JSON.parse(localStorage.getItem('luminous_save'));G.bag=G.bag||[];G.enc=G.enc||rnd(10,17);G.party.forEach(m=>{if(!m.eq)m.eq={...START_EQ[m.cls]};applyStats(m);m.hp=Math.min(m.hp,m.mhp);m.mp=Math.min(m.mp,m.mmp);});}catch(e){newGame();}resetChain();setMap(G.map);}
    else{newGame();setMap('castle');}
    break;
  }
  await fadeTo(1,300);scene='field';bgm(CUR.bgm);mv=null;await fadeTo(0,300);
  if(!G.flags.kingTalk){await kingIntro();}
  busy=false;fq.length=0;
}

// ================= メインループ =================
let last=0;
function frame(now){
  const dt=Math.min(100,now-last);last=now;
  if(scene==='field'&&G)fieldUpdate(now,dt);else fq.length=0;
  ctx.setTransform(SC,0,0,SC,0,0);ctx.font=FONT;ctx.textBaseline='top';ctx.textAlign='left';
  if(scene==='load'){ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.textAlign='center';txt('Now Loading...',128,108);ctx.textAlign='left';}
  else if(scene==='title')drawTitle(now);
  else if(scene==='field')drawField(now);
  else if(scene==='battle'&&B)drawBattle(now);
  else if(scene==='end')drawEnd(now);
  ctx.font=FONT;
  overlays.forEach(f=>f(now));
  if(flashA>0){ctx.fillStyle=`rgba(255,255,255,${flashA})`;ctx.fillRect(0,0,W,H);}
  if(fadeA>0){ctx.fillStyle=`rgba(0,0,0,${fadeA})`;ctx.fillRect(0,0,W,H);}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
startTitle();
