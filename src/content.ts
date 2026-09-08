import { act, createState } from "./sim/engine.ts";
import type { Preset, Solution, State } from "./sim/types.ts";

export const MODULES = [
  ["overview", "Sistem genel görünümü", "POWER SYSTEM OVERVIEW", "network"],
  ["ac", "AC güç laboratuvarı", "AC POWER LAB", "activity"],
  ["dc", "DC & TRU laboratuvarı", "DC POWER LAB", "convert"],
  ["battery", "Batarya & standby", "BATTERY & STANDBY POWER", "battery"],
  ["apu", "APU & haricî güç", "APU & EXTERNAL POWER", "plug"],
  ["tie", "Bus tie & transfer", "BUS TIE & POWER TRANSFER LAB", "transfer"],
  ["loads", "Yük yönetimi", "LOAD MANAGEMENT LAB", "sliders"],
  ["protection", "Koruma sistemleri", "PROTECTION SYSTEMS", "shield"],
  ["faults", "Arıza enjeksiyonu", "FAILURE INJECTION", "fault"],
  ["trouble", "Arıza teşhisi", "TROUBLESHOOTING", "search"],
  ["free", "Serbest deney", "FREE EXPERIMENT", "flask"],
  ["labs", "Rehberli deneyler", "GUIDED LABS", "book"],
  ["quiz", "Bilgi & görev sınavı", "QUIZ / CHALLENGE MODE", "target"],
  ["explorer", "Bileşen gezgini", "COMPONENT EXPLORER", "box"],
] as const;
export type ModuleId = (typeof MODULES)[number][0];
export interface LabStep {
  task: string;
  check: (s: State, q: Solution) => boolean;
  observation: string;
}
export interface Lab {
  title: string;
  goal: string;
  preset: Preset;
  initial: string;
  setup?: (s: State) => State;
  steps: LabStep[];
  question: string;
  result: string;
}
export const LABS: Lab[] = [
  {
    title: "Yalnızca batarya",
    goal: "Hot Battery, Battery Bus ve standby AC farkını gözle.",
    preset: "cold",
    initial: "Cold & Dark · BAT OFF",
    steps: [
      {
        task: "BATTERY switch ON yap.",
        check: (s, q) => s.batteryOn && q.nodes.batbus.powered,
        observation:
          "Ana kontaktör kapandı; Battery Bus artık bataryaya bağlı.",
      },
      {
        task: "NAV Receiver ve Flight Instruments yüklerini aç.",
        check: (_, q) => q.nodes.nav.powered && q.nodes.instruments.powered,
        observation:
          "DC ESS doğrudan DC; AC STANDBY inverter üzerinden besleniyor.",
      },
      {
        task: "Bataryayla en az 10 simülasyon saniyesi çalış.",
        check: (s) => s.time >= 10 && s.energyWh < 816,
        observation: "Enerji, güç × süre kadar azaldı.",
      },
    ],
    question: "BAT OFF yapılırsa Fire Monitoring neden çalışmaya devam eder?",
    result: "Hot Battery hattı ana kontaktörden bağımsızdır.",
  },
  {
    title: "External Power bağlantısı",
    goal: "Kaynak kalitesini doğrulayıp yerde uçak baralarını besle.",
    preset: "cold",
    initial: "Cold & Dark · GPU ayrılmış",
    steps: [
      {
        task: "GPU kablosunu bağla ve GPU ON yap.",
        check: (s) => s.gpuCable && s.gpuOn,
        observation:
          "Fiziksel bağlantı kuruldu; uçak kontaktörü henüz ayrı bir koşul.",
      },
      {
        task: "EXT kaynak anahtarını ON yap; 115 V / 400 Hz / faz uygunluğunu doğrula.",
        check: (_, q) => q.sources.ext.available,
        observation: "Kaynak kalite denetiminden geçti.",
      },
      {
        task: "EXT contactor kapat ve Avionics yükünü aç.",
        check: (_, q) =>
          q.nodes.ac1.source === "ext" && q.nodes.avionics.powered,
        observation: "GPU → AC BUS 1 → TRU 1 → DC BUS 1 → Avionics.",
      },
    ],
    question:
      "330 Hz kaynağı bağlamaya çalışınca hangi bileşen bağlantıyı reddeder?",
    result: "Kalite koruması external power kontaktörünü açık tutar.",
  },
  {
    title: "GPU → APU transferi",
    goal: "Batarya / DC starter beslemesiyle APU başlat, kaynağı değiştir.",
    preset: "cold",
    initial: "GPU bağlı ve geçerli · BAT ON",
    setup: (s) => {
      s.gpuCable = s.gpuOn = s.batteryOn = true;
      s.sources.ext.on = s.sources.ext.contactor = true;
      return s;
    },
    steps: [
      {
        task: "APU MASTER aç, START bas ve RPM ≥ 95 bekle.",
        check: (s) => s.apuRpm >= 95,
        observation: "Starter enerjisi Battery Bus tarafından sağlandı.",
      },
      {
        task: "APU GEN ve contactor aç.",
        check: (s, q) => s.sources.apu.contactor && q.sources.apu.available,
        observation: "APU hazır; yerde geçerli GPU bu modelde öncelikli.",
      },
      {
        task: "EXT contactor açarak APU beslemesini doğrula.",
        check: (_, q) =>
          q.nodes.ac1.source === "apu" && q.nodes.ac2.source === "apu",
        observation: "Kaynaklar paralellenmeden iki bara APU üzerine geçti.",
      },
    ],
    question: "APU START için neden yalnızca APU MASTER yeterli değil?",
    result: "Starter için kullanılabilir DC elektrik yolu da gerekir.",
  },
  {
    title: "Engine 1 & GEN 1",
    goal: "Tahrik, excitation ve kontaktör koşullarını ayrı ayrı kur.",
    preset: "cold",
    initial: "Motorlar durmuş",
    steps: [
      {
        task: "ENGINE 1 START ve RPM ≥ 55.",
        check: (s) => s.engines[0] && s.rpm[0] >= 55,
        observation: "Basitleştirilmiş IDG tahrik eşiğine ulaşıldı.",
      },
      {
        task: "GEN 1 ON ve GCB 1 CLOSED yap.",
        check: (_, q) => q.nodes.ac1.source === "gen1",
        observation: "Uygun kaynak ve kapalı feeder yolu birlikte gerekli.",
      },
    ],
    question: "Motor dururken GCB kapalı olsa bile neden AC üretilemez?",
    result: "Elektrik üretimi için mekanik enerji girişi gerekir.",
  },
  {
    title: "Normal iki jeneratör",
    goal: "İki izole AC kaynağı ve iki TRU ile normal konfigürasyonu kur.",
    preset: "cold",
    initial: "Cold & Dark",
    steps: [
      {
        task: "İki motoru başlat, iki GEN ve GCB anahtarını aç.",
        check: (_, q) => q.sources.gen1.connected && q.sources.gen2.connected,
        observation: "Her motor jeneratörü kendi AC barasını besler.",
      },
      {
        task: "BAT ON yap; Avionics ve Right Fuel Pump yüklerini aç.",
        check: (_, q) =>
          q.nodes.avionics.powered &&
          q.nodes.fuelRight.powered &&
          q.battery.mode === "CHARGING",
        observation: "TRU 1 ve TRU 2 DC dağıtımı; DC BUS 2 şarj hattı.",
      },
    ],
    question: "İki jeneratör çalışırken AUTO tie neden açık?",
    result: "Bu mimaride bağımsız AC kaynakları paralellenmez.",
  },
  {
    title: "GEN 1 kaybı & transfer",
    goal: "Tek arızanın aşağı akış etkisini izle.",
    preset: "normal",
    initial: "Normal flight",
    steps: [
      {
        task: "GEN 1 FAIL enjekte et.",
        check: (s) => s.faults.includes("gen1Fail"),
        observation: "GEN 1 normal besleme yolu açıldı.",
      },
      {
        task: "AUTO tie üzerinden GEN 2 beslemesini kontrol et.",
        check: (_, q) =>
          q.nodes.fuelLeft.source === "gen2" &&
          q.nodes.fuelLeft.edgePath.includes("tie"),
        observation: "GEN 2 → AC BUS 2 → tie → AC BUS 1 → TRU 1.",
      },
      {
        task: "GEN 1 arızasını kaldır; iki izole kaynağa dön.",
        check: (s, q) =>
          !s.faults.includes("gen1Fail") &&
          q.sources.gen1.connected &&
          q.sources.gen2.connected,
        observation: "Normal kaynak geri geldiğinde tie açılır.",
      },
    ],
    question: "Transfer sonrası GEN 2 yük yüzdesi neden artar?",
    result: "İki tarafın yüklerini tek kaynak taşımaktadır.",
  },
  {
    title: "TRU 1 kaybı",
    goal: "AC varlığının DC beslemesini garanti etmediğini gözle.",
    preset: "normal",
    initial: "DC tie OPEN",
    steps: [
      {
        task: "TRU 1 FAIL enjekte et.",
        check: (s, q) =>
          s.faults.includes("tru1Fail") &&
          q.nodes.ac1.powered &&
          !q.nodes.dc1.powered,
        observation: "AC BUS 1 canlı, DC BUS 1 enerjisiz.",
      },
      {
        task: "DC tie AUTO seçerek DC BUS 1 beslemesini geri kazan.",
        check: (_, q) => q.nodes.dc1.path.includes("tru2"),
        observation: "Alternatif DC yolu TRU 2 üzerinden sağlandı.",
      },
    ],
    question: "AC voltmetresi normal iken hangi dönüştürücüyü kontrol edersin?",
    result: "DC baranın TRU ve çıkış feeder yolu incelenir.",
  },
  {
    title: "Kapasite & load shedding",
    goal: "Aşırı talebi önceliklere göre azalt.",
    preset: "normal",
    initial: "Tek GEN 2 · 18 kVA",
    setup: (s) => {
      s.sources.gen2.kva = 18;
      return act(s, { type: "fault", id: "gen1Fail" });
    },
    steps: [
      {
        task: "AUTO SHED açıkken Galley shed olduğunu doğrula.",
        check: (_, q) => q.shed.includes("galley") && q.nodes.nav.powered,
        observation: "Önce non-essential Galley çıkarıldı; NAV korundu.",
      },
      {
        task: "Galley yükünü OFF yap; GEN 2 yükünü %100 altında tut.",
        check: (s, q) => !s.loads.galley.on && q.sources.gen2.load <= 100,
        observation: "Talep azaltılması kapasiteyi rahatlatır.",
      },
    ],
    question: "Essential yükler hâlâ kapasiteyi aşarsa ne olur?",
    result:
      "Essential yükler otomatik shed edilmez; gecikmeli kaynak koruması trip edebilir.",
  },
  {
    title: "Tüm ana AC üretiminin kaybı",
    goal: "Standby besleme zincirini ve kaybolan yükleri incele.",
    preset: "normal",
    initial: "Normal flight",
    steps: [
      {
        task: "BOTH GENERATORS FAIL enjekte et.",
        check: (_, q) => !q.nodes.ac1.powered && !q.nodes.ac2.powered,
        observation: "Ana AC ve iki TRU beslemesi kayboldu.",
      },
      {
        task: "DC ESS ve AC STANDBY batarya kökünü doğrula.",
        check: (_, q) =>
          q.nodes.dcess.source === "battery" &&
          q.nodes.acstby.source === "battery",
        observation: "Batarya → Battery Bus → essential DC / static inverter.",
      },
    ],
    question: "Galley neden batarya üzerine aktarılmaz?",
    result:
      "Yük ve batarya kapasitesi sınırları nedeniyle yalnızca seçilmiş standby yolları vardır.",
  },
  {
    title: "Batarya dayanımını artır",
    goal: "Acil durumda yük ile tahmini süre ilişkisini ölç.",
    preset: "emergency",
    initial: "Ana AC yok · 40 Ah · %85",
    steps: [
      {
        task: "NAV Receiver yükünü OFF yap.",
        check: (s) => !s.loads.nav.on,
        observation: "200 W azalma anlık tahmini dayanımı artırır.",
      },
      {
        task: "Emergency Lighting yükünü OFF yap ve tüketimi 720 W altına indir.",
        check: (s, q) => !s.loads.emergency.on && q.battery.netWatts < 720,
        observation:
          "Bu yalnızca eğitim deneyi; gerçek essential yük seçimi tipe özgüdür.",
      },
    ],
    question: "Süre tahmini neden sabit bir dakika sayısı değil?",
    result: "Kalan Wh / güncel W hesabı her yük değişiminde yenilenir.",
  },
  {
    title: "AC bus kısa devresini izole et",
    goal: "Sağlam tarafı koruyarak fault isolation davranışını gözle.",
    preset: "normal",
    initial: "Normal flight · AUTO tie",
    steps: [
      {
        task: "AC BUS 1 SHORT enjekte et.",
        check: (s, q) =>
          s.faults.includes("ac1Short") &&
          !q.nodes.ac1.powered &&
          q.nodes.ac2.powered,
        observation: "GCB 1 ve tie arızalı bölgeyi ayırdı.",
      },
      {
        task: "Arızayı kaldır ve AC BUS 1 normal beslemesini doğrula.",
        check: (s, q) =>
          !s.faults.includes("ac1Short") && q.nodes.ac1.source === "gen1",
        observation:
          "Simülasyonda arıza kaldırıldıktan sonra sağlam besleme geri döner.",
      },
    ],
    question: "Tie ile arızalı bus üzerine transfer neden engellenmeli?",
    result: "Aksi hâlde sağlam jeneratör de kısa devre alanını besler.",
  },
  {
    title: "Cold & Dark geri kazanımı",
    goal: "Uçağı haricî güçle besle ve seçilmiş yükleri geri kazan.",
    preset: "cold",
    initial: "Bütün ana kaynaklar kapalı",
    steps: [
      {
        task: "BAT ON ile standby hattını kur.",
        check: (_, q) => q.nodes.batbus.source === "battery",
        observation: "İlk seçilmiş DC besleme kuruldu.",
      },
      {
        task: "Geçerli GPU kaynağını bağla ve EXT contactor kapat.",
        check: (_, q) => q.nodes.ac1.source === "ext",
        observation: "Ana AC ve TRU yolları kuruldu.",
      },
      {
        task: "Avionics, NAV ve iki Fuel Pump yükünü aç; şarjı doğrula.",
        check: (_, q) =>
          ["avionics", "nav", "fuelLeft", "fuelRight"].every(
            (id) => q.nodes[id].powered,
          ) && q.battery.mode === "CHARGING",
        observation:
          "Güç kaynağı, dönüşüm, yük ve enerji yenileme zinciri tamam.",
      },
    ],
    question: "Bir yük kapalı kalırsa bus geriliminden sonra ne incelenir?",
    result: "Yük anahtarı, circuit breaker ve yükün kendi arıza durumu.",
  },
];

export const CASES = [
  {
    title: "AC BUS 1 DEAD",
    complaint: "Sağ AC tarafı normal; sol ana AC voltmetresi 0 V.",
    faults: ["gen1Fail", "tieOpen"],
    answer: "GEN 1 kaybı ve transfer yolunun açık kalması",
    options: [
      "GEN 1 kaybı ve transfer yolunun açık kalması",
      "Yalnız TRU 1 arızası",
      "Yalnız batarya şarj cihazı arızası",
    ],
    hint: "AC BUS 2 gerilimini ve tie komut/gerçek durumunu karşılaştır.",
  },
  {
    title: "DC BUS 1 DEAD / AC NORMAL",
    complaint: "AC BUS 1 115 V; sol DC yükleri çalışmıyor.",
    faults: ["tru1Fail"],
    answer: "TRU 1 dönüşüm yolunun kaybı",
    options: [
      "TRU 1 dönüşüm yolunun kaybı",
      "GEN 2 aşırı frekans",
      "Hot Battery Bus arızası",
    ],
    hint: "TRU girişini ve çıkışını ayrı ölç.",
  },
  {
    title: "BOTH GENERATORS OFFLINE",
    complaint: "Ana AC yok, yalnız standby ve essential DC canlı.",
    faults: ["bothGen"],
    answer: "İki ana jeneratör kaybı; alternatif APU kaynağı gerekli",
    options: [
      "İki ana jeneratör kaybı; alternatif APU kaynağı gerekli",
      "İki NAV circuit breaker açık",
      "Yalnız Galley arızası",
    ],
    hint: "APU starter için Battery Bus ölçümü yap.",
  },
  {
    title: "BATTERY DISCHARGING",
    complaint: "İki AC kaynak normal olmasına rağmen batarya akımı pozitif.",
    faults: ["chargerFail"],
    answer: "Batarya şarj cihazı / şarj yolu kullanılamıyor",
    options: [
      "Batarya şarj cihazı / şarj yolu kullanılamıyor",
      "İki jeneratör aynı anda aşırı frekansta",
      "Hot Battery beslemesi kapalı",
    ],
    hint: "DC BUS 2 ve şarj girişinin kullanılabilirliğini karşılaştır.",
  },
  {
    title: "GENERATOR OVERLOAD",
    complaint: "GEN 1 yükü %100 üzerinde; koruma zamanlayıcısı ilerliyor.",
    faults: ["overload"],
    answer: "GEN 1 kapasitesine göre fazla talep, AUTO SHED kapalı",
    options: [
      "GEN 1 kapasitesine göre fazla talep, AUTO SHED kapalı",
      "Faz A ve B aynı fazda",
      "Batarya dolu olduğu için yük artıyor",
    ],
    hint: "Kaynak kapasitesini, yük tablosunu ve AUTO SHED anahtarını kontrol et.",
  },
  {
    title: "EXTERNAL POWER REJECTED",
    complaint: "GPU bağlı ve ON; EXT komutuna rağmen ana baralar enerjisiz.",
    faults: [],
    answer: "GPU frekansı kabul aralığının dışında",
    options: [
      "GPU frekansı kabul aralığının dışında",
      "Galley anahtarı OFF",
      "Batarya SOC yüksek",
    ],
    hint: "EXT PWR frekansını ölç; eğitim kabul aralığı 380–420 Hz.",
  },
  {
    title: "ESSENTIAL BUS UNPOWERED",
    complaint: "Ana DC baralar normal, DC ESS 0 V.",
    faults: ["essShort"],
    answer: "DC ESS kısa devre nedeniyle izole",
    options: [
      "DC ESS kısa devre nedeniyle izole",
      "İki motor durmuş",
      "Yalnız inverter kapalı",
    ],
    hint: "Sağlam üst beslemeler ile essential feeder izolasyonunu karşılaştır.",
  },
  {
    title: "BUS TIE WILL NOT CLOSE",
    complaint: "GEN 1 OFF; AUTO tie komutu var ama AC BUS 1 hâlâ 0 V.",
    faults: ["tieOpen"],
    answer: "Bus tie kontaktörü STUCK OPEN",
    options: [
      "Bus tie kontaktörü STUCK OPEN",
      "GEN 2 kapasitesi sıfır",
      "Batarya dolu",
    ],
    hint: "Tie için commanded ve actual durumlarını incele.",
  },
  {
    title: "CONTACTOR WILL NOT OPEN",
    complaint: "GCB 1 açma komutu verilmesine rağmen fiziksel kontak kapalı.",
    faults: ["gen1Closed"],
    answer: "GEN 1 kontaktörü STUCK CLOSED",
    options: [
      "GEN 1 kontaktörü STUCK CLOSED",
      "TRU 2 soğutması kapalı",
      "NAV yükü açık",
    ],
    hint: "GCB 1 komut/gerçek durum farkı ve upstream korumayı incele.",
  },
  {
    title: "INTERMITTENT GENERATOR",
    complaint: "GEN 1 düzenli aralıklarla ayrılıyor ve geri geliyor.",
    faults: ["intermittent"],
    answer: "GEN 1 aralıklı düşük gerilim koşulu",
    options: [
      "GEN 1 aralıklı düşük gerilim koşulu",
      "GPU kablosu bağlı",
      "Normal batarya şarjı",
    ],
    hint: "En az 12 simülasyon saniyesi gözle; gerilim ile olay zamanlarını karşılaştır.",
  },
];
export function caseState(index: number): State {
  let s = createState(index === 5 ? "cold" : "normal");
  for (const id of CASES[index].faults) s = act(s, { type: "fault", id });
  if (index === 4) s.autoShed = false;
  if (index === 5) {
    s.gpuCable = s.gpuOn = true;
    s.sources.ext.on = s.sources.ext.contactor = true;
    s.sources.ext.frequency = 330;
  }
  if (index === 7) s.sources.gen1.on = false;
  if (index === 8) s.sources.gen1.contactor = false;
  s.events = [
    {
      id: 0,
      time: 0,
      type: "info",
      text: `Teşhis oturumu: ${CASES[index].complaint}`,
    },
  ];
  s.nextEvent = 1;
  return s;
}

export interface Question {
  category: string;
  prompt: string;
  options?: string[];
  answer: string;
  explanation: string;
  demonstrate?: string;
}
const mc = (
  category: string,
  prompt: string,
  answer: string,
  distractors: string[],
  explanation: string,
  demonstrate?: string,
): Question => ({
  category,
  prompt,
  answer,
  options: [answer, ...distractors],
  explanation,
  demonstrate,
});
export const QUESTIONS: Question[] = [
  mc(
    "Kaynak",
    "Normal konfigürasyonda AC BUS 1 kaynağı hangisi?",
    "GEN 1",
    ["Batarya", "TRU 1"],
    "Motor jeneratörü GCB 1 üzerinden kendi AC barasını besler.",
  ),
  mc(
    "Tahmin",
    "GEN 1 FAIL, GEN 2 sağlıklı ve tie AUTO. AC BUS 1 ne olur?",
    "GEN 2 tarafından beslenir",
    ["Her durumda enerjisiz kalır", "TRU 1 AC üretir"],
    "Tie kapanır; GEN 2 karşı tarafa transfer sağlar.",
    "gen1Fail",
  ),
  mc(
    "Tahmin",
    "GEN 1 kayıp ve tie STUCK OPEN. AC BUS 1?",
    "Enerjisiz kalır",
    ["Bataryadan 115 V alır", "TRU 2 doğrudan AC üretir"],
    "Batarya ana AC baralarını beslemez; transfer yolu açık.",
  ),
  mc(
    "TRU",
    "TRU 1 girişi AC kaybederse ne olur?",
    "DC üretimi kesilir",
    ["28 V üretmeye devam eder", "400 Hz DC üretir"],
    "TRU enerji kaynağı değil dönüştürücüdür.",
  ),
  mc(
    "TRU",
    "AC BUS 1 normal, DC BUS 1 dead, DC tie OPEN. İlk inceleme?",
    "TRU 1 ve DC feeder",
    ["GEN 2 EGT", "Kabin aydınlatma rengi"],
    "Arıza dönüşüm veya DC dağıtım yolunda olabilir.",
    "tru1Fail",
  ),
  mc(
    "Batarya",
    "BAT OFF iken hangi bara doğrudan batarya beslemesini korur?",
    "Hot Battery Bus",
    ["AC BUS 1", "Ground Service Bus"],
    "Hot Battery hattı ana batarya kontaktörünü kullanmaz.",
  ),
  mc(
    "Batarya",
    "Batarya deşarj hızı hangi büyüklüğe bağlıdır?",
    "Sağladığı güç ve geçen süre",
    ["Yalnız simülasyon ekranı", "Yalnız frekans"],
    "Wh tüketimi W × saat integraliyle hesaplanır.",
  ),
  mc(
    "Standby",
    "Batarya DC enerjisini AC STANDBY için hangi bileşen dönüştürür?",
    "Static inverter",
    ["TRU", "IDG"],
    "Inverter DC → AC, TRU AC → DC dönüşümüdür.",
  ),
  mc(
    "Standby",
    "Tüm ana jeneratörler kayıp. Galley neden çalışmıyor?",
    "Ana AC beslemesi yok; standby yükü değil",
    ["Batarya yanlış renkte", "TRU AC üretemiyor çünkü yük az"],
    "Batarya yalnız seçilmiş kritik yolları taşır.",
    "bothGen",
  ),
  mc(
    "External",
    "115 V / 330 Hz GPU için beklenen sonuç?",
    "Bağlantı reddedilir",
    ["Normal bağlantı", "TRU frekansı otomatik 400 Hz yapar"],
    "Bu eğitim modelinde kabul aralığı 380–420 Hz.",
  ),
  mc(
    "External",
    "GPU ON fakat kablo ayrılmış. Uçağa enerji gelir mi?",
    "Hayır",
    ["Evet, kablosuz güç var", "Yalnız GEN 1 üzerinden"],
    "Fiziksel besleme yolu gerekli.",
  ),
  mc(
    "External",
    "Yanlış faz / faz kaybında contactor ne yapmalı?",
    "Açık kalmalı",
    ["Kaliteyi önemsemeden kapanmalı", "Bataryayı ayırmalı"],
    "Uyumsuz AC kaynağı kabul edilmez.",
  ),
  mc(
    "APU",
    "APU MASTER ON, Battery Bus dead. START sonucu?",
    "Starter başlatılamaz",
    ["APU anında %100 olur", "TRU kendi enerjisini üretir"],
    "Başlangıç için DC starter beslemesi gerekli.",
  ),
  mc(
    "APU",
    "APU RPM yükselirken generator neden hemen bağlanmaz?",
    "Kararlı hız ve kaynak kalitesi beklenir",
    ["Baranın rengi değişmelidir", "Batarya %100 olmalıdır"],
    "Bu modelde APU ≥ %95 ve geçerli 115 V / 400 Hz gerekli.",
  ),
  mc(
    "Bus tie",
    "İki jeneratör normal, AUTO tie neden açık?",
    "İzole bara işletimi için",
    ["İki jeneratör de arızalı", "DC üretimini durdurmak için"],
    "Bu mimari AC kaynakları paralellemez.",
  ),
  mc(
    "Bus tie",
    "CLOSED tie komutu ile iki kaynak mevcutsa ne olur?",
    "Interlock bir kaynak kontaktörünü açar",
    ["Senkronizasyon olmadan paralel olur", "Batarya TRU olur"],
    "Kaynak transferi break-before-make yaklaşımıyla basitleştirilmiştir.",
  ),
  mc(
    "Koruma",
    "Bilinen kısa devreli bus alternatif kaynağa bağlanmalı mı?",
    "Hayır, izole kalmalı",
    ["Evet, daha güçlü kaynak seçilmeli", "Sadece Galley açıksa"],
    "Fault isolation sağlam elektrik ağını korur.",
    "ac1Short",
  ),
  mc(
    "Koruma",
    "Tie STUCK CLOSED ve AC BUS 1 short birlikte olursa?",
    "Ortak alan upstream kaynaklardan izole edilir",
    ["GEN 2 kısa devreyi beslemeye zorlanır", "TRU kısa devreyi şarj eder"],
    "Yapışmış kontaktör bağımsız kaynak/feeder korumasını geçersiz kılamaz.",
  ),
  mc(
    "Yük atma",
    "Bu modelde ilk otomatik shed adayı hangisi?",
    "Galley",
    ["Flight Control Computers", "Fire Monitoring"],
    "Non-essential yükler, important ve essential yüklerden önce çıkarılır.",
  ),
  mc(
    "Yük atma",
    "Bir yük OFF yapılınca jeneratör akımı nasıl değişir?",
    "O kaynağın talebi ve akımı azalır",
    ["Daima artar", "Hiç değişmez"],
    "Üç faz akımı yaklaşık P / (3 × Vphase × PF).",
  ),
  mc(
    "Koruma",
    "Aşırı yük sınırını anlık aşmak mutlaka hemen trip midir?",
    "Hayır, bu modelde 5 s gecikme var",
    ["Evet, tüm arızalar aynı", "Koruma hiçbir zaman çalışmaz"],
    "Kısa devre hızlı izolasyon, termal aşırı yük gecikmeli korumadır.",
  ),
  mc(
    "CB",
    "NAV CB OPEN iken DC ESS 28 V. NAV durumu?",
    "Enerjisiz",
    ["Normal", "400 Hz üretir"],
    "Bara canlı olsa da yüke giden breaker yolu açık.",
  ),
  mc(
    "CB",
    "Yük short devam ederken CB reset ne yapar?",
    "Koruma tekrar bağlantıyı engeller",
    ["Arızayı onarır", "Batarya kapasitesini artırır"],
    "Gerçek reset prosedürleri onaylı dokümana bağlıdır.",
  ),
  mc(
    "IDG",
    "IDG kavramı neyi açıklıyor?",
    "Değişken motor hızından yaklaşık sabit jeneratör hızı",
    ["DC gerilimini AC bara yapmak", "Bataryanın Wh kapasitesi"],
    "Mekanik ayrıntılar modellenmez; modern mimariler değişebilir.",
  ),
  mc(
    "AC",
    "Üç faz arasındaki yaklaşık faz açısı?",
    "120°",
    ["90°", "360°"],
    "Dengeli üç faz A, B, C sinüsleri bir periyodu üçe böler.",
  ),
  mc(
    "AC",
    "115/200 V gösteriminde 200 V yaklaşık neyi ifade eder?",
    "Fazlar arası RMS gerilim",
    ["Batarya gerilimi", "Her fazın tepe gerilimi"],
    "Y bağlantıda VLL ≈ √3 × VLN; 115 × √3 ≈ 199 V.",
  ),
  mc(
    "Batarya",
    "Şarj cihazı arızalı, ana AC normal. Batarya akımı neden pozitif olabilir?",
    "Hot Battery yükleri enerji tüketmeye devam eder",
    ["Batarya mutlaka %100", "TRU AC tüketmez"],
    "Ana baralar canlı olsa bile şarj yolu ayrı incelenir.",
  ),
  mc(
    "Teşhis",
    "STUCK OPEN kontaktörde hangi fark belirleyicidir?",
    "CLOSED komutu, OPEN gerçek durumu",
    ["İki gerilimin de mutlaka 115 V olması", "APU sıcaklığı"],
    "Komut mekanik hareketin kanıtı değildir.",
  ),
  mc(
    "Teşhis",
    "GEN 2 yükü GEN 1 arızasından sonra neden artar?",
    "Tie üzerinden iki tarafı taşır",
    ["Batarya kapasitesi artar", "Frekans iki katına çıkar"],
    "Güç yolu ve yük toplamı aynı çözümden hesaplanır.",
    "gen1Fail",
  ),
  mc(
    "Standby",
    "Batarya enerjisi 0 Wh olursa standby ne olur?",
    "Başka geçerli besleme yoksa kaybolur",
    ["Sonsuza dek 28 V kalır", "TRU bedava enerji üretir"],
    "Kaynağı olmayan bus enerjisizdir.",
  ),
  {
    category: "Hesap · sayısal",
    prompt: "28 V DC yük 10 A çekiyor. Güç kaç W?",
    answer: "280",
    explanation: "P = V × I = 28 × 10 = 280 W.",
  },
  {
    category: "Hesap · sayısal",
    prompt: "600 W yük, 0,5 saat çalışıyor. Tüketim kaç Wh?",
    answer: "300",
    explanation: "E = P × t = 600 × 0,5 = 300 Wh.",
  },
  {
    category: "Hesap · sayısal",
    prompt: "24 V nominal, 40 Ah batarya. Nominal enerji kaç Wh?",
    answer: "960",
    explanation:
      "24 × 40 = 960 Wh; gerçek kullanılabilir enerji tipe ve koşullara bağlıdır.",
  },
  {
    category: "Hesap · sayısal",
    prompt: "Kalan enerji 600 Wh, sabit tüketim 1200 W. Dayanım kaç dakika?",
    answer: "30",
    explanation: "600 / 1200 = 0,5 saat = 30 dakika.",
  },
  {
    category: "Hesap · sayısal",
    prompt:
      "27 kW kullanılabilir kapasiteli kaynağın yükü 13,5 kW. Yük yüzdesi?",
    answer: "50",
    explanation: "13,5 / 27 × 100 = %50.",
  },
  {
    category: "Güç yolu · sıralama",
    prompt:
      "Normal sol DC güç yolunu virgülle sırala: DC BUS 1, GEN 1, TRU 1, AC BUS 1",
    answer: "GEN 1, AC BUS 1, TRU 1, DC BUS 1",
    explanation: "Kaynak → AC dağıtım → dönüşüm → DC dağıtım.",
  },
];

export const COMPONENTS = [
  [
    "Engine Generator",
    "Mekanik enerjiyi üç faz AC elektrik enerjisine dönüştürür.",
    "Motor tahriki",
    "115/200 V · 400 Hz AC",
    "Kararlı tahrik, GCU geçerli, GCB kapalı",
    "Tahrik kaybı, gerilim/frekans bozukluğu",
    "Normal AC beslemesi kaybolur; tie alternatifi seçilir.",
    "gen1",
  ],
  [
    "IDG / Constant-Speed Drive",
    "Değişken motor hızına rağmen yaklaşık sabit jeneratör hızı kavramı.",
    "Değişken motor devri",
    "Yaklaşık sabit tahrik hızı",
    "Eğitim kullanılabilirlik eşiği ≥ %55",
    "Tahrik / regülasyon kaybı",
    "400 Hz kalitesi bozulabilir; modern uçak mimarileri farklıdır.",
    "gen1",
  ],
  [
    "Generator Control Unit",
    "Kaynak kalitesini denetler ve koruma komutlarını üretir.",
    "Gerilim, frekans, faz ve yük ölçümleri",
    "Excitation / kontaktör izinleri",
    "108–122 V · 380–420 Hz eğitim bandı",
    "Kalite reddi / kontrol arızası",
    "Uygun olmayan kaynak ağdan ayrılır.",
    "gen1",
  ],
  [
    "Generator Contactor",
    "Jeneratörü kendi AC barasına bağlayan kontrollü feeder yolu.",
    "Jeneratör AC",
    "AC bus",
    "CLOSED komutu ve koruma izni",
    "STUCK OPEN / CLOSED / CONTROL FAILURE",
    "Komut ile gerçek kontak farklı olabilir.",
    "gcb1",
  ],
  [
    "Bus Tie Contactor",
    "Bir sağlam kaynağın iki ana AC tarafı beslemesini sağlar.",
    "Sağlam AC taraf",
    "Karşı taraf",
    "AUTO: iki kaynak varken OPEN",
    "STUCK OPEN / STUCK CLOSED",
    "Transfer kaybı veya izolasyon güçlüğü.",
    "tie",
  ],
  [
    "AC Bus",
    "AC enerjisini feeder ve yüklere dağıtan ortak düğüm.",
    "Geçerli AC kaynak yolu",
    "AC yükler / TRU",
    "Nominal 115 V faz-nötr RMS",
    "Bus short / feeder kaybı",
    "Arızalı bölüm izole edilir.",
    "ac1",
  ],
  [
    "DC Bus",
    "TRU çıkışını DC yüklere dağıtır.",
    "TRU veya seçilmiş DC tie",
    "28 V DC yükler",
    "Sağlıklı dönüşüm yolu",
    "DC short / feeder kaybı",
    "Yerel DC yükleri durur.",
    "dc1",
  ],
  [
    "Essential Bus",
    "Seçilmiş kritik sistemlere alternatif besleme sağlar.",
    "Öncelikli ve yedek kaynaklar",
    "Essential yükler",
    "AUTO transfer açık",
    "Transfer kaybı / bus short",
    "Alternatif kaynak bile short edilmiş barayı besleyemez.",
    "dcess",
  ],
  [
    "Battery",
    "DC enerjiyi depolar; standby ve Hot Battery yüklerini taşır.",
    "Şarj cihazı enerjisi",
    "22–26 V eğitim OCV modeli",
    "Enerji > 0 Wh",
    "Düşük SOC / batarya kaybı",
    "Standby dayanımı azalır veya kaybolur.",
    "battery",
  ],
  [
    "Battery Charger",
    "Uygun DC beslemeden batarya enerjisini yeniler.",
    "DC BUS 2",
    "500 W giriş, 450 W bataryaya",
    "BAT ON, sağlıklı kontaktör, SOC < %100",
    "Şarj yolu arızası",
    "Hot Battery tüketimi nedeniyle yavaş deşarj görülebilir.",
    "charger",
  ],
  [
    "Transformer Rectifier Unit",
    "AC gerilimi dönüştürür ve doğrultarak DC sağlar.",
    "115 V / 400 Hz AC",
    "28 V DC · %92 eğitim verimi",
    "TRU ON, AC var, soğutma yeterli",
    "Overtemperature / overload / giriş kaybı",
    "İlgili DC normal kaynağı kaybolur.",
    "tru1",
  ],
  [
    "Static Inverter",
    "Batarya yolundaki DC enerjiyi standby AC yapar.",
    "Battery Bus DC",
    "115 V / 400 Hz AC · %88 verim",
    "Normal AC yok; inverter ON",
    "Inverter failure",
    "DC ESS çalışırken AC STANDBY kaybolabilir.",
    "inverter",
  ],
  [
    "APU Generator",
    "Ana motorlardan bağımsız yardımcı AC kaynağı.",
    "APU kararlı devir",
    "115/200 V · 400 Hz",
    "APU MASTER, START, RPM ≥ %95, GEN ON",
    "Starter besleme / jeneratör arızası",
    "Alternatif AC kaynağı kullanılamaz.",
    "apu",
  ],
  [
    "External Power Receptacle",
    "Yerdeki GPU ile uçak elektrik ağı arasındaki bağlantı.",
    "Kabloyla gelen GPU AC",
    "Kalite denetimli AC feeder",
    "Yerde, kablo bağlı, GPU ON",
    "Kablo ayrılması / yanlış frekans / faz",
    "Kaynak reddedilir veya besleme kesilir.",
    "ext",
  ],
  [
    "Circuit Breaker",
    "Dal devresini aşırı akıma karşı korur ve ayırır.",
    "Bus beslemesi",
    "Tek yük devresi",
    "CLOSED ve arızasız yük",
    "OPEN / TRIPPED / yük short",
    "Yalnız ilgili yük kaybolabilir; gelişigüzel reset yapılmaz.",
    "cb-nav",
  ],
  [
    "Electrical Load",
    "Elektrik enerjisini işlevsel çıktıya dönüştüren tüketici.",
    "Uygun AC / DC bus",
    "Aydınlatma, pompa, hesaplama vb.",
    "Switch ON, CB CLOSED, besleme geçerli",
    "Açık devre / aşırı akım / kısa devre",
    "Kaynak talebi ve sistem kullanılabilirliği değişir.",
    "fuelLeft",
  ],
];
