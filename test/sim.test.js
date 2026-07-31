const { solve, score } = require('../src/sim.js');

let pass = 0, fail = 0;
function near(a, b, label, tol = 1e-3) {
  const ok = Math.abs(a - b) < tol;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}: got ${a.toFixed(3)}, want ${b.toFixed(3)}`);
  ok ? pass++ : fail++;
}
function eq(a, b, label) {
  const ok = a === b;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}: got ${a}, want ${b}`);
  ok ? pass++ : fail++;
}

/* Build the par solution from GDD §6:
   2 miners -> 2 smelters; one ingot line to plate, the other to rod -> screw;
   plate + screw -> assembler -> depot. */
function parFactory(screwBeltCap) {
  const E = (id, type, recipe, extra) => Object.assign({ id, type, recipe }, extra || {});
  const entities = [
    E('m1', 'miner', 'mine'), E('m2', 'miner', 'mine'),
    E('s1', 'smelter', 'ingot'), E('s2', 'smelter', 'ingot'),
    E('cPlate', 'constructor', 'plate'),
    E('cRod', 'constructor', 'rod'),
    E('cScrew', 'constructor', 'screw'),
    E('asm', 'assembler', 'reinf'),
    E('depot', 'sink', null),
  ];
  const L = (from, to, cap) => ({ id: from + '>' + to, from, to, cap, path: [] });
  const links = [
    L('m1', 's1', 60), L('m2', 's2', 60),
    L('s1', 'cPlate', 60), L('s2', 'cRod', 60),
    L('cRod', 'cScrew', 60),
    L('cPlate', 'asm', 60),
    L('cScrew', 'asm', screwBeltCap),
    L('asm', 'depot', 60),
  ];
  return { entities, links };
}

console.log('\n— par solution, Mk2 belt on the screw line (120/min) —');
let st = parFactory(120);
let r = solve(st);
near(r.output.reinf || 0, 10, 'reinforced plates/min');
for (const id of ['m1', 'm2', 's1', 's2', 'cPlate', 'cRod', 'cScrew', 'asm']) {
  const e = st.entities.find((x) => x.id === id);
  near(e.f, 1, `${id} efficiency`);
}
const sc = score(st, r);
eq(sc.machines, 8, 'machine count');
near(sc.ore, 60, 'ore consumed/min');

console.log('\n— same build, Mk1 belt on the screw line (60/min cap) —');
console.log('  the 90 screws/min will not fit; expect a cascade back up the rod line');
st = parFactory(60);
r = solve(st);
near(r.output.reinf || 0, 6.667, 'reinforced plates/min (throttled)');
const g = (id) => st.entities.find((x) => x.id === id);
near(g('cScrew').f, 0.6667, 'screw constructor efficiency');
eq(g('cScrew').state, 'blocked', 'screw constructor state');
near(g('cRod').f, 0.6667, 'rod constructor efficiency');
near(g('asm').f, 0.6667, 'assembler efficiency');
eq(g('asm').state, 'throttled', 'assembler state');
console.log('  assembler deficits:', g('asm').deficits);
near(g('cPlate').f, 0.6667, 'plate constructor throttled by backpressure');
eq(g('cPlate').state, 'throttled', 'plate constructor state');
console.log('  root cause:', g('cScrew').isRootCause ? 'screw constructor' : '?', '| everyone else blames link', g('cPlate').limitedBy && g('cPlate').limitedBy.id);

console.log('\n— one miner short: 1 miner feeding the whole chain —');
st = parFactory(120);
st.entities = st.entities.filter((e) => e.id !== 'm2');
st.links = st.links.filter((l) => l.from !== 'm2');
r = solve(st);
console.log('  output:', (r.output.reinf || 0).toFixed(3), '/min');
near(g('s2') ? g('s2').f : 0, 0, 'orphaned smelter is stopped');

console.log('\n— multi-output level, rung 4: shared ore node —');
{
  const entities = [
    { id: 'm1', type: 'miner', recipe: 'mine', nodeRate: 60 },
    { id: 'sp', type: 'splitter', recipe: null },
    { id: 's1', type: 'smelter', recipe: 'ingot' },
    { id: 's2', type: 'smelter', recipe: 'ingot' },
    { id: 'cP', type: 'constructor', recipe: 'plate' },
    { id: 'cR', type: 'constructor', recipe: 'rod' },
    { id: 'depot', type: 'sink', recipe: null },
  ];
  const links = [
    { id: 'a', from: 'm1', to: 'sp', cap: 120, path: [] },
    { id: 'b', from: 'sp', to: 's1', cap: 60, path: [] },
    { id: 'c', from: 'sp', to: 's2', cap: 60, path: [] },
    { id: 'd', from: 's1', to: 'cP', cap: 60, path: [] },
    { id: 'e', from: 's2', to: 'cR', cap: 60, path: [] },
    { id: 'f', from: 'cP', to: 'depot', cap: 60, path: [] },
    { id: 'g', from: 'cR', to: 'depot', cap: 60, path: [] },
  ];
  const s2 = { entities, links };
  const r2 = solve(s2);
  near(r2.output.plate || 0, 20, 'plates/min');
  near(r2.output.rod || 0, 30, 'rods/min');
  console.log('  a 60/min node splits evenly into 30+30 ingots — both lines at 100%');
}


console.log('\n— conservation across passthroughs —');
{
  let k = 0;
  const E = (t, r, x) => Object.assign({ id: 'c' + (++k), type: t, recipe: r }, x || {});
  const ents = [
    E('miner', 'mine', { nodeRate: 60 }), E('splitter', null),
    E('smelter', 'ingot'), E('sink', null),
  ];
  const [m, sp, sm, dp] = ents;
  const links = [
    { id: 'k1', from: m.id, to: sp.id, cap: 60, path: [], length: 5 },
    { id: 'k2', from: sp.id, to: sm.id, cap: 60, path: [], length: 5 },
    { id: 'k3', from: sm.id, to: dp.id, cap: 60, path: [], length: 5 },
  ];
  const st = { entities: ents, links };
  const res = solve(st);
  near(links[0].flow, links[1].flow, 'splitter conserves mass: in equals out');
  near(m.f, 0.5, 'a miner feeding a half-used splitter runs at 50%');
  eq(m.state, 'blocked', 'and reads as blocked, not running');
  near(score(st, res).ore, 30, 'the ore metric reports what the node actually gives up');
}

console.log('\n— a fully wired splitter uses the whole node —');
{
  let k = 0;
  const E = (t, r, x) => Object.assign({ id: 'd' + (++k), type: t, recipe: r }, x || {});
  const ents = [
    E('miner', 'mine', { nodeRate: 60 }), E('splitter', null),
    E('smelter', 'ingot'), E('smelter', 'ingot'),
    E('constructor', 'plate'), E('constructor', 'rod'), E('sink', null),
  ];
  const [m, sp, s1, s2, cP, cR, dp] = ents;
  const L = (a, b) => ({ id: 'x' + (++k), from: a.id, to: b.id, cap: 60, path: [], length: 5 });
  const links = [L(m, sp), L(sp, s1), L(sp, s2), L(s1, cP), L(s2, cR), L(cP, dp), L(cR, dp)];
  const st = { entities: ents, links };
  const res = solve(st);
  near(res.output.plate || 0, 20, 'level 5 par: 20 plates/min');
  near(res.output.rod || 0, 30, 'level 5 par: 30 rods/min');
  near(m.f, 1, 'the miner runs flat out');
  near(score(st, res).ore, 60, 'the whole 60/min node is used');
  near(links[1].flow, 30, 'splitter sends 30 down one branch');
  near(links[2].flow, 30, 'and 30 down the other');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
