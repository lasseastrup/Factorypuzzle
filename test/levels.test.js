const { solve, score, MACHINES } = require('../src/sim.js');

let pass=0, fail=0;
const ok=(c,l)=>{console.log(`${c?'  ok  ':' FAIL '} ${l}`); c?pass++:fail++;};

function build(spec){
  let n=0;
  const ents=[], links=[];
  const E=(type,recipe,extra)=>{const e=Object.assign({id:'e'+(++n),type,recipe},extra||{});ents.push(e);return e;};
  const Lk=(a,b,cap)=>{links.push({id:'l'+(++n),from:a.id,to:b.id,cap,path:new Array(6).fill([0,0])});};
  return spec(E,Lk,{entities:ents,links,ents});
}

/* --- LV1: 30 ingots --- */
let r=build((E,Lk,S)=>{
  const m=E('miner','mine',{nodeRate:30}), s=E('smelter','ingot'), d=E('sink',null);
  Lk(m,s,60); Lk(s,d,60); return S;
});
let out=solve(r);
ok(Math.abs((out.output.ingot||0)-30)<1e-3, 'LV1 makes 30 ingots/min');
ok(r.ents.every(e=>MACHINES[e.type].kind==='sink'||e.f>0.999), 'LV1 all machines at 100%');
ok(score(r,out).machines===2, 'LV1 par machines = 2');

/* --- LV2: 20 plates --- */
r=build((E,Lk,S)=>{
  const m=E('miner','mine',{nodeRate:30}), s=E('smelter','ingot'), c=E('constructor','plate'), d=E('sink',null);
  Lk(m,s,60); Lk(s,c,60); Lk(c,d,60); return S;
});
out=solve(r);
ok(Math.abs((out.output.plate||0)-20)<1e-3, 'LV2 makes 20 plates/min');
ok(r.ents.every(e=>MACHINES[e.type].kind==='sink'||e.f>0.999), 'LV2 all machines at 100%');
ok(score(r,out).machines===3, 'LV2 par machines = 3');

/* --- LV3: 90 screws. One output port per machine means 90/min cannot leave
       on a Mk1 belt at all — the level is only solvable with a Mk2 upgrade. --- */
r=build((E,Lk,S)=>{
  const m=E('miner','mine',{nodeRate:30}), s=E('smelter','ingot'),
        cr=E('constructor','rod'), cs=E('constructor','screw'), d=E('sink',null);
  Lk(m,s,60); Lk(s,cr,60); Lk(cr,cs,60); Lk(cs,d,120); return S;
});
out=solve(r);
ok(Math.abs((out.output.screw||0)-90)<1e-3, 'LV3 makes 90 screws/min on Mk2');
ok(r.ents.every(e=>MACHINES[e.type].kind==='sink'||e.f>0.999), 'LV3 all machines at 100%');
ok(score(r,out).machines===4, 'LV3 par machines = 4');

/* and confirm Mk1 genuinely fails, so the level teaches what it claims */
r=build((E,Lk,S)=>{
  const m=E('miner','mine',{nodeRate:30}), s=E('smelter','ingot'),
        cr=E('constructor','rod'), cs=E('constructor','screw'), d=E('sink',null);
  Lk(m,s,60); Lk(s,cr,60); Lk(cr,cs,60); Lk(cs,d,60); return S;
});
out=solve(r);
ok((out.output.screw||0) < 90-1e-3, 'LV3 with Mk1 falls short (' + (out.output.screw||0).toFixed(0) + '/90)');
ok(out.bottlenecks.length===1, 'LV3 names exactly one bottleneck belt');

/* --- LV4: 10 reinforced plates --- */
r=build((E,Lk,S)=>{
  const m1=E('miner','mine',{nodeRate:30}), m2=E('miner','mine',{nodeRate:30});
  const s1=E('smelter','ingot'), s2=E('smelter','ingot');
  const cp=E('constructor','plate'), cr=E('constructor','rod'), cs=E('constructor','screw');
  const a=E('assembler','reinf'), d=E('sink',null);
  Lk(m1,s1,60); Lk(m2,s2,60); Lk(s1,cp,60); Lk(s2,cr,60);
  Lk(cr,cs,60); Lk(cp,a,60); Lk(cs,a,120); Lk(a,d,60); return S;
});
out=solve(r);
ok(Math.abs((out.output.reinf||0)-10)<1e-3, 'LV4 makes 10 reinforced plates/min');
ok(r.ents.every(e=>MACHINES[e.type].kind==='sink'||e.f>0.999), 'LV4 all machines at 100%');
ok(score(r,out).machines===8, 'LV4 par machines = 8');

/* --- LV5: 20 plates + 30 rods off one 60 node, splitter required --- */
r=build((E,Lk,S)=>{
  const m=E('miner','mine',{nodeRate:60}), sp=E('splitter',null);
  const s1=E('smelter','ingot'), s2=E('smelter','ingot');
  const cp=E('constructor','plate'), cr=E('constructor','rod'), d=E('sink',null);
  Lk(m,sp,60); Lk(sp,s1,60); Lk(sp,s2,60); Lk(s1,cp,60); Lk(s2,cr,60);
  Lk(cp,d,60); Lk(cr,d,60); return S;
});
out=solve(r);
ok(Math.abs((out.output.plate||0)-20)<1e-3, 'LV5 makes 20 plates/min');
ok(Math.abs((out.output.rod||0)-30)<1e-3, 'LV5 makes 30 rods/min');
ok(r.ents.every(e=>MACHINES[e.type].kind==='sink'||e.f>0.999), 'LV5 all machines at 100%');
ok(score(r,out).machines===5, 'LV5 par machines = 5');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
