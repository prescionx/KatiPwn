# 🐦⚡ KatiPwn

**katiponline.com** klavye hız testi sayfası için yazılmış bir Tampermonkey userscript'idir. Oyun sonunda sunucuya gönderilen POST isteklerini yakalar, engeller ve istersen kendi belirlediğin değerlerle yeni bir istek gönderir.

> Kısaca: Klavye hız testi sonuçlarını manipüle etmeni sağlar.

---

## ⚠️ Sorumluluk Reddi

**Bu script tamamen eğitim ve öğrenme amaçlı geliştirilmiştir.**

- Bu aracı kullanarak yapacağın her şeyden **sen sorumlusun**.
- Geliştirici (**PrescionX**), bu script'in kötüye kullanılmasından **hiçbir şekilde sorumlu tutulamaz**.
- katiponline.com'un kullanım şartlarını ihlal etmek **senin sorumluluğundadır**.
- Script'i kullanarak oluşabilecek **her türlü hesap banlama, veri kaybı veya diğer olumsuz sonuçlardan** geliştirici sorumlu değildir.
- Bu script'i indiren, kuran ve kullanan herkes bu şartları **kabul etmiş sayılır**.

---

## 📥 Kurulum (Adım Adım)

### 1. Tampermonkey'i Kur

Tampermonkey, tarayıcına userscript yüklemenizi sağlayan bir eklentidir.

| Tarayıcı | Link |
|-----------|------|
| Chrome | [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) |
| Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |

- Linke tıkla → **"Ekle"** veya **"Yükle"** butonuna bas → Tampermonkey kurulacaktır.

### 2. Script'i Yükle

1. Bu repodaki **`userscript.js`** dosyasını aç.
2. Dosyanın içindeki **tüm kodu kopyala** (Ctrl+A → Ctrl+C).
3. Tarayıcında **Tampermonkey simgesine** tıkla → **"Yeni Script Oluştur"** (Create a new script) seçeneğine bas.
4. Açılan editördeki her şeyi sil, kopyaladığın kodu **yapıştır** (Ctrl+V).
5. **Ctrl+S** ile kaydet.
6. Tamamdır. Script artık aktif.

### 3. Kontrol Et

- Tampermonkey simgesine tıkla.
- **"KatiPwn"** yazısını ve yanında **açık/kapalı** toggle'ını görmelisin.
- Açık (yeşil) olduğundan emin ol.

---

## 🎮 Nasıl Kullanılır

### Adım 1: Siteye Git

Tarayıcından **[katiponline.com/klavye-hiz-testi](https://katiponline.com/klavye-hiz-testi/)** adresine git.

### Adım 2: Kontrol Panelini Aç

Sayfanın sağ alt köşesinde **🦅 KatiPwn** yazan bir buton göreceksin. Bu butona tıkla. Yeni bir pencere (popup) açılacak. Bu senin **kontrol panelin**.

### Adım 3: Bloklayıcıyı Aç

Kontrol panelinde **"BLOKLAYICI"** anahtarını aç (yeşil yapsın). Bu ne işe yarıyor? Oyun bittiğinde siteye gönderilecek olan gerçek sonuçlarını **engeller**. Yani orijinal skorun sunucuya gitmez.

### Adım 4: Değerlerini Ayarla

Kontrol panelinde aşağıdaki alanları göreceksin:

| Alan | Ne İşe Yarıyor | Örnek |
|------|----------------|-------|
| **Doğru Kelime** | Kaç kelime doğru yazdığın | `120` |
| **Yanlış Kelime** | Kaç kelime yanlış yazdığın | `0` |
| **Süre** | Oyun süresi (dd:ss) | `01:00` |
| **Saniye** | Sürenin saniye hali | `60` |

Hızlı ayar yapmak için **profil butonlarını** kullanabilirsin:
- **NORMAL** → 60 doğru kelime
- **PRO** → 110 doğru kelime
- **GOD** → 220 doğru kelime

### Adım 5: Oyunu Başlat ve Bitir

1. Siteye dön ve **klavye hız testini başlat**.
2. Oyunu **normal şekilde oyna** (veya sadece bekle, fark etmez).
3. Oyun bittiğinde, bloklayıcı gerçek sonuçları engelleyecek.

### Adım 6: Sonuçları Gönder

İki seçeneğin var:

- **Manuel Gönderim:** Kontrol panelinden değerleri ayarla → **"BU VERİLERLE GÖNDER"** butonuna bas.
- **Otomatik Gönderim (OTO-GÖNDER):** Bu anahtarı da açarsan, oyun bittiğinde otomatik olarak senin belirlediğin değerlerle istek gönderilir. Ekstra bir şey yapmana gerek kalmaz.

---

## 🔧 Özellikler

| Özellik | Açıklama |
|---------|----------|
| **İstek Yakalama** | Sunucuya giden POST isteklerini yakalar ve listeler |
| **Bloklama** | Orijinal test sonuçlarının sunucuya gitmesini engeller |
| **Özel Değer Gönderme** | İstediğin WPM, doğru/yanlış sayılarıyla sonuç gönderirsin |
| **Otomatik Gönderim** | Oyun bitince otomatik olarak senin değerlerini gönderir |
| **HUD (Zamanlayıcı)** | Oyun sırasında ekranda süreyi gösterir |
| **Ağ İzleme** | Yakalanan tüm istekleri yan panelde listeler, detaylarını gösterir |
| **Lider Tablosu** | Birincileri çekip popup'ta gösterir |
| **Hızlı Profiller** | Tek tıkla Normal / Pro / God değerlerini yükler |

---

## 🤔 Sıkça Sorulan Sorular

**S: Tampermonkey nedir?**
C: Tarayıcına ekstra JavaScript kodu çalıştırmanı sağlayan bir eklenti. Chrome, Firefox, Edge gibi tarayıcılarda çalışır.

**S: Banlanır mıyım?**
C: Site sahipleri anormal sonuçları tespit edebilir. Risk sana aittir.

**S: Token nedir, nereden alıyorum?**
C: Token, oyun başladığında site tarafından otomatik olarak oluşturulur. Script bunu kendisi yakalar, senin bir şey yapmana gerek yok.

**S: Script çalışmıyor, ne yapayım?**
C: Tampermonkey'in açık olduğundan emin ol. Doğru sayfada olduğundan emin ol (`katiponline.com/klavye-hiz-testi/`). Sayfayı yenile.

---

## 📄 Lisans

MIT Lisansı ile lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakabilirsin.

---

**Geliştirici:** PrescionX