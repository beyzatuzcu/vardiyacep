# VardiyaCep 1.2 — Ay düzeltmesi

Bu sürüm, Excel hücrelerinin ham tarih değeri yanlış bir ayı gösterse bile dosya adındaki ayı ve üst satırdaki haftanın günlerini karşılaştırır.

Örnek dosyada ham Excel tarihleri Mart 2026 olarak kayıtlıydı; ancak dosya adı AĞUSTOS ve gün sırası 1 Ağustos 2026 Cumartesi ile uyumluydu. Uygulama artık takvimi otomatik olarak Ağustos 2026'ya düzeltir.

GitHub'a en az şu üç dosyayı yükleyip eskilerinin üzerine yazın:
- `app.js`
- `index.html`
- `service-worker.js`

Yükledikten sonra iPhone uygulamasını tamamen kapatıp yeniden açın ve Excel'i tekrar seçin.
