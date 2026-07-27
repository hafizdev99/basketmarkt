# 🏀 Basketmarkt

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
    ├── assets/logo.png      → Basketmarkt logosu
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

## 1) Firebase Kurulumu

1. https://console.firebase.google.com adresinden yeni proje oluştur.
2. **Build > Firestore Database** kısmından bir Firestore veritabanı oluştur (production mode).
3. **Project settings > General > Your apps > Web app (</>)** ile bir web uygulaması ekle.
4. Sana verilen `firebaseConfig` bilgilerini kopyalayıp `public/js/firebase-config.js`
   dosyasındaki `BURAYA_...` alanlarına yapıştır.

## 2) Firestore Veri Modeli

### `players` koleksiyonu (her doküman = 1 oyuncu, doküman ID = oyuncunun URL ID'si)

```json
{
  "name": "LeBron James",
  "photoUrl": "https://...jpg",
  "team": "Los Angeles Lakers",
  "teamId": "los-angeles-lakers",
  "league": "NBA",
  "position": "SF",
  "jerseyNumber": 23,
  "nationality": "ABD",
  "birthDate": "1984-12-30",
  "height": 206,
  "weight": 113,
  "marketValue": 40000000,
  "currency": "EUR",
  "contractUntil": "2026",
  "bio": "Kısa biyografi metni...",
  "stats": { "ppg": 25.4, "rpg": 7.2, "apg": 8.1, "spg": 1.2 }
}
```

> Doküman ID'sini kendin belirle (ör. `lebron-james`), böylece URL de
> `basketmarkt.com/oyuncu/lebron-james` gibi okunaklı olur.

### `news` koleksiyonu (her doküman = 1 haber)

```json
{
  "title": "Lakers'tan Sürpriz Transfer",
  "excerpt": "Kısa özet...",
  "content": "Paragraf 1...\n\nParagraf 2...",
  "coverImage": "https://...jpg",
  "category": "Transfer",
  "author": "Basketmarkt Editör",
  "publishedAt": "2026-07-20T10:00:00Z",
  "relatedPlayerIds": ["lebron-james"]
}
```

### `teams` koleksiyonu (her doküman = 1 takım)

```json
{
  "name": "Los Angeles Lakers",
  "city": "Los Angeles",
  "league": "NBA",
  "logoUrl": "https://...png"
}
```

## 3) Veri Nasıl Eklenir?

En kolay yol: Firebase konsolu → Firestore Database → **Start collection** →
koleksiyon adını (`players`, `news`, `teams`) yazıp yukarıdaki alanlarla dokümanlar oluştur.

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
