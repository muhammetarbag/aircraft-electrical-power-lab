# Doğrulama raporu — 2026-09-08

Bu rapor ilk sürümün yerel kalite kontrolünü kaydeder. Yayın adresi: [Aircraft Electrical Power Lab](https://muhammetarbag.github.io/aircraft-electrical-power-lab/). GitHub CI/deploy sonuçları [Actions](https://github.com/muhammetarbag/aircraft-electrical-power-lab/actions) üzerinden izlenebilir.

## Gözlenen ortam

- Node.js `v26.8.1`, npm `12.0.0`.
- React `19.2.8`, TypeScript `5.9.3`, Vite `8.2.2`.
- Playwright `1.62.0`, gerçek headless Chromium; 1600×1100 masaüstü ve 390×844 mobil/touch context.
- Tek ajanla yerel uygulama ve doğrulama. Test Python ortamı: komşu `radio-navigation-lab/.venv/bin/python` içindeki mevcut Playwright; bu ortama değişiklik yapılmadı. Bağımsız kurulumu `requirements-test.txt` tanımlar.

## Sonuçlar

| Kontrol | Sonuç |
| --- | --- |
| `npm test` | **60/60 geçti** |
| 12 rehberli lab'ın gerçek komut dizileriyle tamamlanması | **12/12 geçti**, test toplamına dahil |
| 10 teşhis vakasının başlangıç belirtisi | **10/10 doğrulandı**, içerik testine dahil |
| `npm run format:check` | Geçti |
| `npm run build` | TypeScript ve üretim derlemesi geçti |
| Üretim UI, `tests/browser_check.py` | **79/79 geçti** |
| 14 modülün masaüstü ve mobil sayfa sınırları | Sayfa düzeyinde yatay taşma yok |
| JavaScript console / page errors | **0** |
| Yerel kök URL | `http://127.0.0.1:3024/`, HTTP 200 |
| Üretim alt yol kontrolü | `http://127.0.0.1:3025/aircraft-electrical-power-lab/` üzerinde tamamlandı |
| HTML referanslı JS, CSS ve favicon | HTTP 200; `dist/` ile SHA-256 birebir aynı |
| Üretim çıktı büyüklüğü | Yaklaşık 872 KiB; yerel fontlar dahil |

`artifacts/browser-results.json` 79 kontrolün tek tek sonuçlarını, `artifacts/asset-check.json` HTML asset doğrulamasını içerir. Görüntüler `artifacts/desktop.png`, `artifacts/mobile.png` ve `artifacts/transfer.png` altındadır. Bu üretilmiş dosyalar Git'e alınmaz. Alt yol sunucusu doğrulama içindir; GitHub Pages yayını değildir.

## Doğrulanan davranışlar

- Cold & Dark, Hot Battery, ana BAT kontaktörü, gerçek deşarj/şarj, zaman içinde enerji tükenmesi ve yüke bağlı terminal gerilimi.
- Geçerli GPU bağlantısı; kablo/yerde/anahtar koşulları; 330 Hz, yüksek/düşük gerilim ve faz kalitesi reddi. Kaynak reddedilse de gerçek terminal kalitesi probla ölçülür.
- APU starter besleme koşulu, hızlanma ve GPU→APU transferi. Motor tahrik eşiği, GEN excitation ve kontaktör kontrolü.
- GEN 1 kaybında GEN 2→tie→TRU 1→sol DC yük yolu; tie OPEN / STUCK OPEN ile transfer kaybı.
- CLOSED tie ile AC kaynaklarının paralellenmesini önleyen interlock. Kaynak kontaktörü yapışsa bile upstream koruma. STUCK CLOSED tie + bus short durumunda ortak AC bölgenin izolasyonu.
- TRU kaybı, isteğe bağlı DC transfer, DC bus short izolasyonu, essential short üzerinde batarya ile hatalı yeniden beslemenin engellenmesi.
- Non-essential önce load shedding; essential korunması; 5 saniyelik gecikmeli generator overload trip; TRU soğutma ve thermal trip.
- CB OPEN yükü keser, short sürerken reset engellenir, arıza giderildikten sonra kilitli CB geri kazanılır.
- Pause / step / 0.5×–10× zaman; gerçek telemetry geçmişi; olay kaydı dışa aktarma ve temizleme.
- Dalga ve hesap kontrolleri; lab koşulu sağlanmadan adım ilerlememesi; quiz sayısal ve çoktan seçmeli değerlendirme; localStorage kalıcılığı.
- Sol pompaya güç verme ve sağlam beslemeyi koruyarak arızayı izole etme görevlerinin gerçek kontrollerle tamamlanması ve puanlanması.
- Klavyeden SVG kontaktör seçimi, şema yakınlaştırması, mobil menü/kontroller ve yalnız diyagramın kendi içinde yatay kaydırılması.

## Kapsam ve sınırlar

Bu bir yönlü mantıksal dağıtım ağıdır; onaylı uçak prosedürü, SPICE, jeneratör elektromanyetiği, AC senkronizasyon, elektrokimyasal batarya veya kısa devre empedans modeli değildir. Kaynak önceliği ve değerler README'de açık eğitim varsayımı olarak belgelenmiştir. Güç kayıpları TRU/inverter ve şarj veriminde hesaba katılır; batarya Wh durumu kullanılabilir terminal enerjisini temsil eder.

Kaynak transferleri mantıksal çözüm adımında gerçekleşir. Olay zinciri replay ayrı bir görselleştirmedir; fiziksel kontaktör zaman sabiti iddiası yoktur. Dalga/hesap tezgâhları kavramsal denetimlerdir ve uçak kaynağını gizlice değiştirmez.

GitHub Pages workflow'u model/içerik testlerini ve üretim Chromium doğrulamasını deploy önüne koyar. Bu yerel raporun kapsamına ek olarak canlı URL ve ana sayfa bağlantısı yayın sırasında doğrulanır.
