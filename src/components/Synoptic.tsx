import { useState } from "react";
import { ArrowRight, Crosshair, HelpCircle, Search, Zap } from "lucide-react";
import { NAMES } from "../sim/catalog.ts";
import type { Solution, State } from "../sim/types.ts";
import { fmt, Meter, Note, type Dispatch } from "./Controls.tsx";

const POS: Record<string, [number, number]> = {
  gen1: [130, 78],
  apu: [430, 78],
  ext: [730, 78],
  gen2: [1030, 78],
  ac1: [240, 248],
  ac2: [920, 248],
  acess: [580, 330],
  acstby: [580, 445],
  tru1: [240, 405],
  tru2: [920, 405],
  dc1: [240, 560],
  dc2: [920, 560],
  dcess: [580, 610],
  battery: [130, 735],
  batbus: [410, 735],
  inverter: [760, 735],
  hotbat: [130, 850],
  ground: [1030, 850],
  fuelLeft: [79, 560],
  fuelRight: [1081, 560],
  nav: [580, 850],
  instruments: [750, 445],
};
function route(id: string, from: string, to: string): string {
  const [x, y] = POS[from],
    [a, b] = POS[to];
  const halfWidth = (id: string) =>
    ["fuelLeft", "fuelRight", "nav", "instruments"].includes(id) ? 69 : 82;
  if (id === "tie") return `M${x},${y} H${a}`;
  if (id.startsWith("apu") || id.startsWith("ext")) {
    const lane = from === "apu" ? 169 : 190;
    return `M${x},${y + 34} V${lane} H${a} V${b - 26}`;
  }
  if (id === "gcb1" || id === "gcb2")
    return `M${x},${y + 34} V210 H${a} V${b - 26}`;
  if (id === "dcTie") return `M${x},${y} V515 H${a} V${b}`;
  if (id === "acessFeed")
    return `M${x},${y + 26} V${b} H${a - (a > x ? 82 : -82)}`;
  if (id === "dcessFeed") return `M${x},${y + 26} V${b} H${a}`;
  if (id === "batNormal") return `M${x},${y + 26} V670 H${a} V${b - 32}`;
  if (id === "standbyFeed" && from === "inverter")
    return `M${x},${y - 32} V685 H674 V${b} H${a + 82}`;
  if (id === "groundFeed") return `M${x + 82},${y} H1135 V${b} H${a + 82}`;
  if (x === a)
    return `M${x},${y + (b > y ? 30 : -30)} V${b + (b > y ? -30 : 30)}`;
  if (y === b)
    return `M${x + (a > x ? halfWidth(from) : -halfWidth(from))},${y} H${a + (a > x ? -halfWidth(to) : halfWidth(to))}`;
  return `M${x},${y + 32} V${(y + b) / 2} H${a} V${b - 32}`;
}
const CONTACT: Record<string, [number, number]> = {
  gcb1: [130, 170],
  gcb2: [1030, 170],
  tie: [580, 248],
  apu1: [430, 148],
  ext2: [730, 148],
  batContactor: [275, 735],
  dcTie: [580, 515],
  acessFeed: [420, 330],
  dcessFeed: [420, 610],
};
const CONTACT_LABEL: Record<string, string> = {
  gcb1: "GCB 1",
  gcb2: "GCB 2",
  tie: "BUS TIE",
  apu1: "APU → AC 1",
  ext2: "EXT → AC 2",
  batContactor: "BAT CONTACTOR",
  dcTie: "DC TIE",
  acessFeed: "AC ESS FEED",
  dcessFeed: "DC ESS FEED",
};
// Default label sits above the contactor; these would land on a node caption there.
const CONTACT_LABEL_AT: Record<string, [number, number, "start" | "middle"]> = {
  apu1: [27, 3, "start"],
  ext2: [27, 3, "start"],
  dcTie: [0, 31, "middle"],
};
export type Level = "BASIC" | "ENGINEERING" | "MAINTENANCE";
export function Synoptic({
  q,
  s,
  selected,
  select,
  level,
  paused,
}: {
  q: Solution;
  s: State;
  selected: string;
  select: (id: string) => void;
  level: Level;
  paused: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const trace = q.nodes[selected]?.edgePath || [];
  return (
    <section
      className={`synoptic-panel ${paused ? "paused" : ""}`}
      aria-label="Master electrical synoptic"
    >
      <div className="synoptic-heading">
        <div>
          <span className="eyebrow">LIVE ELECTRICAL NETWORK</span>
          <h2>Gücün izini sür.</h2>
        </div>
        <div className="diagram-tools">
          <button
            aria-label="Şemayı uzaklaştır"
            disabled={zoom === 1}
            onClick={() => setZoom(Math.max(1, zoom - 0.25))}
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Şemayı yakınlaştır"
            disabled={zoom >= 2}
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          >
            +
          </button>
          <button
            aria-label="Şema yakınlaştırmasını sıfırla"
            onClick={() => setZoom(1)}
          >
            <Crosshair size={15} />
          </button>
        </div>
      </div>
      <div className="diagram-legend">
        <span>
          <i className="cyan" />
          AC POWER
        </span>
        <span>
          <i className="green" />
          DC POWER
        </span>
        <span>
          <i className="amber-bg" />
          BATTERY
        </span>
        <span>
          <i className="red-bg" />
          FAULT
        </span>
        <span>
          <i />
          UNPOWERED
        </span>
      </div>
      <div className="diagram-scroll">
        <svg
          viewBox="0 0 1160 940"
          style={{ width: `${zoom * 100}%` }}
          role="img"
          aria-label="Canlı AC DC dağıtım şeması; bileşenler ve kontaktörler tıklanabilir"
        >
          <defs>
            <pattern
              id="dots"
              width="22"
              height="22"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="0.7" fill="#26364a" />
            </pattern>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10Z" fill="context-stroke" />
            </marker>
          </defs>
          <rect x="0" y="0" width="1160" height="940" fill="url(#dots)" />
          <text className="section-label" x="32" y="27">
            GENERATION
          </text>
          <text className="section-label" x="32" y="304">
            AC DISTRIBUTION
          </text>
          <text className="section-label" x="32" y="491">
            DC CONVERSION & DISTRIBUTION
          </text>
          <text className="section-label" x="32" y="670">
            BATTERY & STANDBY
          </text>
          {q.edges
            .filter((e) => POS[e.from] && POS[e.to])
            .map((e) => {
              const color =
                q.nodes[e.to].source === "battery"
                  ? "battery-flow"
                  : q.nodes[e.to].frequency > 0
                    ? "ac-flow"
                    : "dc-flow";
              return (
                <g
                  key={e.id}
                  className={`wire ${e.active ? `energized ${color}` : ""} ${e.fault ? "fault-wire" : ""} ${trace.includes(e.id) || selected === e.id ? "traced" : ""}`}
                >
                  <path d={route(e.id, e.from, e.to)} className="wire-base" />
                  {e.active && (
                    <path
                      d={route(e.id, e.from, e.to)}
                      className="wire-energy"
                      markerEnd="url(#arrow)"
                    />
                  )}
                  <path
                    d={route(e.id, e.from, e.to)}
                    className="wire-hit"
                    onClick={() => select(e.id)}
                  />
                  <title>
                    {e.id} · {e.closed ? "CLOSED" : "OPEN"} · {e.reason}
                  </title>
                </g>
              );
            })}
          {Object.entries(CONTACT).map(([id, [x, y]]) => {
            const e = q.edges.find((e) => e.id === id);
            if (!e) return null;
            const [lx, ly, anchor] = CONTACT_LABEL_AT[id] ?? [0, -24, "middle"];
            return (
              <g
                key={id}
                transform={`translate(${x},${y})`}
                role="button"
                tabIndex={0}
                aria-label={`${id} kontaktör ${e.closed ? "CLOSED" : "OPEN"}`}
                onClick={() => select(id)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    select(id);
                  }
                }}
                className={`svg-contactor ${e.active ? "active" : ""} ${e.fault ? "fault" : ""} ${selected === id ? "selected" : ""}`}
              >
                <rect x="-21" y="-17" width="42" height="34" rx="4" />
                <circle cx="-12" cy="0" r="3" />
                <circle cx="12" cy="0" r="3" />
                <path d={e.closed ? "M-10,0 H10" : "M-10,0 L8,-11"} />
                <title>{e.reason}</title>
                {level !== "BASIC" && (
                  <text x={lx} y={ly} textAnchor={anchor}>
                    {CONTACT_LABEL[id] ?? id}
                  </text>
                )}
              </g>
            );
          })}
          {Object.entries(POS).map(([id, [x, y]]) => {
            const n = q.nodes[id],
              source = n.kind === "source",
              converter = n.kind === "converter",
              load = n.kind === "load";
            return (
              <g
                key={id}
                className={`svg-node ${n.powered ? "powered" : ""} ${n.source === "battery" ? "battery-node" : n.frequency ? "ac-node" : "dc-node"} ${n.failed ? "failed" : ""} ${selected === id || q.nodes[selected]?.path.includes(id) ? "selected" : ""}`}
                transform={`translate(${x},${y})`}
                role="button"
                tabIndex={0}
                aria-label={`${NAMES[id]}, ${n.powered ? "POWERED" : "UNPOWERED"}`}
                onClick={() => select(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(id);
                  }
                }}
              >
                <rect
                  x={load ? -69 : -82}
                  y="-32"
                  width={load ? 138 : 164}
                  height="64"
                  rx={source ? 8 : 4}
                />
                {source && (
                  <g transform="translate(-59,-1)">
                    <circle
                      className={
                        n.powered && id !== "battery" ? "generator-ring" : ""
                      }
                      r="14"
                    />
                    <text textAnchor="middle" y="5" className="source-symbol">
                      {id === "battery" ? "±" : "~"}
                    </text>
                  </g>
                )}
                <text
                  x={source ? 14 : 0}
                  y="-9"
                  textAnchor="middle"
                  className={`node-name ${load ? "load-node-name" : ""}`}
                >
                  {NAMES[id]}
                </text>
                <text
                  x={source ? 14 : 0}
                  y="14"
                  textAnchor="middle"
                  className="node-value"
                >
                  {level === "BASIC"
                    ? n.failed
                      ? "ISOLATED"
                      : n.powered
                        ? "POWERED"
                        : "UNPOWERED"
                    : `${fmt(n.voltage, n.frequency || n.voltage === 0 ? 0 : 1)} V${n.frequency ? ` · ${fmt(n.frequency, 0)} Hz` : n.powered ? " DC" : ""}`}
                </text>
                <circle
                  cx={load ? 57 : 70}
                  cy="-21"
                  r="3"
                  className="status-dot"
                />
                {level !== "BASIC" && (
                  <text
                    x="0"
                    y="49"
                    textAnchor="middle"
                    className="node-detail"
                  >
                    {source && id !== "battery"
                      ? `${fmt(q.sources[id as keyof typeof q.sources].load)}% LOAD`
                      : converter
                        ? `${fmt(n.current)} A · ${fmt(n.watts / 1000)} kW`
                        : n.powered
                          ? `← ${NAMES[n.source!]}`
                          : "NO VALID SOURCE"}
                  </text>
                )}
                <title>{n.reason}</title>
              </g>
            );
          })}
          {level === "MAINTENANCE" && (
            <text className="section-label" x="580" y="905" textAnchor="middle">
              MAINTENANCE · Seçilen bileşenin ölçümünü sağ panelden al.
            </text>
          )}
          <text className="diagram-footnote" x="1130" y="930" textAnchor="end">
            GENERIC TWIN-ENGINE · NO AC PARALLELING
          </text>
        </svg>
      </div>
      <div className="synoptic-bottom">
        <span>
          <span className="live-dot" />
          {paused ? "SIMULATION PAUSED" : "LIVE NETWORK"} · {fmt(s.time, 1)} s
        </span>
        <span>Bir bus, kontaktör veya kaynak seç.</span>
      </div>
    </section>
  );
}

export function Inspector({
  selected,
  select,
  s,
  q,
  send,
  maintenance = false,
}: {
  selected: string;
  select: (id: string) => void;
  s: State;
  q: Solution;
  send: Dispatch;
  maintenance?: boolean;
}) {
  const [tool, setTool] = useState("Voltage");
  const [showWhy, setShowWhy] = useState(false);
  const n = q.nodes[selected],
    e = q.edges.find((e) => e.id === selected);
  const title = n?.name || selected.toUpperCase();
  const onContactor = () => {
    if (selected === "tie" || selected === "dcTie")
      send({
        type: "tie",
        dc: selected === "dcTie",
        value:
          s[selected === "dcTie" ? "dcTie" : "tie"] === "OPEN"
            ? "AUTO"
            : "OPEN",
      });
    else if (selected === "gcb1" || selected === "gcb2") {
      const id = selected === "gcb1" ? "gen1" : "gen2";
      send({
        type: "source",
        id,
        key: "contactor",
        value: !s.sources[id].contactor,
      });
    } else if (selected.startsWith("apu") || selected.startsWith("ext")) {
      const id = selected.startsWith("apu") ? "apu" : "ext";
      send({
        type: "source",
        id,
        key: "contactor",
        value: !s.sources[id].contactor,
      });
    } else if (selected === "batContactor")
      send({ type: "switch", key: "batteryContactor" });
    else if (selected === "acessFeed" || selected === "dcessFeed")
      send({ type: "switch", key: "essentialAuto" });
    else if (selected.startsWith("cb-")) {
      const id = selected.slice(3);
      send({
        type: "load",
        id,
        key: "breaker",
        value: s.loads[id].breaker === "CLOSED" ? "OPEN" : "CLOSED",
      });
    } else if (selected.startsWith("tru") && selected.endsWith("Input"))
      send({ type: "tru", side: selected.includes("1") ? 0 : 1 });
    else if (selected === "invInput") send({ type: "switch", key: "inverter" });
  };
  const controllable =
    e &&
    /^(gcb[12]|tie|dcTie|apu[12]|ext[12]|batContactor|acessFeed|dcessFeed|cb-.+|tru[12]Input|invInput)$/.test(
      e.id,
    );
  return (
    <aside className="inspector">
      <span className="eyebrow">
        <Search size={13} /> COMPONENT INSPECTOR
      </span>
      <label className="inspect-select">
        <span className="sr-only">İncelenecek bileşen</span>
        <select
          aria-label="İncelenecek bileşen"
          value={selected}
          onChange={(ev) => select(ev.target.value)}
        >
          <optgroup label="Kaynaklar, baralar ve yükler">
            {Object.values(q.nodes).map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Kontaktörler & feeder / CB">
            {q.edges.map((edge) => (
              <option key={edge.id} value={edge.id}>
                {edge.id}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <div className="inspector-symbol">
        <Zap size={27} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      <span
        className={`badge ${n?.powered || e?.active ? "good" : n?.failed || e?.fault ? "danger" : ""}`}
      >
        {n
          ? n.failed
            ? "FAULT ISOLATED"
            : n.powered
              ? "ENERGIZED"
              : "UNPOWERED"
          : e?.closed
            ? "CLOSED"
            : "OPEN"}
      </span>
      {n && (
        <>
          <div className="inspector-meters">
            <Meter label="VOLTAGE" value={n.voltage} unit="V" />
            <Meter label="CURRENT" value={n.current} unit="A" />
            <Meter label="FREQUENCY" value={n.frequency} unit="Hz" />
            <Meter
              label={n.id === "battery" ? "NET POWER" : "POWER"}
              value={(n.id === "battery" ? q.battery.netWatts : n.watts) / 1000}
              unit="kW"
            />
          </div>
          <div className="path-box">
            <span className="eyebrow">ACTIVE POWER PATH</span>
            {n.powered ? (
              n.path.map((id, i) => (
                <div key={id}>
                  {i > 0 && <ArrowRight size={12} className="path-arrow" />}
                  <button
                    onClick={() => select(id)}
                    className={id === selected ? "current" : ""}
                  >
                    <i />
                    {NAMES[id]}
                  </button>
                </div>
              ))
            ) : (
              <p>Geçerli güç yolu bulunamadı.</p>
            )}
          </div>
        </>
      )}
      {e && (
        <>
          <dl className="contact-reading">
            <div>
              <dt>COMMANDED</dt>
              <dd>{e.commanded ? "CLOSED" : "OPEN"}</dd>
            </div>
            <div>
              <dt>ACTUAL</dt>
              <dd>{e.closed ? "CLOSED" : "OPEN"}</dd>
            </div>
            <div>
              <dt>{NAMES[e.from]}</dt>
              <dd>{fmt(q.nodes[e.from].voltage)} V</dd>
            </div>
            <div>
              <dt>{NAMES[e.to]}</dt>
              <dd>{fmt(q.nodes[e.to].voltage)} V</dd>
            </div>
            <div>
              <dt>ENERGY FLOW</dt>
              <dd>{e.active ? "ACTIVE" : "NONE"}</dd>
            </div>
          </dl>
          {controllable && (
            <button className="primary full" onClick={onContactor}>
              Kontaktör / feeder komutunu değiştir
            </button>
          )}
        </>
      )}
      <button
        className="why-button"
        onClick={() => setShowWhy(!showWhy)}
        aria-expanded={showWhy}
      >
        <HelpCircle size={17} />
        WHY? · Bu durumun nedeni
      </button>
      {(showWhy || !maintenance) && (
        <div className="why-explanation" aria-live="polite">
          {n?.reason || e?.reason}
          {n?.powered && n.source && (
            <p>
              Kök kaynak: <b>{NAMES[n.source]}</b>. Yalnızca geçerli, kapalı
              yollar vurgulanır.
            </p>
          )}
        </div>
      )}
      <div className="measurement">
        <span className="eyebrow">MAINTENANCE PROBE</span>
        <select
          aria-label="Ölçüm aracı"
          value={tool}
          onChange={(ev) => setTool(ev.target.value)}
        >
          {[
            "Voltage",
            "Current",
            "Frequency",
            "Contactor",
            "Breaker",
            "Source",
            "Load",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <output data-testid="probe-reading">
          {tool === "Voltage"
            ? `${fmt(n?.voltage ?? q.nodes[e!.to].voltage, 2)} V`
            : tool === "Current"
              ? `${fmt(n?.current ?? (e!.active ? q.nodes[e!.to].current : 0), 2)} A`
              : tool === "Frequency"
                ? `${fmt(n?.frequency ?? q.nodes[e!.to].frequency, 1)} Hz`
                : tool === "Contactor"
                  ? e
                    ? `${e.commanded ? "CLOSE" : "OPEN"} CMD / ${e.closed ? "CLOSED" : "OPEN"} ACTUAL`
                    : "Kontaktör seçerek ölç."
                  : tool === "Breaker"
                    ? selected.startsWith("cb-")
                      ? s.loads[selected.slice(3)].breaker
                      : s.loads[selected]?.breaker || "Yük veya CB seç."
                    : tool === "Source"
                      ? n?.source
                        ? NAMES[n.source]
                        : "NO ACTIVE SOURCE"
                      : n
                        ? `${fmt(n.watts, 0)} W · ${n.powered ? "POWERED" : "UNPOWERED"}`
                        : "Yük seçerek ölç."}
        </output>
      </div>
      <Note>
        Ölçümler canlı modelden gelir. Bu mantıksal ağ; transient gerilim, ark
        ve empedans analizi içermez.
      </Note>
    </aside>
  );
}
