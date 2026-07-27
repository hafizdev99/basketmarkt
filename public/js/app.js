// ===========================================================
// BASKETMARKT — Ortak uygulama modülü
// Firestore veri erişimi + yardımcı fonksiyonlar
// ===========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs,
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
// Oyuncular
// -----------------------------------------------------------

/** filters: { league, team, position, search } */
export async function fetchPlayers(filters = {}) {
  const constraints = [];
  if (filters.league) constraints.push(where("league", "==", filters.league));
  if (filters.team) constraints.push(where("teamId", "==", filters.team));
  if (filters.position) constraints.push(where("position", "==", filters.position));
  constraints.push(orderBy("marketValue", "desc"));
  if (filters.max) constraints.push(fbLimit(filters.max));

  const q = query(collection(db, "players"), ...constraints);
  const snap = await getDocs(q);
  let players = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (filters.search) {
    const s = filters.search.toLowerCase();
    players = players.filter(p => p.name?.toLowerCase().includes(s));
  }
  return players;
}

export async function fetchPlayerById(id) {
  const ref = doc(db, "players", id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// -----------------------------------------------------------
// Haberler
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

export async function fetchTeams(league) {
  const constraints = league ? [where("league", "==", league)] : [];
  const q = query(collection(db, "teams"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchTeamById(id) {
  const ref = doc(db, "teams", id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// -----------------------------------------------------------
// Yazma işlemleri (Admin paneli için)
// -----------------------------------------------------------

/** id verilirse o dokümanı oluşturur/üzerine yazar (slug'ı biz belirleriz), yoksa otomatik id alır. */
export async function savePlayer(id, data) {
  if (id) {
    await setDoc(doc(db, "players", id), data, { merge: true });
    return id;
  }
  const ref = await addDoc(collection(db, "players"), data);
  return ref.id;
}

export async function deletePlayer(id) {
  await deleteDoc(doc(db, "players", id));
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

export async function saveTeam(id, data) {
  if (id) {
    await setDoc(doc(db, "teams", id), data, { merge: true });
    return id;
  }
  const ref = await addDoc(collection(db, "teams"), data);
  return ref.id;
}

export async function deleteTeam(id) {
  await deleteDoc(doc(db, "teams", id));
}

/** Bir takımın kadro toplam piyasa değerini, o takıma bağlı tüm oyuncuların
 *  marketValue toplamı olarak yeniden hesaplayıp teams/{teamId}.totalValue alanına yazar.
 *  Oyuncu eklendiğinde / düzenlendiğinde / silindiğinde çağrılmalı. */
export async function recalcTeamValue(teamId) {
  if (!teamId) return;
  const q = query(collection(db, "players"), where("teamId", "==", teamId));
  const snap = await getDocs(q);
  let total = 0;
  let currency = "EUR";
  snap.docs.forEach(d => {
    const p = d.data();
    total += Number(p.marketValue) || 0;
    if (p.currency) currency = p.currency;
  });
  await setDoc(doc(db, "teams", teamId), {
    totalValue: total,
    totalValueCurrency: currency,
    playerCount: snap.size,
    totalValueUpdatedAt: serverTimestamp()
  }, { merge: true });
}
