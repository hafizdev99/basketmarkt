// ===========================================================
// BasMedia — Ortak uygulama modülü
// Firestore veri erişimi + yardımcı fonksiyonlar
// Sezon sistemi: her oyuncu/takımın "kimlik" bilgisi (root doküman)
// sezondan bağımsızdır; sezona özgü veriler (değer, takım, pozisyon,
// istatistikler / toplam kadro değeri) alt koleksiyonlarda tutulur:
//   players/{id}                → kimlik (isim, foto, doğum tarihi, vs.)
//   players/{id}/playerSeasons/{season} → o sezona ait takım/değer/istatistik
//   teams/{id}                  → kimlik (isim, şehir, logo)
//   teams/{id}/teamSeasons/{season}     → o sezona ait toplam değer/kadro sayısı
//   seasons/{season}            → mevcut sezonların global kaydı (dropdown için)
// ===========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, collectionGroup, doc, getDoc, getDocs,
  query, where, orderBy, limit as fbLimit,
  addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// -----------------------------------------------------------
// Yardımcılar
// -----------------------------------------------------------

/** URL yolundan id çıkarır. Örn: /oyuncu/lebron-james-23 -> "lebron-james-23" */
export function getIdFromPath(prefix) {
  const path = window.location.pathname.replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);
  const idx = parts.indexOf(prefix);
  if (idx !== -1 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  // Firebase Hosting rewrite kullanılmıyorsa ?id= ile de çalışsın
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

export function formatCurrency(value, currency = "EUR") {
  if (value == null) return "—";
  const symbols = { EUR: "€", USD: "$", TRY: "₺" };
  const s = symbols[currency] || "";
  if (value >= 1_000_000) return `${s}${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${s}${(value / 1_000).toFixed(0)}K`;
  return `${s}${value}`;
}

export function formatDate(input) {
  if (!input) return "";
  const d = input?.toDate ? input.toDate() : new Date(input);
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

export function slugify(text) {
  const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u" };
  return text
    .split("").map(ch => map[ch] || ch).join("")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// -----------------------------------------------------------
// Sezonlar
// -----------------------------------------------------------

/** Tüm sezonları getirir, en yeni en başta olacak şekilde sıralı (string sıralaması
 *  "2025-2026" < "2026-2027" olduğu için doğru kronolojik sırayı verir). */
export async function fetchSeasons() {
  const snap = await getDocs(collection(db, "seasons"));
  const seasons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  seasons.sort((a, b) => (a.id < b.id ? 1 : -1));
  return seasons;
}

/** Sezon kaydı yoksa oluşturur (var olan bir sezonu bozmaz — merge). */
export async function ensureSeasonExists(seasonId, label) {
  if (!seasonId) return;
  await setDoc(doc(db, "seasons", seasonId), { id: seasonId, label: label || seasonId }, { merge: true });
}

// -----------------------------------------------------------
// Oyuncular
// -----------------------------------------------------------

/** filters: { season (zorunlu), league, teamId, position, search, max } */
export async function fetchPlayers(filters = {}) {
  if (!filters.season) throw new Error("fetchPlayers: 'season' parametresi zorunludur.");

  const constraints = [where("season", "==", filters.season)];
  if (filters.league) constraints.push(where("league", "==", filters.league));
  if (filters.teamId) constraints.push(where("teamId", "==", filters.teamId));
  if (filters.position) constraints.push(where("position", "==", filters.position));

  const q = query(collectionGroup(db, "playerSeasons"), ...constraints);
  const snap = await getDocs(q);

  const seasonDocs = snap.docs.map(d => ({ playerId: d.ref.parent.parent.id, season: d.data() }));
  const uniqueIds = [...new Set(seasonDocs.map(s => s.playerId))];

  const rootDocs = await Promise.all(uniqueIds.map(id => getDoc(doc(db, "players", id))));
  const rootById = {};
  rootDocs.forEach(snap => { if (snap.exists()) rootById[snap.id] = snap.data(); });

  let players = seasonDocs
    .filter(s => rootById[s.playerId])
    .map(s => ({ id: s.playerId, ...rootById[s.playerId], ...s.season }));

  if (filters.search) {
    const s = filters.search.toLowerCase();
    players = players.filter(p => p.name?.toLowerCase().includes(s));
  }

  players.sort((a, b) => (Number(b.marketValue) || 0) - (Number(a.marketValue) || 0));
  if (filters.max) players = players.slice(0, filters.max);
  return players;
}

/** Belirli bir oyuncuyu, belirli bir sezon için getirir. season verilmezse
 *  oyuncunun currentSeason'ı kullanılır. */
export async function fetchPlayerById(id, season) {
  const rootSnap = await getDoc(doc(db, "players", id));
  if (!rootSnap.exists()) return null;
  const root = rootSnap.data();
  const targetSeason = season || root.currentSeason;
  if (!targetSeason) return { id, ...root };

  const seasonSnap = await getDoc(doc(db, "players", id, "playerSeasons", targetSeason));
  return { id, ...root, ...(seasonSnap.exists() ? seasonSnap.data() : {}), season: targetSeason };
}

/** Bir oyuncunun verisi olan tüm sezonları listeler (en yeni en başta). */
export async function fetchPlayerSeasonsList(playerId) {
  const snap = await getDocs(collection(db, "players", playerId, "playerSeasons"));
  const seasons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  seasons.sort((a, b) => (a.id < b.id ? 1 : -1));
  return seasons;
}

// -----------------------------------------------------------
// Haberler (sezon kavramı yok)
// -----------------------------------------------------------

export async function fetchNews(max = 20) {
  const q = query(collection(db, "news"), orderBy("publishedAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchNewsById(id) {
  const ref = doc(db, "news", id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// -----------------------------------------------------------
// Takımlar
// -----------------------------------------------------------

/** filters: { season (zorunlu), league } */
export async function fetchTeams(filters = {}) {
  if (!filters.season) throw new Error("fetchTeams: 'season' parametresi zorunludur.");

  const constraints = [where("season", "==", filters.season)];
  if (filters.league) constraints.push(where("league", "==", filters.league));

  const q = query(collectionGroup(db, "teamSeasons"), ...constraints);
  const snap = await getDocs(q);

  const seasonDocs = snap.docs.map(d => ({ teamId: d.ref.parent.parent.id, season: d.data() }));
  const uniqueIds = [...new Set(seasonDocs.map(s => s.teamId))];

  const rootDocs = await Promise.all(uniqueIds.map(id => getDoc(doc(db, "teams", id))));
  const rootById = {};
  rootDocs.forEach(snap => { if (snap.exists()) rootById[snap.id] = snap.data(); });

  let teams = seasonDocs
    .filter(s => rootById[s.teamId])
    .map(s => ({ id: s.teamId, ...rootById[s.teamId], ...s.season }));

  teams.sort((a, b) => (Number(b.totalValue) || 0) - (Number(a.totalValue) || 0));
  return teams;
}

/** Tüm takımları (kimlik bilgisiyle, sezondan bağımsız) getirir —
 *  admin panelindeki "Takım seç" dropdown'ı için kullanılır. */
export async function fetchTeamsBasic() {
  const snap = await getDocs(collection(db, "teams"));
  const teams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  teams.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return teams;
}

export async function fetchTeamById(id, season) {
  const rootSnap = await getDoc(doc(db, "teams", id));
  if (!rootSnap.exists()) return null;
  const root = rootSnap.data();
  const targetSeason = season || root.currentSeason;
  if (!targetSeason) return { id, ...root };

  const seasonSnap = await getDoc(doc(db, "teams", id, "teamSeasons", targetSeason));
  return { id, ...root, ...(seasonSnap.exists() ? seasonSnap.data() : {}), season: targetSeason };
}

/** Bir takımın verisi olan tüm sezonları listeler (en yeni en başta). */
export async function fetchTeamSeasonsList(teamId) {
  const snap = await getDocs(collection(db, "teams", teamId, "teamSeasons"));
  const seasons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  seasons.sort((a, b) => (a.id < b.id ? 1 : -1));
  return seasons;
}

// -----------------------------------------------------------
// Yazma işlemleri (Admin paneli için)
// -----------------------------------------------------------

/** Oyuncuyu kaydeder: rootData (sezondan bağımsız kimlik) players/{id}'ye,
 *  seasonData (o sezona özgü bilgiler) players/{id}/playerSeasons/{season}'a yazılır. */
export async function savePlayer(id, season, rootData, seasonData) {
  await setDoc(doc(db, "players", id), { ...rootData, currentSeason: season }, { merge: true });
  await setDoc(doc(db, "players", id, "playerSeasons", season), { ...seasonData, season }, { merge: true });
  await ensureSeasonExists(season);
  return id;
}

/** Oyuncuyu ve TÜM sezon kayıtlarını tamamen siler. */
export async function deletePlayer(id) {
  const seasonsSnap = await getDocs(collection(db, "players", id, "playerSeasons"));
  await Promise.all(seasonsSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, "players", id));
}

/** Sadece bir oyuncunun belirli bir sezon kaydını siler (oyuncunun kimliği ve
 *  diğer sezonları kalır). */
export async function deletePlayerSeason(id, season) {
  await deleteDoc(doc(db, "players", id, "playerSeasons", season));
}

export async function saveNews(id, data) {
  if (id) {
    await setDoc(doc(db, "news", id), data, { merge: true });
    return id;
  }
  const ref = await addDoc(collection(db, "news"), data);
  return ref.id;
}

export async function deleteNews(id) {
  await deleteDoc(doc(db, "news", id));
}

/** Takımı kaydeder: rootData (kimlik) teams/{id}'ye, seasonData
 *  (o sezona özgü lig/toplam değer/kadro sayısı) teams/{id}/teamSeasons/{season}'a yazılır. */
export async function saveTeam(id, season, rootData, seasonData) {
  await setDoc(doc(db, "teams", id), { ...rootData, currentSeason: season }, { merge: true });
  await setDoc(doc(db, "teams", id, "teamSeasons", season), { ...seasonData, season }, { merge: true });
  await ensureSeasonExists(season);
  return id;
}

/** Takımı ve TÜM sezon kayıtlarını tamamen siler (o takıma bağlı oyuncular
 *  silinmez, sadece takımsız kalırlar). */
export async function deleteTeam(id) {
  const seasonsSnap = await getDocs(collection(db, "teams", id, "teamSeasons"));
  await Promise.all(seasonsSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, "teams", id));
}

/** Bir takımın belirli bir sezondaki kadro toplam piyasa değerini, o sezonda
 *  o takıma bağlı tüm oyuncuların marketValue toplamı olarak yeniden hesaplayıp
 *  teams/{teamId}/teamSeasons/{season}.totalValue alanına yazar. */
export async function recalcTeamSeasonValue(teamId, season) {
  if (!teamId || !season) return;
  const q = query(
    collectionGroup(db, "playerSeasons"),
    where("teamId", "==", teamId),
    where("season", "==", season)
  );
  const snap = await getDocs(q);
  let total = 0;
  let currency = "EUR";
  snap.docs.forEach(d => {
    const p = d.data();
    total += Number(p.marketValue) || 0;
    if (p.currency) currency = p.currency;
  });
  await setDoc(doc(db, "teams", teamId, "teamSeasons", season), {
    totalValue: total,
    totalValueCurrency: currency,
    playerCount: snap.size,
    totalValueUpdatedAt: serverTimestamp(),
    season
  }, { merge: true });
}

/** Bir takım için YENİ BİR SEZON oluşturur: önceki sezonun kadrosunu (oyuncu +
 *  takım + değer + istatistik bilgileriyle) otomatik kopyalar, sonra admin
 *  panelinden düzenlenebilir. */
export async function addSeasonForTeam(teamId, fromSeason, newSeasonId) {
  await ensureSeasonExists(newSeasonId);

  // Önceki sezonun takım verisini taban al (lig, para birimi vs.)
  let fromTeamSeason = {};
  if (fromSeason) {
    const fromSnap = await getDoc(doc(db, "teams", teamId, "teamSeasons", fromSeason));
    if (fromSnap.exists()) fromTeamSeason = fromSnap.data();
  }
  await setDoc(doc(db, "teams", teamId, "teamSeasons", newSeasonId), {
    league: fromTeamSeason.league || "",
    totalValue: 0,
    totalValueCurrency: fromTeamSeason.totalValueCurrency || "EUR",
    playerCount: 0,
    season: newSeasonId
  }, { merge: true });
  await setDoc(doc(db, "teams", teamId), { currentSeason: newSeasonId }, { merge: true });

  // Önceki sezonun kadrosunu kopyala
  if (fromSeason) {
    const rosterQ = query(
      collectionGroup(db, "playerSeasons"),
      where("teamId", "==", teamId),
      where("season", "==", fromSeason)
    );
    const rosterSnap = await getDocs(rosterQ);
    await Promise.all(rosterSnap.docs.map(async (d) => {
      const playerId = d.ref.parent.parent.id;
      const data = d.data();
      await setDoc(doc(db, "players", playerId, "playerSeasons", newSeasonId), {
        ...data,
        season: newSeasonId,
        valueUpdatedAt: new Date().toISOString()
      }, { merge: true });
      await setDoc(doc(db, "players", playerId), { currentSeason: newSeasonId }, { merge: true });
    }));
  }

  await recalcTeamSeasonValue(teamId, newSeasonId);
  return newSeasonId;
}

// -----------------------------------------------------------
// TEK SEFERLİK GEÇİŞ (Migration): eski "düz" veri yapısından
// (players/{id} ve teams/{id} içinde doğrudan tüm alanlar) yeni sezon
// yapısına geçiş. Bu güncellemeden ÖNCE eklenmiş tüm oyuncu/takımlar
// "season" olarak verilen sezona (varsayılan "2025-2026") atanır.
// Birden fazla kez çalıştırılması güvenlidir: bir doküman zaten yeni
// formata geçmişse (root'ta artık "marketValue"/"totalValue" alanı
// kalmamışsa) tekrar işlenmez.
// -----------------------------------------------------------
export async function migrateFlatDataToSeasons(seasonId = "2025-2026") {
  await ensureSeasonExists(seasonId);
  let playersMigrated = 0;
  let teamsMigrated = 0;

  const playersSnap = await getDocs(collection(db, "players"));
  for (const d of playersSnap.docs) {
    const data = d.data();
    if (data.marketValue === undefined && data.team === undefined && data.teamId === undefined) continue; // zaten yeni format
    const seasonData = {
      teamId: data.teamId || null,
      team: data.team || "",
      league: data.league || "",
      position: data.position || "",
      jerseyNumber: data.jerseyNumber ?? null,
      marketValue: data.marketValue || 0,
      currency: data.currency || "EUR",
      contractUntil: data.contractUntil || "",
      stats: data.stats || {},
      valueUpdatedAt: data.valueUpdatedAt || new Date().toISOString(),
      season: seasonId
    };
    const rootData = {
      name: data.name || "",
      nationality: data.nationality || "",
      birthDate: data.birthDate || null,
      height: data.height ?? null,
      weight: data.weight ?? null,
      bio: data.bio || "",
      photoUrl: data.photoUrl || "",
      photoPositionX: data.photoPositionX ?? 50,
      photoPositionY: data.photoPositionY ?? 20,
      photoZoom: data.photoZoom ?? 100,
      currentSeason: seasonId
    };
    await setDoc(doc(db, "players", d.id, "playerSeasons", seasonId), seasonData);
    await setDoc(doc(db, "players", d.id), rootData); // merge:false → eski düz alanları temizler
    playersMigrated++;
  }

  const teamsSnap = await getDocs(collection(db, "teams"));
  for (const d of teamsSnap.docs) {
    const data = d.data();
    if (data.totalValue === undefined && data.league === undefined) continue; // zaten yeni format
    const seasonData = {
      league: data.league || "",
      totalValue: data.totalValue || 0,
      totalValueCurrency: data.totalValueCurrency || "EUR",
      playerCount: data.playerCount || 0,
      totalValueUpdatedAt: data.totalValueUpdatedAt || new Date().toISOString(),
      season: seasonId
    };
    const rootData = {
      name: data.name || "",
      city: data.city || "",
      logoUrl: data.logoUrl || "",
      currentSeason: seasonId
    };
    await setDoc(doc(db, "teams", d.id, "teamSeasons", seasonId), seasonData);
    await setDoc(doc(db, "teams", d.id), rootData); // merge:false → eski düz alanları temizler
    teamsMigrated++;
  }

  return { playersMigrated, teamsMigrated };
}
