import test from "node:test";
import assert from "node:assert/strict";
import {
  CASES,
  COMPONENTS,
  LABS,
  MODULES,
  QUESTIONS,
  caseState,
} from "../src/content.ts";
import { act, advance, createState, solve } from "../src/sim/engine.ts";
import type { Action, State } from "../src/sim/types.ts";
test("requested educational content is complete and answers are well formed", () => {
  assert.equal(MODULES.length, 14);
  assert.equal(LABS.length, 12);
  assert.equal(CASES.length, 10);
  assert.equal(COMPONENTS.length, 16);
  assert.ok(QUESTIONS.length >= 35);
  for (const q of QUESTIONS) {
    assert.ok(q.prompt && q.explanation && q.answer);
    if (q.options) assert.ok(q.options.includes(q.answer));
  }
  assert.ok(QUESTIONS.filter((q) => !q.options).length >= 6);
});
test("all ten diagnosis cases produce their advertised deterministic symptoms", () => {
  const qs = CASES.map((_, i) => solve(caseState(i)));
  assert.ok(!qs[0].nodes.ac1.powered && qs[0].nodes.ac2.powered);
  assert.ok(qs[1].nodes.ac1.powered && !qs[1].nodes.dc1.powered);
  assert.ok(!qs[2].nodes.ac1.powered && qs[2].nodes.acstby.powered);
  assert.equal(qs[3].battery.mode, "DISCHARGING");
  assert.ok(qs[4].sources.gen1.load > 100);
  assert.ok(
    !qs[5].sources.ext.available && qs[5].sources.ext.frequency === 330,
  );
  assert.ok(!qs[6].nodes.dcess.powered && qs[6].nodes.dc1.powered);
  assert.ok(!qs[7].nodes.ac1.powered && qs[7].nodes.ac2.powered);
  const contact = qs[8].edges.find((e) => e.id === "gcb1")!;
  assert.ok(contact.closed && !contact.commanded);
  assert.ok(
    advance(caseState(9), 7).events.some((e) =>
      e.text.includes("UNDERVOLTAGE"),
    ),
  );
  for (let i = 0; i < CASES.length; i++) {
    assert.equal(caseState(i).events.length, 1);
    assert.ok(CASES[i].options.includes(CASES[i].answer));
  }
});
type Step = Action | number;
const sw = (key: "batteryOn" | "gpuCable" | "gpuOn" | "apuMaster"): Action => ({
  type: "switch",
  key,
});
const source = (
  id: "gen1" | "gen2" | "ext" | "apu",
  key: "on" | "contactor",
  value = true,
): Action => ({ type: "source", id, key, value });
const load = (id: string, value = true): Action => ({
  type: "load",
  id,
  key: "on",
  value,
});
const f = (id: string): Action => ({ type: "fault", id });
const recipes: Step[][][] = [
  [[sw("batteryOn")], [load("nav"), load("instruments")], [11]],
  [
    [sw("gpuCable"), sw("gpuOn")],
    [source("ext", "on")],
    [source("ext", "contactor"), load("avionics")],
  ],
  [
    [sw("apuMaster"), { type: "apuStart" }, 21],
    [source("apu", "on"), source("apu", "contactor")],
    [source("ext", "contactor", false)],
  ],
  [
    [{ type: "engine", side: 0 }, 8],
    [source("gen1", "on"), source("gen1", "contactor")],
  ],
  [
    [
      { type: "engine", side: 0 },
      { type: "engine", side: 1 },
      8,
      source("gen1", "on"),
      source("gen2", "on"),
      source("gen1", "contactor"),
      source("gen2", "contactor"),
    ],
    [sw("batteryOn"), load("avionics"), load("fuelRight")],
  ],
  [[f("gen1Fail")], [], [f("gen1Fail")]],
  [[f("tru1Fail")], [{ type: "tie", dc: true, value: "AUTO" }]],
  [[], [load("galley", false)]],
  [[f("bothGen")], []],
  [[load("nav", false)], [load("emergency", false)]],
  [[f("ac1Short")], [f("ac1Short")]],
  [
    [sw("batteryOn")],
    [
      sw("gpuCable"),
      sw("gpuOn"),
      source("ext", "on"),
      source("ext", "contactor"),
    ],
    [load("avionics"), load("nav"), load("fuelLeft"), load("fuelRight")],
  ],
];
for (const [index, lab] of LABS.entries())
  test(`LAB ${index + 1} is completable with actual controls and live conditions`, () => {
    let s: State = createState(lab.preset);
    if (lab.setup) s = lab.setup(s);
    assert.equal(recipes[index].length, lab.steps.length);
    for (const [i, st] of lab.steps.entries()) {
      for (const op of recipes[index][i])
        s = typeof op === "number" ? advance(s, op) : act(s, op);
      assert.ok(
        st.check(s, solve(s)),
        `lab ${index + 1} step ${i + 1}: ${st.task}`,
      );
    }
  });
