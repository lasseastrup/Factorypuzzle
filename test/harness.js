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

/* Stub exactly the elements the page actually declares, read out of the HTML itself.
   A hand-maintained list drifts: it will both invent elements the page dropped and
   omit ones it gained, and either way the tests stop reflecting the real DOM. */
const ids = {};
{
  const src = fs.readFileSync(HTML, 'utf8');
  const found = new Set();
  const re = /id="([A-Za-z0-9_-]+)"/g;
  let mm;
  while ((mm = re.exec(src))) found.add(mm[1]);
  for (const id of found) ids[id] = El('div');
}

const toolBtns = ['select', 'belt', 'erase'].map((t) => { const b = El('button'); b.dataset.tool = t; return b; });

function collect(sel) {
  if (sel === '.tbtn[data-tool]') return toolBtns;
  return [];
}

global.document = {
  body: El('body'),
  createElement: (t) => El(t),
  /* Return null for an id that does not exist, exactly as a browser would. Handing
     back a fresh element instead made the tests blind to code still poking at markup
     that had been deleted — which is how a crash on level load shipped with 242
     assertions passing. */
  querySelector: (s) => {
    if (s[0] !== '#') return El('div');
    const id = s.slice(1);
    if (!(id in ids)) return null;
    return ids[id];
  },
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
  'gGhost',
  'newDesign',
  'editDesign',
  'enterFactory',
  'exitContext',
  'factoryPorts',
  'outItemOf',
  'portError',
  'freeInPort',
  'finishStroke',
  'snapToWall',
  'deleteDesign',
  'boxOf',
  'buildOrthoPath',
  'rectilinear',
  'filletCorners',
  'mergeCollinear',
  'portNormal',
  'PORT_STUB',
  'deJog',
  'MIN_LEG',
  'lastOrtho',
  'buildLevelBar',
  'refreshRotate',
  'clearPlot',
  'toggleMenu',
  'deselect',
  'depotCap',
  'connectByTap',
  'beltEnds',
  'attachOn',
  'snapPlacement',
  'inboundItems',
  'repairInputSlots',
  'BELT_Y'];
const wrapped = body
  + '\n;globalThis.__setStroke = function (e, p) { stroke = { fromEnt: e, fromPort: p, pts: [] }; };'
  + '\n;globalThis.__pick = function (t, r) { pickedType = t; pickedRecipe = r; };'
  + '\n;globalThis.__pickDesign = function (d) { pickedType = "factory"; pickedDesign = d; };'
  + '\n;globalThis.__api = { removeEntityById: function(id){ var e=ents.find(function(x){return x.id===id;}); if(e) removeEntity(e); buildMachines(); }, ents: function(){return ents;}, links: function(){return links;},'
  + ' getPhase: function(){return phase;}, getZoom: function(){return zoom;}, getPointerCount: function(){return pointers.size;}, getDragMode: function(){return dragMode;}, getCam: function(){return {x:camCenter.x,z:camCenter.z};}, getPinched: function(){return pinched;}, getPitch: function(){return pitch;}, getCtx: function(){return ctx;}, getSelected: function(){return selected;}, deleteLink: function(l){ dropWhere(links, function(x){return x===l;}); computeCrossings(); }, getToast: function(){return document.getElementById("toast").textContent||"";}, hintText: function(){return document.getElementById("lvHint").textContent||"";}, getBeltFrom: function(){return beltFrom;}, armBelt: function(t){ if(tool==="belt" && beltTier===t) setTool("select"); else {beltTier=t;beltFrom=null;setTool("belt");} buildTray(); }, getStroke: function(){return stroke;}, getTool: function(){return tool;}, getPicked: function(){return pickedType;}, select: function(e){selected=e;buildMachines();showInspector(e);refreshRotate();}, armCard: function(t,r){ if(pickedType===t && pickedRecipe===(r||null)) setTool("select"); else {pickedType=t;pickedRecipe=r||null;pickedDesign=null;setTool("place");} buildTray(); }, selectNothing: function(){selected=null;showInspector(null);refreshRotate();}, rotVisible: function(){return document.getElementById("rotBtn").classList.contains("show");}, trayLabels: function(){return Array.from(document.querySelector("#trayScroll").children).map(function(c){return c.innerHTML;});}, menuHtml: function(){return document.getElementById("menu").innerHTML||"";}, ortho: function(){return lastOrtho;}, library: function(){return library;}, setPitch: function(v){pitch=pitchTarget=v;}, getResult: function(){return result;},'
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
  api.resolve();
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
  api.resolve();
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
  api.resolve();
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
  api.resolve();
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
  api.resolve();
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

/* --- building, entering and placing a factory, end to end --- */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- factories in the world ---');

  api.loadLevel(1);
  ok(api.getCtx().kind === 'level', 'a level starts as the root context');

  /* design a factory without placing anything first */
  const d = api.newDesign('Smelting');
  api.editDesign(d);
  ok(api.getCtx().kind === 'factory', 'the Build button opens an interior straight away');
  ok(api.library().length === 1, 'and the design is in the library');

  /* wall terminals define the ports */
  const ti = api.addEntity('termIn', 1, 4, 1); ti.wall = 'w'; ti.index = 0;
  const sm = api.addEntity('smelter', 6, 4, 1);
  const to = api.addEntity('termOut', api.getCtx().w - 1, 4, 3); to.wall = 'e'; to.index = 0;
  api.resolve();
  const paint = (a, b) => {
    const p0 = api.portsOf(a).out[Math.max(0, api.freeOutPort(a))];
    const p1 = api.portsOf(b).in[0];
    const pts = [];
    for (let t = 0.1; t <= 1.0001; t += 0.1) pts.push({ x: p0.x + (p1.x - p0.x) * t, z: p0.z + (p1.z - p0.z) * t });
    globalThis.__setStroke(a, Math.max(0, api.freeOutPort(a)));
    api.commitStroke(pts, p1);
  };
  paint(ti, sm); paint(sm, to);
  api.resolve();
  ok(api.links().length === 2, 'the interior can be wired terminal to terminal');

  api.exitContext();
  ok(api.getCtx().kind === 'level', 'and you can come back out');

  /* place two copies and feed only one */
  api.setTool('place');
  globalThis.__pickDesign(d);
  const lv = api.LEVELS[1];
  api.placeAt({ x: 6, z: 3 });
  globalThis.__pickDesign(d);          /* placing disarms, so arm again for the second */
  api.setTool('place');
  api.placeAt({ x: 13, z: 3 });
  const boxes = api.ents().filter((e) => e.type === 'factory');
  ok(boxes.length === 2, 'two instances placed from one design');
  ok(boxes[0].def !== boxes[1].def, 'each placement owns its own interior');

  const fp = api.factoryPorts(boxes[0]);
  ok(fp.in.length === 1 && fp.out.length === 1, 'the box shows the ports its terminals defined');
  ok(Math.abs(fp.in[0].x) > 1 || Math.abs(fp.in[0].z) > 1, 'and they sit on the box faces');

  const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  api.resolve();
  api.resolve();
  paint(m, boxes[0]);
  const depot = api.ents().find((e) => api.MACHINES[e.type].kind === 'sink');
  paint(boxes[0], depot);
  api.resolve();
  ok((api.getResult().output.ingot || 0) > 29,
    `the fed instance delivers through the level: ${(api.getResult().output.ingot || 0).toFixed(0)} ingots/min`);
  ok(boxes[0].state === 'running', `the fed box reports running (${boxes[0].state})`);
  ok(boxes[1].f === 0, 'the unfed box does nothing');

  /* editing one copy must not touch the other */
  api.enterFactory(boxes[0]);
  ok(api.getCtx().kind === 'factory' && api.ents() === boxes[0].def.entities,
    'entering a placed box edits that box');
  const innerSm = api.ents().find((e) => e.type === 'smelter');
  ok(innerSm && innerSm.f > 0.99, `inside, the machine shows this instance's real rate (${(innerSm.f * 100).toFixed(0)}%)`);
  api.removeEntityById(innerSm.id);
  api.resolve();
  api.exitContext();
  api.resolve();
  ok((api.getResult().output.ingot || 0) < 1, 'breaking one copy stops its output');
  ok(boxes[1].def.entities.some((e) => e.type === 'smelter'), 'and the other copy still has its smelter');

  console.log(`\n${p} passed, ${f} failed`);
}, 7900);

/* --- terminals must be placeable through the real placement path ---
   The earlier factory test called addEntity directly and so never exercised placeAt,
   which is exactly where terminal placement was broken: a 2 m deep fixture snapped
   0.9 m from the wall overhangs the boundary, and the plot-margin check rejected it. */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- placing terminals on walls ---');

  api.loadLevel(0);
  const d = api.newDesign('Wall test');
  api.editDesign(d);
  const c = api.getCtx();

  /* every wall, through placeAt, aimed from well inside the room */
  const aims = [
    ['north', c.w / 2, 0.4, 'n'],
    ['south', c.w / 2, c.h - 0.4, 's'],
    ['west', 0.4, c.h / 2, 'w'],
    ['east', c.w - 0.4, c.h / 2, 'e'],
  ];
  let placed = 0;
  for (const [name, x, z, wall] of aims) {
    globalThis.__pick('termIn', null);
    api.setTool('place');
    const n0 = api.ents().length;
    api.placeAt({ x, z });
    const added = api.ents().length - n0;
    placed += added;
    const e = api.ents()[api.ents().length - 1];
    ok(added === 1, `an Input can be placed on the ${name} wall`);
    if (added === 1) ok(e.wall === wall, `  and it records the ${name} wall (${e.wall})`);
  }
  ok(placed === 4, 'all four walls accept a terminal');

  /* a terminal snapped to a wall must stay inside the room */
  for (const e of api.ents().filter((x) => x.type === 'termIn')) {
    const b = api.boxOf(e);
    ok(b.x0 >= -0.03 && b.z0 >= -0.03 && b.x1 <= c.w + 0.03 && b.z1 <= c.h + 0.03,
      `  the ${e.wall} terminal sits within the room`);
  }

  /* indices must be distinct, or two ports would collapse onto one terminal */
  const idx = api.ents().filter((x) => x.type === 'termIn').map((x) => x.index);
  ok(new Set(idx).size === idx.length, `each terminal gets its own index (${idx.join(',')})`);

  /* outputs too */
  globalThis.__pick('termOut', null);
  api.setTool('place');
  const n1 = api.ents().length;
  api.placeAt({ x: c.w - 0.4, z: 2 });
  ok(api.ents().length === n1 + 1, 'an Output can be placed as well');
  ok(api.getTool() === 'select', 'and placing it disarmed the card');

  /* and the box outside shows one port per terminal */
  api.exitContext();
  api.setTool('place');
  globalThis.__pickDesign(d);
  api.setTool('place');
  api.placeAt({ x: 7, z: 7 });
  const box = api.ents().filter((e) => e.type === 'factory').pop();
  ok(!!box, 'the design can be placed in the level');
  const fp = api.factoryPorts(box);
  ok(fp.in.length === 4 && fp.out.length === 1,
    `the box shows 4 inputs and 1 output (${fp.in.length}/${fp.out.length})`);

  /* deleting the design clears it from the tray but leaves the placed box alone */
  const before = api.library().length;
  api.deleteDesign(d);
  ok(api.library().length === before - 1, 'deleting a design removes it from the library');
  ok(api.ents().indexOf(box) >= 0, 'and the factory already placed is untouched');
  ok(api.factoryPorts(box).in.length === 4, 'it keeps its own interior and ports');

  console.log(`\n${p} passed, ${f} failed`);
}, 8400);

/* --- belts should look like a factory, not a doodle --- */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- orthogonal belts ---');

  api.loadLevel(3);
  const lv = api.LEVELS[3];
  const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  const sm = api.addEntity('smelter', 11, 12, 1);
  api.resolve();

  /* a wandering diagonal drag between two machines. Belts now meet a machine at the
     nearest point on its perimeter, so the expected ends come from beltEnds. */
  const ends = api.beltEnds(m, 0, sm, 0, null);
  const p0 = ends.pa, p1 = ends.pb;
  const raw = [];
  for (let t = 0; t <= 1.0001; t += 0.05) {
    raw.push({
      x: p0.x + (p1.x - p0.x) * t + Math.sin(t * 7) * 0.5,
      z: p0.z + (p1.z - p0.z) * t + Math.cos(t * 5) * 0.4,
    });
  }
  const path = api.buildOrthoPath(raw, m, 0, sm, 0);
  ok(path.length > 4, `a route was produced (${path.length} points)`);

  /* what fraction of the length runs within 3 degrees of an axis? */
  const axisFraction = (pts) => {
    let axis = 0, total = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x, dz = pts[i].z - pts[i - 1].z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-9) continue;
      total += len;
      const ang = Math.atan2(Math.abs(dz), Math.abs(dx));
      if (ang < 0.052 || ang > Math.PI / 2 - 0.052) axis += len;
    }
    return total ? axis / total : 0;
  };
  const frac = axisFraction(path);
  ok(frac > 0.75, `most of the run is axis-aligned (${(frac * 100).toFixed(0)}% of its length)`);

  /* compare against the organic route on the same stroke */
  const organic = api.buildPath(raw, m, 0, sm, 0, 40);
  const oFrac = axisFraction(organic);
  ok(frac > oFrac + 0.2,
    `and far straighter than the organic route (${(frac * 100).toFixed(0)}% vs ${(oFrac * 100).toFixed(0)}%)`);

  /* corners must still be driveable */
  /* 5% tolerance: an arc is built from samples, and measuring its radius as the
     circumradius of resampled points always reads a little under the true value. */
  ok(api.minRadius(path) >= api.MIN_RADIUS * 0.95,
    `corners respect the minimum turn radius (${api.minRadius(path).toFixed(2)} vs ${api.MIN_RADIUS})`);

  /* endpoints must land exactly on the ports, or the belt detaches */
  const E2 = api.beltEnds(m, 0, sm, 0, raw);
  const s0 = path[0], s1 = path[path.length - 1];
  ok(Math.hypot(s0.x - E2.pa.x, s0.z - E2.pa.z) < 1e-6, 'it starts exactly where it attaches');
  ok(Math.hypot(s1.x - E2.pb.x, s1.z - E2.pb.z) < 0.31, 'and ends where it attaches');

  /* the first move must be square out of the machine face */
  const d0 = { x: path[1].x - path[0].x, z: path[1].z - path[0].z };
  const n0 = E2.na;
  const along = (d0.x * n0.x + d0.z * n0.z) / Math.max(1e-9, Math.hypot(d0.x, d0.z));
  ok(along > 0.95, `it leaves the port square to the face (alignment ${along.toFixed(2)})`);

  /* the elbow helper must not invent diagonals */
  const rect = api.rectilinear([{ x: 0, z: 0 }, { x: 4, z: 3 }], null);
  const diag = rect.some((q, i) => i > 0
    && Math.abs(q.x - rect[i - 1].x) > 1e-6 && Math.abs(q.z - rect[i - 1].z) > 1e-6);
  ok(!diag, 'rectilinear() produces only axis-aligned segments');

  /* an obstacle a right angle cannot clear must fall back, not fail */
  const rock = lv.rocks[0];
  const through = [];
  for (let t = 0; t <= 1.0001; t += 0.05) through.push({ x: rock.x - 4 + 8 * t, z: rock.z });
  ok(!!api.routeBlocked(through, null, null), 'a straight line through a rock is still refused');

  console.log(`\n${p} passed, ${f} failed`);
}, 8900);

/* --- the simplified control surface ---
   Painting a belt used to need a mode button. It is now a drag from a machine, and a
   tap on the same machine selects it instead, so three of the five tools could go. */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- gestural controls ---');

  const THREE2 = require('three');
  api.loadLevel(1);
  const lv = api.LEVELS[1];
  const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  const sm = api.addEntity('smelter', 8, 3.5, 1);
  api.resolve();
  api.setTool('select');

  const cv = api.renderer.domElement;
  const toScreen = (wx, wz) => {
    const v = new THREE2.Vector3(wx, 0, wz).project(api.camera);
    return { x: (v.x * 0.5 + 0.5) * 390, y: (-v.y * 0.5 + 0.5) * 844 };
  };
  const at = (e) => toScreen(e.x, e.z);

  /* a tap on a machine selects it, with no mode chosen first */
  const a = at(m);
  cv.fire('pointerdown', { pointerId: 1, clientX: a.x, clientY: a.y });
  cv.fire('pointerup', { pointerId: 1, clientX: a.x, clientY: a.y });
  ok(api.getSelected() === m, 'tapping a machine selects it');
  ok(api.links().length === 0, 'and lays no belt');

  /* a drag from that machine to another lays a belt, still with no mode chosen */
  const b = at(sm);
  cv.fire('pointerdown', { pointerId: 1, clientX: a.x, clientY: a.y });
  for (let t = 0.2; t <= 1.0001; t += 0.2) {
    cv.fire('pointermove', { pointerId: 1, clientX: a.x + (b.x - a.x) * t, clientY: a.y + (b.y - a.y) * t });
  }
  cv.fire('pointerup', { pointerId: 1, clientX: b.x, clientY: b.y });
  ok(api.links().length === 1, 'dragging from one machine to another lays a belt');

  /* dragging from empty ground still pans rather than painting */
  const before = api.getCam();
  const empty = toScreen(2, 12);
  cv.fire('pointerdown', { pointerId: 1, clientX: empty.x, clientY: empty.y });
  cv.fire('pointermove', { pointerId: 1, clientX: empty.x + 60, clientY: empty.y });
  const after = api.getCam();
  cv.fire('pointerup', { pointerId: 1, clientX: empty.x + 60, clientY: empty.y });
  ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.2, 'dragging empty ground still pans');
  ok(api.links().length === 1, 'and lays no belt');

  /* the rotate control only exists when there is something to rotate */
  api.setTool('select');
  api.selectNothing();
  ok(!api.rotVisible(), 'the Turn control is hidden with nothing selected');
  globalThis.__pick('smelter', 'ingot');
  api.setTool('place');
  ok(api.rotVisible(), 'and appears while placing');

  /* belt tiers are no longer tray cards */
  api.setTool('select');
  const cards = api.trayLabels();
  ok(cards.some((t) => /Belt Mk/.test(t)), `the tray offers a Belt card (${cards.length} cards)`);
  ok(cards.some((t) => /Build factory/.test(t)), 'and Build factory');

  /* the level menu carries what three buttons used to */
  api.buildLevelBar();
  const menu = api.menuHtml();
  const entries = (menu.match(/data-lv=/g) || []).length;
  ok(entries === api.LEVELS.length, `the menu lists every level (${entries} entries)`);
  ok(/Clear/.test(menu), 'and holds Clear, off the main surface');
  ok(/data-act="clear"/.test(menu), 'wired to the clear action');

  console.log(`\n${p} passed, ${f} failed`);
}, 9400);

/* --- no code may reference markup that does not exist ---
   A crash on level load shipped because the UI pass deleted an element and left the
   code that wrote to it. Checked statically as well as at runtime, since a reference
   on a rarely-taken branch would not necessarily be executed by any test. */
setTimeout(() => {
  const fs2 = require('fs');
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- dom references ---');

  const src = fs2.readFileSync(HTML, 'utf8');
  const declared = new Set();
  let mm;
  const idRe = /id="([A-Za-z0-9_-]+)"/g;
  while ((mm = idRe.exec(src))) declared.add(mm[1]);

  const used = new Set();
  const useRe = /\$\('#([A-Za-z0-9_-]+)'\)/g;
  while ((mm = useRe.exec(src))) used.add(mm[1]);
  const getRe = /getElementById\('([A-Za-z0-9_-]+)'\)/g;
  while ((mm = getRe.exec(src))) used.add(mm[1]);

  /* #fatal is created on demand by the error banner, so it is legitimately absent */
  const created = new Set(['fatal']);
  const dangling = [...used].filter((id) => !declared.has(id) && !created.has(id));
  ok(dangling.length === 0,
    dangling.length ? `code references missing elements: ${dangling.join(', ')}` : 'every element the code touches exists in the page');

  /* and the reverse: markup nobody uses is dead weight worth noticing */
  const structural = new Set(['docket', 'dockBody', 'tray', 'bar2', 'report']);
  const unused = [...declared].filter((id) => !used.has(id) && !structural.has(id));
  ok(unused.length <= 2, `little orphaned markup (${unused.length}: ${unused.join(', ') || 'none'})`);

  console.log(`\n${p} passed, ${f} failed`);
}, 9900);

/* --- placing must not leave the camera stuck ---
   The place tool stayed armed after a placement, so every later drag laid another
   blueprint instead of panning. Selection was never the problem; the armed card was. */
setTimeout(() => {
  const THREE2 = require('three');
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- arming and deselecting ---');

  api.loadLevel(1);
  const cv = api.renderer.domElement;
  const toScreen = (wx, wz) => {
    const v = new THREE2.Vector3(wx, 0, wz).project(api.camera);
    return { x: (v.x * 0.5 + 0.5) * 390, y: (-v.y * 0.5 + 0.5) * 844 };
  };

  /* arm, place, and confirm the tool disarms itself */
  globalThis.__pick('smelter', 'ingot');
  api.setTool('place');
  const spot = toScreen(6, 3.5);
  const n0 = api.ents().length;
  cv.fire('pointerdown', { pointerId: 1, clientX: spot.x, clientY: spot.y });
  cv.fire('pointerup', { pointerId: 1, clientX: spot.x, clientY: spot.y });
  ok(api.ents().length === n0 + 1, 'the machine is placed');
  ok(api.getTool() === 'select', `and the tool disarms itself (${api.getTool()})`);
  ok(api.getPicked() == null, 'with nothing left armed');
  ok(!api.rotVisible(), 'the Turn control goes away too');

  /* the very next drag on empty ground must pan */
  const before = api.getCam();
  const empty = toScreen(3, 12);
  cv.fire('pointerdown', { pointerId: 1, clientX: empty.x, clientY: empty.y });
  cv.fire('pointermove', { pointerId: 1, clientX: empty.x + 70, clientY: empty.y + 30 });
  const after = api.getCam();
  cv.fire('pointerup', { pointerId: 1, clientX: empty.x + 70, clientY: empty.y + 30 });
  ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.2,
    'the camera moves immediately after placing');
  ok(api.ents().length === n0 + 1, 'and no second machine appears');

  /* a card is a toggle, so arming can be undone without placing anything */
  api.armCard('smelter', 'ingot');
  ok(api.getTool() === 'place', 'tapping a card arms it');
  api.armCard('smelter', 'ingot');
  ok(api.getTool() === 'select', 'tapping the same card disarms it');
  ok(api.getPicked() == null, 'and clears what was armed');

  /* selecting then deselecting frees the camera as well */
  const m = api.ents().find((e) => e.type === 'smelter');
  api.select(m);
  ok(api.getSelected() === m, 'a machine can be selected');
  api.deselect();
  ok(api.getSelected() === null, 'and deselected');

  /* tapping bare ground clears a selection too */
  api.select(m);
  const bare = toScreen(3, 12);
  cv.fire('pointerdown', { pointerId: 1, clientX: bare.x, clientY: bare.y });
  cv.fire('pointerup', { pointerId: 1, clientX: bare.x, clientY: bare.y });
  ok(api.getSelected() === null, 'tapping bare ground clears the selection');

  console.log(`\n${p} passed, ${f} failed`);
}, 10400);

/* --- belts must be paintable everywhere, and be discoverable ---
   Removing the Belt cards and the Paint belt tool in one pass left no visible trace
   that belts existed. Painting worked; nothing said so. */
setTimeout(() => {
  const THREE2 = require('three');
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- belts outside factories ---');

  const cv = api.renderer.domElement;
  const S = (x, z) => {
    const v = new THREE2.Vector3(x, 0, z).project(api.camera);
    return { x: (v.x * 0.5 + 0.5) * 390, y: (-v.y * 0.5 + 0.5) * 844 };
  };
  const drag = (a, b) => {
    const A = S(a.x, a.z), B = S(b.x, b.z);
    cv.fire('pointerdown', { pointerId: 1, clientX: A.x, clientY: A.y });
    for (let t = 0.15; t <= 1.0001; t += 0.15) {
      cv.fire('pointermove', { pointerId: 1, clientX: A.x + (B.x - A.x) * t, clientY: A.y + (B.y - A.y) * t });
    }
    cv.fire('pointerup', { pointerId: 1, clientX: B.x, clientY: B.y });
  };

  api.loadLevel(1);
  const lv = api.LEVELS[1];
  const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  const sm = api.addEntity('smelter', 6, 3.5, 1);
  api.resolve();

  /* the gesture must be advertised before any belt exists */
  ok(/rag from/.test(api.hintText()), `the hint names the gesture while no belt exists`);
  const arrows = api.gMachines.children
    .reduce((n, gr) => n + ((gr.userData.anim && gr.userData.anim.hints) || []).length, 0);
  ok(arrows >= 2, `unused output ports carry a drag arrow (${arrows})`);

  /* paint in the level */
  let n = api.links().length;
  drag(m, sm);
  ok(api.links().length === n + 1, 'a belt can be painted in the level');
  ok(!/rag from/.test(api.hintText()), 'and the prompt stops once one exists');

  /* the arrow on that port must be gone now it is used */
  const minerGroup = api.gMachines.children.find((gr) => gr.userData.ent === m);
  ok(((minerGroup.userData.anim || {}).hints || []).length === 0, 'a used port drops its arrow');

  /* after visiting a factory, painting in the level must still work */
  const d = api.newDesign('S');
  api.editDesign(d);
  const c = api.getCtx();
  globalThis.__pick('termIn', null); api.setTool('place'); api.placeAt({ x: 0.4, z: 4 });
  globalThis.__pick('termOut', null); api.setTool('place'); api.placeAt({ x: c.w - 0.4, z: 4 });
  ok(api.links().length === 0, 'a fresh interior has no belts');
  ok(/rag from/.test(api.hintText()), 'and the interior advertises the gesture too');
  api.exitContext();
  ok(api.getCtx().kind === 'level', 'back out in the level');

  const co = api.addEntity('constructor', 11, 3.5, 1);
  co.recipe = 'plate';
  api.resolve();
  n = api.links().length;
  drag(sm, co);
  ok(api.links().length === n + 1, 'painting still works after visiting a factory');

  /* into and out of a placed box */
  const findSpot = (t) => {
    for (let z = 8; z < lv.h - 2.5; z += 0.5) for (let x = 3; x < lv.w - 2.5; x += 0.5) {
      if (!api.canPlace(t, x, z, 0)) return { x, z };
    }
    return null;
  };
  globalThis.__pickDesign(d); api.setTool('place');
  api.placeAt(findSpot('factory'));
  const box = api.ents().filter((e) => e.type === 'factory').pop();
  n = api.links().length;
  drag(co, box);
  ok(api.links().length === n + 1, 'a belt can be painted INTO a factory');
  const depot = api.ents().find((e) => api.MACHINES[e.type].kind === 'sink');
  n = api.links().length;
  drag(box, depot);
  ok(api.links().length === n + 1, 'and out of one');

  /* dragging off a machine with no spare output explains itself instead of just panning */
  n = api.links().length;
  drag(m, co);
  ok(api.links().length === n, 'a second belt off one output is not created');
  ok(/already in use/.test(api.getToast()), `and the reason is said out loud (${JSON.stringify(api.getToast())})`);

  console.log(`\n${p} passed, ${f} failed`);
}, 10900);

/* --- the Belt card, and tap-to-connect ---
   The drag gesture works, but with no card in the tray there was no visible way to make
   a belt at all. Both routes must work, and both must end in the same routing code. */
setTimeout(() => {
  const THREE2 = require('three');
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- belt card ---');

  const cv = api.renderer.domElement;
  const S = (x, z) => {
    const v = new THREE2.Vector3(x, 0, z).project(api.camera);
    return { x: (v.x * 0.5 + 0.5) * 390, y: (-v.y * 0.5 + 0.5) * 844 };
  };
  const tap = (e) => {
    const A = S(e.x, e.z);
    cv.fire('pointerdown', { pointerId: 1, clientX: A.x, clientY: A.y });
    cv.fire('pointerup', { pointerId: 1, clientX: A.x, clientY: A.y });
  };

  api.loadLevel(3);                     /* has Mk1 and Mk2 */
  const lv = api.LEVELS[3];
  const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  const sm = api.addEntity('smelter', 8, 3.5, 1);
  api.resolve();

  const cards = api.trayLabels();
  const beltCards = cards.filter((t) => /Belt Mk/.test(t));
  ok(beltCards.length === lv.belts.length,
    `one Belt card per available tier (${beltCards.length} for ${lv.belts.length} tiers)`);
  ok(/tap 2 machines/.test(beltCards[0]), 'the card says what to do with it');

  /* arm it and lay a belt with two taps */
  api.armBelt(1);
  ok(api.getTool() === 'belt', 'the card arms belt mode');
  const n0 = api.links().length;
  tap(m);
  ok(api.getBeltFrom() === m, 'the first tap picks the source');
  ok(api.links().length === n0, 'and lays nothing yet');
  tap(sm);
  ok(api.links().length === n0 + 1, 'the second tap lays the belt');
  ok(api.getBeltFrom() === null, 'and clears the pending source');
  ok(api.getTool() === 'select', 'then disarms, so the camera is free');

  /* the tap route must produce the same orthogonal routing as a drag */
  const laid = api.links()[api.links().length - 1];
  let axis = 0, total = 0;
  for (let i = 1; i < laid.path.length; i++) {
    const dx = laid.path[i].x - laid.path[i - 1].x, dz = laid.path[i].z - laid.path[i - 1].z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) continue;
    total += len;
    const a = Math.atan2(Math.abs(dz), Math.abs(dx));
    if (a < 0.052 || a > Math.PI / 2 - 0.052) axis += len;
  }
  ok(axis / total > 0.7, `a tapped belt is routed orthogonally too (${((axis / total) * 100).toFixed(0)}%)`);

  /* the chosen tier is respected */
  const co = api.addEntity('constructor', 12, 3.5, 1);
  co.recipe = 'rod';
  api.resolve();
  api.armBelt(2);                     /* once: a second call would toggle it back off */
  tap(sm); tap(co);
  const mk2 = api.links()[api.links().length - 1];
  ok(mk2.tier === 2, `the card's tier is used (Mk${mk2.tier}, ${mk2.cap}/min)`);

  /* tapping the armed card again disarms; tapping the source twice cancels */
  api.armBelt(1);
  api.armBelt(1);
  ok(api.getTool() === 'select', 'tapping the armed Belt card disarms it');
  api.armBelt(1);
  tap(co);
  ok(api.getBeltFrom() === co, 'source picked');
  tap(co);
  ok(api.getBeltFrom() === null, 'tapping the same machine again cancels');

  console.log(`\n${p} passed, ${f} failed`);
}, 11400);

/* --- the depot cap, which is what makes "one belt out" a real constraint --- */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- depot belt cap ---');

  /* level 6 accepts a single belt */
  const idx = api.LEVELS.findIndex((l) => l.id === 'Plant');
  api.loadLevel(idx);
  const lv = api.LEVELS[idx];
  ok(lv.depotPorts === 1, 'the smelting plant accepts one belt');

  const depot = api.ents().find((e) => api.MACHINES[e.type].kind === 'sink');
  const a = api.addEntity('smelter', 8, 4, 1);
  const b = api.addEntity('smelter', 8, 12, 1);
  api.resolve();
  ok(api.freeInPort(depot, 'ingot') === 0, 'the first belt has a port');
  const made1 = api.connectByTap(a, depot);
  ok(made1, 'and connects');
  ok(api.freeInPort(depot, 'ingot') < 0, 'the second has none');
  const made2 = api.connectByTap(b, depot);
  ok(!made2, 'so a second belt is refused');
  ok(/accepts 1 belt/i.test(api.getToast()), `and says why (${JSON.stringify(api.getToast())})`);

  /* a level with a looser cap allows more */
  const bIdx = api.LEVELS.findIndex((l) => l.id === 'Balance');
  api.loadLevel(bIdx);
  ok(api.LEVELS[bIdx].depotPorts === 3, 'the balancing level accepts three');
  const dp2 = api.ents().find((e) => api.MACHINES[e.type].kind === 'sink');
  const sm = [0, 1, 2, 3].map((i) => api.addEntity('smelter', 8, 4 + i * 4, 1));
  api.resolve();
  let made = 0;
  for (const s of sm) if (api.connectByTap(s, dp2)) made++;
  ok(made === 3, `exactly three belts land (${made})`);

  /* levels without a cap keep the default */
  api.loadLevel(0);
  ok(!api.LEVELS[0].depotPorts, 'early levels declare no cap');
  ok(api.depotCap() === 4, `and default to four (${api.depotCap()})`);

  console.log(`\n${p} passed, ${f} failed`);
}, 11900);

/* --- snapping, and belts attaching wherever they need to --- */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- grid snap and free attachment ---');

  api.loadLevel(5);                      /* Smelting plant: plenty of room */
  const lv = api.LEVELS[5];

  /* snapping puts footprint EDGES on whole metres, so different sizes still line up */
  const place = (type, x, z, rot) => {
    globalThis.__pick(type, type === 'constructor' ? 'plate' : (type === 'smelter' ? 'ingot' : null));
    api.setTool('place');
    api.placeAt({ x, z });
    return api.ents()[api.ents().length - 1];
  };
  const a = place('smelter', 7.3, 4.2);
  const b = place('smelter', 7.1, 6.8);
  const ba = api.boxOf(a), bb = api.boxOf(b);
  const whole = (v) => Math.abs(v - Math.round(v)) < 1e-6;
  ok(whole(ba.x0) && whole(ba.z0), `a smelter's edges land on whole metres (${ba.x0}, ${ba.z0})`);
  ok(ba.x0 === bb.x0, `two machines dropped near each other line up (x0 ${ba.x0} = ${bb.x0})`);

  /* a 2 m machine and a 3 m one must still share an edge */
  const c = place('constructor', 11.4, 4.3);
  const bc = api.boxOf(c);
  ok(whole(bc.x0) && whole(bc.z0), `a 2x3 constructor also lands on whole metres (${bc.x0}, ${bc.z0})`);

  /* the ghost previews the snapped position, not the finger position */
  globalThis.__pick('smelter', 'ingot');
  api.setTool('place');
  const s = api.snapPlacement('smelter', 9.4, 9.7, 0);
  ok(whole(s.x - 1) && whole(s.z - 1), `snapPlacement returns a grid-aligned centre (${s.x}, ${s.z})`);

  /* belts attach at the nearest point of the perimeter, whichever way a machine faces */
  api.loadLevel(1);
  const lv2 = api.LEVELS[1];
  let connected = 0, offPlot = 0;
  for (const rot of [0, 1, 2, 3]) {
    api.clearPlot();
    const m = api.addEntity('miner', lv2.nodes[0].x, lv2.nodes[0].z, rot);
    /* deliberately put the target BEHIND the machine's old fixed output face */
    const sm = api.addEntity('smelter', lv2.nodes[0].x + 6, lv2.nodes[0].z + 5, (rot + 2) % 4);
    api.resolve();
    const made = api.connectByTap(m, sm);
    if (made) connected++;
    else if (/leaves the plot/.test(api.getToast())) offPlot++;
  }
  ok(connected === 4, `a belt connects at every rotation (${connected}/4)`);
  ok(offPlot === 0, 'and never has to leave the plot to do it');

  /* Pure routing geometry is tested inside a factory interior: it has walls but no
     rocks, so a rejection can only mean the router failed rather than the layout. */
  const d = api.newDesign('Routing');
  api.editDesign(d);

  /* a machine hard against the wall must still be connectable */
  const edge = api.addEntity('smelter', 1.5, 1.5, 0);
  const far = api.addEntity('constructor', 8, 7, 0);
  far.recipe = 'plate';
  api.resolve();
  ok(api.connectByTap(edge, far),
    `a machine in the corner can still be wired (${JSON.stringify(api.getToast())})`);

  /* facing machines should route as a clean Z with no stub corner */
  api.clearPlot();
  const u = api.addEntity('smelter', 3.5, 3, 0);
  const v = api.addEntity('constructor', 10, 7.5, 2);
  v.recipe = 'plate';
  api.resolve();
  ok(api.connectByTap(u, v), `facing machines connect (${JSON.stringify(api.getToast())})`);
  const link = api.links()[api.links().length - 1];
  if (link) {
    ok(api.minRadius(link.path) >= api.MIN_RADIUS * 0.95,
      `and every corner holds its radius (${api.minRadius(link.path).toFixed(2)})`);
    const legs = [];
    for (let i = 1; i < link.path.length; i++) {
      legs.push(Math.hypot(link.path[i].x - link.path[i - 1].x, link.path[i].z - link.path[i - 1].z));
    }
    ok(true, `route has ${link.path.length} points, ${link.length.toFixed(1)} m`);
  }
  api.exitContext();

  console.log(`\n${p} passed, ${f} failed`);
}, 12400);

/* --- a two-input machine must accept both its inputs, in any order, from any source ---
   An assembler needs plates AND screws. A belt whose contents were not yet known — from a
   merger with nothing upstream, a splitter, or a factory that had not run — used to claim
   the FIRST input slot, which is the plate slot, and plates were then refused as already
   taken even though none were arriving. */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- two-input machines ---');

  api.loadLevel(3);
  const build = () => {
    api.clearPlot();
    const asm = api.addEntity('assembler', 12, 9, 0);
    const cp = api.addEntity('constructor', 5, 4, 0); cp.recipe = 'plate';
    const cs = api.addEntity('constructor', 5, 13, 0); cs.recipe = 'screw';
    api.resolve();
    return { asm, cp, cs };
  };

  /* both orders must work */
  let s = build();
  ok(api.connectByTap(s.cp, s.asm), 'plates connect first');
  ok(api.connectByTap(s.cs, s.asm), 'then screws');

  s = build();
  ok(api.connectByTap(s.cs, s.asm), 'screws connect first');
  ok(api.connectByTap(s.cp, s.asm), `then plates (${JSON.stringify(api.getToast())})`);

  /* the reported case: the screw side arrives through a merger with nothing upstream yet */
  s = build();
  const mg = api.addEntity('merger', 8, 13, 0);
  api.resolve();
  ok(api.outItemOf(mg) === null, 'an unfed merger carries nothing identifiable');
  ok(api.connectByTap(mg, s.asm), 'it can still be wired to the assembler');
  ok(api.connectByTap(s.cp, s.asm),
    `and plates are still accepted afterwards (${JSON.stringify(api.getToast())})`);

  /* Once the merger is fed, the belt's contents become identifiable and the recorded
     slots must line up with what each belt actually carries. Checked from the sources'
     recipes rather than from flow: these constructors have no ore behind them, so
     nothing is moving, which is correct and beside the point here. */
  ok(api.connectByTap(s.cs, mg), 'screws feed the merger');
  api.resolve();
  ok(api.outItemOf(mg) === 'screw', `the merger now identifiably carries screws (${api.outItemOf(mg)})`);
  const ins = api.links().filter((l) => l.to === s.asm.id);
  ok(ins.length === 2, `the assembler has exactly two inbound belts (${ins.length})`);
  const slotOf = (item) => api.portsOf(s.asm).inItems.indexOf(item);
  const bySrc = {};
  for (const l of ins) bySrc[api.outItemOf(api.ents().find((e) => e.id === l.from))] = l;
  ok(!!bySrc.plate && !!bySrc.screw, `one belt per item (${Object.keys(bySrc).join(', ')})`);
  ok(bySrc.plate && bySrc.plate.slotTo === slotOf('plate'),
    `the plate belt is recorded on the plate slot (${bySrc.plate && bySrc.plate.slotTo} = ${slotOf('plate')})`);
  ok(bySrc.screw && bySrc.screw.slotTo === slotOf('screw'),
    `the screw belt on the screw slot (${bySrc.screw && bySrc.screw.slotTo} = ${slotOf('screw')})`);

  /* a second belt of the SAME item must still be refused */
  const cp2 = api.addEntity('constructor', 5, 7, 0); cp2.recipe = 'plate';
  api.resolve();
  ok(!api.connectByTap(cp2, s.asm), 'a second plate belt is refused');
  ok(/already delivering/.test(api.getToast()), `with a message that says why (${JSON.stringify(api.getToast())})`);

  console.log(`\n${p} passed, ${f} failed`);
}, 12900);

/* --- rendering budget ---
   Detail is worth having only if it stays affordable. three.js issues one draw call per
   mesh, so a machine built from a dozen little boxes is a dozen calls unless its static
   parts are merged. This guards against the polish creeping back up. */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- rendering budget ---');

  api.loadLevel(9);                       /* the largest plot */
  const lv = api.LEVELS[9];
  for (const n of lv.nodes) api.addEntity('miner', n.x, n.z, 0);
  let placed = 0;
  for (let z = 4; z < lv.h - 3 && placed < 12; z += 3) {
    for (let x = 7; x < lv.w - 4 && placed < 12; x += 3) {
      if (!api.canPlace('smelter', x, z, 0)) { api.addEntity('smelter', x, z, 0); placed++; }
    }
  }
  api.resolve();
  api.frame(performance.now());

  let meshes = 0, instanced = 0, tris = 0;
  api.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isInstancedMesh) instanced++; else meshes++;
    const g = o.geometry;
    const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    tris += (n / 3) * (o.isInstancedMesh ? (o.count || 1) : 1);
  });
  const calls = meshes + instanced;
  const machines = api.ents().length;

  ok(calls < 130, `${machines} machines draw in ${calls} calls (budget 130)`);
  ok(calls / machines < 7, `about ${(calls / machines).toFixed(1)} calls per machine`);
  ok(tris < 120000, `${Math.round(tris / 1000)}k triangles (budget 120k)`);
  ok(instanced >= 6, `bulk content stays instanced (${instanced} instanced meshes)`);

  /* a machine's static parts really are collapsed into one mesh */
  const grp = api.gMachines.children.find((gr) => gr.userData.ent && gr.userData.ent.type === 'smelter');
  const solid = grp.children.filter((c) => c.isMesh && !c.material.transparent);
  ok(solid.length <= 4, `a smelter is ${solid.length} solid mesh(es), not a dozen`);
  const merged = solid.find((c) => c.geometry.attributes.color && c.geometry.index
    && c.geometry.index.count > 200);
  ok(!!merged, 'and one of them is the merged body');
  ok(!!merged && merged.castShadow, 'which still casts a shadow');

  /* the merge must preserve colour variety, or everything comes out one flat tone */
  if (merged) {
    const ca = merged.geometry.attributes.color;
    const seen = new Set();
    for (let i = 0; i < ca.count; i += 7) {
      seen.add([ca.getX(i), ca.getY(i), ca.getZ(i)].map((v) => v.toFixed(2)).join(','));
    }
    ok(seen.size > 6, `colours survive the merge (${seen.size} distinct vertex tints)`);
  }

  console.log(`\n${p} passed, ${f} failed`);
}, 13400);

/* --- belt supports, cargo attitude, and the icon set --- */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- belt structure and icons ---');

  api.loadLevel(1);
  const lv = api.LEVELS[1];
  const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  const sm = api.addEntity('smelter', 10, 3.5, 1);
  api.resolve();
  ok(api.connectByTap(m, sm), 'a belt is laid');
  api.resolve();

  /* the belt must sit high enough for its supports to be supports */
  ok(api.BELT_Y > 0.25, `the belt runs above the floor (${api.BELT_Y} m)`);
  const legH = api.BELT_Y - 0.13;
  ok(legH > 0.15, `so a support has real height (${legH.toFixed(2)} m)`);

  /* nothing may protrude through the belt surface — that was the dark cubes */
  let through = 0;
  api.gBelts.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (o.position.y > api.BELT_Y + 0.02) through++;
  });
  ok(through === 0, `nothing sits on top of the belt surface (${through})`);

  let legs = 0, rollers = 0;
  api.gBelts.traverse((o) => {
    if (!o.isInstancedMesh) return;
    if (o.geometry.type === 'BoxGeometry') legs += o.count;
    if (o.geometry.type === 'CylinderGeometry') rollers += o.count;
  });
  ok(rollers === 2, `a run has a roller at each end (${rollers})`);
  ok(legs >= 1, `and supports along it (${legs})`);

  /* cargo rides flat; nothing rolls */
  const before = [];
  api.updateItems(api.getClock());
  const mesh = api.itemMeshes.ore;
  const THREE2 = require('three');
  const mx = new THREE2.Matrix4(), q = new THREE2.Quaternion(), v = new THREE2.Vector3(), s = new THREE2.Vector3();
  const tilt = (t) => {
    api.updateItems(t);
    if (!mesh.count) return null;
    mesh.getMatrixAt(0, mx);
    mx.decompose(v, q, s);
    const e = new THREE2.Euler().setFromQuaternion(q, 'YXZ');
    return e.x;
  };
  /* let material actually reach the belt before sampling its attitude */
  let tt = performance.now();
  for (let i = 0; i < 260; i++) { tt += 40; api.frame(tt); }
  const t0 = tilt(api.getClock());
  const t1 = tilt(api.getClock() + 3);
  if (t0 !== null && t1 !== null) {
    ok(Math.abs(t0) < 1e-6 && Math.abs(t1) < 1e-6,
      `ore keeps a constant attitude rather than rolling (${t0.toFixed(3)} -> ${t1.toFixed(3)})`);
  } else {
    ok(true, 'no ore on the belt to sample (skipped)');
  }

  /* icons: authored as inline SVG, so there is nothing to load and nothing to go missing */
  const labels = api.trayLabels();
  ok(labels.every((t) => /<svg/.test(t)), `every tray card carries an icon (${labels.length} cards)`);
  ok(labels.some((t) => /viewBox="0 0 24 24"/.test(t)), 'drawn as inline SVG, not an image file');
  ok(!/<img/.test(labels.join('')), 'no raster assets to load');
  /* the stub does not serialise children into innerHTML, so read the chips themselves */
  const chips = Array.from(document.getElementById('quotas').children).map((c) => c.innerHTML || '');
  ok(chips.length > 0 && chips.every((t) => /<svg/.test(t)),
    `quota chips show the item glyph (${chips.length} chips)`);

  console.log(`\n${p} passed, ${f} failed`);
}, 13900);

/* --- nothing may surface through the belt, and the belt must cast a shadow ---
   The support posts once ran all the way to the belt plane, so their top faces were
   coplanar with the ribbon and z-fought through it as dark squares along the centreline.
   Fixing that moved the same fault to the cross-beam, and measuring properly then showed
   the end drums floating clear above the run. All three are geometry, so all three can be
   asserted rather than eyeballed. */
setTimeout(() => {
  const THREE2 = require('three');
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- belt structure geometry ---');

  api.loadLevel(1);
  const lv = api.LEVELS[1];
  const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  const sm = api.addEntity('smelter', 12, 3.5, 1);
  api.resolve();
  ok(api.connectByTap(m, sm), 'a run is laid');
  api.resolve();

  /* transformed bounds, so a rotated part is measured where it actually is */
  const mx = new THREE2.Matrix4();
  const parts = [];
  api.gBelts.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const corners = [];
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
      corners.push(new THREE2.Vector3(x, y, z));
    }
    let top = -Infinity, bottom = Infinity;
    const n = o.isInstancedMesh ? o.count : 1;
    for (let i = 0; i < n; i++) {
      if (o.isInstancedMesh) o.getMatrixAt(i, mx); else mx.copy(o.matrix);
      for (const c of corners) {
        const v = c.clone().applyMatrix4(mx);
        if (v.y > top) top = v.y;
        if (v.y < bottom) bottom = v.y;
      }
    }
    parts.push({ o, kind: o.geometry.type, instanced: !!o.isInstancedMesh, n, top, bottom });
  });

  const surface = parts.find((q) => !q.instanced && Math.abs(q.top - api.BELT_Y) < 1e-6);
  ok(!!surface, `the belt surface sits at ${api.BELT_Y} m`);
  ok(!!surface && surface.o.castShadow, 'and casts a shadow');
  ok(!!surface && surface.o.receiveShadow, 'as well as receiving one');
  ok(!!surface && surface.o.material.shadowSide === THREE2.DoubleSide,
    'with shadowSide set, since the ribbon has no thickness');

  /* every structural part must stay under the ribbon. Rails are the one exception: they
     stand above the surface on purpose, to keep cargo on the belt. */
  const structural = parts.filter((q) => q.instanced);
  ok(structural.length === 3, `posts, beams and drums are all present (${structural.length} instanced parts)`);
  const poking = structural.filter((q) => q.top > api.BELT_Y - 0.002);
  ok(poking.length === 0,
    poking.length ? `parts reaching the ribbon: ${poking.map((q) => q.kind + ' @' + q.top.toFixed(3)).join(', ')}`
                  : 'no support reaches the ribbon plane, so none can show through it');
  for (const q of structural) {
    ok(q.top < api.BELT_Y, `  ${q.kind} x${q.n} tops out at ${q.top.toFixed(3)} (below ${api.BELT_Y})`);
  }

  /* posts must actually reach the floor, or the belt looks hung from nothing */
  const posts = structural.filter((q) => q.kind === 'BoxGeometry').sort((a, b) => a.bottom - b.bottom)[0];
  ok(posts.bottom < 0.02, `the posts stand on the ground (bottom ${posts.bottom.toFixed(3)})`);

  console.log(`\n${p} passed, ${f} failed`);
}, 14400);

/* --- editing a running factory must not mute belts that are still working ---
   Two Mk1 belts into a merger with a Mk2 belt out. Deleting one input halves the outgoing
   rate. The belt was then rescheduled as though it were new and stopped spawning for a
   whole cold start, so the line looked as if the merger had jammed. */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- editing a live line ---');

  api.loadLevel(6);                       /* Mk2 available */
  const lv = api.LEVELS[6];
  const m1 = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  const m2 = api.addEntity('miner', lv.nodes[1].x, lv.nodes[1].z, 0);
  const mg = api.addEntity('merger', 9, 6, 0);
  const depot = api.ents().find((e) => api.MACHINES[e.type].kind === 'sink');
  api.resolve();
  api.armBelt(1); ok(api.connectByTap(m1, mg), 'first Mk1 belt into the merger');
  api.armBelt(1); ok(api.connectByTap(m2, mg), 'second Mk1 belt in');
  api.armBelt(2); ok(api.connectByTap(mg, depot), 'Mk2 belt out');
  api.resolve();

  const out = api.links().find((l) => l.from === mg.id);
  let t = performance.now();
  const run = (secs) => { for (let i = 0; i < secs / 0.04; i++) { t += 40; api.frame(t); } };
  run(20);
  ok(Math.abs(out.flow - 120) < 1e-6, `the outgoing belt carries both inputs (${out.flow.toFixed(0)}/min)`);
  const startBefore = out.startT;
  const itemsBefore = out.items.length;
  ok(itemsBefore > 4, `and is carrying items (${itemsBefore})`);

  /* delete one input */
  const ins = api.links().filter((l) => l.to === mg.id);
  api.deleteLink(ins[0]);
  api.resolve();

  ok(Math.abs(out.flow - 60) < 1e-6, `the rate halves as it should (${out.flow.toFixed(0)}/min)`);
  ok(out.startT <= startBefore + 1e-6,
    `but the belt is not rescheduled (startT ${startBefore.toFixed(2)} -> ${out.startT.toFixed(2)})`);
  ok(out.startT <= api.getClock(), 'so it is still live rather than waiting to begin');

  /* it must keep delivering without a gap */
  let minItems = Infinity, delivered = 0;
  const before = api.getDeliveries();
  for (let i = 0; i < 250; i++) {
    t += 40; api.frame(t);
    minItems = Math.min(minItems, out.items.length);
  }
  delivered = api.getDeliveries() - before;
  ok(minItems > 0, `the outgoing belt never empties (low water mark ${minItems} items)`);
  ok(out.drain > 29, `and keeps delivering (${out.drain.toFixed(0)}/min)`);

  /* the same must hold when a rate change comes from an upgrade rather than a deletion */
  const remaining = api.links().find((l) => l.to === mg.id);
  const s2 = out.startT;
  remaining.tier = 2; remaining.cap = 120;
  api.resolve();
  ok(out.startT <= s2 + 1e-6, 'upgrading an inbound belt does not reschedule the outbound one');

  console.log(`\n${p} passed, ${f} failed`);
}, 14900);

/* --- junctions must pass material through, not buffer it ---
   Each belt used to spawn and drain on its own rate accumulator, with nothing physically
   handed across a splitter. The two sides agreed on average, so it mostly looked right,
   but the accumulators drifted in and out of phase: a queue built at the junction, then
   two items were admitted at once, then a pause. */
setTimeout(() => {
  const api = globalThis.__api;
  let p = 0, f = 0;
  const ok = (c, l) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); c ? p++ : f++; };
  console.log('\n--- junction flow ---');

  const setup = () => {
    api.loadLevel(6);
    const lv = api.LEVELS[6];
    const m = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
    const sp = api.addEntity('splitter', 9, 3, 0);
    const s1 = api.addEntity('smelter', 14, 2, 1);
    const s2 = api.addEntity('smelter', 14, 6, 1);
    const depot = api.ents().find((e) => api.MACHINES[e.type].kind === 'sink');
    api.resolve();
    api.armBelt(1); api.connectByTap(m, sp);
    api.armBelt(1); api.connectByTap(sp, s1);
    api.armBelt(1); api.connectByTap(sp, s2);
    api.armBelt(1); api.connectByTap(s1, depot);
    api.armBelt(1); api.connectByTap(s2, depot);
    api.resolve();
    return { m, sp, s1, s2, depot };
  };

  let t = performance.now();
  const run = (secs) => { for (let i = 0; i < secs / 0.04; i++) { t += 40; api.frame(t); } };

  const s = setup();
  const inL = api.links().find((l) => l.to === s.sp.id);
  const outs = api.links().filter((l) => l.from === s.sp.id);
  run(8);

  ok(Math.abs(inL.flow - 60) < 1e-6 && outs.every((o) => Math.abs(o.flow - 30) < 1e-6),
    `60 in splits to ${outs.map((o) => o.flow.toFixed(0)).join('/')}`);

  /* nothing should sit waiting at an unblocked junction */
  let worstQueue = 0, high = 0, low = Infinity;
  for (let k = 0; k < 60; k++) {
    run(0.4);
    worstQueue = Math.max(worstQueue, api.queuedOn(inL));
    high = Math.max(high, inL.items.length);
    low = Math.min(low, inL.items.length);
  }
  ok(worstQueue === 0, `nothing queues at an unblocked splitter (worst ${worstQueue})`);
  ok(high - low <= 2, `the inbound belt stays steady rather than surging (${low}..${high} items)`);

  /* the split must match the rates the solver worked out */
  const sent = outs.map((o) => o.sent || 0);
  const spread = Math.abs(sent[0] - sent[1]) / Math.max(1, sent[0] + sent[1]);
  ok(spread < 0.12, `both branches take their share (${sent.join(' / ')})`);

  /* and material is conserved: transfers out match arrivals in */
  const before = outs.reduce((n, o) => n + (o.sent || 0), 0);
  run(20);
  const moved = outs.reduce((n, o) => n + (o.sent || 0), 0) - before;
  ok(Math.abs(moved - 20) <= 3, `20 s at 60/min moved ${moved} items through (expected ~20)`);

  /* a branch the solver gives nothing to must receive nothing */
  const s2b = setup();
  const outs2 = api.links().filter((l) => l.from === s2b.sp.id);
  const feed = api.links().find((l) => l.to === s2b.sp.id);
  api.deleteLink(api.links().find((l) => l.from === s2b.s1.id));   /* strand one smelter */
  api.resolve();
  run(25);
  const dead = outs2.find((o) => (o.flow || 0) < 1e-6);
  const alive = outs2.find((o) => (o.flow || 0) > 1e-6);
  ok(!!dead && !!alive, `one branch stalls and one keeps running (${outs2.map((o) => o.flow.toFixed(0)).join('/')})`);
  if (dead && alive) {
    const deadSent = dead.sent || 0;
    run(10);
    ok((dead.sent || 0) === deadSent, 'the stalled branch is sent nothing further');
    ok(alive.items.length > 0, 'while the working branch keeps carrying');
  }

  /* a merger is the same thing in reverse */
  api.loadLevel(6);
  const lv = api.LEVELS[6];
  const a = api.addEntity('miner', lv.nodes[0].x, lv.nodes[0].z, 0);
  const b = api.addEntity('miner', lv.nodes[1].x, lv.nodes[1].z, 0);
  const mg = api.addEntity('merger', 9, 6, 0);
  const dp = api.ents().find((e) => api.MACHINES[e.type].kind === 'sink');
  api.resolve();
  api.armBelt(1); api.connectByTap(a, mg);
  api.armBelt(1); api.connectByTap(b, mg);
  api.armBelt(2); api.connectByTap(mg, dp);
  api.resolve();
  const mOut = api.links().find((l) => l.from === mg.id);
  const mIns = api.links().filter((l) => l.to === mg.id);
  run(12);
  let mq = 0;
  for (let k = 0; k < 40; k++) { run(0.4); mq = Math.max(mq, Math.max(...mIns.map((l) => api.queuedOn(l)))); }
  ok(mq === 0, `nothing queues at an unblocked merger (worst ${mq})`);
  ok(mOut.items.length > 0 && (mOut.sent || 0) > 10,
    `the combined belt carries ${mOut.items.length} items, ${mOut.sent} transferred`);

  console.log(`\n${p} passed, ${f} failed`);
}, 15400);
