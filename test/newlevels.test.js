const { solve, score, MACHINES } = require('../src/sim.js');
let pass = 0, fail = 0, n = 0;
const near = (a, b, l, tol = 1e-3) => {
  const ok = Math.abs(a - b) < tol;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}: ${a.toFixed(1)} / ${b.toFixed(1)}`); ok ? pass++ : fail++;
};
const yes = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? pass++ : fail++; };
const E = (t, r, x) => Object.assign({ id: 'e' + (++n), type: t, recipe: r }, x || {});
const L = (a, b, cap) => ({ id: 'l' + (++n), from: a.id, to: b.id, cap: cap || 60, path: [], length: 5 });
const check = (name, st, quota, parMach, parOre, depotPorts) => {
  const r = solve(st);
  console.log('\n— ' + name + ' —');
  for (const [k, v] of Object.entries(quota)) near(r.output[k] || 0, v, 'delivers ' + k);
  const sc = score(st, r);
  near(sc.machines, parMach, 'machine count');
  near(sc.ore, parOre, 'ore drawn');
  const bad = st.entities.filter((e) => MACHINES[e.type].cost && (e.f || 0) < 0.999);
  yes(bad.length === 0, bad.length ? 'machines below 100%: ' + bad.map((e) => e.type + ' ' + Math.round(e.f * 100) + '%').join(', ') : 'every machine at 100%');
  const inbound = st.links.filter((l) => {
    const d = st.entities.find((e) => e.id === l.to);
    return d && MACHINES[d.type].kind === 'sink';
  }).length;
  yes(inbound <= depotPorts, `depot needs ${inbound} belt(s), has ${depotPorts}`);
  const over = st.links.filter((l) => (l.flow || 0) > l.cap + 1e-6);
  yes(over.length === 0, 'no belt over capacity');
};

/* ---- 6: smelting plant. 120 ore in, 4 smelters, one fast belt out ---- */
{ n = 0;
  const m1 = E('miner','mine',{nodeRate:60}), m2 = E('miner','mine',{nodeRate:60});
  const mg = E('merger',null), s1 = E('splitter',null), s2 = E('splitter',null), s3 = E('splitter',null);
  const sm = [0,1,2,3].map(() => E('smelter','ingot'));
  const mo1 = E('merger',null), mo2 = E('merger',null), dp = E('sink',null);
  const links = [L(m1,mg,60), L(m2,mg,60), L(mg,s1,120), L(s1,s2,120), L(s1,s3,120),
    L(s2,sm[0]), L(s2,sm[1]), L(s3,sm[2]), L(s3,sm[3]),
    L(sm[0],mo1), L(sm[1],mo1), L(sm[2],mo2), L(sm[3],mo2), L(mo1,mo2,120), L(mo2,dp,120)];
  check('LV6 Smelting plant', { entities:[m1,m2,mg,s1,s2,s3,...sm,mo1,mo2,dp], links }, { ingot: 120 }, 6, 120, 1);
}

/* ---- 7: manifold. one trunk past six smelters ---- */
{ n = 0;
  const mi = [0,1,2].map(() => E('miner','mine',{nodeRate:60}));
  const trunk = E('merger',null);
  const sp = [0,1,2,3,4].map(() => E('splitter',null));
  const sm = [0,1,2,3,4,5].map(() => E('smelter','ingot'));
  const mo1 = E('merger',null), mo2 = E('merger',null), dp = E('sink',null);
  const links = [L(mi[0],trunk,60), L(mi[1],trunk,60), L(mi[2],trunk,60), L(trunk,sp[0],240)];
  for (let i = 0; i < 5; i++) {
    links.push(L(sp[i], sm[i]));
    links.push(i < 4 ? L(sp[i], sp[i+1], 240) : L(sp[i], sm[5]));
  }
  links.push(L(sm[0],mo1), L(sm[1],mo1), L(sm[2],mo1), L(sm[3],mo2), L(sm[4],mo2), L(sm[5],mo2));
  links.push(L(mo1,dp,120), L(mo2,dp,120));
  check('LV7 Manifold', { entities:[...mi,trunk,...sp,...sm,mo1,mo2,dp], links }, { ingot: 180 }, 9, 180, 2);
}

/* ---- 8: forced balancing. Mk1 only, so no trunk can carry the load ---- */
{ n = 0;
  const mi = [0,1,2].map(() => E('miner','mine',{nodeRate:60}));
  const sp = [0,1,2].map(() => E('splitter',null));
  const sm = [0,1,2,3,4,5].map(() => E('smelter','ingot'));
  const mg = [0,1,2].map(() => E('merger',null));
  const dp = E('sink',null);
  const links = [];
  for (let i = 0; i < 3; i++) {
    links.push(L(mi[i], sp[i], 60), L(sp[i], sm[i*2], 60), L(sp[i], sm[i*2+1], 60));
    links.push(L(sm[i*2], mg[i], 60), L(sm[i*2+1], mg[i], 60), L(mg[i], dp, 60));
  }
  check('LV8 Balanced load (Mk1 only)', { entities:[...mi,...sp,...sm,...mg,dp], links }, { ingot: 180 }, 9, 180, 3);
}

/* ---- 9: three identical ore-to-plate blocks ---- */
{ n = 0;
  const m1 = E('miner','mine',{nodeRate:60}), m2 = E('miner','mine',{nodeRate:30});
  const mg = E('merger',null), sp = E('splitter',null);
  const sm = [0,1,2].map(() => E('smelter','ingot'));
  const co = [0,1,2].map(() => E('constructor','plate'));
  const mo = E('merger',null), dp = E('sink',null);
  const links = [L(m1,mg,60), L(m2,mg,60), L(mg,sp,120)];
  for (let i = 0; i < 3; i++) links.push(L(sp,sm[i],60), L(sm[i],co[i],60), L(co[i],mo,60));
  links.push(L(mo,dp,60));
  check('LV9 Three of a kind', { entities:[m1,m2,mg,sp,...sm,...co,mo,dp], links }, { plate: 60 }, 8, 90, 1);
}

/* ---- 10: two reinforced-plate modules ---- */
{ n = 0;
  const ents = [], links = [];
  const dp = E('sink',null);
  for (let k = 0; k < 2; k++) {
    const mi = E('miner','mine',{nodeRate:60});
    const sp = E('splitter',null);
    const s1 = E('smelter','ingot'), s2 = E('smelter','ingot');
    const cp = E('constructor','plate'), cr = E('constructor','rod'), cs = E('constructor','screw');
    const asm = E('assembler','reinf');
    ents.push(mi,sp,s1,s2,cp,cr,cs,asm);
    links.push(L(mi,sp,60), L(sp,s1,60), L(sp,s2,60), L(s1,cp,60), L(s2,cr,60),
               L(cr,cs,60), L(cp,asm,60), L(cs,asm,120), L(asm,dp,60));
  }
  ents.push(dp);
  check('LV10 Reinforced line', { entities: ents, links }, { reinf: 20 }, 14, 120, 2);
}

/* every plot must physically hold its par machine count, with room to route */
console.log('\n— plots are big enough —');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const block = html.match(/const LEVELS = \[([\s\S]*?)\n\];/)[1];
const chunks = block.split(/(?=\n  \{ id: ')/).slice(1);
for (const c of chunks) {
  const id = c.match(/\{ id: '([A-Za-z0-9]+)'/)[1];
  const w = +c.match(/w: (\d+)/)[1], hh = +c.match(/h: (\d+)/)[1];
  const mach = +c.match(/machines: (\d+)/)[1];
  const belt = +c.match(/belt: (\d+)/)[1];
  /* a machine averages about 6 square metres; belts and clearance need at least as
     much again, so a plot under three times the machine area will not route */
  const area = w * hh, need = mach * 6 * 3;
  yes(area >= need, `${id}: ${w}x${hh} = ${area} m2 for ${mach} machines (needs >= ${need})`);
  yes(belt > 0 && belt < area, `${id}: belt target ${belt} m is plausible for the plot`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
