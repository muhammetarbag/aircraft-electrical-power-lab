import test from "node:test";
import assert from "node:assert/strict";
import { act, advance, createState, solve } from "../src/sim/engine.ts";
import { LOADS, FAULTS } from "../src/sim/catalog.ts";
import { SOURCE_IDS } from "../src/sim/types.ts";
import type { State } from "../src/sim/types.ts";
test("terminal measurements distinguish failed and quality-rejected generators", () => {
  const failed = act(createState(), { type: "fault", id: "gen1Fail" });
  const rejected = act(createState(), { type: "fault", id: "gen1UnderV" });
  assert.equal(solve(failed).nodes.gen1.voltage, 0);
  assert.equal(solve(rejected).nodes.gen1.voltage, 90);
  assert.equal(solve(rejected).nodes.gen1.powered, false);
});
test("depletion during integration removes battery paths and stops energy below zero", () => {
  const s = createState("emergency");
  s.energyWh = 0.01;
  const next = advance(s, 2);
  assert.equal(next.energyWh, 0);
  assert.equal(solve(next).nodes.acstby.powered, false);
  assert.equal(solve(next).nodes.dcess.powered, false);
});
test("WHY explanations reflect load feed loss and battery net flow", () => {
  const s = createState("emergency"),
    q = solve(s);
  assert.match(q.nodes.fuelLeft.reason, /DC BUS 1/);
  assert.match(q.nodes.battery.reason, /deşarj/);
  assert.match(solve(createState()).nodes.battery.reason, /depolanıyor/);
});
test("battery terminal sag and net probe current match shared telemetry", () => {
  const s = createState("emergency");
  const loaded = solve(s);
  s.loads.instruments.on = false;
  const reduced = solve(s);
  assert.ok(reduced.battery.voltage > loaded.battery.voltage);
  assert.equal(loaded.nodes.battery.current, loaded.battery.current);
  assert.equal(loaded.nodes.dcess.voltage, loaded.battery.voltage);
  const normal = solve(createState());
  assert.equal(normal.nodes.battery.current, normal.battery.current);
  assert.ok(normal.nodes.battery.current < 0);
});
const fault = (s: State, id: string) => act(s, { type: "fault", id });
const gpu = () => {
  let s = createState("cold");
  for (const key of ["gpuCable", "gpuOn"] as const)
    s = act(s, { type: "switch", key });
  s = act(s, { type: "source", id: "ext", key: "on", value: true });
  return act(s, { type: "source", id: "ext", key: "contactor", value: true });
};
test("cold and dark: main buses dead, hot battery still live", () => {
  const q = solve(createState("cold"));
  for (const id of ["ac1", "ac2", "dc1", "dc2", "dcess", "batbus"])
    assert.equal(q.nodes[id].powered, false, id);
  assert.equal(q.nodes.hotbat.source, "battery");
});
test("dual generator normal state has isolated roots, valid TRUs and charging", () => {
  const q = solve(createState());
  assert.equal(q.status, "NORMAL");
  assert.equal(q.nodes.ac1.source, "gen1");
  assert.equal(q.nodes.ac2.source, "gen2");
  assert.equal(q.nodes.dc1.voltage, 28);
  assert.equal(q.nodes.dc2.voltage, 28);
  assert.equal(q.edges.find((e) => e.id === "tie")!.closed, false);
  assert.equal(q.battery.mode, "CHARGING");
});
test("GEN 1 fail propagates GEN 2 across tie and through TRU 1", () => {
  const q = solve(fault(createState(), "gen1Fail"));
  assert.equal(q.nodes.fuelLeft.source, "gen2");
  assert.deepEqual(q.nodes.fuelLeft.path, [
    "gen2",
    "ac2",
    "ac1",
    "tru1",
    "dc1",
    "fuelLeft",
  ]);
  assert.ok(q.nodes.fuelLeft.edgePath.includes("tie"));
});
test("failed or manually open tie prevents crossfeed", () => {
  for (const f of ["tieOpen", "tieControl"])
    assert.equal(
      solve(fault(fault(createState(), "gen1Fail"), f)).nodes.ac1.powered,
      false,
    );
  let s = fault(createState(), "gen1Fail");
  s.tie = "OPEN";
  assert.equal(solve(s).nodes.ac1.powered, false);
});
test("manual closed or welded tie interlocks second generator", () => {
  for (const welded of [false, true]) {
    const s = welded ? fault(createState(), "tieClosed") : createState();
    s.tie = "CLOSED";
    const q = solve(s);
    assert.equal(q.nodes.ac1.source, "gen1");
    assert.equal(q.nodes.ac2.source, "gen1");
    assert.equal(q.sources.gen2.connected, false);
  }
});
test("shorted AC bus is isolated and healthy side survives", () => {
  for (const side of [1, 2]) {
    const q = solve(fault(createState(), `ac${side}Short`));
    assert.equal(q.nodes[`ac${side}`].powered, false);
    assert.equal(q.nodes[`ac${3 - side}`].powered, true);
    assert.equal(q.edges.find((e) => e.id === "tie")!.closed, false);
    assert.equal(
      q.edges.some((e) => e.to === `ac${side}` && e.active),
      false,
    );
  }
});
test("welded tie plus bus fault causes upstream isolation of both buses", () => {
  const q = solve(fault(fault(createState(), "ac1Short"), "tieClosed"));
  assert.equal(q.nodes.ac1.powered, false);
  assert.equal(q.nodes.ac2.powered, false);
  assert.equal(q.edges.find((e) => e.id === "tie")!.closed, true);
  assert.equal(q.nodes.dcess.source, "battery");
});
test("welded gen contactor cannot feed a short or override quality rejection", () => {
  for (const f of ["ac1Short", "gen1UnderV"]) {
    const q = solve(fault(fault(createState(), "gen1Closed"), f));
    assert.equal(q.edges.find((e) => e.id === "gcb1")!.closed, true);
    assert.equal(q.edges.find((e) => e.id === "gcb1")!.active, false);
  }
});
test("battery switch off retains only direct hot branch in cold configuration", () => {
  let s = createState("cold");
  s.batteryOn = true;
  assert.equal(solve(s).nodes.batbus.powered, true);
  s.batteryOn = false;
  assert.equal(solve(s).nodes.batbus.powered, false);
  assert.equal(solve(s).nodes.fire.powered, true);
});
test("battery energy integrates actual power and is not reset each frame", () => {
  const s = createState("emergency"),
    q = solve(s),
    next = advance(s, 60);
  assert.ok(next.energyWh < s.energyWh);
  assert.ok(
    Math.abs(s.energyWh - next.energyWh - q.battery.netWatts / 60) < 0.01,
  );
  assert.ok(
    Math.abs(advance(advance(s, 30), 30).energyWh - next.energyWh) < 1e-7,
  );
});
test("battery charges only when all charger paths are available", () => {
  const s = createState();
  assert.ok(advance(s, 20).energyWh > s.energyWh);
  for (const f of ["chargerFail", "tru2Fail", "batteryOpen"])
    assert.equal(solve(fault(s, f)).battery.chargeWatts, 0);
  s.charger = false;
  assert.ok(advance(s, 20).energyWh < s.energyWh);
});
test("depleted or failed battery stops delivering power", () => {
  for (const depleted of [false, true]) {
    const s = depleted
      ? createState("emergency")
      : fault(createState("emergency"), "batteryFail");
    if (depleted) s.energyWh = 0;
    const q = solve(s);
    assert.equal(q.nodes.hotbat.powered, false);
    assert.equal(q.nodes.dcess.powered, false);
    assert.equal(q.nodes.acstby.powered, false);
  }
});
test("reducing standby load increases endurance", () => {
  const s = createState("emergency"),
    initial = solve(s).battery.endurance;
  s.loads.nav.on = false;
  assert.ok(solve(s).battery.endurance > initial);
});
test("external source powers cold aircraft with valid quality", () => {
  const q = solve(gpu());
  assert.equal(q.nodes.ac1.source, "ext");
  assert.equal(q.nodes.dc1.source, "ext");
});
for (const [key, value] of [
  ["voltage", 90],
  ["voltage", 145],
  ["frequency", 330],
  ["frequency", 480],
  ["phase", false],
] as const) {
  test(`GPU rejects ${key}=${value}`, () => {
    const s = act(gpu(), { type: "source", id: "ext", key, value });
    assert.equal(solve(s).sources.ext.available, false);
    assert.equal(solve(s).nodes.ac1.powered, false);
  });
}
test("physical GPU cable and on-ground state gate availability", () => {
  for (const key of ["gpuCable", "gpuOn", "onGround"] as const) {
    const s = gpu();
    s[key] = false;
    assert.equal(solve(s).sources.ext.available, false);
  }
});
test("APU refuses start without starter supply and starts with battery", () => {
  let s = createState("cold");
  s.apuMaster = true;
  s = act(s, { type: "apuStart" });
  assert.equal(s.apuStarting, false);
  s.batteryOn = true;
  s = act(s, { type: "apuStart" });
  assert.equal(solve(s).nodes.starter.watts, 2000);
  s = advance(s, 21);
  s.sources.apu.on = true;
  s.sources.apu.contactor = true;
  assert.equal(s.apuRpm, 100);
  assert.equal(solve(s).nodes.ac1.source, "apu");
  assert.ok(s.energyWh < 816);
});
test("APU loses start when battery supply disappears before self sustaining speed", () => {
  let s = createState("cold");
  s.batteryOn = true;
  s.apuMaster = true;
  s = advance(act(s, { type: "apuStart" }), 5);
  s.batteryOn = false;
  const next = advance(s, 5);
  assert.ok(next.apuRpm < s.apuRpm);
});
test("engine ramp and generator excitation both required", () => {
  let s = createState("cold");
  s.engines[0] = true;
  s.sources.gen1.on = true;
  s.sources.gen1.contactor = true;
  assert.equal(solve(s).nodes.ac1.powered, false);
  s = advance(s, 8);
  assert.equal(solve(s).nodes.ac1.source, "gen1");
  s.engines[0] = false;
  assert.equal(solve(s).nodes.ac1.powered, false);
});
test("constant speed drive keeps accepted frequency constant across engine RPM", () => {
  for (const rpm of [60, 72, 95]) {
    const s = createState();
    s.rpm[0] = rpm;
    assert.equal(solve(s).nodes.ac1.frequency, 400);
  }
});
test("TRU loss kills normal DC side; selected DC tie can restore from other TRU", () => {
  const s = fault(createState(), "tru1Fail");
  let q = solve(s);
  assert.equal(q.nodes.ac1.powered, true);
  assert.equal(q.nodes.dc1.powered, false);
  assert.equal(q.nodes.dcess.source, "gen2");
  s.dcTie = "AUTO";
  q = solve(s);
  assert.equal(q.nodes.dc1.source, "gen2");
  assert.ok(q.nodes.dc1.path.includes("tru2"));
});
test("TRU cannot generate DC without AC input", () => {
  const s = fault(createState(), "bothGen"),
    q = solve(s);
  assert.equal(q.nodes.tru1.powered, false);
  assert.equal(q.nodes.dc1.powered, false);
  assert.equal(q.nodes.dcess.source, "battery");
});
test("DC short isolates only that distribution path", () => {
  const s = fault(createState(), "dc1Short");
  s.dcTie = "CLOSED";
  const q = solve(s);
  assert.equal(q.nodes.dc1.powered, false);
  assert.equal(q.nodes.ac1.powered, true);
  assert.equal(q.nodes.dc2.powered, true);
});
test("essential bus short cannot be reenergized by battery fallback", () => {
  const q = solve(fault(createState("emergency"), "essShort"));
  assert.equal(q.nodes.dcess.powered, false);
  assert.equal(q.nodes.acstby.powered, true);
});
test("static inverter loss removes standby AC but preserves DC essential", () => {
  const q = solve(fault(createState("emergency"), "inverterFail"));
  assert.equal(q.nodes.acstby.powered, false);
  assert.equal(q.nodes.dcess.powered, true);
});
test("load switches and CBs change source demand and actual load state", () => {
  const s = createState(),
    initial = solve(s).sources.gen1.watts;
  s.loads.galley.breaker = "OPEN";
  const q = solve(s);
  assert.equal(q.nodes.galley.powered, false);
  assert.ok(Math.abs(initial - q.sources.gen1.watts - 6000) < 1e-8);
});
test("branch protection latches and cannot reset into a known short", () => {
  let s = fault(createState(), "loadShort");
  assert.equal(s.loads.galley.breaker, "TRIPPED");
  s = act(s, { type: "resetTrips" });
  assert.equal(s.loads.galley.breaker, "TRIPPED");
  s = fault(s, "loadShort");
  assert.equal(s.loads.galley.breaker, "TRIPPED");
  s = act(s, { type: "resetTrips" });
  assert.equal(s.loads.galley.breaker, "CLOSED");
});
test("automatic shedding prioritizes galley and preserves essential", () => {
  const s = fault(createState(), "gen1Fail");
  s.sources.gen2.kva = 18;
  const q = solve(s);
  assert.equal(q.shed[0], "galley");
  assert.equal(q.nodes.nav.powered, true);
  assert.ok(q.sources.gen2.load <= 100);
});
test("overload trips after delay, never immediately", () => {
  const s = createState();
  s.autoShed = false;
  s.sources.gen1.kva = 8;
  assert.ok(solve(s).sources.gen1.load > 100);
  assert.equal(advance(s, 4).trips.includes("gen1"), false);
  const after = advance(s, 5.4);
  assert.ok(after.trips.includes("gen1"));
  assert.equal(solve(after).nodes.ac1.source, "gen2");
});
test("TRU overtemperature latches until cooled and reset", () => {
  let s = fault(createState(), "tru1Hot");
  assert.ok(s.trips.includes("tru1"));
  s = act(s, { type: "resetTrips" });
  assert.ok(s.trips.includes("tru1"));
  s = act(fault(s, "tru1Hot"), { type: "resetTrips" });
  assert.equal(solve(s).nodes.dc1.powered, true);
});
test("loss of cooling creates deterministic thermal trip under load", () => {
  const s = createState();
  s.cooling[0] = false;
  s.loads.avionics.scale = 2;
  assert.ok(advance(s, 200).trips.includes("tru1"));
});
test("source priority prefers engines, then GPU on ground, then APU", () => {
  const s = gpu();
  s.apuMaster = true;
  s.apuStarting = true;
  s.apuRpm = 100;
  s.sources.apu.on = true;
  s.sources.apu.contactor = true;
  assert.equal(solve(s).nodes.ac1.source, "ext");
  s.gpuCable = false;
  assert.equal(solve(s).nodes.ac1.source, "apu");
  s.engines[0] = true;
  s.rpm[0] = 72;
  s.sources.gen1.on = true;
  s.sources.gen1.contactor = true;
  assert.equal(solve(s).nodes.ac1.source, "gen1");
});
test("actual event log records bus source transfers and intermittent quality failures", () => {
  let s = fault(createState(), "gen1Fail");
  assert.ok(
    s.events.some((e) => e.text.includes("AC BUS 1 ENERGIZED ← GEN 2")),
  );
  s = advance(fault(createState(), "intermittent"), 25);
  assert.ok(
    s.events.filter((e) => e.text.includes("GEN 1 DISCONNECTED")).length >= 2,
  );
});
test("history contains real solved telemetry; zero time does not advance energy", () => {
  const s = advance(createState(), 4),
    q = solve(s);
  assert.ok(s.history.length >= 4);
  assert.ok(Math.abs(s.history.at(-1)!.gen1 - q.sources.gen1.load) < 0.01);
  assert.deepEqual(advance(s, 0), s);
});
test("all resets reconstruct independent initial state and clear trips/history", () => {
  for (const preset of ["cold", "normal", "emergency"] as const)
    assert.deepEqual(
      act(advance(fault(createState(), "tru1Hot"), 10), {
        type: "preset",
        preset,
      }),
      createState(preset),
    );
});
test("graph invariants hold across every required single fault and paired bus faults", () => {
  const states = FAULTS.map((f) => fault(createState(), f[0]));
  for (const f of FAULTS)
    states.push(fault(fault(createState(), f[0]), "ac1Short"));
  for (const s of states) {
    const q = solve(s);
    for (const n of Object.values(q.nodes)) {
      assert.ok(
        Number.isFinite(n.voltage) && Number.isFinite(n.watts) && n.watts >= 0,
        `${s.faults} ${n.id}`,
      );
      if (n.powered) {
        assert.ok(n.source);
        assert.equal(n.path.at(-1), n.id);
        assert.equal(n.edgePath.length, n.path.length - 1);
      }
      if (n.failed) assert.equal(n.powered, false);
    }
    for (const e of q.edges.filter((e) => e.active)) {
      assert.ok(e.closed && q.nodes[e.from].powered && q.nodes[e.to].powered);
      assert.equal(q.nodes[e.from].source, q.nodes[e.to].source);
    }
    for (const id of SOURCE_IDS)
      assert.ok(q.sources[id].load >= 0 && Number.isFinite(q.sources[id].load));
  }
});
test("power balance includes TRU and inverter conversion losses", () => {
  for (const preset of ["normal", "emergency"] as const) {
    const q = solve(createState(preset));
    const input =
      SOURCE_IDS.reduce((sum, id) => sum + q.sources[id].watts, 0) +
      q.battery.watts;
    const losses = q.edges
      .filter((e) => e.active && e.efficiency < 1)
      .reduce(
        (sum, e) => sum + q.nodes[e.to].watts * (1 / e.efficiency - 1),
        0,
      );
    assert.ok(
      Math.abs(
        input -
          q.servedWatts -
          q.nodes.charger.watts -
          q.nodes.starter.watts -
          losses,
      ) < 1e-6,
    );
  }
});
test("all load definitions have unique IDs and existing buses", () => {
  const q = solve(createState());
  assert.equal(new Set(LOADS.map((l) => l.id)).size, LOADS.length);
  for (const l of LOADS) assert.ok(q.nodes[l.bus]);
});
