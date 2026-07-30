# VardiyaCep – GitHub Pages ve iPhone Kurulumu

## 1. GitHub'a yükleme

1. GitHub hesabınızda sağ üstteki **+** menüsünden **New repository** seçin.
2. Depo adını `vardiyacep` yazın.
3. Uygulama personel vardiya verisi işleyeceği için tercihen **Private** seçin. Not: GitHub Pages erişimi planınıza/kurum ayarınıza göre herkese açık olabilir. Kurumsal veri için şirket içi HTTPS sunucusu daha güvenlidir.
4. **Create repository** düğmesine basın.
5. Depoda **Add file → Upload files** seçin.
6. Bu klasördeki dosyaların tamamını yükleme alanına bırakın. ZIP dosyasını değil, ZIP içinden çıkan dosyaları yükleyin.
7. **Commit changes** düğmesine basın.

## 2. GitHub Pages'i açma

1. Depoda **Settings → Pages** bölümüne girin.
2. **Build and deployment** altında **Source: Deploy from a branch** seçin.
3. Branch olarak **main**, klasör olarak **/(root)** seçin.
4. **Save** düğmesine basın.
5. Pages ekranında oluşan `https://KULLANICI-ADINIZ.github.io/vardiyacep/` bağlantısını açın.

## 3. iPhone'a uygulama gibi kurma

1. Bağlantıyı iPhone'da **Safari** ile açın.
2. **Paylaş** simgesine dokunun.
3. **Ana Ekrana Ekle** seçeneğine dokunun.
4. **Web Uygulaması Olarak Aç** seçeneği görünüyorsa açık bırakın.
5. **Ekle** düğmesine dokunun.

## 4. Excel'i kullanma

1. Ana ekrandaki **VardiyaCep** simgesini açın.
2. **Excel Seç** alanından aylık `.xlsx` dosyasını seçin.
3. Personeli sicil veya ad-soyad ile bulun.
4. **Takvime Aktar** seçeneğiyle vardiyaları iPhone Takvim'e ekleyin ve alarm iznini onaylayın.

## Bildirim notu

iPhone'da uygulama kapalıyken yalnızca sayfa içindeki JavaScript zamanlayıcısının her gün çalışması garanti değildir. Bu nedenle vardiya hatırlatmaları için **Takvime Aktar** özelliği kullanılmalıdır. Takvim alarmı, “yarın sabahçısın” benzeri uyarıyı iPhone'un kendi sistemi üzerinden verir.

## Gizlilik

Bu dağıtım paketinde gerçek personel verisi bulunmaz. Excel dosyası tarayıcı içinde işlenir ve uygulama tarafından bir sunucuya yüklenmez. Ancak GitHub deposuna aylık vardiya Excel'ini kesinlikle yüklemeyin; dosyayı yalnızca telefondan uygulamanın içine seçin.
