import { useEffect, useState } from "react";
import { Download, Pause, Play, SkipForward } from "lucide-react";
import { timestamp } from "../sim/engine.ts";
import type { Solution, State } from "../sim/types.ts";
import { NAMES } from "../sim/catalog.ts";
import { fmt, Note, Panel, Range, type Dispatch } from "./Controls.tsx";
export function download(name: string, data: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function TelemetryGraph({ s, q }: { s: State; q: Solution }) {
  const samples = s.history;
  const series = [
    ["gen1", "#65d9ed", "GEN 1"],
    ["gen2", "#a5a2fb", "GEN 2"],
    ["soc", "#eeb96c", "BAT SOC"],
    ["kw", "#83dab5", "LOAD kW"],
  ] as const;
  const minT = samples[0]?.time || 0,
    maxT = Math.max(minT + 60, samples.at(-1)?.time || 0);
  const maxPct = Math.max(100, ...samples.map((h) => Math.max(h.gen1, h.gen2))),
    maxKW = Math.max(30, ...samples.map((h) => h.kw));
  return (
    <Panel
      title="POWER TRENDS"
      subtitle="Son 240 örnek · simülasyon zamanı"
      badge={<span className="badge">LIVE TELEMETRY</span>}
    >
      <div className="chart-key">
        {series.map(([id, color, label]) => (
          <span key={id} style={{ color }}>
            <i style={{ background: color }} />
            {label}{" "}
            <b>
              {fmt(
                id === "gen1" || id === "gen2"
                  ? q.sources[id].load
                  : id === "soc"
                    ? q.battery.soc
                    : q.servedWatts / 1000,
              )}
              {id === "kw" ? "" : "%"}
            </b>
          </span>
        ))}
      </div>
      <svg
        viewBox="0 0 760 200"
        className="trend-chart"
        role="img"
        aria-label="GEN 1 GEN 2 yük yüzdesi, batarya SOC ve toplam yükün gerçek zaman grafiği"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <path d={`M40 ${20 + i * 36}H710`} className="chart-grid" />
            <text x="31" y={24 + i * 36} textAnchor="end">
              {Math.round(maxPct * (1 - i / 4))}%
            </text>
            <text x="718" y={24 + i * 36}>
              {fmt(maxKW * (1 - i / 4), 0)}
            </text>
          </g>
        ))}
        {series.map(([id, color]) => (
          <polyline
            key={id}
            points={samples
              .map(
                (h) =>
                  `${40 + ((h.time - minT) / (maxT - minT)) * 670},${164 - (h[id] / (id === "kw" ? maxKW : maxPct)) * 144}`,
              )
              .join(" ")}
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
        ))}
        <text x="40" y="188">
          {timestamp(minT)}
        </text>
        <text x="710" y="188" textAnchor="end">
          {timestamp(maxT)} · sim time
        </text>
        <text x="718" y="12">
          kW
        </text>
        {samples.length < 2 && (
          <text x="380" y="95" textAnchor="middle">
            Grafik için simülasyonu çalıştır.
          </text>
        )}
      </svg>
    </Panel>
  );
}
export function WaveLab({
  rectifier = false,
  paused,
}: {
  rectifier?: boolean;
  paused: boolean;
}) {
  const [frequency, setFrequency] = useState(400),
    [voltage, setVoltage] = useState(115),
    [phase, setPhase] = useState(0),
    [smooth, setSmooth] = useState(80);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(
      () => setPhase((p) => (p + 0.12) % (Math.PI * 2)),
      80,
    );
    return () => clearInterval(id);
  }, [paused]);
  const colors = ["#65d9ed", "#a5a2fb", "#eeb96c"];
  const value = (x: number, line: number) => {
    const theta = (x / 640) * (frequency / 100) * 2 * Math.PI - phase;
    if (!rectifier)
      return (Math.sin(theta + (line * Math.PI * 2) / 3) * voltage) / 150;
    if (line === 0) return (Math.sin(theta) * voltage) / 150;
    if (line === 1) return (Math.abs(Math.sin(theta)) * voltage) / 150;
    return (
      ((0.64 +
        (smooth / 100) * 0.3 +
        Math.cos(theta * 2) * (1 - smooth / 100) * 0.15) *
        voltage) /
      150
    );
  };
  return (
    <Panel
      title={rectifier ? "RECTIFICATION BENCH" : "THREE-PHASE AC"}
      subtitle={
        rectifier
          ? "AC → doğrultulmuş → filtrelenmiş kavramsal dalga"
          : "120° faz ayrımı · 10 ms pencere · yavaşlatılmış hareket"
      }
    >
      <div className="chart-key">
        {(rectifier
          ? ["RAW AC", "RECTIFIED", "FILTERED"]
          : ["PHASE A · 0°", "PHASE B · 120°", "PHASE C · 240°"]
        ).map((label, i) => (
          <span key={label} style={{ color: colors[i] }}>
            {label}
          </span>
        ))}
      </div>
      <svg
        viewBox="0 0 680 220"
        className="wave-chart"
        role="img"
        aria-label={
          rectifier
            ? "Doğrultma ve filtreleme karşılaştırması"
            : "Üç faz AC dalga biçimi"
        }
      >
        <path d="M20 110H660 M20 25V195" className="chart-grid" />
        {[0, 1, 2].map((line) => (
          <path
            key={line}
            d={Array.from(
              { length: 321 },
              (_, i) =>
                `${i === 0 ? "M" : "L"}${20 + i * 2},${110 - value(i * 2, line) * 80}`,
            ).join(" ")}
            fill="none"
            stroke={colors[line]}
            strokeWidth="2"
          />
        ))}
        <text x="24" y="210">
          0 ms
        </text>
        <text x="650" y="210" textAnchor="end">
          10 ms
        </text>
      </svg>
      <div className="two-grid">
        <Range
          label={rectifier ? "Rectifier input RMS" : "Waveform amplitude RMS"}
          value={voltage}
          min={20}
          max={150}
          unit="V"
          onChange={setVoltage}
        />
        <Range
          label={rectifier ? "Rectifier frequency" : "Waveform frequency"}
          value={frequency}
          min={100}
          max={500}
          unit="Hz"
          onChange={setFrequency}
        />
      </div>
      {rectifier && (
        <Range
          label="Filter smoothing"
          value={smooth}
          min={0}
          max={100}
          unit="%"
          onChange={setSmooth}
        />
      )}
      <Note>
        {rectifier
          ? "Tek faz tam dalga doğrultma kavramı; gerçek üç faz TRU, ripple ve filtre dinamiklerinin ayrıntılı modeli değildir."
          : `Vpeak = √2 × VRMS = ${fmt(voltage * Math.SQRT2)} V. Vline-line ≈ ${fmt(voltage * Math.sqrt(3))} V. Grafik normalize genliktedir.`}{" "}
        Bu tezgâh kavramsal dalga kontrolüdür; uçak kaynağını değiştirmek için
        kaynak kalite kontrollerini kullan.
      </Note>
    </Panel>
  );
}
export function QuantitiesLab() {
  const [v, setV] = useState(28),
    [i, setI] = useState(10),
    [time, setTime] = useState(30),
    [ac, setAc] = useState(false);
  const power = v * i * (ac ? 3 * 0.9 : 1);
  return (
    <Panel
      title="ELECTRICAL QUANTITIES"
      subtitle="Formül tezgâhı · açık birimler"
    >
      <div className="button-row">
        <button
          className={!ac ? "active" : ""}
          onClick={() => {
            setAc(false);
            setV(28);
          }}
        >
          DC
        </button>
        <button
          className={ac ? "active" : ""}
          onClick={() => {
            setAc(true);
            setV(115);
          }}
        >
          3-PHASE AC
        </button>
      </div>
      <div className="formula">
        {ac ? "P = 3 × Vphase × I × PF" : "P = V × I"}
        <strong>
          {fmt(power, 0)} <small>W</small>
        </strong>
        <span>
          Energy = P × t = <b>{fmt((power * time) / 60)} Wh</b>
        </span>
      </div>
      <Range
        label="Calculation voltage"
        value={v}
        min={1}
        max={200}
        unit={ac ? "V L–N RMS" : "V DC"}
        onChange={setV}
      />
      <Range
        label="Calculation current"
        value={i}
        min={1}
        max={150}
        unit="A"
        onChange={setI}
      />
      <Range
        label="Calculation duration"
        value={time}
        min={1}
        max={120}
        unit="min"
        onChange={setTime}
      />
      <Note>
        {ac
          ? "Dengeli üç faz varsayımı. P = √3 × VLL × I × PF ile eşdeğerdir; PF = 0,90."
          : "Batarya enerjisi nominal V × Ah ile başlatılır; zaman içindeki tüketim W × saat olarak entegre edilir."}
      </Note>
    </Panel>
  );
}
export function EventLog({ s, send }: { s: State; send: Dispatch }) {
  return (
    <Panel
      title="SYSTEM EVENT LOG"
      subtitle="Gerçek durum geçişleri · kronolojik kayıt"
      badge={
        <div className="button-row">
          <button
            aria-label="Olay kaydını indir"
            onClick={() =>
              download(
                "ata24-events.txt",
                s.events
                  .map(
                    (e) =>
                      `${timestamp(e.time)} ${e.type.toUpperCase()} ${e.text}`,
                  )
                  .join("\n"),
              )
            }
          >
            <Download size={14} />
          </button>
          <button onClick={() => send({ type: "clearLog" })}>CLEAR LOG</button>
        </div>
      }
    >
      <div className="event-log" aria-label="Sistem olay kaydı">
        {s.events.length ? (
          [...s.events].reverse().map((e) => (
            <div className={e.type} key={e.id}>
              <time>{timestamp(e.time)}</time>
              <i />
              <span>{e.text}</span>
            </div>
          ))
        ) : (
          <p className="muted">
            Kayıt temiz. Yeni anahtar veya sistem değişimleri burada görünür.
          </p>
        )}
      </div>
    </Panel>
  );
}
export function Cascade({ s }: { s: State }) {
  const events = s.events.slice(-12),
    [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [s.faults.join(",")]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () => setStep((v) => Math.min(v + 1, events.length)),
      1000,
    );
    return () => clearInterval(id);
  }, [playing, events.length]);
  return (
    <Panel
      title="FAILURE CASCADE REPLAY"
      subtitle="Son 12 gerçek olayın adım adım yeniden gösterimi"
    >
      <div className="button-row">
        <button onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
          {playing ? "PAUSE REPLAY" : "PLAY REPLAY"}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setStep((v) => Math.min(v + 1, events.length));
          }}
        >
          <SkipForward size={15} />
          STEP
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setStep(0);
          }}
        >
          REWIND
        </button>
        <span className="muted">
          {Math.min(step, events.length)} / {events.length}
        </span>
      </div>
      <ol className="cascade-list">
        {events.slice(0, step).map((e) => (
          <li key={e.id}>
            <small>{timestamp(e.time)}</small>
            {e.text}
          </li>
        ))}
      </ol>
      {step === 0 && (
        <p className="muted">
          STEP ile gerçek olay zincirini incele. Replay kontrolleri canlı
          simülasyon saatinden bağımsızdır.
        </p>
      )}
    </Panel>
  );
}
export function AircraftView({
  q,
  select,
}: {
  q: Solution;
  select: (id: string) => void;
}) {
  const areas: [string, number, number][] = [
    ["nav", 450, 80],
    ["ext", 510, 146],
    ["battery", 395, 183],
    ["gen1", 265, 240],
    ["gen2", 635, 240],
    ["avionics", 455, 255],
    ["fuelLeft", 190, 326],
    ["fuelRight", 710, 326],
    ["cabin", 450, 375],
    ["apu", 450, 500],
  ];
  return (
    <Panel
      title="AIRCRAFT ELECTRICAL MAP"
      subtitle="Temsilî yerleşim · bileşen seçmek için işaretlere tıkla"
    >
      <svg
        className="aircraft-view"
        viewBox="0 0 900 560"
        role="img"
        aria-label="Uçak üzerinde jeneratörler, APU, batarya ve yük konumları"
      >
        <path
          className="aircraft-body"
          d="M450 35Q415 64 415 188L65 367 65 402 416 312 426 452 337 510 337 529 450 505 563 529 563 510 474 452 484 312 835 402 835 367 485 188Q485 64 450 35Z"
        />
        <path
          className="aircraft-detail"
          d="M450 60V490M415 188L416 312M485 188L484 312M65 367L416 267M835 367L484 267"
        />
        {areas.map(([id, x, y]) => (
          <g
            key={id}
            role="button"
            tabIndex={0}
            onClick={() => select(id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") select(id);
            }}
            aria-label={`Uçakta ${NAMES[id]}`}
            className={`aircraft-marker ${q.nodes[id].powered ? "powered" : ""}`}
            transform={`translate(${x},${y})`}
          >
            <circle r="15" />
            <circle r="4" />
            <text
              x={x > 500 ? 24 : -24}
              textAnchor={x > 500 ? "start" : "end"}
              y="4"
            >
              {NAMES[id]}
            </text>
          </g>
        ))}
      </svg>
      <Note>
        Exact locations vary by aircraft. Bu plan bir bakım yerleşim çizimi
        değildir.
      </Note>
    </Panel>
  );
}
