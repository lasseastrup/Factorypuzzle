/* Runs the prototype's script body against real three.js with a stub DOM,
   so a browser "Script error." becomes a real stack trace. */
const fs = require('fs');
const path = require('path');
const HTML = process.argv[2] || path.join(__dirname, '..', 'index.html');
const THREE = require('three');

function El(tag) {
  const e = {
    tagName: tag, children: [], style: {}, dataset: {}, _html: '',
    textContent: '', onclick: null, offsetHeight: 60, offsetWidth: 300,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, on) { on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (on ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    /* listeners are recorded so tests can replay real gestures — input handling
       has produced bugs that no amount of geometry checking would find */
    _l: {},
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
    removeEventListener(t, fn) { this._l[t] = (this._l[t] || []).filter((f) => f !== fn); },
    fire(t, ev) {
      for (const fn of (this._l[t] || [])) fn(Object.assign({ preventDefault() {} }, ev));
    },
    setPointerCapture() {}, releasePointerCapture() {},
    querySelectorAll(sel) { return collect(sel); },
    getContext() {
      /* enough of CanvasRenderingContext2D for the sky gradient, belt chevrons
         and text sprites the game generates at load */
      return {
        scale() {}, translate() {}, rotate() {}, save() {}, restore() {},
        fillText() {}, measureText: () => ({ width: 10 }),
        clearRect() {}, fillRect(x, y, w, hh) { this._ops.push(['rect', x, y, w, hh]); }, strokeRect() {},
        _ops: (globalThis.__canvasOps = globalThis.__canvasOps || []),
        beginPath() {}, closePath() {},
        moveTo(x, y) { this._ops.push(['pt', x, y]); },
        lineTo(x, y) { this._ops.push(['pt', x, y]); },
        arc() {}, stroke() {}, fill() {},
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        set font(v) {}, set fillStyle(v) {}, set strokeStyle(v) {},
        set lineWidth(v) {}, set lineCap(v) {}, set globalAlpha(v) {},
        set textAlign(v) {}, set textBaseline(v) {},
      };
    },
    get className() { return [...this.classList._s].join(' '); },
    set className(v) { this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this.children = []; },
  };
  return e;
}

const ids = {};
for (const id of ['labels', 'docket', 'lvId', 'lvName', 'lvHint', 'quotas', 'levelBar',
                  'insp', 'trayScroll', 'bar2', 'run', 'plannerBtn', 'clearBtn',
                  'report', 'rcard', 'toast', 'tools', 'tray', 'rotBtn', 'camBtn']) {
  ids[id] = El('div');
}
const toolBtns = ['select', 'belt', 'erase'].map((t) => { const b = El('button'); b.dataset.tool = t; return b; });

function collect(sel) {
  if (sel === '.tbtn[data-tool]') return toolBtns;
  return [];
}

global.document = {
  body: El('body'),
  createElement: (t) => El(t),
  querySelector: (s) => (s[0] === '#' ? ids[s.slice(1)] || El('div') : El('div')),
  querySelectorAll: collect,
  getElementById: (id) => ids[id] || null,
};
global.__fatal = (m, d) => { throw new Error('__fatal: ' + m + ' ' + (d||'')); };
global.window = global;
global.innerWidth = 390; global.innerHeight = 844;
global.devicePixelRatio = 2;
global.performance = { now: () => Date.now() };
global.addEventListener = () => {};
global.clearTimeout = clearTimeout; global.setTimeout = setTimeout;

let frames = 0, maxFrames = Number(process.env.FRAMES || 4);
global.requestAnimationFrame = (fn) => { if (frames++ < maxFrames) setImmediate(() => fn(performance.now() + frames * 16)); };

/* stub the renderer — no WebGL here, but keep everything else real */
class FakeRenderer {
  constructor() {
    this.domElement = El('canvas');
    this.shadowMap = { enabled: false, type: null };
    this.capabilities = { isWebGL2: true, maxTextureSize: 4096 };
  }
  setPixelRatio() {} setSize() {} render() {}
}
THREE.WebGLRenderer = FakeRenderer;
global.THREE = THREE;

function paint(api, a, b) {
  const p0 = api.portsOf(a).out[Math.max(0, api.freeOutPort(a))];
  const P = api.portsOf(b);
  const p1 = P.in[0];
  const pts = [];
  for (let t = 0.12; t <= 1.0001; t += 0.12) {
    pts.push({ x: p0.x + (p1.x - p0.x) * t, z: p0.z + (p1.z - p0.z) * t });
  }
  globalThis.__setStroke(a, Math.max(0, api.freeOutPort(a)));
  api.commitStroke(pts, p1);
}
const html = fs.readFileSync(HTML, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const body = blocks[blocks.length-1];

/* expose internals for poking after boot */
const exports_ = ['loadLevel','addEntity','resolve','scene','camera','quotaMet','LEVELS','MACHINES','groundAt','handleTap','portsOf','freeOutPort','commitStroke','beltMetres','computeCrossings','entAt','setTool','frame','score','updateLabels',
  'simplify','chaikin','resample','minRadius','segHit','routeBlocked','arcTable','MIN_RADIUS','canPlace',
  'sun','renderer','animateMachines','gMachines','BELT_TEX','BELT_SPEED',
  'portsOf','localPorts','machineYaw','buildMachines','setZoom','cameraIsSane','resetView','machineAtScreen','PITCH_STEPS','smoothPath','buildPath','smoothToRadius','MIN_RADIUS','SMOOTH_CAPS','ribbon','BELT_HW','RAIL_HW','BELT_TEX_PERIOD','gBelts','arcTable','advanceBelts','beltHasRoom','queuedOn','JAM_SPACING','itemMeshes','updateItems','roomy','resolveFlow',
  'ghostAt',
  'placeAt',
  'gGhost'];
const wrapped = body
  + '\n;globalThis.__setStroke = function (e, p) { stroke = { fromEnt: e, fromPort: p, pts: [] }; };'
  + '\n;globalThis.__pick = function (t, r) { pickedType = t; pickedRecipe = r; };'
  + '\n;globalThis.__api = { removeEntityById: function(id){ var e=ents.find(function(x){return x.id===id;}); if(e) removeEntity(e); buildMachines(); }, ents: function(){return ents;}, links: function(){return links;},'
  + ' getPhase: function(){return phase;}, getZoom: function(){return zoom;}, getPointerCount: function(){return pointers.size;}, getDragMode: function(){return dragMode;}, getCam: function(){return {x:camCenter.x,z:camCenter.z};}, getPinched: function(){return pinched;}, getPitch: function(){return pitch;}, setPitch: function(v){pitch=pitchTarget=v;}, getResult: function(){return result;},'
  + ' getSpinUp: function(){return spinUp;}, getHold: function(){return deliveryProgress().worst;}, getClock: function(){return clockT;}, getDeliveries: function(){return deliveries.length;}, isReported: function(){return reported;}, DELIVER_WINDOW: DELIVER_WINDOW, deliveryProgress: function(){return deliveryProgress();}, rateMet: function(){return rateMet();}, solvedMap: function(){return solved;}, setPlanner: function(v){plannerOn=v;},'
  + exports_.map(function(k){return ' ' + k + ': ' + k;}).join(',') + ' };';

try {
  new Function(wrapped)();
  console.log('BOOT OK — script ran, level 1 loaded, ' + maxFrames + ' frames requested');
} catch (err) {
  console.log('BOOT FAILED');
  console.log(err && err.stack ? err.stack : err);
  process.exit(1);
}

setTimeout(() => {
  const api = globalThis.__api;
  try {
    /* build level 1's par solution the way a player would */
    api.setTool('select');
    const lv = api.LEVELS[0];
    const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
    const s = api.addEntity('smelter', 7.5, 7.5, 0);
    api.resolve();
    const depot = api.ents().find((e) => api.MACHINES[e.type].kind === 'sink');
    /* paint two strokes the way a finger would: a few sampled points */
    paint(api, m, s); paint(api, s, depot);
    api.computeCrossings(); api.resolve();
    console.log('belt painted:', api.beltMetres().toFixed(1), 'm across', api.links().length, 'runs');
    const res = api.getResult();
    console.log('LV1 output:', JSON.stringify(res.output), '| spin-up', api.getSpinUp().toFixed(2) + 's');

    console.log('-- the factory just runs; advance the clock --');
    let t = performance.now();
    const step = () => { t += 40; api.frame(t); };
    for (let i = 0; i < 60; i++) step();            // let the line fill
    let pr = api.deliveryProgress();
    console.log('after fill: rate met =', api.rateMet(),
                '| depot has', pr.worst ? pr.worst.have + '/' + pr.worst.need : '-');
    for (let i = 0; i < 400; i++) step();
    pr = api.deliveryProgress();
    console.log('completed:', !!api.solvedMap()[api.LEVELS[0].id],
                '| depot', pr.worst ? pr.worst.have + '/' + pr.worst.need : '-',
                '| deliveries in window:', api.getDeliveries());

    console.log('-- planner overlay on --');
    api.setPlanner(true);
    api.updateLabels();
    console.log('planner OK');

    console.log('-- switching through every level --');
    for (let i = 0; i < api.LEVELS.length; i++) { api.loadLevel(i); api.frame(performance.now()); }
    console.log('all levels loaded OK');
    console.log('\nALL RUNTIME CHECKS PASSED');
  } catch (err) {
    console.log('RUNTIME FAILED');
    console.log(err && err.stack ? err.stack : err);
    process.exit(1);
  }
}, 200);

/* --- geometric checks: is anything actually visible? --- */
setTimeout(() => {
  const THREE = require('three');
  const api = globalThis.__api;
  api.loadLevel(0);
  api.frame(performance.now());
  const scene = api.scene || globalThis.__scene;
  const cam = api.camera || globalThis.__camera;
  if (!scene || !cam) { console.log('\n(no scene handle exported — skipping)'); return; }

  cam.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);

  const meshes = [];
  scene.traverse((o) => { if (o.isMesh || o.isSprite || o.isLine) meshes.push(o); });
  const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);

  let inView = 0, minD = Infinity, maxD = -Infinity;
  for (const m of meshes) {
    const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    const d = p.distanceTo(camPos);
    minD = Math.min(minD, d); maxD = Math.max(maxD, d);
    const n = p.clone().project(cam);
    if (Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1 && n.z >= -1 && n.z <= 1) inView++;
  }
  console.log('\n--- visibility audit ---');
  console.log('objects in scene:      ', meshes.length);
  console.log('inside view frustum:   ', inView);
  console.log('camera distance range: ', minD.toFixed(1), '..', maxD.toFixed(1));
  console.log('near / far planes:     ', cam.near, '/', cam.far);
  if (scene.fog) {
    console.log('FOG near/far:          ', scene.fog.near, '/', scene.fog.far);
    const swallowed = maxD >= scene.fog.far;
    console.log(swallowed
      ? '>>> EVERYTHING IS PAST FOG FAR — all geometry paints as pure fog colour <<<'
      : 'fog range is compatible with camera distance');
  } else {
    console.log('fog:                    none');
  }
  console.log(inView > 0 ? 'frustum: OK' : '>>> NOTHING IN FRUSTUM <<<');
}, 500);

/* --- geometry suite for the gridless belt painting --- */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- painted-belt geometry ---');

  /* a wobbly but essentially straight drag should collapse to a near-straight run */
  const wobbly = [];
  for (let i = 0; i <= 40; i++) wobbly.push({ x: i * 0.25, z: Math.sin(i) * 0.05 });
  ok(api.simplify(wobbly, 0.13).length <= 4, 'finger wobble simplifies away (' + api.simplify(wobbly, 0.13).length + ' pts from 41)');

  /* a hard 90-degree kink must be rounded to something a conveyor could physically do */
  const kink = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }];
  const rawR = api.minRadius(api.resample(kink, 0.34));
  let sm = api.resample(api.chaikin(kink, 2), 0.34), iters = 3;
  while (api.minRadius(sm) < api.MIN_RADIUS && iters <= 6) sm = api.resample(api.chaikin(kink, iters++), 0.34);
  ok(rawR < api.MIN_RADIUS, 'raw kink violates min turn radius (r=' + rawR.toFixed(2) + ')');
  ok(api.minRadius(sm) >= api.MIN_RADIUS, 'smoothing fixes it (r=' + api.minRadius(sm).toFixed(2) + ' >= ' + api.MIN_RADIUS + ')');

  /* two belts that cross should produce exactly one over-under bump */
  ok(!!api.segHit({x:0,z:0},{x:4,z:0},{x:2,z:-2},{x:2,z:2}), 'perpendicular segments detected as crossing');
  ok(!api.segHit({x:0,z:0},{x:4,z:0},{x:0,z:3},{x:4,z:3}), 'parallel segments do not cross');

  api.loadLevel(4);
  const lv = api.LEVELS[4];
  const depot = api.ents().find((e) => api.MACHINES[e.type].kind === 'sink');
  const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  const s1 = api.addEntity('smelter', 7, 5.5, 0);
  const s2 = api.addEntity('smelter', 7, 10.5, 0);
  api.resolve();
  const paint = (a, b, via) => {
    const p0 = api.portsOf(a).out[Math.max(0, api.freeOutPort(a))];
    const p1 = api.portsOf(b).in[0];
    const pts = [];
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const mx = via ? via.x : (p0.x + p1.x) / 2, mz = via ? via.z : (p0.z + p1.z) / 2;
      const ax = p0.x + (mx - p0.x) * Math.min(1, t * 2), az = p0.z + (mz - p0.z) * Math.min(1, t * 2);
      const bx = mx + (p1.x - mx) * Math.max(0, t * 2 - 1), bz = mz + (p1.z - mz) * Math.max(0, t * 2 - 1);
      pts.push(t < 0.5 ? { x: ax, z: az } : { x: bx, z: bz });
    }
    globalThis.__setStroke(a, Math.max(0, api.freeOutPort(a)));
    api.commitStroke(pts, p1);
  };
  /* deliberately cross the two runs to the depot */
  paint(s1, depot, { x: 12, z: 11 });
  paint(s2, depot, { x: 12, z: 5 });
  api.computeCrossings();
  const bumped = api.links().filter((l) => l.bumps.length).length;
  ok(api.links().length === 2, 'two runs painted to the depot');
  ok(bumped === 1, 'exactly one run ramps over the other (' + bumped + ' bumped)');

  /* a stroke straight through a rock must be refused */
  const rock = lv.rocks[0];
  const through = [];
  for (let t = 0; t <= 1.0001; t += 0.1) through.push({ x: rock.x - 3 + 6 * t, z: rock.z });
  ok(!!api.routeBlocked(through, null, null), 'a route clipping a rock is rejected');

  console.log(`\n${p} passed, ${f} failed`);
}, 900);

/* --- lighting and shadow audit ---
   A shadow camera that does not contain the plot drops shadows silently at the
   edges, in the same family of bug as the fog that painted the whole world in the
   background colour. Cheap to assert, invisible to catch by eye. */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- lighting / shadows ---');

  api.loadLevel(3);            // the largest plot
  api.frame(performance.now());
  const lv = api.LEVELS[3];
  const sun = api.sun;
  const s = sun.shadow.camera;

  ok(api.renderer.shadowMap.enabled, 'shadow map enabled');
  ok(sun.castShadow, 'sun casts shadows');

  // the shadow camera is in light space; check its half-extent covers the plot diagonal
  sun.updateMatrixWorld(true);
  const dx = Math.abs(sun.position.x - lv.w / 2), dz = Math.abs(sun.position.z - lv.h / 2);
  const halfSpan = Math.min(s.right, s.top);
  const need = Math.hypot(lv.w, lv.h) / 2;
  ok(halfSpan >= need, `shadow camera covers the plot (half-extent ${halfSpan.toFixed(1)} >= ${need.toFixed(1)} needed)`);

  const lightDist = Math.hypot(dx, sun.position.y, dz);
  ok(s.far > lightDist, `shadow far plane is beyond the plot (far ${s.far.toFixed(0)} > dist ${lightDist.toFixed(0)})`);
  ok(s.near > 0 && s.near < lightDist, 'shadow near plane is sane');

  let casters = 0, receivers = 0;
  api.scene.traverse((o) => { if (o.castShadow) casters++; if (o.receiveShadow) receivers++; });
  ok(casters > 5, `things cast shadows (${casters})`);
  ok(receivers > 0, `something receives them (${receivers})`);

  // scene.background must not be a flat colour equal to the ground, the old bug
  ok(!!api.scene.background && api.scene.background.isTexture, 'background is a sky gradient, not a flat wash');

  // animation must not throw and must move parts
  const before = [];
  api.gMachines.children.forEach((g) => { const a = g.userData.anim; if (a && a.drum) before.push(a.drum.rotation.x); });
  api.animateMachines(3.0);
  ok(true, 'animateMachines runs without throwing');

  console.log(`\n${p} passed, ${f} failed`);
}, 1400);

/* --- port placement must survive rotation ---
   The renderer now rotates each machine group, so port meshes are children in
   local space. If local and world port maths ever disagree, belts silently attach
   to the wrong face. Compare the rendered mesh position against portsOf. */
setTimeout(() => {
  const THREE = require('three');
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- port placement vs rotation ---');

  api.loadLevel(3);
  for (const rot of [0, 1, 2, 3]) {
    const e = api.addEntity('constructor', 8, 8, rot);
    e.recipe = 'plate';
    api.buildMachines();
    api.scene.updateMatrixWorld(true);
    const want = api.portsOf(e).out[0];
    // find the group for this entity and its output port child
    let got = null;
    for (const g of api.gMachines.children) {
      if (g.userData.ent !== e) continue;
      g.updateMatrixWorld(true);
      const lp = api.localPorts(e).out[0];
      const v = new THREE.Vector3(lp.x, 0.34, lp.z);
      g.localToWorld(v);
      got = { x: v.x, z: v.z };
    }
    const d = got ? Math.hypot(got.x - want.x, got.z - want.z) : Infinity;
    ok(d < 1e-6, `rot ${rot * 90}deg: rendered output port matches portsOf (off by ${d.toExponential(1)})`);
    // and the four rotations must not all land in the same place
    api.removeEntityById(e.id);
  }
  console.log(`\n${p} passed, ${f} failed`);
}, 1900);

/* --- exposure audit ---
   Lambert output is base colour times incoming light. If the lights sum past 1.0,
   every pale surface clips to pure white and no amount of colour tuning helps.
   This is not visible to any of the other checks and was a real bug. */
setTimeout(() => {
  const THREE = require('three');
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- exposure ---');

  api.loadLevel(0);
  api.frame(performance.now());

  let hemi = null; const dirs = [];
  api.scene.traverse((o) => {
    if (o.isHemisphereLight) hemi = o;
    else if (o.isDirectionalLight) dirs.push(o);
  });
  const up = new THREE.Vector3(0, 1, 0);
  const tot = new THREE.Color(0, 0, 0);
  if (hemi) tot.add(hemi.color.clone().multiplyScalar(hemi.intensity));
  for (const d of dirs) {
    d.updateMatrixWorld(true);
    const dir = d.position.clone();
    if (d.target) dir.sub(d.target.position);
    dir.normalize();
    tot.add(d.color.clone().multiplyScalar(d.intensity * Math.max(0, dir.dot(up))));
  }
  const peak = Math.max(tot.r, tot.g, tot.b);
  ok(peak <= 1.05, `irradiance on an up-facing surface stays within range (peak ${peak.toFixed(2)})`);

  const clipping = [];
  const seen = new Set();
  api.scene.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    const m = o.material;
    if (m.isMeshBasicMaterial) return;              // unlit: renders as its own colour
    if (seen.has(m.uuid)) return;
    seen.add(m.uuid);
    const base = m.color.clone();
    const ca = o.geometry && o.geometry.attributes && o.geometry.attributes.color;
    if (m.vertexColors && ca) {
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < ca.count; i++) { r += ca.getX(i); g += ca.getY(i); b += ca.getZ(i); }
      base.multiply(new THREE.Color(r / ca.count, g / ca.count, b / ca.count));
    }
    const out = Math.max(base.r * tot.r, base.g * tot.g, base.b * tot.b);
    if (out >= 0.995) clipping.push('#' + m.color.getHexString() + ' -> ' + out.toFixed(2));
  });
  ok(clipping.length === 0, 'no lit surface clips to white'
    + (clipping.length ? '  OFFENDERS: ' + clipping.join(', ') : ''));

  console.log(`\n${p} passed, ${f} failed`);
}, 2400);

/* --- pinch/zoom gesture regression ---
   Replays the gesture that killed the view: a third finger landing mid-pinch,
   then lifting back to two. The old code assigned a Vector3 to the variable the
   pinch maths multiplied, producing NaN zoom and a dead camera. */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- pinch zoom ---');

  api.loadLevel(0);
  const cv = api.renderer.domElement;
  const down = (id, x, y) => cv.fire('pointerdown', { pointerId: id, clientX: x, clientY: y });
  const move = (id, x, y) => cv.fire('pointermove', { pointerId: id, clientX: x, clientY: y });
  const up   = (id, x, y) => cv.fire('pointerup',   { pointerId: id, clientX: x, clientY: y });

  const z0 = api.getZoom();

  /* a normal two-finger pinch outward should zoom in */
  down(1, 150, 400); down(2, 250, 400);
  move(1, 100, 400); move(2, 300, 400);
  const zIn = api.getZoom();
  ok(Number.isFinite(zIn), 'zoom stays finite through a normal pinch');
  ok(zIn < z0, `pinching out zooms in (${z0.toFixed(1)} -> ${zIn.toFixed(1)})`);
  up(1, 100, 400); up(2, 300, 400);

  /* now the killer: three fingers, then back to two.
     Reset to mid-range first, or the clamp at zoomMin hides the result. */
  api.setZoom(22);
  down(1, 150, 400); down(2, 250, 400);
  down(3, 200, 600);                       // third finger lands mid-pinch
  up(3, 200, 600);                         // and lifts again
  move(1, 120, 400); move(2, 280, 400);
  const zAfter = api.getZoom();
  ok(Number.isFinite(zAfter), `zoom survives a third finger (${zAfter.toFixed(1)})`);
  ok(zAfter < 22, `and the pinch still had an effect (22.0 -> ${zAfter.toFixed(1)})`);
  ok(api.cameraIsSane(), 'camera frustum still finite after the three-finger gesture');
  up(1, 120, 400); up(2, 280, 400);
  ok(api.getPointerCount() === 0, 'pointer map empties after all fingers lift');
  ok(api.getDragMode() === null, 'drag mode clears');

  /* and zooming back in must still work afterwards */
  api.setZoom(22);
  const zBefore = api.getZoom();
  down(1, 150, 400); down(2, 250, 400);
  move(1, 60, 400); move(2, 340, 400);
  const zBack = api.getZoom();
  up(1, 60, 400); up(2, 340, 400);
  ok(zBack < zBefore, `can still zoom in afterwards (${zBefore.toFixed(1)} -> ${zBack.toFixed(1)})`);

  /* direct assault on setZoom */
  api.setZoom(NaN); ok(Number.isFinite(api.getZoom()), 'setZoom(NaN) is ignored');
  api.setZoom(Infinity); ok(Number.isFinite(api.getZoom()), 'setZoom(Infinity) is ignored');
  api.setZoom(-500); ok(api.getZoom() > 0, 'setZoom clamps below the minimum');
  api.setZoom(1e9);
  const lv = api.LEVELS[0];
  ok(api.getZoom() <= Math.max(lv.w, lv.h) * 2.4 + 1e-6, 'setZoom clamps to the level maximum');

  console.log(`\n${p} passed, ${f} failed`);
}, 2900);

/* --- gesture transitions must not jump ---
   Lifting one finger of a pinch used to leave the pan baseline at the finger's
   original touch point, so the camera slammed across by the whole pinch distance
   the moment the gesture changed. */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- gesture transitions ---');

  api.loadLevel(0);
  const cv = api.renderer.domElement;
  const down = (id, x, y) => cv.fire('pointerdown', { pointerId: id, clientX: x, clientY: y });
  const move = (id, x, y) => cv.fire('pointermove', { pointerId: id, clientX: x, clientY: y });
  const up   = (id, x, y) => cv.fire('pointerup',   { pointerId: id, clientX: x, clientY: y });

  api.setZoom(22);

  /* pinch wide apart, then lift one finger and hold the other still */
  down(1, 200, 400); down(2, 220, 400);
  move(1, 60, 400); move(2, 360, 400);          // fingers travel ~140px each
  const camMid = api.getCam();
  up(2, 360, 400);                              // one finger lifts
  move(1, 60, 400);                             // the other does not move at all
  const camAfter = api.getCam();
  const jump = Math.hypot(camAfter.x - camMid.x, camAfter.z - camMid.z);
  ok(jump < 0.01, `no camera jump when a finger lifts mid-pinch (moved ${jump.toFixed(3)} m)`);

  /* continuing to drag that finger should pan smoothly and proportionally */
  move(1, 100, 400);                            // 40px
  const camPan = api.getCam();
  const panDist = Math.hypot(camPan.x - camAfter.x, camPan.z - camAfter.z);
  ok(panDist > 0.05 && panDist < 6, `panning afterwards is proportional (${panDist.toFixed(2)} m for 40px)`);
  up(1, 100, 400);
  ok(api.getPointerCount() === 0 && api.getDragMode() === null, 'gesture fully cleared');
  ok(api.getPinched() === false, 'pinch flag cleared once all fingers are up');

  /* a pinch must never be mistaken for a tap: arm the place tool and check
     that lifting both fingers does not build anything */
  api.setTool('place');
  const before = api.ents().length;
  down(1, 180, 420); down(2, 240, 420);
  move(1, 140, 420); move(2, 280, 420);
  up(1, 140, 420);
  up(2, 280, 420);
  ok(api.ents().length === before, 'a pinch does not place a machine on release');

  /* 3 fingers down to 2 should not lurch the zoom either */
  api.setZoom(22);
  down(1, 150, 400); down(2, 250, 400); down(3, 200, 600);
  const zBefore = api.getZoom();
  up(3, 200, 600);
  move(1, 150, 400); move(2, 250, 400);         // neither remaining finger moved
  const zAfter = api.getZoom();
  ok(Math.abs(zAfter - zBefore) < 0.01, `no zoom lurch going 3 fingers to 2 (${zBefore.toFixed(2)} -> ${zAfter.toFixed(2)})`);
  up(1, 150, 400); up(2, 250, 400);

  /* and an ordinary single tap must still work */
  api.setTool('select');
  down(1, 200, 400); up(1, 200, 400);
  ok(api.getDragMode() === null, 'a plain tap still completes cleanly');

  console.log(`\n${p} passed, ${f} failed`);
}, 3400);

/* --- visible throughput must equal real throughput ---
   A player counting items on a belt is auditing the simulation. If 30/min does not
   look like one item every two seconds, the game is lying about the number the
   whole puzzle turns on. */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- visible throughput ---');

  const S = api.BELT_SPEED;
  for (const flow of [15, 30, 45, 60, 90, 120, 240]) {
    const spacing = S * 60 / flow;
    const visible = (S / spacing) * 60;          // items past a fixed point per minute
    const gap = spacing / S;                     // seconds between items
    ok(Math.abs(visible - flow) < 1e-9,
      `${flow}/min shows as ${visible.toFixed(1)}/min — one item every ${gap.toFixed(2)} s`);
  }

  /* the specific case that was reported */
  const gap30 = (S * 60 / 30) / S;
  ok(Math.abs(gap30 - 2.0) < 1e-9, `a 30/min miner emits one item every ${gap30.toFixed(2)} s exactly`);

  /* and enough items must be on a typical belt for the rhythm to be readable */
  const typicalBelt = 9;
  const onBelt30 = typicalBelt / (S * 60 / 30);
  ok(onBelt30 >= 1.3, `a ${typicalBelt} m belt at 30/min carries ${onBelt30.toFixed(1)} items at once (needs >1 to read as a flow)`);

  console.log(`\n${p} passed, ${f} failed`);
}, 3900);

/* --- oblique camera ---
   Lowering the pitch displaces the visible top of a tall machine well behind its
   footprint, so ground-plane hit testing stops working. And the pan mapping has to
   use sin(pitch), not cos: it was cos, making vertical panning 1.6x too fast. */
setTimeout(() => {
  const THREE = require('three');
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- oblique camera ---');

  api.loadLevel(0);
  api.frame(performance.now());
  ok(Math.abs(api.getPitch() - api.PITCH_STEPS[2]) < 1e-6,
    `default tilt is ${Math.round(api.PITCH_STEPS[2] * 180 / Math.PI)} deg`);

  /* place a miner on the node and aim at the TOP of its drill tower */
  const lv = api.LEVELS[0];
  const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  api.buildMachines();
  api.scene.updateMatrixWorld(true);
  api.frame(performance.now());

  const topOfTower = new THREE.Vector3(m.x, 1.9, m.z);
  const proj = topOfTower.clone().project(api.camera);
  const sx = (proj.x * 0.5 + 0.5) * 390, sy = (-proj.y * 0.5 + 0.5) * 844;

  const groundPt = api.groundAt(sx, sy);
  const groundHit = api.entAt(groundPt);
  const meshHit = api.machineAtScreen(sx, sy);

  const offset = groundPt ? Math.hypot(groundPt.x - m.x, groundPt.z - m.z) : -1;
  ok(offset > 1.0, `the tower top maps to ground ${offset.toFixed(2)} m from the footprint`);
  ok(groundHit !== m, 'ground-plane hit testing misses it, as expected at this angle');
  ok(meshHit === m, 'mesh picking finds the machine you actually tapped');

  /* pan mapping must match the geometry */
  for (const deg of [36, 44, 54]) {
    api.setPitch(deg * Math.PI / 180);
    api.frame(performance.now());
    const cv = api.renderer.domElement;
    api.setZoom(24);
    const before = api.getCam();
    cv.fire('pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    cv.fire('pointermove', { pointerId: 1, clientX: 200, clientY: 300 });   // 100px up
    const after = api.getCam();
    cv.fire('pointerup', { pointerId: 1, clientX: 200, clientY: 300 });
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    const expect = 100 * (24 / 844) / Math.sin(deg * Math.PI / 180);
    ok(Math.abs(moved - expect) < 0.02,
      `${deg} deg: 100px drag pans ${moved.toFixed(2)} m, geometry says ${expect.toFixed(2)} m`);
  }
  /* at the shallowest tilt and furthest zoom the terrain must still fill the
     frame, or the player sees the edge of the world */
  const shallow = api.PITCH_STEPS[0];
  for (let i = 0; i < api.LEVELS.length; i++) {
    const l = api.LEVELS[i];
    const viewH = Math.max(l.w, l.h) * 2.4;          // zoomMax
    const terrainOnScreen = (l.h + 120) * Math.sin(shallow);
    if (i === api.LEVELS.length - 1 || terrainOnScreen <= viewH) {
      ok(terrainOnScreen > viewH,
        `${l.id}: terrain covers the frame at min tilt / max zoom (${terrainOnScreen.toFixed(0)} > ${viewH.toFixed(0)})`);
    }
  }
  api.setPitch(api.PITCH_STEPS[2]);

  console.log(`\n${p} passed, ${f} failed`);
}, 4400);

/* --- completion is measured at the depot ---
   No predicted "line filling" wait: the level passes when the depot has actually
   received a window's worth of each quota item, and the design is capable of the
   rate. Both conditions are observable. */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- completion by delivery ---');

  api.loadLevel(1);
  const lv = api.LEVELS[1];
  const depot = api.ents().find((e) => api.MACHINES[e.type].kind === 'sink');
  const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  const sm = api.addEntity('smelter', 6.5, 3.5, 0);
  const co = api.addEntity('constructor', 10.5, 3.5, 0);
  co.recipe = 'plate';
  api.resolve();
  const paint = (a, b) => {
    const p0 = api.portsOf(a).out[Math.max(0, api.freeOutPort(a))];
    const p1 = api.portsOf(b).in[0];
    const pts = [];
    for (let t = 0.1; t <= 1.0001; t += 0.1) pts.push({ x: p0.x + (p1.x - p0.x) * t, z: p0.z + (p1.z - p0.z) * t });
    globalThis.__setStroke(a, Math.max(0, api.freeOutPort(a)));
    api.commitStroke(pts, p1);
  };
  paint(m, sm); paint(sm, co); paint(co, depot);
  api.computeCrossings(); api.resolve();

  ok(api.rateMet(), 'the design is capable of the quota rate straight away');
  ok(!api.deliveryProgress().ok, 'but the depot has received nothing, so it is not complete');
  ok(!api.solvedMap()[lv.id], 'and the level is not passed on the strength of the rate alone');

  /* a correct factory must never be asked for more than its rate implies */
  for (const rate of [10, 20, 30, 45, 60, 90]) {
    const need = Math.max(1, Math.floor(rate * api.DELIVER_WINDOW / 60));
    const actuallyDelivers = Math.floor(api.DELIVER_WINDOW / (60 / rate));
    ok(need <= actuallyDelivers,
      `${rate}/min: asks for ${need} in ${api.DELIVER_WINDOW}s, a correct line delivers ${actuallyDelivers}`);
  }

  let t = performance.now();
  const run = (secs) => { for (let i = 0; i < secs / 0.04; i++) { t += 40; api.frame(t); } };

  run(3);
  ok(api.getDeliveries() >= 0, 'deliveries begin accumulating as material arrives');
  run(30);
  ok(!!api.solvedMap()[lv.id], 'completes once the depot has a full window of deliveries');

  /* editing clears the window, so a level cannot be passed on stale deliveries */
  api.loadLevel(2);
  const lv2 = api.LEVELS[2];
  api.addEntity('miner', lv2.nodes[0].x, lv2.nodes[0].z, 0);
  api.resolve();
  ok(api.getDeliveries() === 0, 'an edit clears the delivery window');
  run(25);
  ok(!api.rateMet() && !api.solvedMap()[lv2.id], 'a miner alone never passes the screw level');

  console.log(`\n${p} passed, ${f} failed`);
}, 4900);

/* --- painted paths should not look erratic --- */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- path smoothing ---');

  /* a deliberately shaky drag: a straight run with hand tremor on top */
  const shaky = [];
  for (let i = 0; i <= 60; i++) {
    shaky.push({ x: i * 0.18, z: Math.sin(i * 1.9) * 0.16 + Math.sin(i * 0.7) * 0.1 });
  }
  const turning = (pts) => {
    let sum = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const a1 = Math.atan2(pts[i].z - pts[i - 1].z, pts[i].x - pts[i - 1].x);
      const a2 = Math.atan2(pts[i + 1].z - pts[i].z, pts[i + 1].x - pts[i].x);
      let d = a2 - a1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      sum += Math.abs(d);
    }
    return sum;
  };

  const rawTurn = turning(api.resample(shaky, 0.3));
  const smoothed = api.smoothToRadius(api.chaikin(api.simplify(shaky, 0.24), 3), 40);
  const smoothTurn = turning(smoothed);

  ok(smoothTurn < rawTurn * 0.5,
    `smoothing removes most of the wander (total turning ${rawTurn.toFixed(2)} rad -> ${smoothTurn.toFixed(2)})`);
  ok(api.minRadius(smoothed) >= api.MIN_RADIUS,
    `the result respects the minimum turn radius (${api.minRadius(smoothed).toFixed(2)} >= ${api.MIN_RADIUS})`);

  /* stronger smoothing must be monotonically calmer, so the fallback ladder makes sense */
  const turns = [0, 8, 40].map((cap) =>
    turning(api.smoothToRadius(api.chaikin(api.simplify(shaky, 0.24), 3), cap)));
  ok(turns[0] >= turns[1] && turns[1] >= turns[2],
    `more smoothing is always calmer (${turns.map((v) => v.toFixed(2)).join(' >= ')})`);

  /* and the endpoints must not move, or belts would detach from their ports */
  const a0 = shaky[0], a1 = shaky[shaky.length - 1];
  const s0 = smoothed[0], s1 = smoothed[smoothed.length - 1];
  ok(Math.hypot(s0.x - a0.x, s0.z - a0.z) < 1e-9, 'start point is pinned');
  ok(Math.hypot(s1.x - a1.x, s1.z - a1.z) < 0.31, 'end point is preserved within a resample step');

  console.log(`\n${p} passed, ${f} failed`);
}, 5400);

/* --- the belt must look like a belt ---
   Two failures were visible only on a real screen: the side rails were built at
   the belt's own half-width, so most of the visible conveyor was untextured grey,
   and the chevron spanned only the middle of the width so just a thin line
   appeared to move. */
setTimeout(() => {
  const THREE = require('three');
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- belt appearance ---');

  /* rails must be strips, not more belt */
  ok(api.RAIL_HW < api.BELT_HW * 0.4,
    `side rails are thin relative to the surface (${(api.RAIL_HW * 2).toFixed(2)} m vs ${(api.BELT_HW * 2).toFixed(2)} m)`);
  const totalWidth = api.BELT_HW * 2 + 4 * api.RAIL_HW;
  ok(totalWidth < api.BELT_HW * 2 * 1.6,
    `total conveyor width stays close to the moving surface (${totalWidth.toFixed(2)} m)`);

  /* ribbon() must honour the width it is given */
  const straight = { path: [{ x: 0, z: 0 }, { x: 4, z: 0 }], arc: [0, 4], bumps: [], tier: 1 };
  const spread = (hw) => {
    const g = api.ribbon([straight], (l, c) => c.setHex(0xffffff), false, hw);
    const a = g.attributes.position;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < a.count; i++) { min = Math.min(min, a.getZ(i)); max = Math.max(max, a.getZ(i)); }
    return max - min;
  };
  ok(Math.abs(spread(api.BELT_HW) - api.BELT_HW * 2) < 1e-6, 'ribbon at belt width spans the belt width');
  ok(Math.abs(spread(api.RAIL_HW) - api.RAIL_HW * 2) < 1e-6, 'ribbon at rail width spans only the rail width');

  /* the surface UVs must cover the full width, or only a strip animates */
  api.loadLevel(0);
  const surf = api.ribbon([straight], (l, c) => c.setHex(0xffffff), true, api.BELT_HW);
  const uv = surf.attributes.uv;
  let vmin = Infinity, vmax = -Infinity;
  for (let i = 0; i < uv.count; i++) { vmin = Math.min(vmin, uv.getY(i)); vmax = Math.max(vmax, uv.getY(i)); }
  ok(vmin === 0 && vmax === 1, `surface UVs span the full width (v ${vmin}..${vmax})`);

  /* and the drawn pattern must reach both edges of that width */
  const ops = globalThis.__canvasOps || [];
  const N = 64;
  let touchesTop = false, touchesBottom = false, fullSpanRect = false;
  for (const o of ops) {
    if (o[0] === 'pt') {
      if (o[2] <= 1) touchesTop = true;
      if (o[2] >= N - 1) touchesBottom = true;
    } else if (o[0] === 'rect' && o[2] <= 0 && o[4] >= N) {
      fullSpanRect = true;      // a cleat spanning edge to edge
    }
  }
  ok(touchesTop && touchesBottom, 'the chevron reaches both edges of the belt');
  ok(fullSpanRect, 'there is a cleat spanning the full width');

  /* surface scroll must match item speed or the belt slips under its cargo */
  const scrollPerSec = api.BELT_SPEED / api.BELT_TEX_PERIOD;      // texture periods/sec
  const metresPerSec = scrollPerSec * api.BELT_TEX_PERIOD;
  ok(Math.abs(metresPerSec - api.BELT_SPEED) < 1e-9,
    `surface scrolls at item speed (${metresPerSec.toFixed(2)} m/s)`);

  console.log(`\n${p} passed, ${f} failed`);
}, 5900);

/* --- items on a belt form a queue without glitching ---
   The bug this replaces: a moving stream and a packed queue were drawn from
   different maths, so an arriving item slid through the queue and then snapped
   backwards to a lattice position. The invariants below make that impossible to
   reintroduce — items are simulated, ordered, and spaced. */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- belt queues ---');

  api.loadLevel(0);
  const lv = api.LEVELS[0];
  const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  const sm = api.addEntity('smelter', 8, 9, 0);
  api.resolve();
  const paint = (a, b) => {
    const p0 = api.portsOf(a).out[Math.max(0, api.freeOutPort(a))];
    const p1 = api.portsOf(b).in[0];
    const pts = [];
    for (let t = 0.1; t <= 1.0001; t += 0.1) pts.push({ x: p0.x + (p1.x - p0.x) * t, z: p0.z + (p1.z - p0.z) * t });
    globalThis.__setStroke(a, Math.max(0, api.freeOutPort(a)));
    api.commitStroke(pts, p1);
  };
  paint(m, sm);                      // smelter output unconnected: the belt will back up
  api.computeCrossings(); api.resolve();
  const link = api.links()[0];

  let t = performance.now();
  let worstGap = Infinity, everOutOfOrder = false, everPastEnd = false, everNegative = false;
  const checkFrame = () => {
    const it = link.items || [];
    for (let i = 0; i < it.length; i++) {
      if (it[i] > link.length + 1e-6) everPastEnd = true;
      if (it[i] < -1e-6) everNegative = true;
      if (i > 0) {
        const gap = it[i - 1] - it[i];
        if (gap < -1e-9) everOutOfOrder = true;       // an item overtook the one ahead
        worstGap = Math.min(worstGap, gap);
      }
    }
  };
  /* run long enough to fill the belt completely, checking every single frame */
  for (let i = 0; i < 900; i++) { t += 40; api.frame(t); checkFrame(); }

  ok((link.items || []).length > 3, `the belt carries a queue (${(link.items || []).length} items)`);
  ok(!everOutOfOrder, 'no item ever overtakes the one ahead of it');
  ok(worstGap >= api.JAM_SPACING - 1e-6,
    `nothing ever gets closer than the packed spacing (worst gap ${worstGap.toFixed(3)} m vs ${api.JAM_SPACING})`);
  ok(!everPastEnd, 'no item ever runs off the end of the belt');
  ok(!everNegative, 'no item ever ends up behind the start');
  ok(!api.beltHasRoom(link), 'the belt reports itself full at the input end');
  ok(m.state === 'blocked', `and the miner blocks once it is (${m.state})`);
  ok(api.queuedOn(link) > 3, `the inspector can report the queue length (${api.queuedOn(link)} waiting)`);

  /* positions must be monotonic in time for a given item, i.e. no teleporting back */
  const before = (link.items || []).slice();
  t += 40; api.frame(t);
  const after = (link.items || []).slice();
  const n = Math.min(before.length, after.length);
  let jumped = false;
  for (let i = 0; i < n; i++) if (after[i] + 1e-9 < before[i] - 1e-9) jumped = true;
  ok(!jumped, 'no item moves backwards between frames');

  /* connect it up and the queue must start moving off the end */
  const depot = api.ents().find((e) => api.MACHINES[e.type].kind === 'sink');
  paint(sm, depot);
  api.computeCrossings(); api.resolve();
  const queuedBefore = api.queuedOn(link);
  for (let i = 0; i < 200; i++) { t += 40; api.frame(t); checkFrame(); }
  ok(worstGap >= api.JAM_SPACING - 1e-6, 'spacing still holds while the queue is draining');
  ok(api.queuedOn(link) < queuedBefore || (link.drain || 0) > 29,
    `material starts leaving the belt (drain ${(link.drain || 0).toFixed(0)}/min)`);
  ok(sm.f > 0.99, `and the smelter runs (${(sm.f * 100).toFixed(0)}%)`);

  console.log(`\n${p} passed, ${f} failed`);
}, 6400);

/* --- slower belts should mean more items visible --- */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- item density ---');
  const S = api.BELT_SPEED;
  for (const [flow, belt] of [[30, 9], [30, 14], [60, 9]]) {
    const n = belt / (S * 60 / flow);
    ok(n >= 1.5, `${flow}/min on a ${belt} m belt shows ${n.toFixed(1)} items at once`);
  }
  const gap = (S * 60 / 30) / S;
  ok(Math.abs(gap - 2.0) < 1e-9, `and 30/min is still exactly one item every ${gap.toFixed(2)} s`);
  console.log(`\n${p} passed, ${f} failed`);
}, 6900);

/* --- placing commits on lift, and shows where belts will attach --- */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- blueprint placement ---');

  api.loadLevel(1);
  const before = api.ents().length;
  const cv = api.renderer.domElement;
  api.setTool('place');
  globalThis.__pick('smelter', 'ingot');

  /* aim at a spot known to be clear, rather than arbitrary pixels */
  const THREE2 = require('three');
  const toScreen = (wx, wz) => {
    const v = new THREE2.Vector3(wx, 0, wz).project(api.camera);
    return { x: (v.x * 0.5 + 0.5) * 390, y: (-v.y * 0.5 + 0.5) * 844 };
  };
  const a = toScreen(6, 3.5), b = toScreen(6.6, 3.9);
  cv.fire('pointerdown', { pointerId: 1, clientX: a.x, clientY: a.y });
  ok(api.gGhost.children.length > 0, 'a blueprint appears as soon as the finger goes down');
  ok(api.ents().length === before, 'and nothing is placed yet');

  const ghost = api.gGhost.children[0];
  const ports = ghost.children.filter((c) => c.isMesh && c.geometry.type === 'BoxGeometry').length;
  ok(ports >= 3, `the blueprint shows the body plus its port markers (${ports} boxes)`);
  ok(ghost.children.some((c) => c.geometry && c.geometry.type === 'ConeGeometry'),
    'the output port is marked with a direction arrow');

  cv.fire('pointermove', { pointerId: 1, clientX: b.x, clientY: b.y });
  ok(api.gGhost.children.length > 0, 'the blueprint follows the finger');
  ok(api.ents().length === before, 'still nothing placed while dragging');

  cv.fire('pointerup', { pointerId: 1, clientX: b.x, clientY: b.y });
  ok(api.ents().length === before + 1, 'the machine is placed when the finger lifts');
  ok(api.gGhost.children.length === 0, 'and the blueprint is cleared');

  /* the placed machine's ports must be where the blueprint said they were */
  const placed = api.ents()[api.ents().length - 1];
  ok(placed && placed.type === 'smelter', `and it is the machine that was picked (${placed && placed.type})`);
  const lp = api.localPorts(placed);
  ok(lp.out.length === 1 && lp.in.length === 1, 'a smelter has one input and one output port');
  const pw = api.portsOf(placed).out[0];
  ok(Math.hypot(pw.x - placed.x, pw.z - placed.z) > 0.4,
    'its output port sits on the footprint edge, not at the centre');

  /* no status lamps left. Checked precisely rather than by counting spheres — the
     smelter's steam puff is legitimately a sphere. */
  const lamps = api.gMachines.children.filter((gr) => gr.userData.anim && gr.userData.anim.lamp).length;
  ok(lamps === 0, `no machine carries a status lamp (${lamps})`);

  console.log(`\n${p} passed, ${f} failed`);
}, 7400);
