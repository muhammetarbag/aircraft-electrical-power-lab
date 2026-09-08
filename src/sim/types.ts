export const SOURCE_IDS = ["gen1", "gen2", "apu", "ext"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];
export type RootSource = SourceId | "battery";
export type Mode = "AUTO" | "OPEN" | "CLOSED";
export type Preset = "normal" | "cold" | "emergency";
export interface SourceControl {
  on: boolean;
  contactor: boolean;
  voltage: number;
  frequency: number;
  phase: boolean;
  kva: number;
}
export interface LoadDefinition {
  id: string;
  name: string;
  bus: string;
  watts: number;
  priority: "ESSENTIAL" | "IMPORTANT" | "NON-ESSENTIAL";
  area: string;
}
export interface LoadControl {
  on: boolean;
  breaker: "CLOSED" | "OPEN" | "TRIPPED";
  scale: number;
}
export interface Event {
  id: number;
  time: number;
  text: string;
  type: "info" | "warning" | "fault";
}
export interface Sample {
  time: number;
  gen1: number;
  gen2: number;
  soc: number;
  kw: number;
}
export interface State {
  time: number;
  engines: [boolean, boolean];
  rpm: [number, number];
  rpmTarget: [number, number];
  sources: Record<SourceId, SourceControl>;
  apuMaster: boolean;
  apuStarting: boolean;
  apuRpm: number;
  gpuCable: boolean;
  gpuOn: boolean;
  onGround: boolean;
  tie: Mode;
  dcTie: Mode;
  essentialAuto: boolean;
  batteryOn: boolean;
  batteryContactor: boolean;
  charger: boolean;
  capacityAh: number;
  energyWh: number;
  batteryTemp: number;
  inverter: boolean;
  tru: [boolean, boolean];
  cooling: [boolean, boolean];
  truTemp: [number, number];
  faults: string[];
  trips: string[];
  timers: Record<string, number>;
  loads: Record<string, LoadControl>;
  autoShed: boolean;
  events: Event[];
  nextEvent: number;
  history: Sample[];
  emergencySeconds: number;
}
export interface NodeReading {
  id: string;
  name: string;
  kind: "source" | "ac" | "dc" | "converter" | "load";
  powered: boolean;
  voltage: number;
  frequency: number;
  watts: number;
  current: number;
  source: RootSource | null;
  path: string[];
  edgePath: string[];
  reason: string;
  failed: boolean;
}
export interface Edge {
  id: string;
  from: string;
  to: string;
  commanded: boolean;
  closed: boolean;
  active: boolean;
  reason: string;
  fault: boolean;
  efficiency: number;
  outputVoltage?: number;
  outputFrequency?: number;
}
export interface SourceReading {
  available: boolean;
  connected: boolean;
  voltage: number;
  frequency: number;
  phase: boolean;
  watts: number;
  current: number;
  load: number;
  kva: number;
  temperature: number;
  reason: string;
}
export interface Solution {
  nodes: Record<string, NodeReading>;
  edges: Edge[];
  sources: Record<SourceId, SourceReading>;
  shed: string[];
  requestedWatts: number;
  servedWatts: number;
  battery: {
    voltage: number;
    soc: number;
    watts: number;
    netWatts: number;
    current: number;
    chargeWatts: number;
    endurance: number;
    mode: string;
  };
  status: "NORMAL" | "DEGRADED" | "EMERGENCY" | "FAULT ISOLATED";
  statusReason: string;
  alerts: string[];
}
export type Action =
  | { type: "preset"; preset: Preset }
  | { type: "fault"; id: string }
  | { type: "clearFaults" }
  | { type: "resetTrips" }
  | { type: "engine"; side: 0 | 1 }
  | { type: "rpm"; side: 0 | 1; value: number }
  | {
      type: "source";
      id: SourceId;
      key: keyof SourceControl;
      value: number | boolean;
    }
  | {
      type: "switch";
      key:
        | "apuMaster"
        | "gpuCable"
        | "gpuOn"
        | "onGround"
        | "essentialAuto"
        | "batteryOn"
        | "batteryContactor"
        | "charger"
        | "inverter"
        | "autoShed";
    }
  | { type: "apuStart" }
  | { type: "apuStop" }
  | { type: "tie"; dc?: boolean; value: Mode }
  | { type: "tru"; side: 0 | 1; cooling?: boolean }
  | { type: "batterySoc"; value: number }
  | { type: "capacity"; value: number }
  | {
      type: "load";
      id: string;
      key: keyof LoadControl;
      value: number | boolean | LoadControl["breaker"];
    }
  | { type: "clearLog" };
