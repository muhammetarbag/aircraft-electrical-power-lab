import type { ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";
import { LIMITS } from "../sim/engine.ts";
import type { Action, Solution, SourceId, State } from "../sim/types.ts";
import { NAMES, LOADS, FAULTS } from "../sim/catalog.ts";
export type Dispatch = (action: Action) => void;
export const fmt = (value: number, digits = 1) =>
  Number.isFinite(value) ? value.toFixed(digits) : "—";
export function Switch({
  label,
  on,
  onChange,
  detail,
}: {
  label: string;
  on: boolean;
  onChange: () => void;
  detail?: string;
}) {
  return (
    <button
      type="button"
      className={`switch-row ${on ? "on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
    >
      <span>
        {label}
        {detail && <small>{detail}</small>}
      </span>
      <span className="switch-track">
        <i />
      </span>
    </button>
  );
}
export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="range">
      <span>
        {label}
        <output>
          {fmt(value, step < 1 ? 1 : 0)} <em>{unit}</em>
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export function Panel({
  title,
  subtitle,
  children,
  className = "",
  badge,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  badge?: ReactNode;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="note">
      <Info size={15} />
      <span>{children}</span>
    </p>
  );
}
export function Meter({
  label,
  value,
  unit,
  tone = "",
}: {
  label: string;
  value: number | string;
  unit?: string;
  tone?: string;
}) {
  return (
    <div className={`meter ${tone}`}>
      <span>{label}</span>
      <strong>
        {typeof value === "number" ? fmt(value) : value}
        <small>{unit}</small>
      </strong>
    </div>
  );
}
export function SourceControls({
  s,
  q,
  send,
  ids = ["gen1", "gen2", "apu", "ext"],
}: {
  s: State;
  q: Solution;
  send: Dispatch;
  ids?: SourceId[];
}) {
  return (
    <div className={`source-grid count-${ids.length}`}>
      {ids.map((id) => {
        const r = q.sources[id],
          c = s.sources[id],
          side = id === "gen1" ? 0 : 1;
        return (
          <Panel
            key={id}
            title={NAMES[id]}
            subtitle={
              id.startsWith("gen")
                ? `ENGINE ${side + 1} · IDG / GCU`
                : id === "apu"
                  ? "AUXILIARY POWER UNIT"
                  : "GROUND POWER UNIT"
            }
            badge={
              <span
                className={`badge ${r.connected ? "good" : r.available ? "amber" : ""}`}
              >
                {r.connected
                  ? "CONNECTED"
                  : r.available
                    ? "AVAILABLE"
                    : "OFFLINE"}
              </span>
            }
          >
            <div className="meter-row">
              <Meter label="V L–N" value={r.voltage} unit="V" />
              <Meter label="FREQ" value={r.frequency} unit="Hz" />
              <Meter label="CURRENT" value={r.current} unit="A" />
            </div>
            <div className="load-meter">
              <span>
                LOAD <b>{fmt(r.load)}%</b>
              </span>
              <div>
                <i
                  style={{
                    width: `${Math.min(100, r.load)}%`,
                    background:
                      r.load > 100
                        ? "var(--red)"
                        : r.load > 90
                          ? "var(--amber)"
                          : undefined,
                  }}
                />
              </div>
              <small>
                {fmt(r.watts / 1000)} kW / {fmt(r.kva * LIMITS.pf)} kW · PF 0.90
              </small>
            </div>
            {id.startsWith("gen") && (
              <>
                <Switch
                  label={`ENGINE ${side + 1} START`}
                  on={s.engines[side]}
                  onChange={() => send({ type: "engine", side })}
                />
                <div className="drive-readout">
                  <span>
                    ENGINE <b>{fmt(s.rpm[side], 0)}% RPM</b>
                  </span>
                  <span>
                    IDG <b>{r.available ? "12 000" : "—"} rpm</b>
                  </span>
                </div>
              </>
            )}
            {id === "apu" && (
              <>
                <Switch
                  label="APU MASTER"
                  on={s.apuMaster}
                  onChange={() => send({ type: "switch", key: "apuMaster" })}
                />
                <div className="button-row">
                  <button onClick={() => send({ type: "apuStart" })}>
                    APU START
                  </button>
                  <button onClick={() => send({ type: "apuStop" })}>
                    APU STOP
                  </button>
                </div>
                <div className="drive-readout">
                  <span>
                    RPM <b>{fmt(s.apuRpm, 0)}%</b>
                  </span>
                  <span>
                    EGT <b>{fmt(24 + s.apuRpm * 4.2, 0)} °C</b>
                  </span>
                </div>
                <small className="muted">
                  OFF → starter → hızlanma → ≥ %95 → AVAILABLE
                </small>
              </>
            )}
            {id === "ext" && (
              <>
                <Switch
                  label="Yerde / ON GROUND"
                  on={s.onGround}
                  onChange={() => send({ type: "switch", key: "onGround" })}
                />
                <Switch
                  label="GPU CABLE"
                  on={s.gpuCable}
                  onChange={() => send({ type: "switch", key: "gpuCable" })}
                />
                <Switch
                  label="GPU ON"
                  on={s.gpuOn}
                  onChange={() => send({ type: "switch", key: "gpuOn" })}
                />
              </>
            )}
            <Switch
              label={`${NAMES[id]} ON`}
              on={c.on}
              onChange={() =>
                send({ type: "source", id, key: "on", value: !c.on })
              }
            />
            <Switch
              label={`${NAMES[id]} CONTACTOR`}
              on={c.contactor}
              onChange={() =>
                send({
                  type: "source",
                  id,
                  key: "contactor",
                  value: !c.contactor,
                })
              }
              detail="Komut · gerçek durum için şemadan kontaktörü seç"
            />
            <p className="source-reason">{r.reason}</p>
            <details className="tuning">
              <summary>
                Kaynak kalitesi & kapasite <ChevronDown size={14} />
              </summary>
              <Range
                label={`${NAMES[id]} Voltage`}
                value={c.voltage}
                min={80}
                max={150}
                unit="V"
                onChange={(value) =>
                  send({ type: "source", id, key: "voltage", value })
                }
              />
              <Range
                label={`${NAMES[id]} Frequency`}
                value={c.frequency}
                min={300}
                max={480}
                unit="Hz"
                onChange={(value) =>
                  send({ type: "source", id, key: "frequency", value })
                }
              />
              <Range
                label={`${NAMES[id]} Capacity`}
                value={c.kva}
                min={3}
                max={90}
                unit="kVA"
                onChange={(value) =>
                  send({ type: "source", id, key: "kva", value })
                }
              />
              <Switch
                label={`${NAMES[id]} PHASE OK`}
                on={c.phase}
                onChange={() =>
                  send({ type: "source", id, key: "phase", value: !c.phase })
                }
              />
              {id.startsWith("gen") && (
                <Range
                  label={`ENGINE ${side + 1} RPM`}
                  value={s.rpmTarget[side]}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(value) => send({ type: "rpm", side, value })}
                />
              )}
              <p className="muted">
                Eğitim GCU bandı: 108–122 V / 380–420 Hz. Sıcaklık:{" "}
                {fmt(r.temperature)} °C. Gerilimler RMS; IDG 4 kutuplu kavramsal
                tahrik.
              </p>
            </details>
          </Panel>
        );
      })}
    </div>
  );
}
export function BatteryControls({
  s,
  q,
  send,
}: {
  s: State;
  q: Solution;
  send: Dispatch;
}) {
  return (
    <Panel
      title="BATTERY & STANDBY"
      subtitle="24 V nominal · entegre enerji modeli"
      badge={
        <span
          className={`badge ${q.battery.mode === "CHARGING" ? "good" : "amber"}`}
        >
          {q.battery.mode}
        </span>
      }
    >
      <div className="battery-hero">
        <div className="battery-cell">
          <i style={{ height: `${q.battery.soc}%` }} />
        </div>
        <div>
          <strong>
            {fmt(q.battery.soc)}
            <small>%</small>
          </strong>
          <span>
            {fmt(s.energyWh, 0)} / {s.capacityAh * 24} Wh
          </span>
        </div>
      </div>
      <div className="meter-row">
        <Meter label="VOLTAGE" value={q.battery.voltage} unit="V" />
        <Meter label="NET CURRENT" value={q.battery.current} unit="A" />
        <Meter label="TEMP" value={s.batteryTemp} unit="°C" />
      </div>
      <div className="endurance">
        <span>TAHMİNİ DAYANIM</span>
        <strong>
          {fmt(q.battery.endurance)} <small>min</small>
        </strong>
        <small>
          Mevcut net tüketim: {fmt(q.battery.netWatts, 0)} W · geçen acil süre:{" "}
          {fmt(s.emergencySeconds / 60)} min
        </small>
      </div>
      {(["batteryOn", "batteryContactor", "charger", "inverter"] as const).map(
        (key, i) => (
          <Switch
            key={key}
            label={
              [
                "BATTERY",
                "BATTERY CONTACTOR",
                "BATTERY CHARGER",
                "STATIC INVERTER",
              ][i]
            }
            on={s[key]}
            onChange={() => send({ type: "switch", key })}
          />
        ),
      )}
      <Range
        label="Battery capacity"
        value={s.capacityAh}
        min={5}
        max={100}
        unit="Ah"
        onChange={(value) => send({ type: "capacity", value })}
      />
      <Range
        label="Battery initial SOC"
        value={q.battery.soc}
        min={0}
        max={100}
        unit="%"
        onChange={(value) => send({ type: "batterySoc", value })}
      />
      <Note>
        +A deşarj, −A şarj. Hot Battery Bus ana kontaktör açıkken de çalışır.
        SOC kontrolü deney enerjisini yeniden ayarlar; normal çalışmada enerji
        sürekli entegre edilir.
      </Note>
    </Panel>
  );
}
export function TransferControls({
  s,
  q,
  send,
}: {
  s: State;
  q: Solution;
  send: Dispatch;
}) {
  const tie = q.edges.find((e) => e.id === "tie")!;
  return (
    <Panel
      title="BUS TIE & SOURCE TRANSFER"
      subtitle="İzole AC kaynakları · break-before-make"
    >
      <div className="transfer-visual">
        <span className={q.nodes.ac1.powered ? "live-text" : ""}>
          AC BUS 1<br />
          <b>{fmt(q.nodes.ac1.voltage, 0)} V</b>
        </span>
        <button
          aria-label="Bus tie kontaktör komutunu değiştir"
          onClick={() =>
            send({ type: "tie", value: s.tie === "OPEN" ? "AUTO" : "OPEN" })
          }
          className={`contactor-large ${tie.closed ? "closed" : ""}`}
        >
          <i />
          <span>{tie.closed ? "CLOSED" : "OPEN"}</span>
        </button>
        <span className={q.nodes.ac2.powered ? "live-text" : ""}>
          AC BUS 2<br />
          <b>{fmt(q.nodes.ac2.voltage, 0)} V</b>
        </span>
      </div>
      <label className="field">
        AC BUS TIE
        <select
          aria-label="AC BUS TIE"
          value={s.tie}
          onChange={(e) =>
            send({ type: "tie", value: e.target.value as State["tie"] })
          }
        >
          <option>AUTO</option>
          <option>OPEN</option>
          <option>CLOSED</option>
        </select>
      </label>
      <p className="source-reason">{tie.reason}</p>
      <label className="field">
        DC BUS TIE
        <select
          aria-label="DC BUS TIE"
          value={s.dcTie}
          onChange={(e) =>
            send({
              type: "tie",
              dc: true,
              value: e.target.value as State["dcTie"],
            })
          }
        >
          <option>OPEN</option>
          <option>AUTO</option>
          <option>CLOSED</option>
        </select>
      </label>
      <Switch
        label="ESSENTIAL TRANSFER AUTO"
        on={s.essentialAuto}
        onChange={() => send({ type: "switch", key: "essentialAuto" })}
      />
      <Note>
        Öncelik: motor jeneratörü → yerde GPU → APU → seçilmiş standby için
        batarya. CLOSED tie, ikinci AC kaynağını interlock ile ayırır. DC tie
        yalnız tek TRU kaldığında transfer sağlar.
      </Note>
    </Panel>
  );
}
export function TRUControls({
  s,
  q,
  send,
}: {
  s: State;
  q: Solution;
  send: Dispatch;
}) {
  return (
    <div className="two-grid">
      {([0, 1] as const).map((side) => {
        const id = `tru${side + 1}`,
          n = q.nodes[id],
          ac = q.nodes[`ac${side + 1}`];
        return (
          <Panel
            key={id}
            title={NAMES[id]}
            subtitle="TRANSFORMER RECTIFIER UNIT"
            badge={
              <span className={`badge ${n.powered ? "good" : ""}`}>
                {n.powered ? "ONLINE" : "OFFLINE"}
              </span>
            }
          >
            <div className="conversion">
              <div>
                <small>AC INPUT</small>
                <b>{fmt(ac.voltage, 0)} V</b>
                <span>{fmt(ac.frequency, 0)} Hz</span>
              </div>
              <strong>
                AC <span>→</span> DC
              </strong>
              <div>
                <small>DC OUTPUT</small>
                <b>{fmt(n.voltage, 0)} V</b>
                <span>{fmt(n.current)} A</span>
              </div>
            </div>
            <div className="meter-row">
              <Meter label="OUTPUT" value={n.watts / 1000} unit="kW" />
              <Meter label="TEMP" value={s.truTemp[side]} unit="°C" />
              <Meter label="RATING" value="5.0" unit="kW" />
            </div>
            <Switch
              label={`${NAMES[id]} ON`}
              on={s.tru[side]}
              onChange={() => send({ type: "tru", side })}
            />
            <Switch
              label={`${NAMES[id]} COOLING`}
              on={s.cooling[side]}
              onChange={() => send({ type: "tru", side, cooling: true })}
            />
            <button
              className="danger subtle"
              onClick={() => send({ type: "fault", id: `${id}Fail` })}
            >
              {s.faults.includes(`${id}Fail`)
                ? "Arızayı kaldır"
                : `${NAMES[id]} FAIL`}
            </button>
            <p className="source-reason">{n.reason}</p>
            <small className="muted">
              %92 dönüşüm verimi · ≥110 °C termal trip · &gt;5 kW için 5 s
              gecikme
            </small>
          </Panel>
        );
      })}
    </div>
  );
}
export function LoadPanel({
  s,
  q,
  send,
  select,
  breakers = false,
}: {
  s: State;
  q: Solution;
  send: Dispatch;
  select: (id: string) => void;
  breakers?: boolean;
}) {
  return (
    <Panel
      title={breakers ? "CIRCUIT BREAKER PANEL" : "AIRCRAFT ELECTRICAL LOADS"}
      subtitle="Temsilî eğitim yükleri · güç yolu için yük adına tıkla"
      badge={
        <span className="badge">{fmt(q.servedWatts / 1000)} kW SERVED</span>
      }
    >
      <Switch
        label="AUTO LOAD SHEDDING"
        on={s.autoShed}
        onChange={() => send({ type: "switch", key: "autoShed" })}
      />
      <div className="table-scroll">
        <table className="load-table">
          <thead>
            <tr>
              <th>YÜK / BUS</th>
              <th>ÖNCELİK</th>
              <th>GÜÇ</th>
              <th>SWITCH</th>
              <th>CB</th>
              <th>DURUM</th>
            </tr>
          </thead>
          <tbody>
            {LOADS.map((l) => {
              const c = s.loads[l.id],
                n = q.nodes[l.id];
              return (
                <tr key={l.id}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => select(l.id)}
                    >
                      {l.name}
                    </button>
                    <small>{NAMES[l.bus]}</small>
                  </td>
                  <td>
                    <span
                      className={`priority ${l.priority === "ESSENTIAL" ? "essential" : ""}`}
                    >
                      {l.priority}
                    </span>
                  </td>
                  <td>
                    <label className="load-power">
                      <input
                        aria-label={`${l.name} power multiplier`}
                        type="range"
                        min="0.25"
                        max="3"
                        step="0.25"
                        value={c.scale}
                        onChange={(e) =>
                          send({
                            type: "load",
                            id: l.id,
                            key: "scale",
                            value: Number(e.target.value),
                          })
                        }
                      />
                      <span>{fmt((l.watts * c.scale) / 1000, 2)} kW</span>
                    </label>
                  </td>
                  <td>
                    <button
                      aria-label={`${l.name} switch`}
                      aria-pressed={c.on}
                      className={`compact-switch ${c.on ? "on" : ""}`}
                      onClick={() =>
                        send({
                          type: "load",
                          id: l.id,
                          key: "on",
                          value: !c.on,
                        })
                      }
                    >
                      {c.on ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td>
                    <button
                      aria-label={`${l.name} circuit breaker`}
                      className={`cb-button ${c.breaker.toLowerCase()}`}
                      onClick={() =>
                        send({
                          type: "load",
                          id: l.id,
                          key: "breaker",
                          value: c.breaker === "CLOSED" ? "OPEN" : "CLOSED",
                        })
                      }
                    >
                      <i />
                      {c.breaker}
                    </button>
                  </td>
                  <td>
                    <span
                      className={`badge ${n.powered ? "good" : q.shed.includes(l.id) ? "amber" : ""}`}
                    >
                      {n.powered
                        ? "POWERED"
                        : q.shed.includes(l.id)
                          ? "SHED"
                          : c.breaker === "TRIPPED"
                            ? "TRIPPED"
                            : "OFF"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Note>
        Real aircraft circuit-breaker reset procedures are governed by approved
        maintenance/operational documentation. Bu simülasyonda kısa devre
        sürerken koruma bağlantıyı tekrar engeller.
      </Note>
    </Panel>
  );
}
export function FaultPanel({ s, send }: { s: State; send: Dispatch }) {
  return (
    <Panel
      title="FAILURE INJECTION"
      subtitle="Her arıza aynı canlı ağı etkiler. Yeniden tıklamak arızayı kaldırır."
      badge={<span className="badge amber">{s.faults.length} ACTIVE</span>}
    >
      <div className="fault-groups">
        {[...new Set(FAULTS.map((f) => f[2]))].map((group) => (
          <div key={group}>
            <h4>{group}</h4>
            {FAULTS.filter((f) => f[2] === group).map(([id, title]) => (
              <button
                key={id}
                aria-pressed={s.faults.includes(id)}
                className={`fault-button ${s.faults.includes(id) ? "active" : ""}`}
                onClick={() => send({ type: "fault", id })}
              >
                <i />
                {title}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="button-row">
        <button onClick={() => send({ type: "clearFaults" })}>
          CLEAR ALL FAILURES
        </button>
        <button onClick={() => send({ type: "resetTrips" })}>
          Koruma reseti (eğitim)
        </button>
      </div>
      <Note>
        Arıza kaldırma, kilitlenmiş TRIPPED breaker veya TRU korumasını
        kendiliğinden resetlemez. Kısa devre akımı burada nitel olarak
        algılanır; kA büyüklüğü veya elektrik arkı fiziği modellenmez.
      </Note>
    </Panel>
  );
}
