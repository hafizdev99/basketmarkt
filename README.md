# 🏀 BasMedia

Basketbol dünyası için Transfermarkt tarzı bir piyasa değeri / oyuncu / haber platformu.
NBA, EuroLeague, BSL ve diğer tüm liglere açık. Veriler Firebase (Firestore) üzerinden çekilir.

## Klasör Yapısı

```
basketmarkt/
├── firebase.json          → Hosting ayarları + temiz URL yönlendirmeleri
├── firestore.rules        → Firestore güvenlik kuralları
├── firestore.indexes.json → Gerekli composite index'ler
└── public/
    ├── index.html          → Anasayfa
    ├── oyuncular.html       → Oyuncu listesi (filtreli)
    ├── oyuncu.html          → Oyuncu detay şablonu (/oyuncu/:id)
    ├── haberler.html        → Haber listesi
    ├── haber.html           → Haber detay şablonu (/haber/:id)
    ├── takimlar.html        → Takım listesi
    ├── takim.html           → Takım detay şablonu (/takim/:id)
    ├── 404.html
    ├── assets/logo.png      → BasMedia logosu
    ├── css/style.css        → Tüm tasarım sistemi
    └── js/
        ├── firebase-config.js → SENİN Firebase proje bilgilerin buraya
        └── app.js             → Firestore veri çekme fonksiyonları
```

## Her sayfa nasıl "kendi özel URL"sine sahip?

`firebase.json` içindeki `rewrites` sayesinde:

- `/oyuncu/lebron-james` → `oyuncu.html` dosyasını render eder, JS içinde URL'den
  `lebron-james` ID'sini okuyup Firestore'dan o oyuncuyu çeker.
- `/haber/lakers-yeni-transfer` → aynı mantıkla `haber.html`'i kullanır.
- `/turnuva/takim/los-angeles-lakers` → `takim.html`'i kullanır (takım URL'leri
  `turnuva/takim/` öneki altında nested olarak kurgulandı).

Yani her oyuncunun, her haberin, her takımın **gerçek, paylaşılabilir, SEO'ya uygun kendi
URL'si** olur — ayrı ayrı dosya oluşturmana gerek yok, tek şablon + Firestore ID'si yeterli.

## Son Güncellemeler

- **Marka**: Site adı ve logosu **BasMedia** olarak güncellendi.
- **Takım kartları**: Artık oyuncu kartlarıyla aynı görsel dilde — toplam kadro değeri
  bir "value tag" olarak kart üzerinde gösteriliyor.
- **Kadro listesi**: Takım detay sayfasındaki oyuncular artık büyük kartlar yerine
  kompakt bir liste halinde (foto + isim + pozisyon + değer).
- **Fotoğraf kontrolü**: Hem oyuncu hem haber kapak fotoğrafları için admin panelinde
  yukarı/aşağı/sağ/sol konum + yakınlaştırma (zoom) kaydırıcıları var.
- **Mobil menü**: 900px altındaki ekranlarda artık hamburger menü ile gezinme mümkün.
- **SEZON SİSTEMİ** (yeni): Her oyuncu ve takımın artık birden fazla sezonu olabilir
  (2025-2026, 2026-2027, ...). Aşağıdaki "Sezon Sistemi" bölümüne bak.

## Sezon Sistemi

Artık her oyuncu ve takımın **kimliği** (isim, foto, şehir, logo gibi sezondan
bağımsız bilgiler) ile **sezona özgü verisi** (takım, lig, piyasa değeri, istatistikler,
toplam kadro değeri) ayrı tutuluyor:

```
players/{id}                        → kimlik: name, photoUrl, nationality, birthDate,
                                       height, weight, bio, currentSeason
players/{id}/playerSeasons/{season} → o sezona ait: teamId, team, league, position,
                                       jerseyNumber, marketValue, currency,
                                       contractUntil, stats, valueUpdatedAt

teams/{id}                          → kimlik: name, city, logoUrl, currentSeason
teams/{id}/teamSeasons/{season}     → o sezona ait: league, totalValue,
                                       totalValueCurrency, playerCount, totalValueUpdatedAt

seasons/{season}                    → sezonların global kaydı: id, label
```

Sezon ID'leri `"2025-2026"`, `"2026-2027"` gibi metin olarak tutulur (string
sıralaması kronolojik sırayla aynı olduğu için basit sıralama yeterli).

### Admin panelinde nasıl çalışır?

- Panelin üstünde bir **"Aktif Sezon"** seçici var. Oyuncular ve Takımlar
  sekmeleri hep bu sezona göre listelenir/kaydedilir.
- **"+ Yeni Sezon"** butonu, sadece boş bir sezon kaydı oluşturur (henüz hiçbir
  takımın kadrosu yok).
- Bir takımı düzenlerken çıkan **"Bu Takım İçin Yeni Sezon Oluştur"** butonu,
  o takımın o anki (Aktif Sezon'daki) kadrosunu otomatik olarak yeni sezona
  kopyalar — sonra admin panelinden düzenlenebilir (transferler, değer
  güncellemeleri vs.).
- **"Eski Verileri 2025-2026 Sezonuna Aktar"** butonu, bu sezon sistemi
  eklenmeden ÖNCE girilmiş tüm oyuncu/takımları otomatik olarak "2025-2026"
  sezonuna taşır. **Bu güncellemeden sonra ilk iş olarak bir kez çalıştır.**
  Birden fazla çalıştırmak güvenlidir (zaten taşınmış veriyi tekrar işlemez).

### Sitede (ziyaretçi tarafında) nasıl görünür?

Oyuncu ve takım detay sayfalarında, üstteki koyu alanda bir **sezon seçici**
(dropdown) var — ziyaretçi geçmiş sezonlara dönüp o sezondaki takımı/değeri/
istatistikleri görebilir. Oyuncular ve Takımlar listeleme sayfalarında da aynı
şekilde bir sezon filtresi bulunuyor.

## 1) Firebase Kurulumu

1. https://console.firebase.google.com adresinden yeni proje oluştur.
2. **Build > Firestore Database** kısmından bir Firestore veritabanı oluştur (production mode).
3. **Project settings > General > Your apps > Web app (</>)** ile bir web uygulaması ekle.
4. Sana verilen `firebaseConfig` bilgilerini kopyalayıp `public/js/firebase-config.js`
   dosyasındaki `BURAYA_...` alanlarına yapıştır.

## 2) Firestore Veri Modeli

> Not: Aşağıdaki yapı "Sezon Sistemi" bölümünde anlatılan yeni modeldir — kimlik
> (root doküman) ve sezona özgü veri (alt koleksiyon) ayrı tutulur. Admin
> panelini kullanıyorsan bu alanları elle yazmana gerek yok, form bu ayrımı
> senin için yapar.

### `players/{id}` — kimlik (doküman ID = oyuncunun URL ID'si)

```json
{
  "name": "LeBron James",
  "photoUrl": "https://...jpg",
  "photoPositionX": 50,
  "photoPositionY": 20,
  "photoZoom": 100,
  "nationality": "ABD",
  "birthDate": "1984-12-30",
  "height": 206,
  "weight": 113,
  "bio": "Kısa biyografi metni...",
  "currentSeason": "2025-2026"
}
```

### `players/{id}/playerSeasons/{season}` — o sezona ait veri

```json
{
  "season": "2025-2026",
  "team": "Los Angeles Lakers",
  "teamId": "los-angeles-lakers",
  "league": "NBA",
  "position": "SF",
  "jerseyNumber": 23,
  "marketValue": 40000000,
  "currency": "USD",
  "contractUntil": "2026",
  "stats": { "ppg": 25.4, "rpg": 7.2, "apg": 8.1, "spg": 1.2 },
  "valueUpdatedAt": "2026-07-20T10:00:00.000Z"
}
```

> Doküman ID'sini kendin belirle (ör. `lebron-james`), böylece URL de
> `/oyuncu/lebron-james` gibi okunaklı olur.

### `news/{id}` — her doküman = 1 haber (sezon kavramı yok)

```json
{
  "title": "Lakers'tan Sürpriz Transfer",
  "excerpt": "Kısa özet...",
  "content": "Paragraf 1...\n\nParagraf 2...",
  "coverImage": "https://...jpg",
  "coverPositionX": 50,
  "coverPositionY": 50,
  "coverZoom": 100,
  "category": "Transfer",
  "author": "BasMedia Editör",
  "publishedAt": "2026-07-20T10:00:00Z"
}
```

### `teams/{id}` — kimlik (doküman ID = takımın URL ID'si)

```json
{
  "name": "Los Angeles Lakers",
  "city": "Los Angeles",
  "logoUrl": "https://...png",
  "currentSeason": "2025-2026"
}
```

### `teams/{id}/teamSeasons/{season}` — o sezona ait veri

```json
{
  "season": "2025-2026",
  "league": "NBA",
  "totalValue": 210000000,
  "totalValueCurrency": "USD",
  "playerCount": 15,
  "totalValueUpdatedAt": "2026-07-20T10:00:00.000Z"
}
```

### `seasons/{season}` — global sezon kaydı

```json
{ "id": "2025-2026", "label": "2025-2026" }
```

## 3) Veri Nasıl Eklenir?

En kolay ve önerilen yol: **`/admin.html`** panelini kullanmak — sezon seçimi,
takım seçimi, foto kırpma/zoom, otomatik takım değeri hesaplama gibi her şeyi
senin için yapar.

Elle eklemek istersen: Firebase konsolu → Firestore Database → **Start
collection** → yukarıdaki koleksiyon/alt koleksiyon yapısına göre dokümanlar
oluştur.

Toplu veri eklemek istersen, Firebase Admin SDK ile bir Node.js script'i de yazılabilir
(istersen bunu da hazırlayabilirim).

## 4) Yayınlama (Deploy)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # mevcut firebase.json'ı koru, "public" klasörünü seç
firebase deploy
```

Deploy sonrası site `https://SENIN-PROJEN.web.app` adresinde, tüm alt sayfalarıyla
(`/oyuncu/...`, `/haber/...`, `/takim/...`) birlikte canlı olacak.

## Sonraki Adımlar (istersen birlikte ekleyebiliriz)

- Admin paneli (giriş yapıp oyuncu/haber ekleme-düzenleme arayüzü)
- Oyuncu karşılaştırma sayfası
- Piyasa değeri geçmişi grafiği
- Transfer geçmişi (bir oyuncunun takım değiştirme kronolojisi)
- Çoklu dil desteği (TR/EN)
