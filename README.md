# Aircraft Electrical Power Lab

ATA 24 Interactive Training & Simulation Environment. Türkçe açıklamalar, standart İngilizce sistem adları. Backend gerektirmeyen React + TypeScript + Vite uygulaması.

**Simplified educational simulation. Not aircraft-specific. Not intended for real-world aircraft operation or maintenance.**

## Çalıştırma

Yayın adresi: [Aircraft Electrical Power Lab](https://muhammetarbag.github.io/aircraft-electrical-power-lab/).

Node.js ≥22.18 gerekir; yerel doğrulamada Node.js 26 kullanılır.

```sh
npm ci
npm run dev
```

Uygulama: `http://127.0.0.1:3024/`.

```sh
npm test
npm run format:check
npm run build
npm run preview
```

Tarayıcı testleri için ayrı terminalde çalışan dev veya preview sunucusu kullan:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-test.txt
.venv/bin/python -m playwright install chromium
LAB_URL=http://127.0.0.1:3024/ .venv/bin/python tests/browser_check.py
```

## Denemeye başla

1. Normal Flight açılışında GEN 1 ve GEN 2 kendi AC baralarını besler. Şemadaki bus veya kontaktöre tıkla.
2. **GEN 1 FAIL** ile kaybı oluştur; Left Fuel Pump seç ve `GEN 2 → AC BUS 2 → BUS TIE → AC BUS 1 → TRU 1 → DC BUS 1 → Left Fuel Pump` yolunu incele.
3. **TIE STUCK OPEN** deneyinde aynı transferin neden gerçekleşmediğini ölç.
4. **TOTAL AC LOSS** ile batarya / inverter beslemesini ve yük azaltınca artan dayanımı gözle.
5. **Rehberli deneyler** bölümündeki 12 deneyin adımlarını canlı koşullarla doğrula.

14 modül, 10 teşhis vakası, 36 soru (çoktan seçmeli, sayısal, sıralama ve önce tahmin et/sonra göster), iki canlı sistem görevi ve 16 bileşen açıklaması vardır. Quiz/lab/görev ilerlemesi ve görselleştirme seviyesi localStorage içinde saklanır. Deney notu kutusu oturumluk çalışma alanıdır. Dosya dışa aktarma yalnız yerel olay kaydı içindir.

## Ağ modeli

- `src/sim/types.ts`: ortak durum, komut ve çözüm tipleri.
- `src/sim/catalog.ts`: kaynak/bus/yük isimleri, 14 yük ve 34 arıza seçeneği.
- `src/sim/engine.ts`: yönlü grafik, kaynak interlock, güç yolu traversal, ters yönde yük/kayıp hesabı, koruma ve enerji integrali.
- `src/content.ts`: canlı koşullu deneyler, teşhis başlangıçları ve soru bankası.
- `src/components/`: şema, ölçüm araçları, kontroller ve öğrenme panelleri.
- `src/App.tsx`: tek sistem durumu, zaman kontrolü, navigasyon ve ilerleme.

Her enerjili düğüm `source`, `path` ve `edgePath` taşır. Animasyon yalnız çözücü tarafından aktif kabul edilen edge üzerinde yürür. Şemaya çizilmeyen yükler de aynı grafiğin gerçek düğümleridir; yük adına tıklayınca tam yol Inspector içinde görülür. Normal kaynak terminal gerilimi, GCU kalite reddinde dahi ölçülebilir; reddedilen kaynak downstream besleme sağlayamaz.

İlk aşamada kaynak/feeder interlock koşulları grafiği kurar. Traversal AC dağıtım, dönüşüm, DC dağıtım, standby ve yük yollarını çözer. Yükten kök kaynağa geri gidilerek dönüşüm kayıpları dahil giriş gücü toplanır. AUTO SHED, kapasiteyi aşan ilgili kaynaktaki non-essential yükleri, ardından important yükleri sırasıyla çıkarıp grafiği yeniden çözer. Essential yükler otomatik atılmaz; remaining overload 5 simülasyon saniyesi sürerse kaynak koruması trip eder.

## Açık eğitim varsayımları

| Konu | Model |
| --- | --- |
| AC | 115 V faz-nötr RMS, ≈200 V faz-faz, 400 Hz, dengeli üç faz |
| AC akımı | `P / (3 × Vphase × 0.9)`; standby instruments tek faz kabul edilir |
| DC | TRU çıkışı 28 V; `I = P / V` |
| Kaynaklar | Motor jeneratörü 30 kVA, APU 45 kVA, GPU 60 kVA; ayarlanabilir, PF 0.90 |
| Kalite bandı | 108–122 V ve 380–420 Hz; faz koşulu sağlanmalı |
| Öncelik | Motor jeneratörü → yerde geçerli GPU → APU; seçilmiş standby için batarya |
| AC tie | İki jeneratör normalde ayrı; CLOSED komutunda ikinci kaynak interlock ile açılır. Senkron paralelleme yok |
| DC tie | Normalde OPEN. AUTO/CLOSED yalnız tek TRU kaldığında alternatif DC transfer yapar; TRU paralelleme yok |
| Essential | AC ESS: AC1→AC2; AC STANDBY: AC ESS→inverter. DC ESS: DC1→DC2→Battery Bus |
| Battery Bus | Normal DC2 veya DC1 öncelikli; bunlar yoksa batarya kontaktörü |
| Hot Battery | Ana BAT switch ve kontaktörden bağımsız doğrudan sigortalı hat |
| Batarya | 24 V × 40 Ah = 960 Wh başlangıç kapasitesi; başlangıç SOC %85. `E -= netW × dt / 3600` |
| Batarya gerilimi | `22 + 4 × SOC_fraction` V açık devre yaklaşımı; 0,012 Ω eğitim katsayısıyla yüke bağlı terminal gerilimi. Wh durumu kullanılabilir terminal enerjisidir; kimya modeli yok |
| Şarj | DC BUS 2 üzerinden 500 W giriş, %90 verimle 450 W; ana BAT yolu sağlıklı ve SOC <%100 |
| TRU | %92 sabit verim; 5 kW çıkış kapasitesi; ≥110 °C veya >5 kW / 5 s kilitli trip |
| Inverter | %88 sabit verim; normal AC kaybında Battery Bus üzerinden 115 V / 400 Hz |
| APU start | Battery Bus üzerinden 2 kW starter, +%5 RPM/s, ≥%95 kullanılabilir. Self-sustaining hızdan önce besleme kaybıyla yavaşlar |
| Motor / IDG | Elektrik kullanılabilirliği için RPM ≥%55; kararlı 12.000 rpm 4 kutuplu IDG kavramı. Pneumatic/combustion start modeli yok |
| Kısa devre | Nitel yüksek arıza akımı algılama ve anlık bus/feeder izolasyonu; kA / empedans / ark hesabı yok |
| Yapışmış kontaktör | Mekanik durum CLOSED kalır; bağımsız upstream kaynak/feeder koruması kötü beslemeyi keser |
| Zaman | 0,2 s veya daha küçük sabit alt adımlar; 0.5×–10× hız; PAUSE enerji, termal ve zaman evrimini dondurur. Öğrenci anahtar değişiklikleri duraklatılmış modelde de çözülebilir |
| Grafikler | Son 240 gerçek simülasyon örneği. Dalga/hesap tezgâhları ayrı ve açıkça kavramsal; uçak kaynak ayarlarını değiştirmez |

Bus short kaldırıldığında bu mantıksal model sağlıklı bus beslemesini otomatik yeniden seçer. Yük CB trip, TRU thermal/overload trip ve generator overload trip kilitlidir; arıza/sıcaklık giderildikten sonra ayrı eğitim reseti gerekir. Bu davranış uçak tipine ait gerçek reset prosedürü değildir.

Kaynak transferi bir mantıksal adımda hesaplanır; milisaniyelik gerilim kesintileri / gerçek kontaktör geçiş süreleri modellenmez. Şarj cihazı kontrol devreleri, excitation kayıpları ve uçak genelindeki model dışı yükler dahil değildir. Batarya tahmini sabit anlık yüke dayanır; sertifikalı dayanım değeri değildir.

## Kaynaklar

- [DLA ASSIST: Aircraft Transformer-Rectifier power supplies](https://quicksearch.dla.mil/qsDocDetails.aspx?ident_number=18367): 115/200 V, 400 Hz AC uçak sistemi beslemesinin DC'ye dönüşümü için genel çerçeve.
- [FAA: Electric Power Systems](https://www.faa.gov/aircraft/air_cert/step/disciplines/electric_power): uçak güç üretimi ve enerji depolaması çalışma alanı.

Bu kaynaklar yukarıdaki seçilmiş sayısal eğitim limitlerini veya kontaktör mimarisini onaylıyor şeklinde yorumlanmamalıdır.

## GitHub Pages

`npm run build` statik çıktıyı `dist/` altında üretir. `base: './'`, yerel fontlar ve `.nojekyll` sayesinde hem kökte hem repo alt yolunda çalışır. İnternet fontu veya backend isteği yoktur.

Bağımsız repo olarak yayınlanırken `.github/workflows/pages.yml` test, format, typecheck, build ve Chromium UI doğrulamasını deploy önüne koyar. GitHub repository **Settings → Pages → Source: GitHub Actions** seçili olmalıdır. Workflow `codex/aircraft-electrical-power-lab` push veya manuel `workflow_dispatch` ile çalışır. Yayın, doğrulama işi başarıyla tamamlandıktan sonra GitHub Pages ortamına yapılır.

## Doğrulama

`tests/model.test.ts` elektrik güvenilirliği ve enerji bilançosunu; `tests/content.test.ts` tüm 12 lab'ın gerçek kontrol dizileriyle tamamlanmasını ve 10 vaka belirtisini doğrular. `tests/browser_check.py` sadece canlı UI üzerinden yazma yapar; `window.readElectricalState()` salt okunur ölçüm anlık görüntüsü sunar. Ekran görüntüleri, dışa aktarılan olay kaydı ve JSON raporu `artifacts/` altında oluşur ve Git'e dahil edilmez.
