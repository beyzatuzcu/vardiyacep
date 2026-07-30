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

## Telefona kurulum

Uygulamanın bildirim ve çevrimdışı özellikleri için klasörü **HTTPS adresinde** yayınlayın.

### En kolay yayınlama

1. `VardiyaCep` klasörünü bir statik site hizmetine yükleyin. `netlify.toml` hazırdır; klasör doğrudan sürüklenip bırakılabilir.
2. Oluşan bağlantıyı telefonda açın.
3. Android/Chrome: menüden **Ana ekrana ekle / Uygulamayı yükle** seçin.
4. iPhone/Safari: **Paylaş → Ana Ekrana Ekle** seçin.
5. Uygulamada Excel’i yükleyin, personeli seçin ve Hatırlatıcı bölümünden bildirim izni verin.

## Bildirim notu

Telefonun güç tasarrufu veya tarayıcı kısıtları, web bildirimlerinin uygulama tamamen kapalıyken tam saatinde çalışmasını sınırlayabilir. Bu nedenle Hatırlatıcı ekranındaki **Takvim dosyasını indir (.ics)** seçeneği de eklenmiştir. Dosyayı telefon takvimine eklediğinizde alarmı işletim sistemi verir.

## Excel formatı

Uygulama şu alanları arar:

- `Sicil` veya `Personel No`
- `Adı Soyadı` veya `Çalışanın Adı`
- Excel tarihi olarak girilmiş günlük sütunlar

İsteğe bağlı alanlar: `Fiili Görevi`, `Ekip`, `Gerçek Ünvanı`, `Birim`, `Kalan İzin`.

Paketin içindeki `ornek-vardiya.xlsx`, kullanıcı tarafından sağlanan örnek dosyanın kopyasıdır.
