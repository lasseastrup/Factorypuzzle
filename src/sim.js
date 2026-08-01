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
  /* One fitting for both jobs. It has no idea whether it is splitting or merging: it sums
     whatever arrives and divides it evenly among whatever leaves, which is the same
     arithmetic either way. Splitter and merger remain as aliases so older designs still
     load, but the player is only ever offered a Junction. */
  junction: { name: 'Junction', w: 1, h: 1, kind: 'junction', cost: 0, recipes: [] },
  splitter: { name: 'Junction', w: 1, h: 1, kind: 'junction', cost: 0, recipes: [] },
  /* A factory is a box whose interior is built elsewhere. It has no behaviour of its
     own: the solver replaces it with a copy of its definition. */
  factory: { name: 'Factory', w: 4, h: 4, kind: 'factory', cost: 0, recipes: [] },
  /* Terminals are the interior's view of the box's ports. They are plain
     passthroughs, so flattening needs no rewiring: an outside belt simply points at
     the terminal and the interior carries on from there. */
  termIn:  { name: 'Input', w: 1, h: 2, kind: 'pass', cost: 0, recipes: [], wallFixture: true },
  termOut: { name: 'Output', w: 1, h: 2, kind: 'pass', cost: 0, recipes: [], wallFixture: true },
  merger:   { name: 'Junction', w: 1, h: 1, kind: 'junction', cost: 0, recipes: [] },
  sink:     { name: 'Depot',    w: 2, h: 2, kind: 'sink',     cost: 0, recipes: [] },
};

/* A tier is faster AND denser. Speed alone would leave every tier looking identical at
   partial load; density alone left them looking identical full stop, which is what happened
   when they shared one speed — the only difference between a Mk1 and a Mk3 was how close
   together the items sat, and at low flow that is no difference at all. */
const BELTS = [
  { id: 1, name: 'Mk1', cap: 60,  speed: 1.4, color: 0x6b7a8f },
  { id: 2, name: 'Mk2', cap: 120, speed: 2.1, color: 0x4c8fb5 },
  { id: 3, name: 'Mk3', cap: 240, speed: 2.9, color: 0xb5904c },
];

const EPS = 1e-7;
/* passthroughs carry material without transforming it */
const isPass = (k) => k === 'junction' || k === 'splitter' || k === 'merger' || k === 'pass';

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
    } else if (isPass(def.kind)) {
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
      else if (isPass(def.kind)) {
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
      } else if (isPass(def.kind)) {
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
    } else if (isPass(def.kind)) {
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
  if (isPass(def.kind) || def.kind === 'sink' || def.kind === 'factory') return 'passive';
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

/* ---------- nested factories ----------
   A factory instance is replaced by a copy of its definition, recursively. Each copy
   is independent at solve time, so three instances fed different rates behave
   differently even though they share one design. Expanding like this means the
   two-pass solver needs no concept of hierarchy at all.

   Terminals are passthroughs, so a belt from outside aimed at input port 2 becomes a
   belt aimed at that copy's termIn with index 2, and the interior continues. */
const MAX_NESTING = 8;

function flatten(root, defs) {
  const entities = [], links = [];
  let counter = 0;

  const visit = (ctx, prefix, depth, chain) => {
    if (depth > MAX_NESTING) throw new Error('factories nested more than ' + MAX_NESTING + ' deep');
    const local = new Map();
    const terms = { in: new Map(), out: new Map() };

    for (const e of ctx.entities || []) {
      const def = MACHINES[e.type];
      if (def && def.kind === 'factory') {
        /* Each placement owns its interior outright, so the definition travels with
           the entity. A defs map is still honoured for shared designs. */
        const inner = e.def || (defs && defs[e.defId]);
        if (!inner) { local.set(e.id, null); continue; }
        const key = e.defId || inner;
        if (chain.indexOf(key) !== -1) throw new Error('a factory cannot contain itself');
        const child = visit(inner, prefix + e.id + '/', depth + 1, chain.concat([key]));
        local.set(e.id, { factory: true, terms: child });
      } else {
        const copy = Object.assign({}, e, { id: prefix + e.id, _src: e, _root: prefix === '' });
        entities.push(copy);
        local.set(e.id, { id: copy.id });
        if (def && def.kind === 'pass') {
          const slot = e.type === 'termIn' ? terms.in : terms.out;
          slot.set(e.index == null ? 0 : e.index, copy.id);
        }
      }
    }

    for (const l of ctx.links || []) {
      const a = local.get(l.from), b = local.get(l.to);
      if (!a || !b) continue;
      const fromId = a.factory ? a.terms.out.get(l.fromPort || 0) : a.id;
      const toId = b.factory ? b.terms.in.get(l.toPort || 0) : b.id;
      if (!fromId || !toId) continue;       /* a port with nothing wired to it inside */
      links.push(Object.assign({}, l, {
        id: 'f' + (++counter) + ':' + prefix + l.id,
        from: fromId, to: toId, _src: l, _root: prefix === '',
      }));
    }
    return terms;
  };

  visit(root, '', 0, []);
  return { entities, links };
}

/* Solve a hierarchy, then copy results back onto the caller's own objects so the
   renderer keeps working with the entities the player actually placed. */
function solveNested(root, defs, opts) {
  let flat;
  try {
    flat = flatten(root, defs);
  } catch (err) {
    return { output: {}, machines: [], links: [], bottlenecks: [], error: err.message };
  }
  const res = solve(flat, opts);

  for (const e of flat.entities) {
    if (!e._root || !e._src) continue;
    const t = e._src;
    t.f = e.f; t.fIn = e.fIn; t.accept = e.accept; t.state = e.state;
    t.avail = e.avail; t.deficits = e.deficits; t.offer = e.offer;
    t.isRootCause = e.isRootCause; t.limitedBy = e.limitedBy; t.fPot = e.fPot;
  }
  for (const l of flat.links) {
    if (!l._root || !l._src) continue;
    const t = l._src;
    t.flow = l.flow; t.want = l.want; t.drain = l.drain; t.item = l.item;
    t.potFlow = l.potFlow; t.saturated = l.saturated; t.overCapacity = l.overCapacity;
  }

  /* a factory instance reports the worst state of anything inside it */
  const rank = { running: 0, passive: 0, idle: 1, starved: 2, throttled: 3, blocked: 4, stopped: 5 };
  for (const e of root.entities || []) {
    if (!MACHINES[e.type] || MACHINES[e.type].kind !== 'factory') continue;
    let worst = 'running', frac = 1, seen = 0;
    for (const fe of flat.entities) {
      if (String(fe.id).indexOf(e.id + '/') !== 0) continue;
      if (!MACHINES[fe.type] || MACHINES[fe.type].kind === 'pass') continue;
      seen++;
      frac = Math.min(frac, fe.f == null ? 1 : fe.f);
      if ((rank[fe.state] || 0) > (rank[worst] || 0)) worst = fe.state;
    }
    e.f = seen ? frac : 0;
    e.state = seen ? worst : 'idle';
    e.innerCount = seen;
    /* what each output port is actually carrying, so a belt painted from the box
       knows its item without the player having to go and look inside */
    e.portItems = {};
    for (const fl of flat.links) {
      const dest = flat.entities.find((x) => x.id === fl.to);
      if (!dest || dest.type !== 'termOut') continue;
      if (String(dest.id).indexOf(e.id + '/') !== 0) continue;
      if (fl.item) e.portItems[dest.index == null ? 0 : dest.index] = fl.item;
    }
  }
  res.flat = flat;
  return res;
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
  module.exports = { ITEMS, MACHINES, BELTS, solve, solveNested, flatten, score, waterfill, recipeOf, MAX_NESTING };
}
