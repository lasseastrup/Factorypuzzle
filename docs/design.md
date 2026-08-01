# RATIO — Game Design Document (v0.8)

*Working title. Alternatives: Throughput, Feedstock, Assembly Line, Per Minute.*

**v0.8:** the control surface is gestures and cards — thirteen persistent buttons down to two (§10).

**v0.7:** factories are player-built boxes that can be entered and nested; every placement is an independent copy of a library design, with ports defined by terminals on the interior walls (§7).

**v0.6:** the factory runs continuously — no play button, no waiting state; the depot counts what it actually receives (§5.1).

**Resolved since v0.1:** modules are abstract boxes sized by machine count (§7.4) · a planner overlay assists the arithmetic (§5.5) · belts visibly fill before validation, no fast-forward (§5.1) · multi-output quotas are the primary progression axis, on a 7-rung coupling ladder (§8.2) · **the grid is gone — belts are painted freehand and measured in metres (§5.2, §9)**.

---

## 1. One-liner

A top-down 3D factory puzzle for mobile: each level gives you ore nodes and a quota, and you must build the belts and machines that hit it. Solve a level and it becomes a reusable module — a black box you drop into later levels, running at exactly the efficiency you built it with.

## 2. Design pillars

1. **Ratios are the puzzle.** Not combat, not survival, not base defence. Every level is an arithmetic problem wearing an industrial costume.
2. **Legible math.** Rates are chosen so a player can do the division in their head. Fractional awkwardness is introduced deliberately, as a puzzle, never as friction.
3. **Encapsulation is progression.** You don't unlock a "steel factory," you *build* one and then reuse it. Your past cleverness compounds; so does your past sloppiness.
4. **Readable at 6 inches.** Every state a machine can be in must be identifiable from a thumbnail-sized icon at a glance.
5. **No idle waiting.** Never a mechanic that asks the player to put the phone down and come back.

## 3. Player fantasy

The satisfaction of a machine that runs at exactly 100% with nothing backed up and nothing starved. The click of a system that balances. The specific pleasure of realising a chain you built six levels ago is the missing piece of the one in front of you.

## 4. Core loop

```
Read the quota  →  plan the ratio  →  place machines  →  paint belts
      ↑                                                      ↓
  optimise / revisit  ←  scored on 3 axes  ←  depot receives quota for 8s
      ↓                                          (the line never stops running)
  level becomes a Module  →  available in every later level
```

Session length target: 3–15 minutes per level attempt. Playable one-handed for browsing/planning, two hands for building.

---

## 5. Simulation model

### 5.1 Rates and the tick

Everything is expressed as **items per minute**. The sim runs at 20 Hz for visuals but throughput is resolved as a rational-number flow network, so the displayed "97.5/min" is exact, not sampled.

Design rule: all base rates are multiples of 5, and most are multiples of 15. This keeps mental arithmetic viable.

**Verification model: the depot counts.** There is no play button and no waiting state. The moment a machine is placed it is working, belts carry whatever reaches them, and the level is completed when two plainly observable things are both true:

1. **The design is capable of the rate.** The solver's steady-state output at the depot meets the quota. This is the ratio puzzle itself.
2. **The depot has actually received a window's worth.** Over the last **8 seconds** it must have taken in at least `floor(rate × 8 / 60)` of each quota item.

The second condition is why the first is not enough on its own: a correct design still has to physically run. It also stops a backed-up belt draining in a burst from passing a factory whose sustained output is short.

The threshold never rounds up. A stream at R per minute puts at least `floor(R × 8 / 60)` items through any 8-second window, so asking for that many can never fail a correct factory — whereas asking for one more would fail it on window alignment alone.

**What this replaced, and why.** An earlier version pressed Run, watched a cold start, then validated; a later one ran continuously but showed a *predicted* "line filling" countdown before it would credit anything. Both existed for the same reason: quota was measured from the solver's predicted rate, which becomes true the instant the last belt is painted, so something had to stop a level passing before material had arrived. A predicted timer was a crude proxy for an observation. Once items are simulated individually the depot can simply count them, and the waiting state disappears — until material arrives the count is low, and the belts visibly show it travelling. The bar now has two states, both of which explain themselves: *below quota*, or *depot 3 / 4 ING · last 8s*.

- Belt visual travel speed is a *tuned* number, not derived from throughput. A 60/min belt and a 240/min belt move items at similar visible speed but different spacing. Physically dishonest, dramatically better — and it costs nothing in accuracy, because spacing emerges from the spawn rate, so the visible rate always equals the real one.
- Longest-path length in a level is still a level-design budget. A player should not be waiting long for the first item to cross.

### 5.2 Space, and painted belts

**There is no grid.** Positions are continuous and measured in metres. Belts are *painted*: the player presses on a machine's output port and drags a stroke to the target, and the game turns that stroke into a conveyor.

- Build area is a bounded plot per level (e.g. 20×18 m) with obstacles and fixed ore nodes. The plot edge is marked as a **ruler**, since the currency is metres of belt.
- Machines have rectangular footprints in metres — Miner 2×2, Smelter 2×2, Constructor 2×3, Assembler 3×4, Module 4×4 and up — placed at any position. Rotation stays in 90° steps: free rotation looks organic but makes ports hard to reason about, and 90° steps keep every footprint axis-aligned, which keeps collision cheap and legible.
- **Ports are physical.** One output port per machine, one input port per required item, positioned on the footprint edges. A stroke must begin at a free output and end at a compatible input. This is what makes a splitter worth placing rather than a formality.
- **Stroke processing: orthogonal first.** A hand-drawn curve looks organic; a factory looks square. So a stroke is turned into **axis-aligned runs joined by filleted corners**, following the shape the player drew rather than replacing it: simplify the drag (Ramer–Douglas–Peucker), take a long approach run square out of each port, replace each leg with an L choosing the elbow nearer the actual stroke, straighten out any jog too short to corner cleanly, then fillet every corner with a real arc at the minimum turn radius. Typically ~75% of a run's length ends up dead straight.
- **The organic route is the fallback.** If a right-angled route will not fit past an obstacle, the older curve-smoothing path is tried instead. Clearance is the hard constraint; squareness gives way to it.
- Conveyors cannot turn on a dime, and enforcing a minimum radius is what makes painting feel physical rather than like scribbling. The radius is deliberately **tight** (0.7 m against a 0.3 m belt): a sweeping curve eats the straight runs that make a plot read as a factory.
- The game never rejects a stroke for being wobbly — it only refuses one that hits an obstacle, leaves the plot, or misses a port.
- Belts must keep a clearance from machines and rocks, but they may freely cross each other.
- **Where two belts cross, the later one ramps over.** This is the main reason the game is 3D rather than 2D, and going gridless makes it better: crossings occur at real intersections rather than at tile boundaries, and the over-under is generated automatically from the geometry.

**What the grid was doing, and what replaces it.** The grid made space legible and forgave imprecise fingers by snapping. Losing it costs some of that, and the mitigation is snapping where it matters — at the ports — while leaving the middle of the stroke free. In exchange, belt length becomes a continuous cost, so elegant routing is directly and visibly rewarded, and the drawing itself becomes a skill rather than a menu operation.

### 5.3 Belts

| Tier | Throughput | Unlock |
|---|---|---|
| Belt Mk1 | 60 /min | start |
| Belt Mk2 | 120 /min | act 1 |
| Belt Mk3 | 240 /min | act 2 |

Belt capacity limits are essential — they're what force line-splitting and are the source of the game's best "oh, *that's* why it stalled" moments.

**Splitter:** 1 in, up to 3 out. Round-robins by default; per-output rate can be set (e.g. 40/20) as an unlockable upgrade.
**Merger:** up to 3 in, 1 out. Overflow backs up the slowest input first.

### 5.4 Machine states (the diagnostic vocabulary)

Every machine displays a ring:

- **Green, full ring** — running at 100%.
- **Amber, partial ring** — running at N%, starved. Ring fill shows the actual %.
- **Red, pulsing** — output blocked; downstream is backed up or unconsumed.
- **Grey** — no recipe set / no power / disconnected.

Belts are colour-graded by saturation (dim = under-used, bright = at capacity, red pips = fully backed up). Tapping any machine traces its bottleneck upstream with a highlighted path. **This diagnostic layer is not polish — it is the game's primary teaching tool and should be built in the prototype, not after.**

### 5.5 The Planner Overlay

A toggleable layer, available from the tutorial onward, that surfaces the arithmetic. This is a significant design commitment: it means **the division is no longer the puzzle**, and the difficulty has to move somewhere else (see §5.5.3).

#### 5.5.1 What it shows

- **Per machine:** required input rate vs. actual input rate, and the resulting efficiency. `Smelter — needs 30 ore/min, getting 22.5 → 75%`.
- **Per belt:** current load against capacity. `47 / 60`.
- **Per node:** ore committed vs. ore available.
- **Deficit tags:** any starved machine shows its shortfall as a number. `−7.5 ore/min`.
- **Quota tracker:** projected steady-state output vs. target, updating live as the player places machines — so you know the plan works before you press Run.

#### 5.5.2 What it must never show

The line between an instrument and a solver is the whole ballgame here. The overlay reports **what your factory is doing**. It never reports **what your factory should be**. Specifically, it must not:

- Suggest machine counts ("add 2 smelters").
- Auto-balance splitter ratios.
- Highlight the intended solution path.
- Offer a recipe tree that pre-computes the full chain for a target rate.

The player should always be the one who turns "I'm 7.5 ore/min short" into "so I need another half-fed smelter, which means…". Reading the deficit is free; deciding what to do about it is the game.

#### 5.5.3 Where the difficulty moves

With arithmetic assisted, the difficulty budget shifts onto the axes the overlay can't help with:

| Axis | Why the overlay doesn't solve it |
|---|---|
| **Space** | Tight plots, obstacles, awkward node placement. The overlay tells you a belt is at 47/60; it can't route it around a rock. |
| **Belt capacity & crossings** | Knowing 90/min exceeds 60/min is trivial. Physically splitting, routing, and re-merging two lines through a congested plot is not. |
| **Byproduct loops** | The overlay shows a machine is output-blocked. Designing a loop that consumes the byproduct at exactly the rate it's produced is a structural problem. |
| **Multi-quota levels** | Two outputs competing for one ore stream, where the overlay honestly reports that both are at 60%. |
| **Optimisation** | Hitting quota is now easy. Landing in the left tail of all three histograms (§9) is where the hours go. |

This is a healthier difficulty profile for mobile anyway: spatial reasoning survives interruption and small screens better than arithmetic held in working memory does. But it does mean **level design carries more weight than it would have**, and the prototype's five levels must be authored with that in mind.

### 5.6 Backpressure, byproducts and stalls

**A half-built line fills from the front.** Every machine works the moment it has input, whether or not the chain reaches the depot yet. A belt with physical space on it accepts material at capacity, so a machine runs until its *own* output belt is full, then blocks — and the jam walks backwards one belt at a time until it reaches the miner.

This matters more than it sounds. Solving only for steady state says an unfinished chain is entirely jammed with nothing moving, which is true eventually and useless as feedback: the player sees dead machines and empty belts and concludes their factory is broken, when in fact it works and simply has nowhere to put the output. A line that visibly fills up and stalls at a specific point tells them where to build next.

Two rules keep it honest:

- **Queues obey conservation.** A belt's backlog grows by what arrives minus what the far end removes. When those are equal it *holds its length* — it does not quietly drain. So connecting a stalled line does not magically clear the backlog; the backlog only shrinks if the far end outpaces the near end. A packed queue that is being consumed creeps forward at the consumption rate rather than sitting frozen.
- **Quota is only credited once nothing is still accumulating.** While a belt fills, upstream runs faster than the line can ultimately sustain, so crediting output during that window would let a factory pass on a transient it cannot hold.

From act 2, some recipes emit a secondary output. If a byproduct isn't consumed or sunk, the machine's output blocks and the whole line stalls. This converts the game from "chain builder" to "system balancer" and is where the real difficulty lives. Sinks (incinerators) exist but cost score — the clean solution loops the byproduct back into something useful.

### 5.7 Fluids (act 2+)

A second network with different rules: pipes have a flow cap but merge without ratio loss, and can't be split by round-robin — only by pressure. Deliberately not just "belts but blue." Deferred out of prototype scope.

### 5.8 Deliberately cut for v1

- **Power.** Redundant with machine-count scoring, and adds a whole second network to route. Reconsider as a per-level budget constraint on specific puzzles rather than a global system.
- **Underclocking / machine clock speed.** It's a genuinely great tool but it dissolves ratio puzzles into "set everything to 87.5%." Introduce late, as an unlockable that costs score to use.
- **Player character / walking around.** Top-down god view only.

---

## 6. Content: worked example

This is the act 1 target chain, chosen to demonstrate the numbers philosophy.

| Machine | Recipe | In | Out |
|---|---|---|---|
| Miner Mk1 | — | node | **30** ore/min (60 on pure node, 15 on impure) |
| Smelter | Ingot | 30 ore | **30** ingot |
| Constructor | Plate | 30 ingot | **20** plate |
| Constructor | Rod | 30 ingot | **30** rod |
| Constructor | Screw | 30 rod | **90** screw |
| Assembler | Reinforced Plate | 20 plate + 90 screw | **10** reinf. plate |

**The par solution for "10 Reinforced Plates/min":**

```
2× Miner (60 ore) → 2× Smelter (60 ingot)
   ├─ 30 ingot → 1× Constructor:Plate → 20 plate ─┐
   └─ 30 ingot → 1× Constructor:Rod  → 30 rod    │
                    → 1× Constructor:Screw → 90 screw
                                                  ├→ 1× Assembler → 10 reinf. plate/min
```

8 machines, zero waste, every machine at exactly 100%. Note the trap built into it: **90 screws/min will not fit on a Mk1 belt (60/min cap).** The player must either upgrade the belt or run two screw constructors at 45 each into a merger. That single detail teaches belt capacity, splitting, and the difference between "the math works" and "the factory works" in one level.

Ore types for v1: Iron, Copper, Limestone, Coal. Enough for a real tech chain, few enough to art-direct properly.

---

## 7. Factories inside factories (the hook)

This is the most distinctive mechanic and the one that needs the most careful handling. It replaces an earlier design in which each completed *level* became a reusable module.

### 7.1 What a factory is

A **Factory** is a box the player places like any other machine. It has input and output ports on the outside, and an interior that the player builds by **entering** it. Inside is a plot like any other, except that instead of ore nodes and a depot there are **terminals**: one for each of the box's ports. Wire the input terminals through machines to the output terminals and the box does something.

Machines can still be built freely outside a box. A factory is an organising tool, not a requirement.

### 7.2 The interface is drawn on the walls

Inside a factory the player places **Input** and **Output** terminals, which snap to the interior walls and slide along them. Each terminal becomes a port on the matching face of the box outside, at the matching position along that face. The interface you draw inside is the interface you see out.

This means a factory can be **designed before it exists anywhere**. A "Build factory" button opens an empty interior; the design goes to the library; copies are placed later. Nothing has to be put in the world before you can start working on it.

An earlier version created ports by attaching belts from outside, and grew the interface by use. That was abandoned because it contradicted shared interiors — one instance with two inputs and another with one cannot share an interior wired to a fixed set of terminals. Wall terminals define the interface from the one place that can see the whole picture.

### 7.3 Every placement is its own copy

Placing a design **deep-copies** it. Editing a placed factory changes only that box; editing the library entry changes only future placements. There is no editing-at-a-distance and no forked-definition bookkeeping.

The cost is real and worth naming: a factory is a **blueprint, not a subroutine**. You lose "improve once, improve everywhere", which was the sharper version of the idea. What is bought is a model with no surprising action at a distance, no need for an unlink escape hatch, and no contradiction with per-instance ports. A "push changes to all copies" action could be added later if the blueprint model feels too flat.

Instances are independent at solve time as well as in structure. Three copies fed 30, 15 and 0 ore per minute run at 100%, 50% and 0%.

### 7.4 Nesting

A factory may contain other factories, to any reasonable depth. A factory may **not** contain itself, directly or transitively; that is refused rather than allowed to hang.

### 7.5 How it is simulated

An instance is **replaced by a copy of its definition** before solving, recursively. Terminals are plain passthroughs, so a belt aimed at input port 2 becomes a belt aimed at that copy's terminal and the interior carries on — no rewiring required.

The consequence worth noting: the solver needs **no concept of hierarchy at all**. It solves one flat graph, exactly as before, which is why the two-pass flow model, the bottleneck attribution and the backpressure rules all keep working through nested factories for free. Results are copied back onto the objects the player actually placed, and an instance reports the worst state of anything inside it, so a box turns amber when something deep within it is starved.

### 7.6 Open risks

- **Legibility.** A box that reports "starved" tells you to go looking. Whether that is a satisfying investigation or a chore is the thing to playtest.
- **No undo.** Deleting a machine inside a factory is irreversible, and there is no undo anywhere in the prototype yet.
- **Blueprint flatness.** With copies fully independent, there is no reward for going back and improving a design already in use. If that makes factories feel like organisation rather than leverage, a push-to-copies action is the fix.
- **Scoring.** Machines and ore inside a factory count towards the level's totals, so a factory is organisational rather than free. Whether footprint should count the box or its contents is unresolved.

## 8. Level design & progression

Each level specifies:

- **Quota** — one or more output items, each with a rate (e.g. "20 Reinforced Plates/min + 30 Screws/min"). The puzzle is minimising cost to reach it, not maximising output, which keeps scoring comparable across players.
  - **Quotas are minimums, not exact targets.** The output sink accepts everything; overproduction is legal but wasted ore is punished by the ore metric (§9). Making overproduction a *fail* would be both fiddly and thematically odd — a factory that makes too much isn't broken.
  - **But quotas must be authored so a zero-waste solution exists.** See §8.1.
- **Plot** — dimensions, terrain obstacles, ore node positions and purities. Node placement is the *spatial* half of the puzzle and is where hand-authoring earns its keep.
- **Available tech** — which machines and which modules are legal here.
- **Optional constraint** — a twist: no belt upgrades, max 12 machines, one ore node only, must consume the sulphur byproduct.

### 8.1 Quota design rules

**Rule 1: quotas are integer multiples of clean machine output.** Pillar 1 is "everything at exactly 100%" — the green-ring moment. That moment is only *reachable* if the quota divides evenly into base recipe rates. If an Assembler produces 10 Reinforced Plates/min, then 10, 20 and 30 are good quotas and **2 is a bad one**: 2/min forces the assembler to sit at 20%, permanently amber, and no amount of player cleverness fixes it. The satisfaction the whole game is built on becomes unreachable.

So: quota rates should be multiples of 5, matching §6's numbers. `2 Iron Bars/min` becomes `30 Iron Bars/min`. Big numbers also read as more industrial, which is a free thematic win.

*(Exception worth prototyping: a deliberate act-3 level where the quota is intentionally awkward and the only clean solution requires the unlocked underclocking tool from §5.8. One level, as a punchline, not a pattern.)*

**Rule 2: the ratio between quotas is a difficulty dial.** When two outputs share an upstream resource, the quota ratio *becomes* the splitter ratio the player has to build. `30 : 30` is trivial. `20 : 40` is one splitter. `2 : 5` is a coprime balancer puzzle — genuinely hard, and act-3 material rather than the gentle introduction it looks like.

**Rule 3: multi-output difficulty comes from coupling, not count.** This is the important one. Two outputs from two *different* ores — iron bars and copper pipes — are two separate puzzles sharing a plot. That adds *breadth* (more machines to place, more space pressure) but very little *depth*: the player solves each chain independently and never has to reason about the interaction. The depth arrives when the outputs are coupled.

### 8.2 The multi-output ladder

Difficulty rungs, in the order they should be introduced:

| Rung | Shape | Example | What it teaches |
|---|---|---|---|
| 1 | One output, short chain | 30 Iron Ingots | placement, belts |
| 2 | One output, long chain | 10 Reinforced Plates | intermediate stages, belt caps |
| 3 | Two outputs, **separate ores** | 30 Iron Bars + 20 Copper Pipes | plot management, space pressure |
| 4 | Two outputs, **shared ore node** | 30 Iron Plates + 30 Iron Rods | splitting one ore stream; the node becomes the bottleneck |
| 5 | Two outputs, **shared intermediate** | 20 Reinforced Plates + 30 Screws | tapping a line mid-chain and overbuilding it deliberately |
| 6 | Two outputs, **coprime ratio** | 20 Plates + 50 Rods | balancer construction, programmable splitters |
| 7 | **Nested** — one output feeds the other | 10 Frames, and 20 spare Plates from the same chain | reasoning about a chain that consumes its own product |

Rungs 4–7 are where multi-quota earns its authoring cost. Rung 3 is worth including anyway as the gentle on-ramp, but it shouldn't be mistaken for the destination.

### 8.3 Why this improves the module system

Multi-output levels are also **how the game manufactures good modules.** A one-in/one-out module is a limited building block. A module with two outputs — say `60 iron ore → 20 plates + 30 screws` — is a far more useful lego brick, because later levels can draw both streams from one placed box. So multi-quota progression isn't only a difficulty ladder; it's a *quality* ladder for the player's own toolkit, which reinforces the §7.2 incentive to go back and build those levels well.



### 8.4 Act structure (v1)

| Act | Ladder rungs (§8.2) | Teaches | Ends on |
|---|---|---|---|
| Tutorial (5 levels) | 1 | placement, belts, 1:1 ratios, machine states | first non-1:1 ratio |
| Act 1 (12 levels) | 1–2 | belt caps, splitters/mergers, 2-input assembly, first module reuse | Reinforced Plate |
| Act 2 (15 levels) | 3–5 | second ore, multi-output, shared nodes and intermediates, byproducts, fluids | a 2-output module used downstream |
| Act 3 (12 levels) | 6–7 | coprime balancers, nested outputs, tight plots, "build this using only modules" | endgame item |

**Sandbox mode:** unbounded plot, all tech, no quota. Ships after the campaign, not with the prototype. It's the retention layer, but it can't carry the tutorialisation.

---

## 9. Scoring & replay

Three independent metrics, each shown as a histogram against other players (the Zachtronics model — it drives replay far harder than a star rating):

1. **Machines** — total machine count including modules' internal cost.
2. **Belt** — metres painted. Replaces the old tile-footprint metric: it is a continuous measure, it reads more naturally ("34 m of belt"), and it rewards the thing painting makes expressive — short, clean, well-planned runs.
3. **Ore** — raw input consumed per unit output. Rewards waste elimination.

These are genuinely in tension: the ore-optimal solution usually needs more machines. No combined score, no "perfect" — just three histograms and your position on each. A level is *passed* on hitting quota; optimisation is entirely optional and entirely the point.

---

## 10. Controls (mobile-first)

**Every action is a gesture or a card. There are no mode buttons.**

| Action | Input |
|---|---|
| Pan | one-finger drag on empty ground |
| Zoom | pinch |
| Turn the view | two-finger twist, snapping to 90° on release |
| Inspect | tap a machine or a belt |
| **Paint a belt** | **drag from one machine to another** |
| Place a machine | pick a card, drag on the plot, release to commit |
| Cancel a pick | tap the armed card again, or Escape |
| Deselect | tap bare ground, the inspector's close control, or Escape |
| Rotate | the one floating control, shown only while placing or with something selected |
| Remove | inspect it, then Remove |
| Upgrade a belt | tap the belt |

**The simplification that mattered.** An earlier build had five mode buttons down the right edge — Select, Paint belt, Erase, Turn, Rotate view — plus Planner, Score and Clear along the bottom and a row of five level buttons. Thirteen persistent controls.

Three of those tools described something the hand already says. Painting a belt is a drag that begins on a machine; inspecting one is a tap on it. Those are different gestures, so a mode to distinguish them is pure overhead: the stroke now starts speculatively on press and is discarded on release if the finger never moved. Erase was redundant with the Remove action already in the inspector. That is three buttons gone for nothing lost.

The rest went by relocation rather than deletion. Rotate appears only when there is something to rotate. View rotation became the twist gesture. Score is reached by tapping the progress bar, which is where a player already looks. Level selection and Clear moved into a menu behind the level title — and Clear in particular is better off the main surface, since there is still no undo. Belt tiers left the tray entirely: a tier is a property of a belt, not a thing you place, so belts start at Mk1 and are upgraded by tapping them, which is exactly what level 3 teaches.

**Two persistent controls remain:** a rates toggle, and the tray of things you can place.

**Arming is never sticky.** Placing something returns to the neutral state. Leaving the tool armed after a placement meant every later drag laid another blueprint instead of moving the camera, which reads as the view being stuck rather than as a mode being active — a mode with no visible border is indistinguishable from a bug. One extra tap to place a second machine is much the cheaper cost. For the same reason a card is a toggle, so arming can always be undone without placing anything.

Camera is orthographic at a **fixed 54° above the horizon**. (Three tilt steps were prototyped; 54° won on a phone — shallower looked better in stills but tall machines began hiding belts behind them.) Yaw snaps to 90°; there is no free orbit, which would destroy the readability of belt paths and make drag-to-place ambiguous.

Two consequences of an oblique view that are easy to get wrong:

- **Hit testing must use the machine meshes, not the ground plane.** At an angle the visible top of a miner's drill tower sits about 2 m behind its footprint, so a ground-plane raycast misses the thing the player is obviously pointing at. Placement still uses the ground, because there the player is indicating a position rather than an object.
- **Panning divides by sin(pitch), not cos.** A ground step along the view's depth axis projects onto the screen vertical by sin(pitch). Getting this wrong makes vertical panning feel wrong in a way that is hard to name and easy to ship.

## 11. Art direction

Clean, bright, low-poly industrial. Flat colours, strong silhouettes, minimal texture detail — driven by readability at phone scale first and performance second. Each item type has a distinct colour and shape so a belt's contents are identifiable while zoomed out. Machines animate visibly when running so 100% vs 60% is felt as well as read.

Audio: rhythmic, layered. Each machine type contributes a loop; a well-balanced factory should sound like a groove locking in. A stalled line goes audibly arrhythmic — audio as a diagnostic channel.

---

## 12. Technical

- **Engine:** Unity (URP) — best mobile 3D tooling and asset pipeline. Godot 4 is a viable alternative if the team prefers it.
- **Sim/render separation:** the simulation is a rational-arithmetic flow solver, fully decoupled from visuals. Items on belts are rendered as interpolated positions along a spline, not as simulated entities. This is non-negotiable for perf: a level with 40k items in flight must never instantiate 40k GameObjects. Instanced rendering, one draw call per item type.
- **Targets:** 60 fps on a mid-range 2022 Android device, with 200 machines placed.
- **Save:** local, with cloud sync later. A save is just the placement graph plus module definitions — small and diff-friendly, which makes solution sharing nearly free.

---

## 13. Prototype scope (vertical slice)

The goal of the prototype is to answer one question: **is balancing ratios on a touchscreen actually fun?** Everything else is deferred.

**In:**
- Iron only. Miner, Smelter, Constructor (2 recipes), Assembler.
- Belt Mk1 + Mk2, splitter, merger, automatic over-under at crossings.
- 5 hand-built levels ending on the Reinforced Plate problem.
- Full machine-state diagnostics (rings, belt saturation, bottleneck trace).
- **Planner overlay** (§5.5) — now core, not polish. Without it the prototype tests a different game.
- Visible spin-up with incremental validation (§5.1).
- Module encapsulation for at least one level, so composition can be felt.
- Three-axis scoring, local only, no histograms.

**Out:** fluids, byproducts, power, underclocking, sandbox, meta-progression, art polish, audio beyond placeholders, online anything.

**Milestones:**
1. Camera, machine placement, belt painting. *(feel test — if painting belts isn't pleasant, stop and fix this before anything else)*
2. Flow solver + item rendering + machine states.
3. Five levels + quota validation + scoring.
4. Module encapsulation and reuse.
5. Playtest with 5 people who have never played Satisfactory. **That last constraint matters most** — the design's biggest unknown is whether it's legible to someone without genre literacy.

---

## 14. Resolved decisions

- **Module footprint** — abstract rectangle, `2 × machineCount` tiles snapped to a fixed shape set. §7.4
- **Arithmetic assistance** — planner overlay available from the tutorial, reporting actuals and deficits but never prescribing solutions. Difficulty relocates to space, routing, loops and optimisation. §5.5
- **Verification** — visible cold-start spin-up with incremental per-chain validation, no fast-forward. Spin-up time becomes a level-design budget. §5.1
- **Multi-output quotas** — confirmed as the primary progression axis, structured as a 7-rung ladder (§8.2). Quotas are minimums authored as multiples of 5; depth comes from coupling outputs, not from counting them. §8.1

## 15. Open questions

Ordered by how much they'd change the build.

1. **Does the overlay show deficits only, or requirements too?** The line in §5.5.2 is drawn at "shows shortfall, never prescribes." But "needs 30 ore/min" is arguably already a requirement. Is the per-machine *nominal* input rate always visible, or only the actual? *(Leaning: nominal is fine — it's on the recipe card anyway. What stays hidden is anything aggregated across machines.)*
2. **Do programmable splitters need to exist?** Rung 6 (coprime ratios) is either a satisfying balancer-construction puzzle or pure tedium, and which one it is depends entirely on whether the player has a splitter with settable output ratios. Giving them one makes rung 6 easy; withholding it makes rung 6 the hardest content in the game. *(Leaning: withhold until act 3, then grant it as the reward for having done it the hard way once.)*
3. **Does gridless placement need a soft snap?** Machines currently sit anywhere, which is freeing but makes neat parallel rows fiddly on a touchscreen. A light magnetic snap to nearby machine edges would preserve continuity while making tidy layouts easy. Worth a playtest before adding — the answer depends on whether players *want* tidy rows or enjoy organic sprawl.
4. **How many outputs is too many?** The ladder assumes two. Does a three-output level exist, or does the HUD and the plot both fall apart? *(Leaning: three appears exactly once, as a finale.)*
5. **Spin-up on the largest plots.** With no speed button, does a 15-second wait on an act-3 level survive contact with players? A playtest question — but if the answer is no, the response is smaller plots, so author act 3 conservatively until we know.
6. **Is there a fail state?** Currently a level is just unsolved until solved. Should any level type carry a move limit or budget? *(Recommendation: no. Timers and factory puzzles mix badly.)*
7. **Ore node scarcity.** Infinite (pure puzzle) or depleting (logistics layer, implicit timer)? *(Recommendation: infinite.)*
8. **Refactor flow specifics.** When a module doesn't fit, the game offers a refactor route into the old level. Does the player return to a saved in-progress state of the current level? Does re-solving ever *break* a later level that depended on the old rates?
9. **Monetisation.** Premium one-off, or free with ad-gated hints? Decides whether the level count is 45 or 150, so settle before content authoring.
10. **Solution sharing.** Saves are tiny and nearly free to share. v1 feature or v2 hook?
11. **Portrait or landscape?** Landscape gives build area; portrait is one-handed. Both means two UI layouts.
