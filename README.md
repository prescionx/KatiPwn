# 🐦⚡ KatiPwn

**katiponline.com** klavye hız testi için geliştirilmiş bir Tampermonkey userscript'idir. Oyun sonunda sunucuya gönderilen sonuç isteklerini yakalar, engeller ve kendi belirlediğin değerlerle sahte sonuçlar göndermenizi sağlar.

> **Kısaca:** Klavye hız testi sonuçlarını manipüle eden gelişmiş bir otomasyon aracı.

---

## 📸 Ekran Görüntüleri

### Ana Kontrol Paneli
![Ana Panel](https://github.com/user-attachments/assets/d3e009d3-515f-425f-a80e-c3a740982954)

### Birinciliğe Yerleş — Onay Ekranı
![Birinciliğe Yerleş Onay](https://github.com/user-attachments/assets/6a6f2cff-e31e-4fbf-afcf-62f068c2a9a7)

### Bağlantı Koptu Ekranı
![Bağlantı Koptu](https://github.com/user-attachments/assets/4c08a018-6390-414f-87b0-42ae20fb9bd1)

---

## 📖 Detaylı Açıklama

### Mimari Yapı

KatiPwn tek bir dosyadan (`userscript.js`) oluşur ve iki ana bileşen içerir:

| Bileşen | Görev |
|---------|-------|
| **GhostKernel** | Ana sayfada çalışır. Ağ isteklerini (XHR & Fetch) yakalar, engeller, token yönetimi yapar ve popup ile `postMessage` üzerinden iletişim kurar. |
| **UIManager** | Popup pencereyi (900×800) render eder. Kullanıcı arayüzü, form alanları, lider tablosu ve tüm kontrol elemanlarını içerir. |

**İletişim akışı:**
```
Ana Sayfa (GhostKernel)  ←──postMessage──→  Popup Pencere (UIManager)
```

### Ağ Yakalama (Network Interception)

Script, tarayıcının `XMLHttpRequest` ve `Fetch API`'sini hook'layarak tüm ağ trafiğini izler:

- **`sonuckaydet.php`** adresine giden POST istekleri tespit edilir
- Bloklayıcı açıkken bu istekler engellenir (sunucuya ulaşmaz)
- Engellenen istekler yerine kullanıcının belirlediği sahte verilerle yeni istek gönderilir
- `X-Bypass-Interceptor: true` header'ı ile script'in kendi gönderdiği istekler tekrar yakalanmaz

### Token Sistemi

Her oyun başladığında site `islemler.php?islem=calisma_baslat` adresine istek atar ve bir `calisma_token` döner. Script bu token'ı otomatik olarak yakalar ve saklar. Manuel olarak da "TOKEN İSTE" butonu ile yeni token alınabilir.

```
POST islemler.php → islem=calisma_baslat → calisma_token alınır
```

### Payload (Veri) Yapısı

Sunucuya gönderilen sahte sonuçlar şu alanlardan oluşur:

| Alan | Açıklama | Örnek |
|------|----------|-------|
| `calisma_token` | Oturum token'ı | `abc123xyz` |
| `dogru` | Doğru kelime sayısı | `360` |
| `yanlis` | Yanlış kelime sayısı | `0` |
| `sure` | Süre (dd:ss formatı) | `01:00` |
| `saniyebilgisi` | Süre (saniye) | `60` |
| `dtv` | Doğru tuş vuruşu (doğru × 6) | `2160` |
| `ytv` | Yanlış tuş vuruşu (yanlış × 6) | `0` |
| `yarisma_puani` | Yarışma puanı | `360` |

### Profil Presetleri (Hızlı Ayar)

Tek tıkla hazır değerler yükleyen 3 preset:

| Preset | Kelime | Süre | DTV |
|--------|--------|------|-----|
| **1 DK** | 360 | 01:00 (60 sn) | 2160 |
| **3 DK** | 1080 | 03:00 (180 sn) | 6480 |
| **5 DK** | 1800 | 05:00 (300 sn) | 10800 |

### 🏆 Birinciliğe Yerleş

6 adımlı otomatik sıralama yükseltme özelliği. Her adımda yeni token alınır ve skor gönderilir:

| Adım | Kategori | Kelime | Süre | Tür |
|------|----------|--------|------|-----|
| 1 | 1 DK | 360 | 60 sn | Normal |
| 2 | 3 DK | 1080 | 180 sn | Normal |
| 3 | 5 DK | 1800 | 300 sn | Normal |
| 4 | 1 DK | 1800 | 300 sn | **Boost** |
| 5 | 3 DK | 1800 | 300 sn | **Boost** |
| 6 | 5 DK | 1800 | 300 sn | **Boost** |

> **Boost turları:** 5 dakikalık skor verilerini (1800 kelime) tüm süre kategorilerine gönderir.

### Lider Tablosu

"BİRİNCİLERİ GETİR" butonu ile 1DK, 3DK ve 5DK kategorilerinde birinciler çekilir ve gösterilir. Eğer giriş yapan kullanıcı listedeyse kendi skoru da gösterilir.

### Kullanıcı Profili Algılama

Script, katiponline.com sayfasındaki DOM elementlerinden kullanıcı adı, e-posta ve profil fotoğrafını otomatik olarak tespit eder ve popup'ta gösterir.

### Bağlantı Takibi (Heartbeat)

Popup pencere ile ana sayfa arasında 3 saniyede bir PING/PONG sinyali gönderilir. 10 saniye boyunca yanıt alınmazsa "Bağlantı Koptu" ekranı gösterilir ve yeniden bağlanma seçeneği sunulur.

### Bildirim Sistemi

Sağ üst köşede 4 saniye süren toast bildirimler gösterilir:
- **Yeşil:** Başarılı işlemler
- **Kırmızı:** Hata durumları
- **Gri:** Bilgi mesajları

---

## 🔧 Tüm Özellikler

| Özellik | Açıklama |
|---------|----------|
| **Ağ İstek Yakalama** | XHR & Fetch API hook'layarak tüm istekleri izler |
| **İstek Bloklama** | `sonuckaydet.php` isteklerini engeller |
| **Otomatik Gönderim** | Engellenen istek yerine sahte veri otomatik gönderir |
| **Manuel Gönderim** | Form üzerinden özel değerlerle istek gönderir |
| **Token Yönetimi** | Oturum token'ını otomatik yakalar veya manuel ister |
| **Profil Presetleri** | 1DK / 3DK / 5DK tek tıkla hazır değer yükler |
| **Birinciliğe Yerleş** | 6 adımlı otomatik sıralama yükseltme |
| **Lider Tablosu** | Tüm kategorilerde birincileri gösterir |
| **Ağ İzleme Geçmişi** | Yakalanan istekleri listeler, detay modalı açar |
| **Kullanıcı Algılama** | Kullanıcı adı, e-posta ve fotoğraf otomatik tespit |
| **Bağlantı Takibi** | PING/PONG heartbeat ile kopma algılama |
| **Bildirim Sistemi** | Toast tarzı başarı/hata/bilgi bildirimleri |
| **Klavye Kısayolu** | `Shift+K` ile kontrol panelini açar |
| **Otomatik Güncelleme** | Tampermonkey üzerinden GitHub'dan otomatik güncellenir |

---

## 📥 Kurulum

### 1. Tampermonkey'i Kur

| Tarayıcı | Link |
|-----------|------|
| Chrome | [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) |
| Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |

### 2. Script'i Yükle

1. Bu repodaki **`userscript.js`** dosyasını aç.
2. Dosyanın içindeki **tüm kodu kopyala** (Ctrl+A → Ctrl+C).
3. Tarayıcında **Tampermonkey simgesine** tıkla → **"Yeni Script Oluştur"** seçeneğine bas.
4. Açılan editördeki her şeyi sil, kopyaladığın kodu **yapıştır** (Ctrl+V).
5. **Ctrl+S** ile kaydet.

> **Otomatik Güncelleme:** Script yüklendikten sonra Tampermonkey, GitHub'daki en son sürümü otomatik olarak kontrol eder ve günceller. `@updateURL` ve `@downloadURL` metadata'ları bu özelliği sağlar.

### 3. Kontrol Et

- Tampermonkey simgesine tıkla.
- **"KatiPwn"** yazısını ve yanında **açık/kapalı** toggle'ını görmelisin.
- Açık (yeşil) olduğundan emin ol.

---

## 🎮 Nasıl Kullanılır

### Adım 1: Siteye Git
Tarayıcından **[katiponline.com/klavye-hiz-testi](https://katiponline.com/klavye-hiz-testi/)** adresine git.

### Adım 2: Kontrol Panelini Aç
Sayfanın sol alt köşesinde **"KatiPwn (Shift+K)"** butonuna tıkla veya **Shift+K** kısayolunu kullan. Yeni bir popup pencere açılacak.

### Adım 3: Bloklayıcıyı Aç
Kontrol panelinde **"BLOKLAYICI"** anahtarını aç. Bu, oyun bittiğinde gerçek sonuçların sunucuya gitmesini engeller.

### Adım 4: Değerlerini Ayarla
Profil presetlerinden birini seç (1DK / 3DK / 5DK) veya form alanlarını manuel olarak doldur.

### Adım 5: Oyunu Başlat ve Bitir
Siteye dön ve klavye hız testini başlat. Oyunu normal şekilde oyna veya bekle.

### Adım 6: Sonuçları Gönder
- **Manuel:** "BU VERİLERLE GÖNDER" butonuna bas.
- **Otomatik:** OTO-GÖNDER açıkken oyun bittiğinde otomatik gönderilir.
- **Birinciliğe Yerleş:** 🏆 butonu ile tüm kategorilerde otomatik skor gönderilir.

---

## 🤔 Sıkça Sorulan Sorular

**S: Tampermonkey nedir?**
C: Tarayıcına ekstra JavaScript kodu çalıştırmanı sağlayan bir eklenti. Chrome, Firefox, Edge gibi tarayıcılarda çalışır.

**S: Script otomatik güncelleniyor mu?**
C: Evet. Tampermonkey, `@updateURL` sayesinde GitHub'daki en son sürümü periyodik olarak kontrol eder ve otomatik günceller.

**S: Banlanır mıyım?**
C: Site sahipleri anormal sonuçları tespit edebilir. Risk tamamen size aittir.

**S: Token nedir?**
C: Oyun başladığında site tarafından oluşturulan oturum anahtarı. Script bunu otomatik yakalar.

**S: Script çalışmıyor, ne yapayım?**
C: Tampermonkey'in açık olduğundan ve doğru sayfada (`katiponline.com/klavye-hiz-testi/`) olduğundan emin ol. Sayfayı yenile.

---

## 📄 Lisans

MIT Lisansı ile lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakabilirsin.

---

## ⚠️ Sorumluluk Reddi

**Bu script tamamen eğitim ve öğrenme amaçlı geliştirilmiştir.**

- Bu aracı kullanarak yapacağın her şeyden **sen sorumlusun**.
- Geliştirici (**PrescionX**), bu script'in kötüye kullanılmasından **hiçbir şekilde sorumlu tutulamaz**.
- katiponline.com'un kullanım şartlarını ihlal etmek **senin sorumluluğundadır**.
- Script'i kullanarak oluşabilecek **her türlü hesap banlama, veri kaybı veya diğer olumsuz sonuçlardan** geliştirici sorumlu değildir.
- Bu araç, web güvenliği ve istemci-sunucu iletişimi hakkında eğitim amacıyla oluşturulmuştur.
- Herhangi bir platformda haksız avantaj elde etmek veya hizmet şartlarını ihlal etmek amacıyla **kullanılmamalıdır**.
- Bu script'i indiren, kuran ve kullanan herkes bu şartları **kabul etmiş sayılır**.

---

**Geliştirici:** PrescionX
