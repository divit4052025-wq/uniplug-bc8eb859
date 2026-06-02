/* ============================================================
   UniPlug — landing interactions (v2)
   ============================================================ */
(function(){
'use strict';
const PR = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
const FINE = window.matchMedia('(pointer:fine)').matches;
const $  = (s,r)=> (r||document).querySelector(s);
const $$ = (s,r)=> Array.from((r||document).querySelectorAll(s));

/* ---------- mascot colours ---------- */
const MCOLOR = {
  founder:'#1A1A1A', sprout:'#F4B5AA', climber:'#D2CECB', spark:'#ED7E4A',
  mentor:'#F8E8DD', quill:'#FAEFE3', grid:'#C2D9EA', sports:'#F2D098',
  cocurricular:'#9AD6C6', lens:'#B5A0D4', leaf:'#C5D9B0',
};
function mountMascots(){
  if(!window.UniPlugMascot) return;
  $$('[data-mascot]').forEach(el=>{
    if(el.dataset.mounted) return;
    el.insertAdjacentHTML('afterbegin', window.UniPlugMascot.make({
      shape: el.dataset.mascot, color: MCOLOR[el.dataset.mascot], expression: el.dataset.expr||'default'
    }));
    el.dataset.mounted='1';
  });
}
mountMascots();

/* ============================================================
   SPLASH — letters assemble, Founder places the rose dot
   ============================================================ */
const intro=$('#intro'), introSkip=$('#introSkip'), stage=$('#introStage');
const SEEN_KEY='uniplug_intro_seen_v2';
let introDone=false;

function enterPage(){
  if(introDone) return; introDone=true;
  try{ sessionStorage.setItem(SEEN_KEY,'1'); }catch(e){}
  intro.classList.add('dissolve');
  document.body.classList.remove('intro-lock');
  introSkip.classList.remove('show');
  setTimeout(()=>{ intro.style.display='none'; revealScan(true); }, 720);
}
introSkip.addEventListener('click',(e)=>{ e.stopPropagation(); clearTimeout(window._enterT); enterPage(); });
intro.addEventListener('click', ()=>{ clearTimeout(window._enterT); enterPage(); });

function playIntro(){
  introDone=false;
  intro.style.display='grid'; intro.classList.remove('dissolve');
  document.body.classList.add('intro-lock');
  const letters=$$('.wm-letter'), founder=$('#introFounder'), carry=$('#introCarryDot'),
        home=$('#introDotHome'), cue=$('#introCue'), kicker=$('#introKicker');
  // reset
  letters.forEach(l=>{ l.style.opacity=0; l.classList.remove('drop'); });
  founder.classList.remove('fly','hover'); founder.style.opacity=0;
  carry.classList.remove('carried','drop');
  home.classList.remove('settle'); home.style.opacity=0; home.style.transform='scale(0)';
  cue.classList.remove('show'); kicker.classList.remove('show');
  const oldRipple=$('.intro-ripple'); if(oldRipple) oldRipple.remove();

  if(PR){
    letters.forEach(l=>l.style.opacity=1);
    home.style.opacity=1; home.style.transform='scale(1)';
    founder.style.opacity=1; carry.style.opacity=0;
    kicker.classList.add('show'); cue.classList.add('show'); introSkip.classList.add('show');
    return;
  }

  // 1) letters drop, 70ms apart
  letters.forEach((l,i)=> setTimeout(()=> l.classList.add('drop'), 120 + i*70));
  const lettersDone = 120 + letters.length*70 + 200; // ~0.8s

  // 2) Founder flies in carrying the dot
  setTimeout(()=>{
    carry.classList.add('carried');
    founder.style.opacity=1;
    founder.classList.add('fly');
  }, lettersDone);
  const flyDone = lettersDone + 1000; // fly = 1s

  // 3) place the dot — carry drops, home dot settles + ripple
  setTimeout(()=>{
    founder.classList.remove('fly'); founder.classList.add('hover');
    carry.classList.add('drop');
    setTimeout(()=>{
      home.style.opacity=1; home.classList.add('settle');
      const rip=document.createElement('div'); rip.className='intro-ripple';
      stage.appendChild(rip); void rip.offsetWidth; rip.classList.add('go');
    }, 240);
  }, flyDone);
  const placeDone = flyDone + 500;

  // 4) kicker + cue
  setTimeout(()=>{ kicker.classList.add('show'); cue.classList.add('show'); introSkip.classList.add('show'); }, placeDone + 200);

  window._enterT = setTimeout(enterPage, placeDone + 4600);
}

let seen=false; try{ seen = sessionStorage.getItem(SEEN_KEY)==='1'; }catch(e){}
if(seen){ intro.style.display='none'; document.body.classList.remove('intro-lock'); introDone=true; }
else { playIntro(); }

/* ============================================================
   CUSTOM CURSOR
   ============================================================ */
if(FINE && !PR){
  const dot=$('.up-cursor'), ring=$('.up-cursor-ring');
  let mx=innerWidth/2,my=innerHeight/2,rx=mx,ry=my;
  document.addEventListener('mousemove', e=>{
    mx=e.clientX; my=e.clientY;
    dot.style.transform=`translate(${mx}px,${my}px) translate(-50%,-50%)`;
    // dark-bg awareness
    const el=document.elementFromPoint(mx,my);
    const dark = el && el.closest('.on-dark,.closing,#intro');
    document.body.classList.toggle('on-dark-cursor', !!dark && intro.style.display==='none');
  });
  (function loop(){
    rx+=(mx-rx)*0.18; ry+=(my-ry)*0.18;
    if(!ring.classList.contains('snap'))
      ring.style.transform=`translate(${rx}px,${ry}px) translate(-50%,-50%) scale(${document.body.classList.contains('hovering')?1:0.5})`;
    requestAnimationFrame(loop);
  })();
  document.addEventListener('mousedown',()=>document.body.classList.add('pressing'));
  document.addEventListener('mouseup',()=>document.body.classList.remove('pressing'));
  function bind(el){
    el.addEventListener('mouseenter',()=>{
      document.body.classList.add('hovering'); ring.classList.add('snap');
      const r=el.getBoundingClientRect();
      ring.style.width=(r.width+12)+'px'; ring.style.height=(r.height+12)+'px';
      ring.style.borderRadius=getComputedStyle(el).borderRadius;
    });
    el.addEventListener('mousemove',e=>{
      const r=el.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
      ring.style.transform=`translate(${cx}px,${cy}px) translate(-50%,-50%) scale(1)`;
      const pull=Math.min(r.width,150)*0.12;
      el.style.transform=`translate(${(e.clientX-cx)/r.width*pull}px,${(e.clientY-cy)/r.height*pull}px)`;
    });
    el.addEventListener('mouseleave',()=>{
      document.body.classList.remove('hovering'); ring.classList.remove('snap');
      ring.style.width='34px'; ring.style.height='34px'; ring.style.borderRadius='50%'; el.style.transform='';
    });
  }
  $$('.magnetic').forEach(bind);
} else { document.body.classList.remove('cursor-on'); }

/* ============================================================
   FOUNDER FOLLOWS CURSOR  (hero)
   ============================================================ */
let eyesOn=true;
function bindFollow(sel, rot){
  const f=$(sel); if(!f || PR) return;
  function get(){ return { svg:f.querySelector('svg'), eyes:$$('.ax-blink circle', f) }; }
  let g=get();
  if(!g.svg) setTimeout(()=>{ g=get(); }, 350);
  document.addEventListener('mousemove', e=>{
    if(!eyesOn || !g.svg) return;
    const r=f.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
    const ang=Math.atan2(e.clientY-cy, e.clientX-cx);
    const d=Math.min(Math.hypot(e.clientX-cx,e.clientY-cy)/600,1);
    g.eyes.forEach(c=> c.style.transform=`translate(${Math.cos(ang)*3.2*d}px,${Math.sin(ang)*2.4*d}px)`);
    g.svg.style.transform=`rotate(${Math.cos(ang)*rot*d}deg)`;
    g.svg.style.transformOrigin='50% 70%';
  });
}
bindFollow('#heroFounder', 1.6);
bindFollow('#closeFounder', 4);

/* ============================================================
   HEADER + reveals
   ============================================================ */
const header=$('#header'); let lastY=0;
function onScroll(){
  const y=window.scrollY;
  document.body.classList.toggle('scrolled', y>30);
  lastY=y;
}
window.addEventListener('scroll', onScroll, {passive:true});

const menuToggle=$('#menuToggle'), navSheet=$('#navSheet');
menuToggle.addEventListener('click',()=>{ const o=navSheet.classList.toggle('open'); menuToggle.textContent=o?'Close':'Menu'; });
$$('#navSheet a').forEach(a=>a.addEventListener('click',()=>{ navSheet.classList.remove('open'); menuToggle.textContent='Menu'; }));

const revealEls=$$('.reveal, .line');
let io;
if('IntersectionObserver' in window){
  io=new IntersectionObserver(es=>es.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); }}),{threshold:0.12,rootMargin:'0px 0px -8% 0px'});
  revealEls.forEach(el=>io.observe(el));
} else revealEls.forEach(el=>el.classList.add('in'));
function revealScan(force){ revealEls.forEach(el=>{ const r=el.getBoundingClientRect(); if(r.top<innerHeight*0.95||force) el.classList.add('in'); }); }

/* ============================================================
   PINNED SCROLL SEQUENCE  (panels can hold multiple sub-steps)
   ============================================================ */
(function pinSeq(){
  const wrap=$('#pinWrap'), stage=$('#pinStage');
  if(!wrap||!stage) return;
  const panels=$$('.panel', stage);
  const stepsArr=panels.map(p=>Math.max(1,parseInt(p.dataset.steps||'1',10)));
  const starts=[]; let acc=0; stepsArr.forEach((s,i)=>{ starts[i]=acc; acc+=s; });
  const TOTAL=acc;
  const STEP_VH=128; // taller per-step = slower, more deliberate advance

  function applySteps(panel, ls){
    panel.querySelectorAll('[data-step-show]').forEach(el=>el.classList.toggle('shown', ls>=+el.dataset.stepShow));
    panel.querySelectorAll('[data-step-only]').forEach(el=>el.classList.toggle('shown', ls===+el.dataset.stepOnly));
    panel.setAttribute('data-step', ls);
  }

  if(PR){ return; } // reduced motion → plain stacked scroll (handled by :not(.pin-on) CSS)

  document.body.classList.add('pin-on');
  function setH(){ wrap.style.height=(TOTAL*STEP_VH)+'vh'; }
  setH();

  let curPanel=-1, curStep=-1;
  function setActive(pi, ls){
    const panelChanged = pi!==curPanel;
    if(panelChanged){
      curPanel=pi;
      panels.forEach((p,idx)=>{
        p.classList.toggle('is-active',idx===pi);
        p.classList.toggle('is-prev',idx<pi);
        p.classList.toggle('is-next',idx>pi);
      });
      document.body.classList.toggle('panel-dark', panels[pi].classList.contains('on-dark'));
    }
    if(panelChanged || ls!==curStep){ curStep=ls; applySteps(panels[pi], ls); }
  }
  function compute(){
    const vh=innerHeight;
    const total=wrap.offsetHeight - vh;
    const top=wrap.getBoundingClientRect().top;
    const scrolled=Math.min(Math.max(-top,0), total);
    const p = total>0 ? scrolled/total : 0;
    let g=Math.floor(p*TOTAL); if(g>=TOTAL)g=TOTAL-1; if(g<0)g=0;
    let pi=0; while(pi<panels.length-1 && g>=starts[pi]+stepsArr[pi]) pi++;
    setActive(pi, g-starts[pi]);
  }
  function scrollToPanel(i){
    if(i<0||i>=panels.length) return;
    const total=wrap.offsetHeight - innerHeight;
    const frac=(starts[i]+0.5)/TOTAL;
    window.scrollTo({top: wrap.offsetTop + frac*total, behavior:'smooth'});
  }
  window.uniplugGoToPanel=scrollToPanel;
  window.addEventListener('scroll',compute,{passive:true});
  window.addEventListener('resize',()=>{ setH(); compute(); });
  compute();
})();

/* nav links → jump to the right panel */
$$('[data-panel-link]').forEach(a=>{
  a.addEventListener('click', e=>{
    const idx=parseInt(a.dataset.panelLink,10);
    if(window.uniplugGoToPanel && !isNaN(idx)){ e.preventDefault(); window.uniplugGoToPanel(idx); }
    if(navSheet) navSheet.classList.remove('open');
    if(menuToggle) menuToggle.textContent='Menu';
  });
});

/* ============================================================
   TWEAKS
   ============================================================ */
const ACCENTS=[
  {n:'Rose',a:'#F4B5AA',d:'#C4907F'},
  {n:'Coral',a:'#ED7E4A',d:'#BC4926'},
  {n:'Sky',a:'#C2D9EA',d:'#6E9CC0'},
  {n:'Teal',a:'#9AD6C6',d:'#5FA995'},
  {n:'Sage',a:'#C5D9B0',d:'#7B9A63'},
  {n:'Plum',a:'#B5A0D4',d:'#8E72C0'},
];
const root=document.documentElement, twAccent=$('#twAccent');
ACCENTS.forEach((c,i)=>{
  const b=document.createElement('button');
  b.className='tw-sw'+(i===0?' on':''); b.style.background=c.a; b.title=c.n;
  b.addEventListener('click',()=>{ root.style.setProperty('--rose',c.a); root.style.setProperty('--rose-deep',c.d); $$('#twAccent .tw-sw').forEach(s=>s.classList.remove('on')); b.classList.add('on'); });
  twAccent.appendChild(b);
});
function toggle(el,on,fn){ el.classList.toggle('on',on); el.addEventListener('click',()=>{ const v=el.classList.toggle('on'); fn(v); }); }
toggle($('#twCursor'), FINE&&!PR, v=>document.body.classList.toggle('cursor-on',v));
toggle($('#twMotion'), true, v=>{
  document.body.classList.toggle('no-motion',!v);
  $$('.mascot [class*="ax-"], .m-float, .m-sway, .m-flicker').forEach(e=>e.style.animationPlayState=v?'running':'paused');
});
toggle($('#twEyes'), true, v=>{ eyesOn=v; if(!v){ const f=$('#heroFounder'); $$('.ax-blink circle',f).forEach(c=>c.style.transform=''); const s=f&&f.querySelector('svg'); if(s)s.style.transform=''; } });
$('#twReplay').addEventListener('click',()=>{ $('#twPanel').classList.remove('open'); try{sessionStorage.removeItem(SEEN_KEY);}catch(e){} window.scrollTo({top:0,behavior:'auto'}); playIntro(); });

const fab=$('#twFab'), panel=$('#twPanel');
fab.addEventListener('click',()=>panel.classList.toggle('open'));
document.addEventListener('click',e=>{ if(!panel.contains(e.target)&&!fab.contains(e.target)) panel.classList.remove('open'); });
window.addEventListener('message',e=>{ const d=e.data; if(d&&(d.type==='tweaks:toggle'||d.type==='toggleTweaks')) panel.classList.toggle('open'); });

onScroll();
})();
