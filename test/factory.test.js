/* Nested factories: definitions are shared, instances are independent at solve time. */
const { solveNested, flatten, MACHINES, MAX_NESTING } = require('../src/sim.js');

let pass = 0, fail = 0;
const near = (a, b, l, tol = 1e-3) => {
  const ok = Math.abs(a - b) < tol;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}: got ${a.toFixed(3)}, want ${b.toFixed(3)}`);
  ok ? pass++ : fail++;
};
const eq = (a, b, l) => {
  const ok = a === b;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}: got ${a}, want ${b}`);
  ok ? pass++ : fail++;
};
const truthy = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? pass++ : fail++; };

let n = 0;
const E = (t, r, x) => Object.assign({ id: 'e' + (++n), type: t, recipe: r }, x || {});
const L = (a, b, cap, extra) => Object.assign(
  { id: 'l' + (++n), from: a.id, to: b.id, cap: cap || 60, path: [], length: 5 }, extra || {});

/* ---- a "smelting" factory: one ore input, one ingot output ---- */
function smeltingDef() {
  const tin = E('termIn', null, { index: 0 });
  const sm = E('smelter', 'ingot');
  const tout = E('termOut', null, { index: 0 });
  return { entities: [tin, sm, tout], links: [L(tin, sm), L(sm, tout)] };
}

console.log('\n— one instance —');
{
  const defs = { smelt: smeltingDef() };
  const m = E('miner', 'mine', { nodeRate: 30 });
  const fac = E('factory', null, { defId: 'smelt' });
  const dp = E('sink', null);
  const root = {
    entities: [m, fac, dp],
    links: [L(m, fac, 60, { toPort: 0 }), L(fac, dp, 60, { fromPort: 0 })],
  };
  const r = solveNested(root, defs);
  near(r.output.ingot || 0, 30, 'a factory turns 30 ore into 30 ingots');
  eq(fac.state, 'running', 'the instance reports the state of its contents');
  near(fac.f, 1, 'and its efficiency');
  eq(fac.innerCount, 1, 'it contains one working machine');
}

console.log('\n— three instances of one definition, fed different rates —');
{
  const defs = { smelt: smeltingDef() };
  const m1 = E('miner', 'mine', { nodeRate: 30 });
  const m2 = E('miner', 'mine', { nodeRate: 15 });
  const f1 = E('factory', null, { defId: 'smelt' });
  const f2 = E('factory', null, { defId: 'smelt' });
  const f3 = E('factory', null, { defId: 'smelt' });   /* nothing wired in */
  const dp = E('sink', null);
  const root = {
    entities: [m1, m2, f1, f2, f3, dp],
    links: [
      L(m1, f1, 60, { toPort: 0 }), L(f1, dp, 60, { fromPort: 0 }),
      L(m2, f2, 60, { toPort: 0 }), L(f2, dp, 60, { fromPort: 0 }),
      L(f3, dp, 60, { fromPort: 0 }),
    ],
  };
  const r = solveNested(root, defs);
  near(r.output.ingot || 0, 45, 'the depot receives 30 + 15 + 0 ingots');
  near(f1.f, 1, 'the fully fed instance runs at 100%');
  near(f2.f, 0.5, 'the half fed instance runs at 50%');
  near(f3.f, 0, 'the unfed instance does nothing');
  truthy(f1.f !== f2.f, 'instances sharing a definition behave independently');
}

console.log('\n— editing the definition changes every instance —');
{
  const defs = { smelt: smeltingDef() };
  const m1 = E('miner', 'mine', { nodeRate: 30 });
  const m2 = E('miner', 'mine', { nodeRate: 30 });
  const f1 = E('factory', null, { defId: 'smelt' });
  const f2 = E('factory', null, { defId: 'smelt' });
  const dp = E('sink', null);
  const root = {
    entities: [m1, m2, f1, f2, dp],
    links: [
      L(m1, f1, 60, { toPort: 0 }), L(f1, dp, 60, { fromPort: 0 }),
      L(m2, f2, 60, { toPort: 0 }), L(f2, dp, 60, { fromPort: 0 }),
    ],
  };
  near(solveNested(root, defs).output.ingot || 0, 60, 'two instances make 60 ingots');

  /* add a constructor inside: ingots become plates, for both instances at once */
  const d = defs.smelt;
  const co = E('constructor', 'plate');
  const sm = d.entities.find((x) => x.type === 'smelter');
  const tout = d.entities.find((x) => x.type === 'termOut');
  d.entities.push(co);
  d.links = d.links.filter((l) => !(l.from === sm.id && l.to === tout.id));
  d.links.push(L(sm, co), L(co, tout));

  const r2 = solveNested(root, defs);
  near(r2.output.plate || 0, 40, 'after one edit both instances make plates: 20 + 20');
  near(r2.output.ingot || 0, 0, 'and neither delivers ingots any more');
}

console.log('\n— unlinking a copy —');
{
  const defs = { smelt: smeltingDef(), smeltCopy: smeltingDef() };
  const m1 = E('miner', 'mine', { nodeRate: 30 });
  const m2 = E('miner', 'mine', { nodeRate: 30 });
  const f1 = E('factory', null, { defId: 'smelt' });
  const f2 = E('factory', null, { defId: 'smeltCopy' });   /* unlinked: own definition */
  const dp = E('sink', null);
  const root = {
    entities: [m1, m2, f1, f2, dp],
    links: [
      L(m1, f1, 60, { toPort: 0 }), L(f1, dp, 60, { fromPort: 0 }),
      L(m2, f2, 60, { toPort: 0 }), L(f2, dp, 60, { fromPort: 0 }),
    ],
  };
  /* change only the unlinked one */
  const d = defs.smeltCopy;
  const co = E('constructor', 'rod');
  const sm = d.entities.find((x) => x.type === 'smelter');
  const tout = d.entities.find((x) => x.type === 'termOut');
  d.links = d.links.filter((l) => !(l.from === sm.id && l.to === tout.id));
  d.entities.push(co);
  d.links.push(L(sm, co), L(co, tout));

  const r = solveNested(root, defs);
  near(r.output.ingot || 0, 30, 'the linked instance is untouched');
  near(r.output.rod || 0, 30, 'the unlinked one produces its own thing');
}

console.log('\n— nesting —');
{
  const defs = { smelt: smeltingDef() };
  /* an outer factory that contains the smelting factory plus a constructor */
  const tin = E('termIn', null, { index: 0 });
  const inner = E('factory', null, { defId: 'smelt' });
  const co = E('constructor', 'plate');
  const tout = E('termOut', null, { index: 0 });
  defs.plated = {
    entities: [tin, inner, co, tout],
    links: [L(tin, inner, 60, { toPort: 0 }), L(inner, co, 60, { fromPort: 0 }), L(co, tout)],
  };
  const m = E('miner', 'mine', { nodeRate: 30 });
  const fac = E('factory', null, { defId: 'plated' });
  const dp = E('sink', null);
  const root = {
    entities: [m, fac, dp],
    links: [L(m, fac, 60, { toPort: 0 }), L(fac, dp, 60, { fromPort: 0 })],
  };
  const r = solveNested(root, defs);
  near(r.output.plate || 0, 20, 'a factory inside a factory works: 30 ore -> 20 plates');
  eq(fac.innerCount, 2, 'the outer instance counts machines at every depth');
  const flat = flatten(root, defs);
  eq(flat.entities.filter((e) => e.type === 'smelter').length, 1, 'flattening produced one smelter');
  eq(flat.entities.filter((e) => e.type === 'constructor').length, 1, 'and one constructor');
}

console.log('\n— a factory may not contain itself —');
{
  const defs = {};
  const tin = E('termIn', null, { index: 0 });
  const self = E('factory', null, { defId: 'loop' });
  const tout = E('termOut', null, { index: 0 });
  defs.loop = { entities: [tin, self, tout], links: [L(tin, self, 60, { toPort: 0 }), L(self, tout, 60, { fromPort: 0 })] };
  const fac = E('factory', null, { defId: 'loop' });
  const dp = E('sink', null);
  const root = { entities: [fac, dp], links: [L(fac, dp, 60, { fromPort: 0 })] };
  const r = solveNested(root, defs);
  truthy(!!r.error, `recursion is refused rather than hanging (${r.error})`);
  near(r.output.plate || 0, 0, 'and nothing is produced');
}

console.log('\n— a port with nothing wired to it inside —');
{
  const defs = { smelt: smeltingDef() };
  const m = E('miner', 'mine', { nodeRate: 30 });
  const fac = E('factory', null, { defId: 'smelt' });
  const dp = E('sink', null);
  const root = {
    entities: [m, fac, dp],
    /* port 1 does not exist inside the definition */
    links: [L(m, fac, 60, { toPort: 1 }), L(fac, dp, 60, { fromPort: 0 })],
  };
  const r = solveNested(root, defs);
  near(r.output.ingot || 0, 0, 'material sent to an unwired port goes nowhere');
  truthy(!r.error, 'and it does not throw');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
