# VardiyaCep v1.7 — Tahmini Vardiya

Bu sürüm, yeni ayın Excel dosyası henüz yüklenmediyse seçili personelin son iki gerçek ayındaki vardiya düzenini analiz ederek yalnızca bir sonraki ay için tahmini program üretir.

- Tahmin, tekrar eden vardiya döngüsünü 2–16 gün aralığında arar.
- Yeterli örüntü yoksa tahmin göstermez.
- Tahmini günler `~` işaretiyle gösterilir ve yüzde örüntü uyumu belirtilir.
- Yeni ayın gerçek Excel'i yüklendiğinde tahmini günler otomatik olarak gerçek kayıtlarla değiştirilir.
- Tahmini vardiya hatırlatmalarında “Tahmine göre” ibaresi bulunur.
- Takvim `.ics` aktarımında tahmini günler `TAHMİN` etiketiyle eklenir.
- Ağustos, Eylül ve diğer yüklenmiş aylar cihazda korunmaya devam eder.

GitHub'a `app.js`, `index.html` ve `service-worker.js` dosyalarını yükleyip Commit changes yapın.
