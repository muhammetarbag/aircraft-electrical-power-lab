import { useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FlaskConical,
  Lightbulb,
  Target,
  X,
} from "lucide-react";
import { CASES, COMPONENTS, LABS, QUESTIONS } from "../content.ts";
import type { Solution, State } from "../sim/types.ts";
import { fmt, Note, Panel } from "./Controls.tsx";
export interface Progress {
  labs: number[];
  answers: Record<string, boolean>;
  challenges: Record<string, number>;
  level: "BASIC" | "ENGINEERING" | "MAINTENANCE";
}
export function GuidedLabs({
  s,
  q,
  active,
  step,
  start,
  next,
  completed,
}: {
  s: State;
  q: Solution;
  active: number | null;
  step: number;
  start: (index: number) => void;
  next: () => void;
  completed: number[];
}) {
  const [observation, setObservation] = useState("");
  const lab = active !== null ? LABS[active] : null;
  return (
    <div className="learning-layout">
      <Panel title="12 GUIDED LABS" subtitle="Amaç → kontrol → gözlem → sonuç">
        <div className="lab-picker">
          {LABS.map((l, i) => (
            <button
              key={l.title}
              className={active === i ? "active" : ""}
              onClick={() => {
                start(i);
                setObservation("");
              }}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <b>{l.title}</b>
              {completed.includes(i) ? (
                <CheckCircle2 size={17} />
              ) : (
                <ArrowRight size={15} />
              )}
            </button>
          ))}
        </div>
      </Panel>
      {lab ? (
        <Panel
          title={`LAB ${String(active! + 1).padStart(2, "0")} · ${lab.title}`}
          subtitle={lab.goal}
          badge={
            <span className="badge">
              {step} / {lab.steps.length}
            </span>
          }
        >
          <span className="eyebrow">INITIAL CONDITION</span>
          <p>{lab.initial}</p>
          <ol className="lab-steps">
            {lab.steps.map((st, i) => (
              <li
                key={st.task}
                className={i < step ? "done" : i === step ? "current" : ""}
              >
                <span>{i < step ? <Check size={15} /> : i + 1}</span>
                <div>
                  <b>{st.task}</b>
                  {i < step && <p>{st.observation}</p>}
                </div>
              </li>
            ))}
          </ol>
          {step < lab.steps.length ? (
            <>
              <button
                className="primary full"
                onClick={() => {
                  if (lab.steps[step].check(s, q)) {
                    setObservation(lab.steps[step].observation);
                    next();
                  } else
                    setObservation(
                      "Koşul henüz sağlanmadı. Aşağıdaki canlı kontrolleri kullan ve güç yolunu yeniden incele.",
                    );
                }}
              >
                <FlaskConical size={16} />
                Canlı koşulu doğrula
              </button>
              {observation && (
                <p className="feedback" role="status">
                  {observation}
                </p>
              )}
            </>
          ) : (
            <div className="success-box">
              <CheckCircle2 size={22} />
              <div>
                <b>LAB COMPLETED</b>
                <p>{lab.result}</p>
              </div>
            </div>
          )}
          <div className="reflection">
            <span className="eyebrow">DÜŞÜN & GÖZLE</span>
            <p>{lab.question}</p>
            <label>
              Deney notun
              <textarea
                aria-label="Deney gözlem notu"
                placeholder="Hangi yol değişti, hangi yük kaldı?"
              />
            </label>
          </div>
          <Note>
            Adım doğrulaması canlı sistem koşullarını kontrol eder. Kaynak, yük
            ve arıza kontrolleri aşağıdadır. Deney tamamlandığında ilerleme bu
            tarayıcıya kaydedilir.
          </Note>
        </Panel>
      ) : (
        <Panel
          title="Bir deney seç"
          subtitle="Her deney kendi başlangıç koşulunu yükler."
        >
          <div className="learning-empty">
            <FlaskConical size={42} />
            <h3>Önce tahmin et. Sonra devreyi kur.</h3>
            <p>
              Kaynağı aç, gücün geçtiği kontaktörleri izle ve sonuçları canlı ağ
              üzerinde doğrula.
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}
export function Troubleshooting({
  active,
  start,
  q,
}: {
  active: number | null;
  start: (index: number) => void;
  q: Solution;
}) {
  const [choice, setChoice] = useState(""),
    [submitted, setSubmitted] = useState(false),
    [hint, setHint] = useState(false);
  const c = active !== null ? CASES[active] : null;
  return (
    <div className="learning-layout">
      <Panel
        title="MAINTENANCE CASE FILES"
        subtitle="10 vaka · belirtilerden arızaya"
      >
        <div className="lab-picker">
          {CASES.map((a, i) => (
            <button
              key={a.title}
              className={active === i ? "active" : ""}
              onClick={() => {
                start(i);
                setChoice("");
                setSubmitted(false);
                setHint(false);
              }}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <b>{a.title}</b>
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      </Panel>
      <Panel
        title={
          c
            ? `CASE ${String(active! + 1).padStart(2, "0")} · ${c.title}`
            : "Arızayı ölçerek bul."
        }
        subtitle={
          c?.complaint ||
          "Bir vaka seç; ölçümler, kontaktörler ve olay kaydı üzerinden teşhis et."
        }
      >
        {c ? (
          <>
            <div className="case-instruments">
              {["ac1", "ac2", "dc1", "dcess"].map((id) => (
                <div key={id}>
                  <small>{q.nodes[id].name}</small>
                  <strong>{fmt(q.nodes[id].voltage)} V</strong>
                </div>
              ))}
            </div>
            <p>
              Şemadan bileşen seç; <b>Maintenance Probe</b> ile Voltage,
              Current, Frequency, Contactor, Breaker, Source ve Load ölçümlerini
              karşılaştır.
            </p>
            <button onClick={() => setHint(!hint)}>
              <Lightbulb size={15} />
              {hint ? "İpucunu gizle" : "Ölçüm ipucu"}
            </button>
            {hint && <p className="feedback">{c.hint}</p>}
            <fieldset className="answer-list">
              <legend>En olası teşhis</legend>
              {[...c.options]
                .sort((a, b) => a.localeCompare(b, "tr"))
                .map((option) => (
                  <label
                    key={option}
                    className={choice === option ? "selected" : ""}
                  >
                    <input
                      type="radio"
                      name="diagnosis"
                      checked={choice === option}
                      onChange={() => {
                        setChoice(option);
                        setSubmitted(false);
                      }}
                    />
                    {option}
                  </label>
                ))}
            </fieldset>
            <button
              className="primary"
              disabled={!choice}
              onClick={() => setSubmitted(true)}
            >
              Teşhisi değerlendir
            </button>
            {submitted && (
              <div
                className={`feedback ${choice === c.answer ? "correct" : "incorrect"}`}
                role="status"
              >
                {choice === c.answer
                  ? `Doğru teşhis. ${c.answer}. Şimdi canlı kontrollerle beslemeyi geri kazanmayı dene.`
                  : "Bu teşhis mevcut belirtileri birlikte açıklamıyor. Üst besleme ile alt besleme ölçümlerini karşılaştır."}
              </div>
            )}
          </>
        ) : (
          <div className="learning-empty">
            <Target size={42} />
            <p>
              Arızanın adı başlangıçta verilmez. Ölçümler ve gerçek kontak
              durumları sana yolu gösterir.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
export function Quiz({
  progress,
  answer,
  demonstrate,
}: {
  progress: Progress;
  answer: (index: number, correct: boolean) => void;
  demonstrate: (fault: string) => void;
}) {
  const [index, setIndex] = useState(0),
    [choice, setChoice] = useState(""),
    [graded, setGraded] = useState<boolean | null>(null);
  const question = QUESTIONS[index],
    normalize = (s: string) =>
      s.trim().toUpperCase().replace(/\s+/g, "").replace(/，/g, ",");
  const submit = () => {
    const correct = normalize(choice) === normalize(question.answer);
    setGraded(correct);
    answer(index, correct);
  };
  const move = (i: number) => {
    setIndex(i);
    setChoice("");
    setGraded(null);
  };
  return (
    <Panel
      title="KNOWLEDGE CHECK"
      subtitle="36 soru · tahmin, güç yolu sıralama ve sayısal hesap"
      badge={
        <span className="badge">
          {Object.values(progress.answers).filter(Boolean).length} DOĞRU /{" "}
          {QUESTIONS.length}
        </span>
      }
    >
      <div className="quiz-header">
        <span className="eyebrow">{question.category.toUpperCase()}</span>
        <b>
          {String(index + 1).padStart(2, "0")} / {QUESTIONS.length}
        </b>
      </div>
      <h3 className="quiz-question">{question.prompt}</h3>
      {question.options ? (
        <fieldset className="answer-list">
          <legend className="sr-only">Cevabın</legend>
          {[...question.options]
            .sort((a, b) => a.localeCompare(b, "tr"))
            .map((option, i) => (
              <label
                key={option}
                className={choice === option ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="quiz"
                  checked={choice === option}
                  disabled={graded !== null}
                  onChange={() => setChoice(option)}
                />
                <span className="answer-letter">
                  {String.fromCharCode(65 + i)}
                </span>
                {option}
              </label>
            ))}
        </fieldset>
      ) : (
        <label className="field">
          {question.category.includes("sıralama")
            ? "Güç yolunu yaz (virgülle ayır)"
            : "Sayısal cevabın (birimsiz)"}
          <input
            aria-label="Quiz cevabı"
            value={choice}
            disabled={graded !== null}
            onChange={(e) => setChoice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && choice && graded === null) submit();
            }}
          />
        </label>
      )}
      {graded === null ? (
        <button className="primary" disabled={!choice.trim()} onClick={submit}>
          Cevabı kontrol et
        </button>
      ) : (
        <div
          className={`feedback ${graded ? "correct" : "incorrect"}`}
          role="status"
        >
          {graded ? <CheckCircle2 size={20} /> : <X size={20} />}
          <div>
            <b>{graded ? "Doğru." : `Doğru cevap: ${question.answer}`}</b>
            <p>{question.explanation}</p>
            {question.demonstrate && (
              <button onClick={() => demonstrate(question.demonstrate!)}>
                Tahmini canlı sistemde göster <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      )}
      <div className="quiz-navigation">
        <button disabled={index === 0} onClick={() => move(index - 1)}>
          Önceki
        </button>
        <div className="quiz-dots">
          {QUESTIONS.map((_, i) => (
            <button
              aria-label={`Soru ${i + 1}`}
              key={i}
              className={`${i === index ? "current" : ""} ${progress.answers[i] === true ? "correct" : progress.answers[i] === false ? "incorrect" : ""}`}
              onClick={() => move(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <button
          disabled={index === QUESTIONS.length - 1}
          onClick={() => move(index + 1)}
        >
          Sonraki
        </button>
      </div>
      <Note>
        İlk yanıt puana yazılır; tekrar denemeler başarı sayısını şişirmez.
        İlerleme yalnız bu tarayıcıda tutulur.
      </Note>
    </Panel>
  );
}
export function ChallengePanel({
  challenge,
  start,
  finish,
  actions,
  elapsed,
  safety,
  result,
}: {
  challenge: string | null;
  start: (kind: "power" | "isolate") => void;
  finish: () => void;
  actions: number;
  elapsed: number;
  safety: number;
  result: string;
}) {
  return (
    <Panel
      title="LIVE SYSTEM CHALLENGES"
      subtitle="Gerçek ağ üzerinde hedefe ulaş; rota verilmez."
    >
      <div className="two-grid">
        <button
          className={`challenge-card ${challenge === "power" ? "active" : ""}`}
          onClick={() => start("power")}
        >
          <Target size={23} />
          <span>
            <b>POWER THE LEFT FUEL PUMP</b>
            <small>
              Kısmen arızalı, enerjisiz uçaktan çalışan sol pompaya.
            </small>
          </span>
          <ArrowRight size={16} />
        </button>
        <button
          className={`challenge-card ${challenge === "isolate" ? "active" : ""}`}
          onClick={() => start("isolate")}
        >
          <Target size={23} />
          <span>
            <b>ISOLATE THE FAULT</b>
            <small>
              AC BUS 1 arızalı: besleme komutlarını ayır, sağlam tarafı koru.
            </small>
          </span>
          <ArrowRight size={16} />
        </button>
      </div>
      {challenge && (
        <>
          <div className="challenge-stats">
            <span>
              <b>{actions}</b> hareket
            </span>
            <span>
              <b>{fmt(elapsed, 0)}</b> gerçek saniye
            </span>
            <span>
              <b>{safety}</b> uygunsuz reset girişimi
            </span>
          </div>
          <button className="primary" onClick={finish}>
            Hedefi canlı sistemde değerlendir
          </button>
          <p className="muted">
            Puan = 1000 − 8 × hareket − 2 × gerçek saniye − 100 × uygunsuz
            reset. Arızayı kaldırma ve preset değiştirme bu görev sırasında
            kilitli; görevi bitir veya yeniden başlat.
          </p>
        </>
      )}
      {result && (
        <p className="feedback" role="status">
          {result}
        </p>
      )}
    </Panel>
  );
}
export function ComponentExplorer({
  select,
}: {
  select: (id: string) => void;
}) {
  const [index, setIndex] = useState(0),
    c = COMPONENTS[index];
  return (
    <div className="learning-layout">
      <Panel
        title="16 COMPONENTS"
        subtitle="İşlevi öğren, canlı durumunu incele"
      >
        <div className="component-picker">
          {COMPONENTS.map((comp, i) => (
            <button
              key={comp[0]}
              className={index === i ? "active" : ""}
              onClick={() => setIndex(i)}
            >
              {comp[0]}
              <ArrowRight size={13} />
            </button>
          ))}
        </div>
      </Panel>
      <Panel title={c[0]} subtitle={c[1]}>
        <dl className="component-details">
          {[
            "INPUT",
            "OUTPUT",
            "NORMAL STATE",
            "COMMON FAILURES",
            "SYSTEM CONSEQUENCE",
          ].map((label, i) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{c[i + 2]}</dd>
            </div>
          ))}
        </dl>
        <button className="primary" onClick={() => select(c[7])}>
          Canlı bileşeni incele <ArrowRight size={15} />
        </button>
        <Note>
          Typical architecture — actual implementation varies by aircraft.
          Kaynak önceliği, kontaktör düzeni ve limitler bu uygulamanın eğitim
          varsayımlarıdır.
        </Note>
      </Panel>
    </div>
  );
}
