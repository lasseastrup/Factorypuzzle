/* RATIO — simulation core.
   Pure data + math. No rendering, no DOM. Testable headlessly.
   All rates are items per minute. Throughput is resolved as a steady-state
   flow network, then the renderer animates toward it (§5.1). */

const ITEMS = {
  ore:   { name: 'Iron Ore',        color: 0x8d7b6b, short: 'ORE' },
  ingot: { name: 'Iron Ingot',      color: 0xd8dee5, short: 'ING' },
  plate: { name: 'Iron Plate',      color: 0x7fa8c9, short: 'PLT' },
  rod:   { name: 'Iron Rod',        color: 0xc9b27f, short: 'ROD' },
  screw: { name: 'Screw',           color: 0xb98be0, short: 'SCR' },
  reinf: { name: 'Reinforced Plate',color: 0x5fd0a8, short: 'RFP' },
};

/* Footprints and recipes per GDD §6. Rates are multiples of 5 by design rule. */
const MACHINES = {
  miner: {
    name: 'Miner', w: 2, h: 2, kind: 'miner', cost: 1,
    recipes: [{ id: 'mine', label: 'Extract', in: {}, out: { ore: 30 } }],
    note: 'On a node: 30/min (impure 15, pure 60)',
  },
  smelter: {
    name: 'Smelter', w: 2, h: 2, kind: 'machine', cost: 1,
    recipes: [{ id: 'ingot', label: 'Iron Ingot', in: { ore: 30 }, out: { ingot: 30 } }],
  },
  constructor: {
    name: 'Constructor', w: 2, h: 3, kind: 'machine', cost: 1,
    recipes: [
      { id: 'plate', label: 'Iron Plate', in: { ingot: 30 }, out: { plate: 20 } },
      { id: 'rod',   label: 'Iron Rod',   in: { ingot: 30 }, out: { rod: 30 } },
      { id: 'screw', label: 'Screw',      in: { rod: 30 },   out: { screw: 90 } },
    ],
  },
  assembler: {
    name: 'Assembler', w: 3, h: 4, kind: 'machine', cost: 1,
    recipes: [{ id: 'reinf', label: 'Reinforced Plate', in: { plate: 20, screw: 90 }, out: { reinf: 10 } }],
  },
  splitter: { name: 'Splitter', w: 1, h: 1, kind: 'splitter', cost: 0, recipes: [] },
  merger:   { name: 'Merger',   w: 1, h: 1, kind: 'merger',   cost: 0, recipes: [] },
  sink:     { name: 'Depot',    w: 2, h: 2, kind: 'sink',     cost: 0, recipes: [] },
};

const BELTS = [
  { id: 1, name: 'Mk1', cap: 60,  color: 0x6b7a8f },
  { id: 2, name: 'Mk2', cap: 120, color: 0x4c8fb5 },
  { id: 3, name: 'Mk3', cap: 240, color: 0xb5904c },
];

const EPS = 1e-7;

/* ---------- helpers ---------- */

/* Distribute `total` across branches, each with its own ceiling.
   Even split, with the remainder redistributed to branches that still have room.
   This is round-robin-with-backpressure: if one output is full, the others take more. */
function waterfill(total, caps) {
  const alloc = caps.map(() => 0);
  let remaining = total;
  let active = caps.map((c, i) => i).filter((i) => caps[i] > EPS);
  let guard = 0;
  while (remaining > EPS && active.length && guard++ < 64) {
    const share = remaining / active.length;
    let moved = 0;
    for (const i of active) {
      const give = Math.min(share, caps[i] - alloc[i]);
      alloc[i] += give;
      remaining -= give;
      moved += give;
    }
    active = active.filter((i) => alloc[i] < caps[i] - EPS);
    if (moved <= EPS) break;
  }
  return alloc;
}

function recipeOf(ent) {
  const def = MACHINES[ent.type];
  if (!def || !def.recipes.length) return null;
  return def.recipes.find((r) => r.id === ent.recipe) || null;
}

/* ---------- the solver ----------
   Two passes, because one is not enough.

   Pass A (potential): flow forward from the miners ignoring belt capacity and
   ignoring backpressure. This is the factory's theoretical ceiling. It exists so
   the diagnostics can answer "where did it go wrong" rather than only "how fast".

   Pass B (actual): iterate with capacities and backpressure, seeded from full
   demand and relaxing downward. A machine always OFFERS its supply-limited output
   and we measure how much the world takes; if we shrank the offer to match the
   accepted amount instead, the fixed point would oscillate.

   Seeding optimistically also dodges the deadlock a naive formulation hits: an
   assembler needing plates AND screws will refuse to ask for either while both are
   absent, and sit at zero forever. */
function solve(state, opts) {
  /* opts.roomy(link) -> true while a belt still has physical space on it.
     Steady state alone says an unfinished chain is entirely jammed with nothing
     moving, which is true eventually but not what happens first: each machine runs
     until its own output belt is full, so material fills the line from the front.
     Treating a belt with room as able to accept at capacity reproduces that, and
     converges to the steady solution as the belts fill. */
  const roomy = (opts && opts.roomy) || (() => false);
  const ents = state.entities;
  const links = state.links;
  const byId = new Map(ents.map((e) => [e.id, e]));

  const outLinks = new Map(ents.map((e) => [e.id, []]));
  const inLinks = new Map(ents.map((e) => [e.id, []]));
  for (const l of links) { l.flow = 0; l.potFlow = 0; l.want = 0; l.item = null; }
  for (const l of links) {
    if (!byId.has(l.from) || !byId.has(l.to)) continue;
    outLinks.get(l.from).push(l);
    inLinks.get(l.to).push(l);
  }
  const order = topoOrder(ents, links, outLinks);

  /* ---------- pass A: potential ---------- */
  const potIn = new Map(ents.map((e) => [e.id, {}]));
  for (const id of order) {
    const e = byId.get(id);
    const def = MACHINES[e.type];
    const a = potIn.get(id);
    let offer = {};
    if (def.kind === 'miner') {
      offer = { ore: e.nodeRate != null ? e.nodeRate : recipeOf(e).out.ore };
      e.fPot = 1;
    } else if (def.kind === 'splitter' || def.kind === 'merger') {
      offer = Object.assign({}, a);
      e.fPot = 1;
    } else if (def.kind === 'sink') {
      e.fPot = 1;
    } else {
      const r = recipeOf(e);
      if (!r) { e.fPot = 0; }
      else {
        let f = 1;
        for (const i of Object.keys(r.in)) f = Math.min(f, (a[i] || 0) / r.in[i]);
        if (!Object.keys(r.in).length) f = 1;
        e.fPot = Math.max(0, f);
        for (const i of Object.keys(r.out)) offer[i] = r.out[i] * e.fPot;
      }
    }
    e.potOut = offer;
    const outs = outLinks.get(id);
    for (const item of Object.keys(offer)) {
      if (offer[item] <= EPS || !outs.length) continue;
      const share = offer[item] / outs.length;
      for (const l of outs) {
        l.potFlow = (l.potFlow || 0) + share;
        const d = potIn.get(l.to);
        d[item] = (d[item] || 0) + share;
      }
    }
  }

  /* ---------- pass B: actual ---------- */
  const avail = new Map(ents.map((e) => [e.id, {}]));
  const accept = new Map(ents.map((e) => [e.id, 1]));
  for (const e of ents) e.f = 1;

  const revOrder = order.slice().reverse();
  for (let iter = 0; iter < 60; iter++) {
    /* Demand pass, walked in reverse topological order so that a passthrough knows
       what its own outputs will actually accept before it states its demand.
       Summing raw capacities instead was a conservation bug: a splitter with one
       branch wired asked for everything its belts could carry, the miner happily
       ran at 100%, and the surplus simply disappeared at the splitter with no
       indication that half the node was being thrown away. */
    const demand = new Map();
    for (const id of revOrder) {
      const e = byId.get(id);
      const def = MACHINES[e.type];
      const d = {};
      if (def.kind === 'sink') d['*'] = Infinity;
      else if (def.kind === 'splitter' || def.kind === 'merger') {
        let onward = 0;
        for (const l of outLinks.get(e.id)) {
          const dest = byId.get(l.to);
          const dd = (dest && demand.get(dest.id)) || {};
          let want;
          if (roomy(l)) want = l.cap;                 /* still space on the belt */
          else if (dd['*'] != null) want = dd['*'];
          else if (l.item != null) want = dd[l.item] || 0;
          else want = l.cap;          /* nothing has flowed yet: assume it will fit */
          onward += Math.min(l.cap, want);
        }
        d['*'] = onward;
      } else {
        const r = recipeOf(e);
        if (r) for (const i of Object.keys(r.in)) d[i] = r.in[i] * Math.max(0, Math.min(1, e.f));
      }
      demand.set(e.id, d);
    }

    for (const e of ents) avail.set(e.id, {});
    for (const l of links) { l.flow = 0; l.want = 0; l.item = null; }

    for (const id of order) {
      const e = byId.get(id);
      const def = MACHINES[e.type];
      const a = avail.get(id);
      let offer = {};

      if (def.kind === 'miner') {
        offer = { ore: e.nodeRate != null ? e.nodeRate : recipeOf(e).out.ore };
        e.fIn = 1;
      } else if (def.kind === 'splitter' || def.kind === 'merger') {
        offer = Object.assign({}, a);
        e.fIn = 1;
      } else if (def.kind === 'sink') {
        e.fIn = 1;
      } else {
        const r = recipeOf(e);
        if (!r) { e.fIn = 0; }
        else {
          let f = 1;
          for (const i of Object.keys(r.in)) f = Math.min(f, (a[i] || 0) / r.in[i]);
          if (!Object.keys(r.in).length) f = 1;
          e.fIn = Math.max(0, Math.min(1, f));
          /* offer the supply-limited output, NOT the accepted output */
          for (const i of Object.keys(r.out)) offer[i] = r.out[i] * e.fIn;
        }
      }
      e.offer = offer;

      const outs = outLinks.get(id);
      let offered = 0, moved = 0;
      for (const item of Object.keys(offer)) {
        const amount = offer[item];
        offered += amount;
        if (amount <= EPS || !outs.length) continue;
        const caps = outs.map((l) => {
          if (roomy(l)) return Math.max(0, l.cap - (l.flow || 0));
          const dest = byId.get(l.to);
          const dd = demand.get(dest.id);
          const want = dd['*'] != null ? dd['*'] : (dd[item] || 0);
          const other = inflowOf(dest, item, inLinks, l);
          return Math.max(0, Math.min(l.cap - (l.flow || 0), want - other));
        });
        const alloc = waterfill(amount, caps);
        /* What the source wanted to push, regardless of what was accepted. A belt
           whose destination cannot take delivery still has ore put onto it — it
           backs up rather than staying empty — and the renderer needs both the
           attempt and the outcome to show that. */
        const share = amount / Math.max(1, outs.length);
        outs.forEach((l) => {
          if (l.item == null || l.item === item) { l.item = item; l.want = (l.want || 0) + share; }
        });
        outs.forEach((l, k) => {
          if (alloc[k] <= EPS) return;
          l.flow = (l.flow || 0) + alloc[k];
          l.item = item;
          const dest = avail.get(l.to);
          dest[item] = (dest[item] || 0) + alloc[k];
          moved += alloc[k];
        });
      }
      accept.set(id, offered > EPS ? Math.min(1, moved / offered) : 1);
      e.accept = accept.get(id);
      e.f = Math.min(e.fIn, e.accept);
    }
  }

  /* ---------- diagnostics ---------- */
  const result = { output: {}, machines: [], links, bottlenecks: [] };
  for (const l of links) {
    l.saturated = l.flow >= l.cap - 1e-4;
    l.overCapacity = (l.potFlow || 0) > l.cap + 1e-4;
    if (l.saturated && l.overCapacity) result.bottlenecks.push(l);
  }

  /* How fast the destination actually takes material off each belt. A belt
     accumulates at flow minus drain — not at want minus flow, which misses the case
     that matters: material arriving at a machine that cannot consume it. Without
     this the belt would carry cargo into a stopped machine and the cargo would
     simply cease to exist. */
  for (const l of links) {
    const dest = byId.get(l.to);
    if (!dest) { l.drain = 0; continue; }
    const def = MACHINES[dest.type];
    if (def.kind === 'sink') {
      l.drain = l.flow || 0;
    } else if (def.kind === 'splitter' || def.kind === 'merger') {
      const ins = (inLinks.get(dest.id) || []).reduce((t, x) => t + (x.flow || 0), 0);
      const outsT = (outLinks.get(dest.id) || []).reduce((t, x) => t + (x.flow || 0), 0);
      l.drain = ins > EPS ? ((l.flow || 0) / ins) * Math.min(ins, outsT) : 0;
    } else {
      const r = recipeOf(dest);
      const need = (r && l.item) ? (r.in[l.item] || 0) * Math.max(0, dest.f || 0) : 0;
      l.drain = Math.min(l.flow || 0, need);
    }
  }
  for (const e of ents) {
    const def = MACHINES[e.type];
    const r = recipeOf(e);
    const a = avail.get(e.id);
    e.avail = a;
    e.deficits = {};
    if (r) for (const i of Object.keys(r.in)) {
      const short = r.in[i] * Math.min(1, e.fPot || 1) - (a[i] || 0);
      if (short > 1e-4) e.deficits[i] = short;
    }
    e.state = classify(e, def, outLinks.get(e.id) || []);
    if (def.kind === 'sink') for (const i of Object.keys(a)) result.output[i] = (result.output[i] || 0) + a[i];
    result.machines.push(e);
  }

  /* Attribute blame. At steady state a throttle has propagated through the whole
     chain, so every machine honestly reports itself starved and the actual culprit
     is invisible. Walk out from each bottleneck belt across the graph and let every
     affected machine name the belt responsible — this is the tap-to-trace of §5.4. */
  if (result.bottlenecks.length) {
    const dist = new Map();
    const blame = new Map();
    const queue = [];
    for (const l of result.bottlenecks) {
      const src = byId.get(l.from);
      if (src) { dist.set(l.from, 0); blame.set(l.from, l); queue.push(l.from); src.isRootCause = true; }
    }
    while (queue.length) {
      const id = queue.shift();
      const d = dist.get(id);
      const neighbours = [];
      for (const l of outLinks.get(id) || []) neighbours.push(l.to);
      for (const l of inLinks.get(id) || []) neighbours.push(l.from);
      for (const n of neighbours) {
        if (dist.has(n)) continue;
        dist.set(n, d + 1);
        blame.set(n, blame.get(id));
        queue.push(n);
      }
    }
    for (const e of ents) {
      if (!blame.has(e.id) || e.f > 0.9999) continue;
      e.limitedBy = blame.get(e.id);
      if (!e.isRootCause && e.state !== 'stopped') e.state = 'throttled';
    }
  }
  return result;
}

/* how much of `item` is already arriving at dest from links other than `exclude` */
function inflowOf(dest, item, inLinks, exclude) {
  let s = 0;
  for (const l of inLinks.get(dest.id)) {
    if (l === exclude) continue;
    if (l.item === item) s += l.flow || 0;
  }
  return s;
}

/* the diagnostic vocabulary of §5.4.
   Note the ordering: a machine whose output belt is saturated *and* over its
   potential is the root cause, and gets named as such. A machine whose output
   simply isn't being taken is blocked but not the culprit. Starvation is last,
   because most starvation in a factory is somebody else's blockage. */
function classify(e, def, outs) {
  if (def.kind === 'splitter' || def.kind === 'merger' || def.kind === 'sink') return 'passive';
  const r = recipeOf(e);
  if (!r) return 'idle';
  if (def.kind === 'miner' && e.f <= EPS) return outs.length ? 'blocked' : 'idle';
  if (e.f <= EPS) {
    /* Distinguish "nowhere to put it" from "nothing to work with". A machine whose
       inputs are satisfied but whose output belt is full is blocked, and pointing
       the player downstream is the useful thing to say. */
    if (outs.length && e.accept != null && e.accept <= EPS && (e.fIn == null || e.fIn > EPS)) return 'blocked';
    return 'stopped';
  }
  if (e.f > 0.9999) return 'running';
  for (const l of outs) if (l.saturated && l.overCapacity) return 'blocked';
  if (e.accept < 0.9999) return 'blocked';
  return 'starved';
}

function topoOrder(ents, links, outLinks) {
  const indeg = new Map(ents.map((e) => [e.id, 0]));
  for (const l of links) if (indeg.has(l.to)) indeg.set(l.to, indeg.get(l.to) + 1);
  const q = ents.filter((e) => indeg.get(e.id) === 0).map((e) => e.id);
  const order = [];
  const seen = new Set();
  while (q.length) {
    const id = q.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const l of outLinks.get(id) || []) {
      indeg.set(l.to, indeg.get(l.to) - 1);
      if (indeg.get(l.to) <= 0) q.push(l.to);
    }
  }
  for (const e of ents) if (!seen.has(e.id)) order.push(e.id); // cycles: arbitrary tail
  return order;
}

/* ---------- scoring (§9) ---------- */
function score(state, result) {
  let machines = 0, footprint = 0;
  for (const e of state.entities) {
    const def = MACHINES[e.type];
    machines += def.cost || 0;
    if (def.kind !== 'sink') footprint += def.w * def.h;
  }
  for (const l of state.links) footprint += (l.path ? l.path.length : 0);
  /* What the node actually gives up, not the miner's nameplate rate. A miner whose
     belt is backed up is drawing less, and the ore metric is supposed to reward
     not wasting the deposit. */
  let ore = 0;
  for (const e of state.entities) {
    if (MACHINES[e.type].kind !== 'miner') continue;
    const nominal = (e.offer && e.offer.ore) || 0;
    ore += nominal * (e.f == null ? 1 : Math.max(0, Math.min(1, e.f)));
  }
  return { machines, footprint, ore };
}

if (typeof module !== 'undefined') {
  module.exports = { ITEMS, MACHINES, BELTS, solve, score, waterfill, recipeOf };
}
