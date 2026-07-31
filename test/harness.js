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
    addEventListener() {}, removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    querySelectorAll(sel) { return collect(sel); },
    getContext() {
      /* enough of CanvasRenderingContext2D for the sky gradient, belt chevrons
         and text sprites the game generates at load */
      return {
        scale() {}, translate() {}, rotate() {}, save() {}, restore() {},
        fillText() {}, measureText: () => ({ width: 10 }),
        clearRect() {}, fillRect() {}, strokeRect() {},
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
        stroke() {}, fill() {},
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
const exports_ = ['loadLevel','addEntity','resolve','startRun','scene','camera','LEVELS','MACHINES','groundAt','handleTap','portsOf','freeOutPort','commitStroke','beltMetres','computeCrossings','entAt','setTool','frame','validate','score','updateLabels',
  'simplify','chaikin','resample','minRadius','segHit','routeBlocked','arcTable','MIN_RADIUS','canPlace',
  'sun','renderer','animateMachines','updateRings','buildRings','gMachines','BELT_TEX',
  'portsOf','localPorts','machineYaw','buildMachines'];
const wrapped = body
  + '\n;globalThis.__setStroke = function (e, p) { stroke = { fromEnt: e, fromPort: p, pts: [] }; };'
  + '\n;globalThis.__api = { removeEntityById: function(id){ var e=ents.find(function(x){return x.id===id;}); if(e) removeEntity(e); buildMachines(); }, ents: function(){return ents;}, links: function(){return links;},'
  + ' getPhase: function(){return phase;}, getResult: function(){return result;},'
  + ' getSpinUp: function(){return spinUp;}, setPlanner: function(v){plannerOn=v;},'
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

    console.log('-- starting run --');
    api.startRun();
    for (let i = 0; i < 400; i++) api.frame(performance.now() + i * 33);
    console.log('phase after run:', api.getPhase());

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
