import { LOADS, NAMES, FAULTS } from "./catalog.ts";
import { SOURCE_IDS } from "./types.ts";
import type {
  Action,
  Edge,
  NodeReading,
  Preset,
  Solution,
  SourceId,
  SourceReading,
  State,
} from "./types.ts";

export const LIMITS = {
  minV: 108,
  maxV: 122,
  minF: 380,
  maxF: 420,
  overloadSeconds: 5,
  truKW: 5,
  truTripTemp: 110,
  pf: 0.9,
  truEfficiency: 0.92,
  inverterEfficiency: 0.88,
};
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const has = (s: State, f: string) => s.faults.includes(f);
const tripped = (s: State, id: string) => s.trips.includes(id);
export const soc = (s: State) =>
  clamp((s.energyWh / (24 * s.capacityAh)) * 100, 0, 100);
export const timestamp = (t: number) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;

function log(
  s: State,
  text: string,
  type: "info" | "warning" | "fault" = "info",
) {
  s.events.push({ id: s.nextEvent++, time: s.time, text, type });
  s.events = s.events.slice(-150);
}
export function createState(preset: Preset = "normal"): State {
  const normal = preset !== "cold";
  const s: State = {
    time: 0,
    engines: [normal, normal],
    rpm: [normal ? 72 : 0, normal ? 72 : 0],
    rpmTarget: [72, 72],
    sources: Object.fromEntries(
      SOURCE_IDS.map((id) => [
        id,
        {
          on: normal && id.startsWith("gen"),
          contactor: normal && id.startsWith("gen"),
          voltage: 115,
          frequency: 400,
          phase: true,
          kva: id === "ext" ? 60 : id === "apu" ? 45 : 30,
        },
      ]),
    ) as State["sources"],
    apuMaster: false,
    apuStarting: false,
    apuRpm: 0,
    gpuCable: false,
    gpuOn: false,
    onGround: !normal,
    tie: "AUTO",
    dcTie: "OPEN",
    essentialAuto: true,
    batteryOn: normal,
    batteryContactor: true,
    charger: true,
    capacityAh: 40,
    energyWh: 24 * 40 * 0.85,
    batteryTemp: 24,
    inverter: true,
    tru: [true, true],
    cooling: [true, true],
    truTemp: [24, 24],
    faults: preset === "emergency" ? ["bothGen", "apuFail"] : [],
    trips: [],
    timers: {},
    loads: Object.fromEntries(
      LOADS.map((l) => [
        l.id,
        { on: normal || l.id === "fire", breaker: "CLOSED", scale: 1 },
      ]),
    ),
    autoShed: true,
    events: [],
    nextEvent: 0,
    history: [],
    emergencySeconds: 0,
  };
  log(
    s,
    `${preset === "cold" ? "COLD & DARK" : preset === "emergency" ? "EMERGENCY" : "NORMAL FLIGHT"} başlangıç koşulu yüklendi.`,
  );
  return s;
}

function sourceQuality(s: State, id: SourceId): SourceReading {
  const c = s.sources[id];
  const index = id === "gen1" ? 0 : 1;
  const rotating = id.startsWith("gen")
    ? s.engines[index] && s.rpm[index] >= 55
    : id === "apu"
      ? s.apuMaster && s.apuRpm >= 95
      : s.gpuCable && s.gpuOn && s.onGround;
  let voltage = rotating && c.on ? c.voltage : 0;
  let frequency = rotating && c.on ? c.frequency : 0;
  const failed =
    has(s, `${id}Fail`) || (id.startsWith("gen") && has(s, "bothGen"));
  if (id === "gen1" && rotating && c.on) {
    if (has(s, "gen1UnderV")) voltage = 90;
    if (has(s, "gen1OverV")) voltage = 140;
    if (has(s, "gen1UnderF")) frequency = 330;
    if (has(s, "gen1OverF")) frequency = 470;
    if (has(s, "intermittent") && s.time % 12 >= 6) voltage = 92;
  }
  if (failed) {
    voltage = 0;
    frequency = 0;
  }
  const phase = c.phase && !(id === "ext" && has(s, "phaseFail"));
  let reason = "Kalite uygun; bağlantı komutu bekleniyor.";
  if (!rotating)
    reason =
      id === "ext"
        ? "GPU kablosu / GPU ON / yerde koşulu sağlanmıyor."
        : "Tahrik hızı henüz kullanılabilir aralıkta değil.";
  else if (!c.on) reason = "Kaynak anahtarı OFF.";
  else if (failed) reason = "Kaynak arızası; GCU çıkışı engelliyor.";
  else if (tripped(s, id))
    reason = "Koruma TRIPPED; neden giderildikten sonra eğitim reseti gerekli.";
  else if (!phase) reason = "Faz sırası / faz bütünlüğü uygun değil.";
  else if (voltage < LIMITS.minV)
    reason = `UNDERVOLTAGE: ${voltage} V < ${LIMITS.minV} V.`;
  else if (voltage > LIMITS.maxV)
    reason = `OVERVOLTAGE: ${voltage} V > ${LIMITS.maxV} V.`;
  else if (frequency < LIMITS.minF)
    reason = `UNDERFREQUENCY: ${frequency} Hz < ${LIMITS.minF} Hz.`;
  else if (frequency > LIMITS.maxF)
    reason = `OVERFREQUENCY: ${frequency} Hz > ${LIMITS.maxF} Hz.`;
  const available =
    rotating &&
    c.on &&
    !failed &&
    !tripped(s, id) &&
    phase &&
    voltage >= LIMITS.minV &&
    voltage <= LIMITS.maxV &&
    frequency >= LIMITS.minF &&
    frequency <= LIMITS.maxF;
  return {
    available,
    connected: false,
    voltage,
    frequency,
    phase,
    watts: 0,
    current: 0,
    load: 0,
    kva: has(s, "overload") && id === "gen1" ? 9 : c.kva,
    temperature: 24 + (rotating ? 25 : 0),
    reason,
  };
}

/** Directed, interlocked distribution graph. Each energized node retains its exact root and edge path. */
function network(s: State, shed: string[]): Solution {
  const nodes: Record<string, NodeReading> = {};
  const edges: Edge[] = [];
  const sources = Object.fromEntries(
    SOURCE_IDS.map((id) => [id, sourceQuality(s, id)]),
  ) as Record<SourceId, SourceReading>;
  const addNode = (
    id: string,
    kind: NodeReading["kind"],
    failed = false,
    reason = "Geçerli bir besleme yolu yok.",
  ) => {
    nodes[id] = {
      id,
      name: NAMES[id] || id,
      kind,
      powered: false,
      voltage: 0,
      frequency: 0,
      watts: 0,
      current: 0,
      source: null,
      path: [],
      edgePath: [],
      reason,
      failed,
    };
  };
  for (const id of SOURCE_IDS) {
    addNode(
      id,
      "source",
      has(s, `${id}Fail`) || (id.startsWith("gen") && has(s, "bothGen")),
      sources[id].reason,
    );
    // Raw terminal quality remains measurable even when the GCU rejects this source.
    nodes[id].voltage = sources[id].voltage;
    nodes[id].frequency = sources[id].frequency;
    if (sources[id].available)
      Object.assign(nodes[id], {
        powered: true,
        voltage: sources[id].voltage,
        frequency: sources[id].frequency,
        source: id,
        path: [id],
      });
  }
  let batteryV =
    s.energyWh > 0 && !has(s, "batteryFail") ? 22 + (4 * soc(s)) / 100 : 0;
  addNode(
    "battery",
    "source",
    has(s, "batteryFail"),
    batteryV
      ? "Batarya kullanılabilir; ana kontaktörden bağımsız Hot Battery beslemesi vardır."
      : "Batarya arızalı veya enerjisi tükendi.",
  );
  if (batteryV)
    Object.assign(nodes.battery, {
      powered: true,
      voltage: batteryV,
      source: "battery",
      path: ["battery"],
    });
  for (const id of ["ac1", "ac2", "acess", "acstby", "ground"])
    addNode(id, "ac", has(s, `${id}Short`));
  for (const id of ["dc1", "dc2", "dcess", "batbus", "hotbat"])
    addNode(
      id,
      "dc",
      has(s, `${id}Short`) || (id === "dcess" && has(s, "essShort")),
    );
  for (const id of ["tru1", "tru2", "inverter"])
    addNode(id, "converter", has(s, `${id}Fail`) || tripped(s, id));
  for (const l of LOADS)
    addNode(
      l.id,
      "load",
      (l.id === "galley" && has(s, "loadShort")) ||
        (l.id === "nav" && has(s, "loadOvercurrent")) ||
        (l.id === "cabin" && has(s, "loadFail")),
    );
  addNode("charger", "load", has(s, "chargerFail"));
  addNode("starter", "load");
  const edge = (
    id: string,
    from: string,
    to: string,
    commanded: boolean,
    closed: boolean,
    reason: string,
    extra: Partial<Edge> = {},
  ) => {
    edges.push({
      id,
      from,
      to,
      commanded,
      closed,
      active: false,
      reason,
      fault: false,
      efficiency: 1,
      ...extra,
    });
  };
  const walk = () => {
    for (let pass = 0; pass < Object.keys(nodes).length; pass++) {
      let changed = false;
      for (const e of edges) {
        const from = nodes[e.from],
          to = nodes[e.to];
        if (!e.closed || !from.powered || to.powered || to.failed) continue;
        Object.assign(to, {
          powered: true,
          voltage: e.outputVoltage ?? from.voltage,
          frequency: e.outputFrequency ?? from.frequency,
          source: from.source,
          path: [...from.path, to.id],
          edgePath: [...from.edgePath, e.id],
          reason: `${from.name} üzerinden besleniyor. ${e.reason}`,
        });
        e.active = true;
        changed = true;
      }
      if (!changed) break;
    }
  };
  const short1 = nodes.ac1.failed,
    short2 = nodes.ac2.failed;
  const tieStuck = has(s, "tieClosed");
  const tieAllowed =
    tieStuck ||
    (s.tie !== "OPEN" && !has(s, "tieOpen") && !has(s, "tieControl"));
  const quarantineBoth = tieStuck && (short1 || short2);
  let g1 =
    sources.gen1.available &&
    (s.sources.gen1.contactor || has(s, "gen1Closed")) &&
    !has(s, "gen1Open") &&
    !has(s, "gen1Control") &&
    !short1 &&
    !quarantineBoth;
  let g2 =
    sources.gen2.available &&
    s.sources.gen2.contactor &&
    !short2 &&
    !quarantineBoth;
  const forceTie = tieStuck || s.tie === "CLOSED";
  // Break-before-make: a closed tie never parallels independent unsynchronised AC roots.
  if (forceTie && tieAllowed && g1 && g2) g2 = false;
  if (quarantineBoth) {
    g1 = false;
    g2 = false;
  }
  const cross = tieAllowed && !short1 && !short2 && (g1 !== g2 || forceTie);
  const backup: SourceId | null =
    !g1 && !g2 && !quarantineBoth && tieAllowed
      ? sources.ext.available && s.sources.ext.contactor && !has(s, "extOpen")
        ? "ext"
        : sources.apu.available && s.sources.apu.contactor
          ? "apu"
          : null
      : null;
  edge(
    "gcb1",
    "gen1",
    "ac1",
    s.sources.gen1.contactor,
    has(s, "gen1Closed") || g1,
    g1
      ? "GEN 1 öncelikli; GCB 1 kapalı."
      : short1 || quarantineBoth
        ? "Feeder koruması: kısa devre alanı izole."
        : has(s, "gen1Open") || has(s, "gen1Control")
          ? "Kontaktör arızası; komut uygulanamadı."
          : sources.gen1.available
            ? "GCB 1 açma komutu."
            : sources.gen1.reason,
    {
      fault:
        has(s, "gen1Closed") || has(s, "gen1Open") || has(s, "gen1Control"),
    },
  );
  // A welded contactor cannot defeat independent upstream generator/feeder protection.
  if (!g1 && has(s, "gen1Closed")) {
    nodes.gen1.powered = false;
    nodes.gen1.source = null;
    nodes.gen1.path = [];
    sources.gen1.reason =
      "GCB 1 kaynaklı izolasyon sorunu; bağımsız GCU/feeder çıkışı engellendi.";
  }
  edge(
    "gcb2",
    "gen2",
    "ac2",
    s.sources.gen2.contactor,
    g2,
    g2
      ? "GEN 2 öncelikli; GCB 2 kapalı."
      : forceTie && sources.gen2.available
        ? "Paralellemeyi önleyen interlock: GEN 2 açıldı."
        : short2 || quarantineBoth
          ? "Kısa devre / yapışmış tie: kaynak izole."
          : sources.gen2.reason,
  );
  for (const id of ["apu", "ext"] as const)
    for (const side of [1, 2]) {
      const active = backup === id && !(side === 1 ? short1 : short2);
      edge(
        `${id}${side}`,
        id,
        `ac${side}`,
        s.sources[id].contactor && s.tie !== "OPEN",
        active,
        active
          ? `${NAMES[id]} ortak transfer hattından besliyor.`
          : sources[id].available
            ? "Motor kaynağı öncelikli, transfer hattı açık veya kontaktör arızalı."
            : sources[id].reason,
        { fault: id === "ext" && has(s, "extOpen") },
      );
    }
  edge(
    "tie",
    g2 ? "ac2" : "ac1",
    g2 ? "ac1" : "ac2",
    s.tie === "CLOSED" || (s.tie === "AUTO" && g1 !== g2),
    tieStuck || cross,
    tieStuck
      ? "STUCK CLOSED: mekanik olarak kapalı. Kaynak interlock / feeder koruması aktif."
      : short1 || short2
        ? "Bus fault nedeniyle tie açıldı; arızalı bara tekrar beslenmez."
        : has(s, "tieOpen") || has(s, "tieControl")
          ? "Tie arızası: transfer yolu kullanılamıyor."
          : cross
            ? "Tek sağlıklı kaynak iki AC barayı besliyor."
            : "İzole bara işletimi; iki kaynak paralel değil.",
    { fault: tieStuck || has(s, "tieOpen") || has(s, "tieControl") },
  );
  if (quarantineBoth) {
    nodes.ac1.reason = nodes.ac2.reason =
      "Tie yapışmış + bus short: ortak alanın tüm AC kaynakları upstream koruma ile izole.";
  }
  walk();
  const preferredAC = nodes.ac1.powered ? "ac1" : "ac2";
  edge(
    "acessFeed",
    preferredAC,
    "acess",
    true,
    nodes[preferredAC].powered && (preferredAC === "ac1" || s.essentialAuto),
    preferredAC === "ac1"
      ? "Normal essential AC beslemesi."
      : "Essential transfer AUTO: AC BUS 2 alternatif besleme.",
  );
  edge(
    "groundFeed",
    sources.ext.available ? "ext" : "ac2",
    "ground",
    s.onGround,
    s.onGround && (sources.ext.available || nodes.ac2.powered),
    "Yalnızca yerde: geçerli GPU veya AC BUS 2 servis beslemesi.",
  );
  for (const side of [0, 1] as const) {
    const id = `tru${side + 1}`,
      ac = `ac${side + 1}`,
      dc = `dc${side + 1}`;
    const healthy =
      s.tru[side] &&
      !nodes[id].failed &&
      !(side === 0 && has(s, "tru1Hot")) &&
      s.truTemp[side] < LIMITS.truTripTemp;
    edge(
      `${id}Input`,
      ac,
      id,
      s.tru[side],
      healthy,
      !s.tru[side]
        ? "TRU OFF."
        : !healthy
          ? "TRU arızası / termal koruma."
          : "AC → DC; dönüşüm verimi %92.",
      {
        efficiency: LIMITS.truEfficiency,
        outputVoltage: 28,
        outputFrequency: 0,
        fault: !healthy && s.tru[side],
      },
    );
    edge(
      `${id}Output`,
      id,
      dc,
      true,
      !nodes[dc].failed,
      nodes[dc].failed
        ? "DC feeder kısa devre koruması açık."
        : "28 V DC çıkış kontaktörü kapalı.",
      { fault: nodes[dc].failed },
    );
  }
  walk();
  const alternateDC = nodes.dc1.powered ? "dc1" : "dc2";
  const targetDC = alternateDC === "dc1" ? "dc2" : "dc1";
  edge(
    "dcTie",
    alternateDC,
    targetDC,
    s.dcTie !== "OPEN",
    s.dcTie !== "OPEN" &&
      nodes[alternateDC].powered &&
      !nodes[targetDC].powered &&
      !nodes[targetDC].failed,
    s.dcTie === "OPEN"
      ? "Bu eğitim mimarisinde DC tie normalde OPEN."
      : "Tek TRU beslemesine transfer; TRU çıkışları paralellenmez.",
  );
  walk();
  edge(
    "hotFeed",
    "battery",
    "hotbat",
    true,
    true,
    "Hot Battery Bus doğrudan ve sigortalı batarya hattında; BAT switch bu hattı kesmez.",
  );
  const dcNormal = nodes.dc2.powered ? "dc2" : nodes.dc1.powered ? "dc1" : null;
  edge(
    "batNormal",
    dcNormal || "dc2",
    "batbus",
    true,
    !!dcNormal,
    "Normal DC kaynağı Battery Bus yüklerini taşır.",
  );
  edge(
    "batContactor",
    "battery",
    "batbus",
    s.batteryOn && s.batteryContactor,
    s.batteryOn && s.batteryContactor && !has(s, "batteryOpen") && !dcNormal,
    has(s, "batteryOpen")
      ? "Battery contactor arızalı."
      : dcNormal
        ? "Normal DC besleme öncelikli; batarya standby."
        : "Batarya ana besleme kontaktörü.",
    { fault: has(s, "batteryOpen") },
  );
  walk();
  const dcEss = nodes.dc1.powered
    ? "dc1"
    : nodes.dc2.powered && s.essentialAuto
      ? "dc2"
      : "batbus";
  edge(
    "dcessFeed",
    dcEss,
    "dcess",
    true,
    !nodes.dcess.failed && (dcEss === "dc1" || s.essentialAuto),
    nodes.dcess.failed
      ? "Essential DC bus kısa devre izolasyonu."
      : "Essential kaynak seçimi: DC BUS 1 → DC BUS 2 → Battery Bus.",
    { fault: nodes.dcess.failed },
  );
  edge(
    "invInput",
    "batbus",
    "inverter",
    s.inverter,
    s.inverter && !nodes.inverter.failed && !nodes.acess.powered,
    "DC → 115 V / 400 Hz standby AC; verim %88.",
    {
      outputVoltage: 115,
      outputFrequency: 400,
      efficiency: LIMITS.inverterEfficiency,
    },
  );
  walk();
  const standbyFeed = nodes.acess.powered ? "acess" : "inverter";
  edge(
    "standbyFeed",
    standbyFeed,
    "acstby",
    true,
    true,
    standbyFeed === "acess"
      ? "Normal standby AC beslemesi."
      : "Normal AC kayıp; static inverter alternatifi.",
  );
  walk();
  for (const l of LOADS) {
    const c = s.loads[l.id];
    const enabled =
      c.on &&
      c.breaker === "CLOSED" &&
      !shed.includes(l.id) &&
      !nodes[l.id].failed;
    edge(
      `cb-${l.id}`,
      l.bus,
      l.id,
      c.on && c.breaker === "CLOSED",
      enabled,
      nodes[l.id].failed
        ? "Yük arızası: dal koruması açıldı."
        : c.breaker !== "CLOSED"
          ? `Circuit breaker ${c.breaker}.`
          : !c.on
            ? "Yük anahtarı OFF."
            : shed.includes(l.id)
              ? "Kapasite yetersiz: öncelik sırasına göre LOAD SHED."
              : "Yük anahtarı ve circuit breaker kapalı.",
      { fault: nodes[l.id].failed || c.breaker === "TRIPPED" },
    );
    if (!enabled) nodes[l.id].reason = edges.at(-1)!.reason;
  }
  const charge =
    s.charger &&
    s.batteryOn &&
    s.batteryContactor &&
    !has(s, "batteryOpen") &&
    !has(s, "batteryFail") &&
    !has(s, "chargerFail") &&
    soc(s) < 99.999 &&
    nodes.dc2.powered;
  edge(
    "chargerFeed",
    "dc2",
    "charger",
    s.charger,
    charge,
    charge
      ? "DC BUS 2 üzerinden 500 W şarj cihazı; verim %90."
      : "Şarj için DC BUS 2, BAT ON, kontaktör ve sağlıklı şarj cihazı gerekli.",
  );
  edge(
    "starterFeed",
    "batbus",
    "starter",
    s.apuStarting,
    s.apuStarting && s.apuRpm < 95,
    "APU starter Battery Bus üzerinden 2 kW çeker.",
  );
  walk();

  // Reverse accumulation accounts for conversion losses and attributes every watt to its real source.
  const consume = (id: string, watts: number) => {
    const n = nodes[id];
    if (!n.powered) return;
    n.watts += watts;
    for (let i = n.edgePath.length - 1; i >= 0; i--) {
      const e = edges.find((e) => e.id === n.edgePath[i])!;
      watts /= e.efficiency;
      nodes[e.from].watts += watts;
    }
  };
  let requestedWatts = 0,
    servedWatts = 0;
  for (const l of LOADS) {
    const watts = l.watts * s.loads[l.id].scale;
    if (s.loads[l.id].on) requestedWatts += watts;
    if (nodes[l.id].powered) {
      consume(l.id, watts);
      servedWatts += watts;
    }
  }
  if (nodes.charger.powered) consume("charger", 500);
  if (nodes.starter.powered) consume("starter", 2000);
  const chargeWatts = nodes.charger.powered ? 450 : 0;
  const battWatts = nodes.battery.watts;
  const netWatts = battWatts - chargeWatts;
  // Small educational terminal-voltage sag. The Wh state represents usable terminal energy.
  if (batteryV) {
    const ocv = batteryV;
    batteryV =
      (ocv + Math.sqrt(Math.max(0, ocv * ocv - 4 * 0.012 * netWatts))) / 2;
    for (const n of Object.values(nodes))
      if (n.source === "battery" && n.frequency === 0) n.voltage = batteryV;
  }
  if (batteryV)
    nodes.battery.reason =
      netWatts > 1
        ? `Batarya ${battWatts.toFixed(0)} W sağlıyor; şarj katkısı ${chargeWatts.toFixed(0)} W. Net ${netWatts.toFixed(0)} W deşarj. ${chargeWatts === 0 ? edges.find((e) => e.id === "chargerFeed")!.reason : ""}`
        : netWatts < -1
          ? `Şarj cihazından ${chargeWatts.toFixed(0)} W gelirken Hot Battery / standby yükleri ${battWatts.toFixed(0)} W tüketiyor. Net ${(-netWatts).toFixed(0)} W bataryaya depolanıyor.`
          : "Net batarya güç alışverişi yaklaşık sıfır; standby hazır.";
  for (const n of Object.values(nodes)) {
    n.current = n.voltage
      ? n.watts / (n.frequency ? 3 * n.voltage * LIMITS.pf : n.voltage)
      : 0;
    if (n.id === "acstby" || n.id === "inverter" || n.id === "instruments")
      n.current = n.voltage ? n.watts / (n.voltage * LIMITS.pf) : 0;
    if (n.failed)
      n.reason = "FAULT ISOLATED: koruma bu bölümü besleme ağından ayırdı.";
    else if (
      !n.powered &&
      n.kind !== "source" &&
      !(quarantineBoth && ["ac1", "ac2"].includes(n.id))
    ) {
      const incoming = edges.filter((e) => e.to === n.id);
      n.reason =
        incoming
          .map(
            (e) =>
              `${NAMES[e.from]}: ${!e.closed ? e.reason : !nodes[e.from].powered ? `üst besleme enerjisiz. ${nodes[e.from].reason}` : e.reason}`,
          )
          .join(" · ") || n.reason;
    }
  }
  nodes.battery.current = batteryV ? netWatts / batteryV : 0;
  for (const id of SOURCE_IDS) {
    const r = sources[id];
    r.watts = nodes[id].watts;
    r.connected = edges.some((e) => e.from === id && e.active);
    r.current = r.voltage ? r.watts / (3 * r.voltage * LIMITS.pf) : 0;
    r.load = (r.watts / (r.kva * 1000 * LIMITS.pf)) * 100;
    r.temperature += r.load * 0.45;
    if (r.connected)
      r.reason = `${NAMES[id]} geçerli yollar üzerinden ${(r.watts / 1000).toFixed(2)} kW sağlıyor. ${r.load > 100 ? "OVERLOAD: 5 saniyelik koruma zamanlayıcısı çalışıyor." : r.load > 90 ? "HIGH LOAD." : "Kapasite içinde."}`;
    nodes[id].reason = r.reason;
  }
  const essential = nodes.dcess.powered && nodes.acstby.powered;
  const noMain = !nodes.ac1.powered && !nodes.ac2.powered;
  const isolated = ["ac1", "ac2", "dc1", "dcess"].some(
    (id) => nodes[id].failed,
  );
  const overload = SOURCE_IDS.some((id) => sources[id].load > 100);
  const status: Solution["status"] =
    !essential || noMain
      ? "EMERGENCY"
      : isolated
        ? "FAULT ISOLATED"
        : s.faults.length ||
            s.trips.length ||
            !nodes.ac1.powered ||
            !nodes.ac2.powered ||
            !nodes.dc1.powered ||
            !nodes.dc2.powered ||
            !sources.gen1.connected ||
            !sources.gen2.connected ||
            shed.length ||
            overload
          ? "DEGRADED"
          : "NORMAL";
  const statusReason = !essential
    ? "Seçilmiş essential beslemelerden en az biri kayıp. Güç yolunu incele."
    : noMain
      ? "Ana AC kayıp; DC ESS ve AC STANDBY batarya / inverter üzerinden korunuyor."
      : isolated
        ? "Arızalı bölüm izole edildi; sağlam yollar çalışmaya devam ediyor."
        : status === "DEGRADED"
          ? "Alternatif besleme, kaynak / dönüştürücü kaybı veya kapasite kısıtı var."
          : "İki izole jeneratör, iki TRU ve essential beslemeler kullanılabilir.";
  const alerts = [
    ...SOURCE_IDS.filter(
      (id) => s.sources[id].on && !sources[id].available,
    ).map((id) => `${NAMES[id]}: ${sources[id].reason}`),
    ...["ac1", "ac2", "dc1", "dcess"]
      .filter((id) => nodes[id].failed)
      .map(
        (id) =>
          `${NAMES[id]} SHORT: yüksek arıza akımı algılandı → feeder açıldı → izole.`,
      ),
    ...(quarantineBoth
      ? [
          "BUS TIE STUCK CLOSED: kısa devreli ortak alan için her iki AC besleme engellendi.",
        ]
      : []),
    ...shed.map((id) => `${NAMES[id]} LOAD SHED`),
    ...(overload ? ["OVERLOAD: 5 s gecikmeli jeneratör koruması."] : []),
    ...(s.energyWh <= 0
      ? ["BATTERY DEPLETED"]
      : soc(s) < 15
        ? ["LOW BATTERY"]
        : []),
  ];
  return {
    nodes,
    edges,
    sources,
    shed,
    requestedWatts,
    servedWatts,
    battery: {
      voltage: batteryV,
      soc: soc(s),
      watts: battWatts,
      netWatts,
      current: batteryV ? netWatts / batteryV : 0,
      chargeWatts,
      endurance: netWatts > 0 ? (s.energyWh / netWatts) * 60 : Infinity,
      mode:
        netWatts > 1 ? "DISCHARGING" : netWatts < -1 ? "CHARGING" : "STANDBY",
    },
    status,
    statusReason,
    alerts,
  };
}

export function solve(s: State): Solution {
  const shed: string[] = [];
  let q = network(s, shed);
  if (!s.autoShed) return q;
  // Deterministic priority: galley, cabin, ground service, then important loads. Essentials are never auto-shed.
  const candidates = [
    ...LOADS.filter((l) => l.priority === "NON-ESSENTIAL"),
    ...LOADS.filter((l) => l.priority === "IMPORTANT"),
  ];
  for (const l of candidates) {
    const n = q.nodes[l.id];
    if (!n.powered || !n.source || n.source === "battery") continue;
    const sourceOver = q.sources[n.source].load > 100;
    const converterOver = n.path.some(
      (id) => /^tru[12]$/.test(id) && q.nodes[id].watts > LIMITS.truKW * 1000,
    );
    if (sourceOver || converterOver) {
      shed.push(l.id);
      q = network(s, shed);
    }
  }
  return q;
}

function transitions(s: State, before: Solution, after: Solution) {
  for (const id of SOURCE_IDS)
    if (before.sources[id].connected !== after.sources[id].connected)
      log(
        s,
        `${NAMES[id]} ${after.sources[id].connected ? "CONNECTED" : "DISCONNECTED"} · ${after.sources[id].reason}`,
        after.sources[id].connected ? "info" : "warning",
      );
  for (const id of [
    "ac1",
    "ac2",
    "acess",
    "acstby",
    "tru1",
    "tru2",
    "dc1",
    "dc2",
    "dcess",
    "batbus",
    "hotbat",
  ]) {
    const a = before.nodes[id],
      b = after.nodes[id];
    if (a.powered !== b.powered || a.source !== b.source)
      log(
        s,
        `${b.name} ${b.powered ? `ENERGIZED ← ${NAMES[b.source!]}` : "UNPOWERED"}${a.source && b.source && a.source !== b.source ? " · SOURCE TRANSFER" : ""}`,
        b.powered ? "info" : "warning",
      );
  }
  for (const id of after.shed)
    if (!before.shed.includes(id))
      log(s, `${NAMES[id]} LOAD SHED · kapasite korunuyor.`, "warning");
  for (const id of before.shed)
    if (!after.shed.includes(id)) log(s, `${NAMES[id]} shed koşulu kalktı.`);
  if (before.battery.mode !== after.battery.mode)
    log(s, `BATTERY ${after.battery.mode}`);
  if (before.status !== after.status)
    log(
      s,
      `SYSTEM ${after.status} · ${after.statusReason}`,
      after.status === "NORMAL" ? "info" : "warning",
    );
}

function protection(s: State, q: Solution) {
  for (const [fault, id] of [
    ["loadShort", "galley"],
    ["loadOvercurrent", "nav"],
  ])
    if (has(s, fault) && s.loads[id].breaker !== "TRIPPED") {
      s.loads[id].breaker = "TRIPPED";
      log(s, `${NAMES[id]} CB TRIPPED · dal akım koruması.`, "fault");
    }
  for (const side of [0, 1] as const) {
    const id = `tru${side + 1}`;
    if (
      (s.truTemp[side] >= LIMITS.truTripTemp ||
        (side === 0 && has(s, "tru1Hot")) ||
        (s.timers[id] || 0) >= 5) &&
      !tripped(s, id)
    ) {
      s.trips.push(id);
      log(s, `${NAMES[id]} TRIPPED · sıcaklık / aşırı yük koruması.`, "fault");
    }
  }
  for (const id of SOURCE_IDS)
    if (
      (s.timers[id] || 0) >= LIMITS.overloadSeconds &&
      !tripped(s, id) &&
      q.sources[id].load > 100
    ) {
      s.trips.push(id);
      log(s, `${NAMES[id]} OVERLOAD TRIP · 5 s sınırı aşıldı.`, "fault");
    }
}

export function act(previous: State, action: Action): State {
  if (action.type === "preset") return createState(action.preset);
  const s = structuredClone(previous),
    before = solve(previous);
  switch (action.type) {
    case "fault": {
      if (!FAULTS.some((f) => f[0] === action.id)) return previous;
      const removing = has(s, action.id);
      if (removing) s.faults = s.faults.filter((f) => f !== action.id);
      else {
        if (action.id === "tieClosed")
          s.faults = s.faults.filter((f) => f !== "tieOpen");
        if (action.id === "tieOpen")
          s.faults = s.faults.filter((f) => f !== "tieClosed");
        if (action.id === "gen1Closed")
          s.faults = s.faults.filter((f) => f !== "gen1Open");
        if (action.id === "gen1Open")
          s.faults = s.faults.filter((f) => f !== "gen1Closed");
        s.faults.push(action.id);
      }
      if (action.id === "lowBattery" && !removing)
        s.energyWh = s.capacityAh * 24 * 0.05;
      log(
        s,
        `${FAULTS.find((f) => f[0] === action.id)![1]} ${removing ? "REMOVED" : "INJECTED"}`,
        removing ? "info" : "fault",
      );
      break;
    }
    case "clearFaults":
      s.faults = [];
      log(
        s,
        "Tüm enjekte arızalar kaldırıldı. TRIPPED korumalar ayrı resetlenir.",
      );
      break;
    case "resetTrips": {
      s.trips = s.trips.filter((id) =>
        id === "tru1"
          ? has(s, "tru1Hot") || s.truTemp[0] >= 110
          : id === "tru2"
            ? s.truTemp[1] >= 110
            : false,
      );
      s.timers = {};
      for (const l of LOADS)
        if (
          s.loads[l.id].breaker === "TRIPPED" &&
          !(l.id === "galley" && has(s, "loadShort")) &&
          !(l.id === "nav" && has(s, "loadOvercurrent"))
        )
          s.loads[l.id].breaker = "CLOSED";
      log(s, "Eğitim koruma reseti: aktif arızalı korumalar kapatılamaz.");
      break;
    }
    case "engine":
      s.engines[action.side] = !s.engines[action.side];
      log(
        s,
        `ENGINE ${action.side + 1} ${s.engines[action.side] ? "START" : "STOP"}`,
      );
      break;
    case "rpm":
      s.rpmTarget[action.side] = clamp(action.value, 0, 100);
      break;
    case "source": {
      const c = s.sources[action.id];
      if (
        action.key === "voltage" ||
        action.key === "frequency" ||
        action.key === "kva"
      )
        c[action.key] = clamp(
          Number(action.value),
          action.key === "kva" ? 3 : 0,
          action.key === "frequency" ? 500 : action.key === "kva" ? 120 : 160,
        );
      else c[action.key] = !!action.value;
      log(s, `${NAMES[action.id]} ${action.key} → ${String(action.value)}`);
      break;
    }
    case "switch":
      s[action.key] = !s[action.key];
      if (action.key === "apuMaster" && !s.apuMaster) s.apuStarting = false;
      log(s, `${action.key} → ${s[action.key] ? "ON" : "OFF"}`);
      break;
    case "apuStart":
      if (s.apuMaster && before.nodes.batbus.powered) {
        s.apuStarting = true;
        log(s, "APU STARTER ENERGIZED");
      } else
        log(
          s,
          "APU START REFUSED · APU MASTER ve Battery Bus beslemesi gerekli.",
          "warning",
        );
      break;
    case "apuStop":
      s.apuStarting = false;
      s.apuMaster = false;
      log(s, "APU STOP");
      break;
    case "tie":
      s[action.dc ? "dcTie" : "tie"] = action.value;
      log(s, `${action.dc ? "DC" : "AC"} BUS TIE → ${action.value}`);
      break;
    case "tru":
      s[action.cooling ? "cooling" : "tru"][action.side] =
        !s[action.cooling ? "cooling" : "tru"][action.side];
      log(
        s,
        `TRU ${action.side + 1} ${action.cooling ? "COOLING" : "SWITCH"} değişti.`,
      );
      break;
    case "batterySoc":
      s.energyWh = (s.capacityAh * 24 * clamp(action.value, 0, 100)) / 100;
      log(s, `Eğitim batarya enerjisi → %${soc(s).toFixed(0)}`);
      break;
    case "capacity": {
      const ratio = soc(s) / 100;
      s.capacityAh = clamp(action.value, 5, 100);
      s.energyWh = s.capacityAh * 24 * ratio;
      break;
    }
    case "load": {
      if (!s.loads[action.id]) return previous;
      const c = s.loads[action.id];
      if (action.key === "scale")
        c.scale = clamp(Number(action.value), 0.25, 3);
      else if (action.key === "on") c.on = !!action.value;
      else c.breaker = action.value as typeof c.breaker;
      log(s, `${NAMES[action.id]} ${action.key} → ${String(action.value)}`);
      break;
    }
    case "clearLog":
      s.events = [];
      return s;
  }
  protection(s, solve(s));
  transitions(s, before, solve(s));
  return s;
}

/** Fixed substeps keep battery integration, APU spin-up and protection invariant to UI time scale. */
export function advance(previous: State, seconds: number): State {
  const s = structuredClone(previous);
  let remaining = clamp(seconds, 0, 3600);
  while (remaining > 0.000001) {
    const dt = Math.min(0.2, remaining),
      before = solve(s);
    s.time += dt;
    for (const i of [0, 1] as const) {
      const target = s.engines[i] ? s.rpmTarget[i] : 0;
      s.rpm[i] += clamp(target - s.rpm[i], -12 * dt, 10 * dt);
    }
    if (
      s.apuMaster &&
      s.apuStarting &&
      (s.apuRpm >= 95 || before.nodes.starter.powered)
    ) {
      s.apuRpm = clamp(s.apuRpm + dt * 5, 0, 100);
    } else s.apuRpm = clamp(s.apuRpm - dt * 8, 0, 100);
    s.energyWh = clamp(
      s.energyWh - (before.battery.netWatts * dt) / 3600,
      0,
      s.capacityAh * 24,
    );
    s.batteryTemp +=
      ((24 + Math.abs(before.battery.current) * 0.14 - s.batteryTemp) * dt) /
      120;
    for (const i of [0, 1] as const) {
      const id = `tru${i + 1}`,
        loadRatio = before.nodes[id].watts / (LIMITS.truKW * 1000);
      const target = 24 + loadRatio * (s.cooling[i] ? 38 : 240);
      s.truTemp[i] += ((target - s.truTemp[i]) * dt) / (s.cooling[i] ? 25 : 40);
      s.timers[id] = loadRatio > 1 ? (s.timers[id] || 0) + dt : 0;
    }
    for (const id of SOURCE_IDS)
      s.timers[id] =
        before.sources[id].load > 100 ? (s.timers[id] || 0) + dt : 0;
    s.emergencySeconds =
      before.status === "EMERGENCY" ? s.emergencySeconds + dt : 0;
    protection(s, before);
    const after = solve(s);
    transitions(s, before, after);
    if (!s.history.length || s.time - s.history.at(-1)!.time >= 1 - 1e-6) {
      s.history.push({
        time: s.time,
        gen1: after.sources.gen1.load,
        gen2: after.sources.gen2.load,
        soc: after.battery.soc,
        kw: after.servedWatts / 1000,
      });
      s.history = s.history.slice(-240);
    }
    remaining -= dt;
  }
  return s;
}
