# VardiyaCep

VardiyaCep, aylık `.xlsx` vardiya dosyasını telefonda kişi bazlı programa dönüştüren kurulabilir bir web uygulamasıdır (PWA).

## Hazır özellikler

- Excel içe aktarma: `Sicil`, `Adı Soyadı` ve tarih sütunlarını otomatik bulur.
- Personel arama: ad, sicil, ekip ve görev ile arama yapılır.
- Günlük özet: bugün ve yarın vardiyası gösterilir.
- Aylık takvim: Sabah, Akşam, Gece, İzin ve Yıllık İzin renklerle ayrılır.
- Vardiya kodu ayarı: S, A, G, I, Y ve kurumunuza özel kodlar düzenlenebilir.
- Bildirim: “Yarın sabahçısın” benzeri tarayıcı bildirimi verir.
- Takvim aktarımı: `.ics` dosyası üretir; telefonun kendi takvimine alarm eklenebilir.
- Gizlilik: Excel dosyası tarayıcıda işlenir, bir sunucuya gönderilmez.
- Çevrimdışı kullanım: İlk açılıştan sonra uygulama dosyaları önbelleğe alınır.

## Excel formatı

Uygulama şu alanları arar:

- `Sicil` veya `Personel No`
- `Adı Soyadı` veya `Çalışanın Adı`
- Excel tarihi olarak girilmiş günlük sütunlar

İsteğe bağlı alanlar: `Fiili Görevi`, `Ekip`, `Gerçek Ünvanı`, `Birim`, `Kalan İzin`.

Paketin içindeki `ornek-vardiya.xlsx`, kullanıcı tarafından sağlanan örnek dosyanın kopyasıdır.
