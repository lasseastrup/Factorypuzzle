# RATIO — factory ratio puzzle (prototype)

A top-down 3D puzzle about balancing throughput. Each level gives you ore nodes and a
quota; you place machines, **paint** conveyor belts between them, and try to make every
machine run at exactly 100% with nothing starved and nothing backed up.

**Play it:** https://lasseastrup.github.io/Factorypuzzle/

Built for mobile: one-finger pan, pinch zoom, drag to paint a belt.

## Where things are

| Path | What it is |
|---|---|
| `index.html` | The playable build. Self-contained — three.js is inlined, no external requests. This is what Pages serves. |
| `src/sim.js` | The simulation core. Pure maths, no rendering, no DOM. |
| `src/game.html` | Renderer, input, and UI. Contains a `/*__SIM__*/` marker where the sim is injected at build time. |
| `docs/design.md` | Game design document. |
| `test/` | Test suites — see below. |
| `build.mjs` | Produces `index.html` and `dist/ratio.html` from `src/`. |

## Build and test

```sh
npm install
npm run build     # regenerates index.html from src/
npm test          # 22 solver + 18 level + 8 geometry assertions, plus a headless boot
```

**Edit `src/`, never `index.html`** — it is generated, and hand edits get overwritten by
the next build.

## The tests, and what they are for

- **`test/sim.test.js`** — 22 assertions on the flow solver. The important one reproduces
  the design document's worked example exactly: 8 machines, 10 reinforced plates/min, every
  machine at 100%. It also checks the failure case, where a 90/min line on a 60/min belt
  throttles the whole chain to precisely 6.667/min and correctly names the belt as the cause.
- **`test/levels.test.js`** — 18 assertions confirming every level is solvable at par with
  no machine below 100%. This guards design pillar 1: a quota that cannot be hit cleanly
  makes the whole game's payoff unreachable.
- **`test/harness.js`** — boots the real page against real three.js with a stub DOM, so a
  browser's opaque "Script error" becomes a stack trace. Also runs a **visibility audit**
  (object count, frustum containment, near/far planes, fog range vs camera distance) and the
  painted-belt geometry suite.

The harness stubs `WebGLRenderer`, so nothing rasterises. It verifies logic and geometry,
not pixels. Rendering bugs still need a human looking at the screen.

## Simulation notes

The solver runs two passes. The first computes each machine's *potential* rate ignoring belt
capacity and backpressure; the second relaxes downward with both applied. Two passes rather
than one because a single-pass fixed point deadlocks on any two-input machine — an assembler
needing plates and screws will refuse to request either while both are absent, and sit at
zero forever. The potential pass also makes the bottleneck trace possible: comparing potential
against actual is what identifies which belt is the real culprit once a throttle has
propagated through the whole chain.

The solver knows only topology, not geometry. Removing the grid in favour of painted belts
changed no line of it.
