import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  Battery,
  BookOpen,
  Box,
  ChevronRight,
  CircleHelp,
  Cpu,
  FlaskConical,
  Gauge,
  Menu,
  Network,
  Pause,
  Play,
  Plug,
  RotateCcw,
  Search,
  ShieldCheck,
  SkipForward,
  SlidersHorizontal,
  Target,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { act, advance, createState, solve, timestamp } from "./sim/engine.ts";
import { DISCLAIMER, LOADS } from "./sim/catalog.ts";
import { MODULES, LABS, caseState, type ModuleId } from "./content.ts";
import type { Action, State } from "./sim/types.ts";
import {
  BatteryControls,
  FaultPanel,
  fmt,
  LoadPanel,
  Note,
  Panel,
  SourceControls,
  TransferControls,
  TRUControls,
} from "./components/Controls.tsx";
import { Inspector, Synoptic } from "./components/Synoptic.tsx";
import {
  AircraftView,
  Cascade,
  EventLog,
  QuantitiesLab,
  TelemetryGraph,
  WaveLab,
} from "./components/Visuals.tsx";
import {
  ChallengePanel,
  ComponentExplorer,
  GuidedLabs,
  Quiz,
  Troubleshooting,
  type Progress,
} from "./components/Learning.tsx";

const STORAGE = "ata24-lab-progress-v1";
const defaultProgress: Progress = {
  labs: [],
  answers: {},
  challenges: {},
  level: "ENGINEERING",
};
function readProgress(): Progress {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (!value || typeof value !== "object") return defaultProgress;
    return {
      labs: Array.isArray(value.labs)
        ? value.labs.filter(
            (v: unknown) =>
              Number.isInteger(v) && Number(v) >= 0 && Number(v) < 12,
          )
        : [],
      answers:
        value.answers && typeof value.answers === "object"
          ? (Object.fromEntries(
              Object.entries(value.answers).filter(
                ([k, v]) => /^\d+$/.test(k) && typeof v === "boolean",
              ),
            ) as Record<string, boolean>)
          : {},
      challenges:
        value.challenges && typeof value.challenges === "object"
          ? (Object.fromEntries(
              Object.entries(value.challenges).filter(
                ([, v]) => typeof v === "number" && Number.isFinite(v),
              ),
            ) as Record<string, number>)
          : {},
      level: ["BASIC", "ENGINEERING", "MAINTENANCE"].includes(value.level)
        ? value.level
        : "ENGINEERING",
    };
  } catch {
    return defaultProgress;
  }
}
const ICONS = {
  network: Network,
  activity: Activity,
  convert: Cpu,
  battery: Battery,
  plug: Plug,
  transfer: ArrowLeftRight,
  sliders: SlidersHorizontal,
  shield: ShieldCheck,
  fault: TriangleAlert,
  search: Search,
  flask: FlaskConical,
  book: BookOpen,
  target: Target,
  box: Box,
};
declare global {
  interface Window {
    readElectricalState: () => {
      state: State;
      solution: ReturnType<typeof solve>;
    };
  }
}

export default function App() {
  const [s, setS] = useState(() => createState()),
    [paused, setPaused] = useState(false),
    [speed, setSpeed] = useState(1);
  const [module, setModule] = useState<ModuleId>("overview"),
    [selected, setSelected] = useState("ac1"),
    [mobileNav, setMobileNav] = useState(false);
  const [progress, setProgress] = useState<Progress>(readProgress),
    [storageError, setStorageError] = useState(false);
  const [lab, setLab] = useState<number | null>(null),
    [labStep, setLabStep] = useState(0),
    [caseIndex, setCaseIndex] = useState<number | null>(null);
  const [challenge, setChallenge] = useState<"power" | "isolate" | null>(null),
    [challengeResult, setChallengeResult] = useState("");
  const [toast, setToast] = useState(""),
    [actions, setActions] = useState(0),
    [safety, setSafety] = useState(0);
  const challengeStart = useRef(0),
    synopticRef = useRef<HTMLDivElement>(null);
  const q = useMemo(() => solve(s), [s]);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setS((old) => advance(old, 0.2 * speed)), 200);
    return () => clearInterval(id);
  }, [paused, speed]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(progress));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [progress]);
  useEffect(() => {
    window.readElectricalState = () => ({
      state: structuredClone(s),
      solution: structuredClone(q),
    });
  }, [s, q]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  const send = useCallback(
    (action: Action) => {
      if (
        challenge &&
        ["preset", "clearFaults", "fault", "batterySoc"].includes(action.type)
      ) {
        setToast(
          "Görev sırasında başlangıç arızaları korunur. Çıkmak için “Görevi sonlandır” kullan.",
        );
        return;
      }
      if (challenge) {
        setActions((n) => n + 1);
        if (
          (action.type === "resetTrips" &&
            s.faults.some((f) =>
              ["loadShort", "loadOvercurrent"].includes(f),
            )) ||
          (action.type === "load" &&
            action.key === "breaker" &&
            action.value === "CLOSED" &&
            ((action.id === "galley" && s.faults.includes("loadShort")) ||
              (action.id === "nav" && s.faults.includes("loadOvercurrent"))))
        )
          setSafety((n) => n + 1);
      }
      setS((old) => act(old, action));
    },
    [challenge, s.faults],
  );
  const go = (id: ModuleId) => {
    setModule(id);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const select = (id: string) => {
    setSelected(id);
    if (
      !synopticRef.current?.getBoundingClientRect() ||
      synopticRef.current.getBoundingClientRect().top < -600 ||
      synopticRef.current.getBoundingClientRect().top > window.innerHeight
    )
      synopticRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  };
  const reset = (preset: "cold" | "normal" | "emergency") => {
    if (challenge) {
      setToast("Preset değiştirmek için önce görevi sonlandır.");
      return;
    }
    setS(createState(preset));
    setLab(null);
    setLabStep(0);
    setCaseIndex(null);
    setToast(`${preset.toUpperCase()} başlangıç koşulu yüklendi.`);
  };
  const whatIf = (id: string) => {
    if (challenge) return;
    let next = createState();
    if (id === "tieOpen") next = act(next, { type: "fault", id: "gen1Fail" });
    setS(act(next, { type: "fault", id }));
    setLab(null);
    setCaseIndex(null);
    setToast(
      "Normal başlangıçtan senaryo çalıştırıldı. Canlı kontrollerle geri kazanabilirsin.",
    );
  };
  const startLab = (index: number) => {
    const l = LABS[index];
    setChallenge(null);
    setCaseIndex(null);
    setLab(index);
    setLabStep(0);
    setS(l.setup ? l.setup(createState(l.preset)) : createState(l.preset));
    setPaused(false);
    setSpeed(1);
  };
  const startCase = (index: number) => {
    setChallenge(null);
    setLab(null);
    setCaseIndex(index);
    setS(caseState(index));
    setPaused(true);
    setProgress((p) => ({ ...p, level: "MAINTENANCE" }));
    setToast(
      "Teşhis vakası duraklatıldı. Ölç veya PLAY ile zaman davranışını gözle.",
    );
  };
  const startChallenge = (kind: "power" | "isolate") => {
    let next = createState(kind === "power" ? "cold" : "normal");
    if (kind === "power") {
      next = act(act(next, { type: "fault", id: "gen1Fail" }), {
        type: "fault",
        id: "tru1Fail",
      });
      next.loads.fuelLeft.on = true;
    } else next = act(next, { type: "fault", id: "ac1Short" });
    setS(next);
    setLab(null);
    setCaseIndex(null);
    setChallenge(kind);
    setChallengeResult("");
    setActions(0);
    setSafety(0);
    challengeStart.current = Date.now();
    setPaused(false);
    setSpeed(1);
  };
  const finishChallenge = () => {
    const success =
      challenge === "power"
        ? q.nodes.fuelLeft.powered &&
          s.faults.includes("gen1Fail") &&
          s.faults.includes("tru1Fail")
        : !q.nodes.ac1.powered &&
          !s.sources.gen1.contactor &&
          s.tie === "OPEN" &&
          q.nodes.ac2.powered &&
          q.nodes.dcess.powered &&
          q.nodes.acstby.powered;
    if (!success) {
      setChallengeResult(
        challenge === "power"
          ? "Hedef henüz enerjili değil. Ölçümleri ve alternatif dönüşüm yollarını incele."
          : "Hedef henüz tamam değil: GCB 1 açma komutu, tie OPEN ve sağlam essential beslemeler birlikte gerekli.",
      );
      return;
    }
    const score = Math.max(
      0,
      Math.round(
        1000 -
          actions * 8 -
          ((Date.now() - challengeStart.current) / 1000) * 2 -
          safety * 100,
      ),
    );
    setProgress((p) => ({
      ...p,
      challenges: {
        ...p.challenges,
        [challenge!]: Math.max(p.challenges[challenge!] || 0, score),
      },
    }));
    setChallengeResult(
      `Görev tamamlandı · ${score} / 1000 puan. ${actions} hareket; ${safety} uygunsuz reset. En iyi sonuç bu tarayıcıya kaydedildi.`,
    );
    setChallenge(null);
  };
  const props = { s, q, send };
  const sourceControls = <SourceControls {...props} />;
  const fullControls = (
    <>
      <div className="section-divider">
        <span>LIVE SYSTEM CONTROLS</span>
        <small>Her kontrol yukarıdaki aynı ağı değiştirir.</small>
      </div>
      {sourceControls}
      <div className="two-grid">
        <BatteryControls {...props} />
        <TransferControls {...props} />
      </div>
      <TRUControls {...props} />
      <LoadPanel {...props} select={select} />
    </>
  );
  const moduleMeta = MODULES.find((m) => m[0] === module)!;
  const contextual = () => {
    switch (module) {
      case "ac":
        return (
          <>
            <SourceControls {...props} ids={["gen1", "gen2"]} />
            <div className="two-grid">
              <WaveLab paused={paused} />
              <QuantitiesLab />
            </div>
            <Note>
              ENGINE SPEED VARIABLE → IDG DRIVE → GENERATOR SPEED APPROXIMATELY
              CONSTANT → 400 Hz. Bu modelde motor start yalnız elektrik tahrik
              kullanılabilirliğini öğretir; pnömatik/yanma başlatma prosedürü
              modellenmez.
            </Note>
          </>
        );
      case "dc":
        return (
          <>
            <TRUControls {...props} />
            <div className="two-grid">
              <WaveLab rectifier paused={paused} />
              <TransferControls {...props} />
            </div>
            <LoadPanel {...props} select={select} />
          </>
        );
      case "battery":
        return (
          <>
            <div className="two-grid">
              <BatteryControls {...props} />
              <div className="stack">
                <Panel
                  title="STANDBY POWER PATH"
                  subtitle="DC essential ve AC standby beslemelerini karşılaştır"
                >
                  <div className="standby-route">
                    BATTERY <ChevronRight size={16} /> BATTERY BUS{" "}
                    <ChevronRight size={16} /> DC ESS
                  </div>
                  <div className="standby-route">
                    BATTERY BUS <ChevronRight size={16} /> INVERTER{" "}
                    <ChevronRight size={16} /> AC STANDBY
                  </div>
                  <p>{q.statusReason}</p>
                  <button
                    className="primary"
                    onClick={() => reset("emergency")}
                  >
                    TOTAL AC LOSS senaryosu
                  </button>
                  <Note>
                    Batarya gerçek gerilim eğrisi / kimyası modellenmez. Yüke
                    bağlı basit gerilim düşümü ve 22–26 V açık devre yaklaşımı,
                    sabit verimli inverter ve Wh integrali kullanılır.
                  </Note>
                </Panel>
                <QuantitiesLab />
              </div>
            </div>
            <LoadPanel {...props} select={select} />
          </>
        );
      case "apu":
        return (
          <>
            <SourceControls {...props} ids={["apu", "ext"]} />
            <div className="two-grid">
              <BatteryControls {...props} />
              <Panel
                title="GROUND POWER PROCEDURE"
                subtitle="Sıra ve kaynak kalitesi"
              >
                <ol className="procedure">
                  <li>Yerde / ON GROUND koşulunu doğrula.</li>
                  <li>GPU CABLE bağla, GPU ON ve EXT PWR ON yap.</li>
                  <li>Voltage, Frequency, Phase OK ve AVAILABLE kontrol et.</li>
                  <li>EXT PWR CONTACTOR kapat; AC ve DC baraları doğrula.</li>
                  <li>Avionics yükünü aç, kaynak yükünü izle.</li>
                  <li>
                    APU için MASTER → START → RPM ≥ %95 → GEN / CONTACTOR.
                  </li>
                </ol>
                <button
                  onClick={() => {
                    go("labs");
                    startLab(1);
                  }}
                >
                  Rehberli ground power deneyini başlat
                </button>
                <Note>
                  Kaynak önceliği nedeniyle APU hazırken geçerli GPU ana
                  baraları beslemeye devam edebilir. Transfer için EXT contactor
                  açılır.
                </Note>
              </Panel>
            </div>
          </>
        );
      case "tie":
        return (
          <>
            <div className="two-grid">
              <TransferControls {...props} />
              <Panel
                title="İKİ KAYNAK, İKİ AYRI BARA"
                subtitle="Yük dağılımı ve kaynak transferi"
              >
                <div className="generator-comparison">
                  {(["gen1", "gen2"] as const).map((id) => (
                    <div key={id}>
                      <span>{id.toUpperCase()}</span>
                      <strong>
                        {fmt(q.sources[id].load)}
                        <small>%</small>
                      </strong>
                      <div className="comparison-bar">
                        <i
                          style={{
                            width: `${Math.min(100, q.sources[id].load)}%`,
                          }}
                        />
                      </div>
                      <small>{fmt(q.sources[id].watts / 1000)} kW</small>
                    </div>
                  ))}
                </div>
                <p>
                  İki jeneratör kendi tarafındaki yükü taşır. Yüklerin eşit
                  olması gerekmez. Tek kaynak kalınca tie, diğer tarafın yükünü
                  bu kaynağa aktarır.
                </p>
                <Note>
                  Bu uygulamada senkron AC paralelleme modu yoktur. “Load
                  sharing” iki izole tarafın yük dağılımını karşılaştırır; tüm
                  uçakların AC jeneratörleri paralel çalışır anlamına gelmez.
                </Note>
                <div className="button-row">
                  <button onClick={() => whatIf("gen1Fail")}>
                    GEN 1 kaybını dene
                  </button>
                  <button onClick={() => whatIf("tieOpen")}>
                    Transfer yolunu boz
                  </button>
                </div>
              </Panel>
            </div>
            <SourceControls {...props} ids={["gen1", "gen2"]} />
            <LoadPanel {...props} select={select} />
          </>
        );
      case "loads":
        return (
          <>
            <LoadPanel {...props} select={select} />
            <SourceControls {...props} ids={["gen1", "gen2"]} />
            <TelemetryGraph {...props} />
          </>
        );
      case "protection":
        return (
          <>
            <div className="two-grid">
              <Panel
                title="PROTECTION SEQUENCE"
                subtitle="Algıla → ayır → sağlam yolları koru"
              >
                <ol className="procedure">
                  <li>
                    GCU: gerilim, frekans ve faz koşullarını kontrol eder.
                  </li>
                  <li>
                    Bus / feeder short: etkilenen alan anında izole edilir.
                  </li>
                  <li>
                    Overload: AUTO SHED talebi azaltır; yük &gt; %100 kalırsa 5
                    s sonra kaynak trip olur.
                  </li>
                  <li>
                    TRU: ≥110 °C veya &gt;5 kW / 5 s koşulunda kilitli trip.
                  </li>
                  <li>
                    Yük kısa devresi: yalnız ilgili circuit breaker TRIPPED.
                  </li>
                </ol>
                <Note>
                  Differential protection kavramı, giriş/çıkış akımı
                  uyumsuzluğunun korunan bölge içindeki arızaya işaret
                  etmesidir. Bu mantıksal model CT dalga şekli veya sayısal
                  diferansiyel röle hesabı içermez.
                </Note>
                <div className="button-row">
                  <button onClick={() => whatIf("ac1Short")}>
                    BUS SHORT deneyi
                  </button>
                  <button onClick={() => send({ type: "resetTrips" })}>
                    Koruma reseti (eğitim)
                  </button>
                </div>
              </Panel>
              <Cascade s={s} />
            </div>
            <LoadPanel {...props} select={select} breakers />
            <FaultPanel s={s} send={send} />
          </>
        );
      case "faults":
        return (
          <>
            <FaultPanel s={s} send={send} />
            <Cascade s={s} />
          </>
        );
      case "trouble":
        return (
          <>
            <Troubleshooting active={caseIndex} start={startCase} q={q} />
            {fullControls}
          </>
        );
      case "free":
        return (
          <>
            {fullControls}
            <FaultPanel s={s} send={send} />
          </>
        );
      case "labs":
        return (
          <>
            <GuidedLabs
              {...props}
              active={lab}
              step={labStep}
              start={startLab}
              next={() => {
                const n = labStep + 1;
                setLabStep(n);
                if (lab !== null && n === LABS[lab].steps.length)
                  setProgress((p) => ({
                    ...p,
                    labs: [...new Set([...p.labs, lab])],
                  }));
              }}
              completed={progress.labs}
            />
            {fullControls}
            <FaultPanel s={s} send={send} />
          </>
        );
      case "quiz":
        return (
          <>
            <Quiz
              progress={progress}
              answer={(i, correct) =>
                setProgress((p) =>
                  p.answers[i] === undefined
                    ? { ...p, answers: { ...p.answers, [i]: correct } }
                    : p,
                )
              }
              demonstrate={(id) => {
                whatIf(id);
                synopticRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
            />
            <ChallengePanel
              challenge={challenge}
              start={startChallenge}
              finish={finishChallenge}
              actions={actions}
              elapsed={
                challenge ? (Date.now() - challengeStart.current) / 1000 : 0
              }
              safety={safety}
              result={challengeResult}
            />
            {challenge && (
              <button
                onClick={() => {
                  setChallenge(null);
                  setChallengeResult("Görev sonlandırıldı; puan kaydedilmedi.");
                }}
              >
                Görevi sonlandır
              </button>
            )}
            {fullControls}
          </>
        );
      case "explorer":
        return (
          <>
            <ComponentExplorer select={select} />
            <AircraftView q={q} select={select} />
          </>
        );
      default:
        return null;
    }
  };
  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Menüyü kapat"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <div className="brand-icon">
            <Zap size={26} />
          </div>
          <span>
            POWER LAB<small>ATA 24 / SYSTEMS TRAINER</small>
          </span>
        </a>
        <div className="sidebar-group-label">TRAINING WORKSPACE</div>
        <nav aria-label="Laboratuvar modülleri">
          {MODULES.map(([id, label, , icon], i) => {
            const Icon = ICONS[icon];
            return (
              <button
                key={id}
                className={module === id ? "active" : ""}
                aria-current={module === id ? "page" : undefined}
                onClick={() => go(id)}
                title={label}
                aria-label={label}
              >
                <Icon size={17} strokeWidth={1.65} />
                <span>{label}</span>
                {id === "labs" ? (
                  <small>{progress.labs.length}/12</small>
                ) : i === 8 && s.faults.length ? (
                  <small className="fault-count">{s.faults.length}</small>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="aircraft-tag">
            <Network size={16} />
            GENERIC TWIN-ENGINE
          </span>
          <p>
            Elektriği gör.
            <br />
            Sistemi anla.
          </p>
          <small>
            INTERACTIVE TRAINING
            <br />
            SIMPLIFIED EDUCATIONAL MODEL
          </small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="Modül menüsünü aç"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span>TRAINING ENVIRONMENT</span>
            <ChevronRight size={13} />
            <b>ATA 24</b>
          </div>
          <div className="topbar-right">
            <span className="session-status">
              <i className="live-dot" />
              {paused ? "PAUSED" : "SIMULATION LIVE"}
            </span>
            <button
              className="icon-button"
              title="Model varsayımları"
              aria-label="Model varsayımlarını göster"
              onClick={() => {
                go("explorer");
              }}
            >
              <CircleHelp size={19} />
            </button>
            <div className="avatar">MA</div>
          </div>
        </header>
        <main>
          <div className="page-title">
            <div>
              <span className="eyebrow">
                ATA 24 / INTERACTIVE ELECTRICAL POWER SIMULATOR
              </span>
              <h1>
                {module === "overview"
                  ? "AIRCRAFT ELECTRICAL POWER LAB"
                  : moduleMeta[2]}
              </h1>
              <p>
                {module === "overview"
                  ? "Gücü üret. Yolu takip et. Arızayı bul. Sistemi geri kazan."
                  : moduleMeta[1] +
                    " · bütün ölçümler aynı canlı elektrik ağından."}
              </p>
            </div>
            <span
              className={`system-status ${q.status === "NORMAL" ? "good" : q.status === "EMERGENCY" ? "danger" : "amber"}`}
              title={q.statusReason}
            >
              <i />
              {q.status}
            </span>
          </div>
          <div className="simulation-toolbar">
            <div className="button-row transport">
              <button
                className={paused ? "" : "active"}
                aria-label={
                  paused ? "Simülasyonu oynat" : "Simülasyonu duraklat"
                }
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? (
                  <Play size={15} fill="currentColor" />
                ) : (
                  <Pause size={15} fill="currentColor" />
                )}
                {paused ? "PLAY" : "PAUSE"}
              </button>
              <button
                aria-label="Simülasyonu bir adım ilerlet"
                onClick={() => {
                  setPaused(true);
                  setS((old) => advance(old, 0.2));
                }}
              >
                <SkipForward size={15} />
              </button>
              <span className="sim-clock">{timestamp(s.time)}</span>
              <select
                aria-label="Simülasyon hızı"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                {[0.5, 1, 2, 5, 10].map((v) => (
                  <option key={v} value={v}>
                    {v}× SPEED
                  </option>
                ))}
              </select>
            </div>
            <div className="view-levels" aria-label="Görselleştirme seviyesi">
              {(["BASIC", "ENGINEERING", "MAINTENANCE"] as const).map(
                (level) => (
                  <button
                    key={level}
                    className={progress.level === level ? "active" : ""}
                    onClick={() => setProgress((p) => ({ ...p, level }))}
                  >
                    {level}
                  </button>
                ),
              )}
            </div>
            <div className="reset-controls">
              <RotateCcw size={14} />
              <select
                aria-label="Başlangıç senaryosu"
                value=""
                onChange={(e) => {
                  if (e.target.value)
                    reset(e.target.value as "cold" | "normal" | "emergency");
                }}
              >
                <option value="" disabled>
                  RESET SYSTEM
                </option>
                <option value="cold">COLD & DARK</option>
                <option value="normal">NORMAL FLIGHT</option>
                <option value="emergency">EMERGENCY</option>
              </select>
            </div>
          </div>
          <div className="what-if-strip">
            <span>
              <FlaskConical size={14} />
              WHAT IF?
            </span>
            {[
              ["gen1Fail", "GEN 1 FAIL"],
              ["bothGen", "TOTAL AC LOSS"],
              ["tru1Fail", "TRU 1 FAIL"],
              ["tieOpen", "TIE STUCK OPEN"],
              ["lowBattery", "LOW BATTERY"],
              ["ac1Short", "BUS SHORT"],
            ].map(([id, text]) => (
              <button
                key={id}
                disabled={!!challenge}
                onClick={() => whatIf(id)}
              >
                {text}
                <ChevronRight size={12} />
              </button>
            ))}
          </div>
          {storageError && (
            <p className="feedback">
              Tarayıcı depolaması kullanılamıyor; ilerleme bu oturumda
              tutuluyor.
            </p>
          )}
          {challenge && module !== "quiz" && (
            <div className="active-training">
              <Target size={16} />
              Görev aktif:{" "}
              {challenge === "power"
                ? "POWER THE LEFT FUEL PUMP"
                : "ISOLATE THE FAULT"}
              <button onClick={() => go("quiz")}>Göreve dön</button>
              <button onClick={() => setChallenge(null)}>
                Görevi sonlandır
              </button>
            </div>
          )}
          {module !== "overview" && (
            <div className="module-content">{contextual()}</div>
          )}
          <div className="workspace" ref={synopticRef}>
            <Synoptic
              q={q}
              s={s}
              selected={selected}
              select={setSelected}
              level={progress.level}
              paused={paused}
            />
            <Inspector
              key={module === "trouble" ? "maintenance" : "normal"}
              selected={selected}
              select={setSelected}
              {...props}
              maintenance={module === "trouble"}
            />
          </div>
          <div className="status-strip">
            <span>
              <Gauge size={17} />
              <b>{q.status}</b> {q.statusReason}
            </span>
            <span>
              {LOADS.filter((l) => q.nodes[l.id].powered).length}/{LOADS.length}{" "}
              LOADS POWERED · {fmt(q.servedWatts / 1000)} kW
            </span>
          </div>
          {q.alerts.length > 0 && (
            <details className="alerts" open={progress.level === "MAINTENANCE"}>
              <summary>
                <TriangleAlert size={16} />
                {q.alerts.length} SYSTEM ADVISORIES
              </summary>
              {q.alerts.map((a) => (
                <p key={a}>{a}</p>
              ))}
            </details>
          )}
          {module === "overview" && (
            <>
              <div className="section-divider">
                <span>POWER SOURCE CONTROLS</span>
                <small>
                  Kaynakları burada kontrol et; akışı yukarıda izle.
                </small>
              </div>
              {sourceControls}
              <div className="two-grid">
                <TransferControls {...props} />
                <BatteryControls {...props} />
              </div>
              <LoadPanel {...props} select={select} />
            </>
          )}
          <div className="two-grid bottom-panels">
            <TelemetryGraph {...props} />
            <EventLog s={s} send={send} />
          </div>
          <footer>
            <div>
              <b>AIRCRAFT ELECTRICAL POWER LAB</b>
              <span>ATA 24 Interactive Training & Simulation Environment</span>
            </div>
            <p>{DISCLAIMER}</p>
            <p>
              Simplified educational ATA 24 model. Architecture and exact values
              vary by aircraft.
            </p>
            <details>
              <summary>Model varsayımları & teknik kaynaklar</summary>
              <p>
                Bu uygulamanın kaynak önceliği, 30 kVA motor jeneratörleri, 45
                kVA APU, 60 kVA GPU, 40 Ah batarya, yük listesi, kontaktör
                düzeni ve koruma limitleri eğitim için seçilmiştir. Kesintisiz
                transfer transientleri, AC senkronizasyon, batarya kimyası ve
                kısa devre empedans hesabı modellenmez.
              </p>
              <p>
                <a
                  href="https://quicksearch.dla.mil/qsDocDetails.aspx?ident_number=18367"
                  target="_blank"
                  rel="noreferrer"
                >
                  DLA: Aircraft Transformer-Rectifier power supplies
                </a>{" "}
                · 115/200 V / 400 Hz AC → DC dönüşüm kavramı.{" "}
                <a
                  href="https://www.faa.gov/aircraft/air_cert/step/disciplines/electric_power"
                  target="_blank"
                  rel="noreferrer"
                >
                  FAA: Electric Power Systems
                </a>{" "}
                · üretim ve enerji depolama kapsamı.
              </p>
            </details>
          </footer>
        </main>
      </div>
      <div className="persistent-disclaimer">{DISCLAIMER}</div>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Bildirimi kapat" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
