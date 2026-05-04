// =============================================================
// firebase.js
// Initializes Firebase if config is provided, otherwise falls
// back to a localStorage-backed in-memory store so the UI is
// fully testable without a backend.
// =============================================================

import { firebaseConfig, COLLECTION_NAME } from "./config.js";

let _mode = "memory";   // "firebase" | "memory"
let _db   = null;
let _fns  = null;       // bag of imported firestore fns when in firebase mode

const LS_KEY = "dearmydeer.messages.v1";

// ─── Public API ─────────────────────────────────────────────
export async function initStore() {
  const cfg = firebaseConfig || {};
  const looksReal = cfg.apiKey && !String(cfg.apiKey).startsWith("YOUR_");
  if (!looksReal) {
    console.warn("[dearmydeer] Firebase config missing — running in local mode (localStorage).");
    _mode = "memory";
    return _mode;
  }
  try {
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js");
    const fsMod  = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js");
    const app = appMod.initializeApp(cfg);
    _db  = fsMod.getFirestore(app);
    _fns = fsMod;
    _mode = "firebase";
    console.info("[dearmydeer] Firebase ready.");
  } catch (err) {
    console.error("[dearmydeer] Firebase init failed, falling back to local mode.", err);
    _mode = "memory";
  }
  return _mode;
}

export function getMode() { return _mode; }

export async function addMessage(payload) {
  const doc = {
    year:        payload.year,
    month:       payload.month,
    monthIndex:  payload.monthIndex,
    message:     (payload.message || "").trim(),
    nickname:    (payload.nickname || "").trim() || null,
    createdAt:   Date.now()
  };

  if (_mode === "firebase") {
    const { collection, addDoc, serverTimestamp } = _fns;
    const ref = await addDoc(collection(_db, COLLECTION_NAME), {
      ...doc,
      createdAt: serverTimestamp()
    });
    return { id: ref.id, ...doc };
  }

  // local mode
  const id = "local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  const all = _readLocal();
  all.push({ id, ...doc });
  _writeLocal(all);
  return { id, ...doc };
}

// onChange(messages[]) is called on every update
export function subscribeMessages(onChange) {
  if (_mode === "firebase") {
    const { collection, query, orderBy, onSnapshot } = _fns;
    const q = query(collection(_db, COLLECTION_NAME), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const out = [];
      snap.forEach((doc) => {
        const d = doc.data();
        out.push({
          id: doc.id,
          year: d.year, month: d.month, monthIndex: d.monthIndex,
          message: d.message, nickname: d.nickname,
          createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : (d.createdAt || 0)
        });
      });
      onChange(out);
    }, (err) => {
      console.error("[dearmydeer] snapshot error", err);
    });
    return unsub;
  }

  // local mode: emit current + listen to storage events
  const emit = () => onChange(_readLocal());
  emit();
  const handler = (e) => { if (e.key === LS_KEY) emit(); };
  window.addEventListener("storage", handler);
  // also expose a manual trigger via a custom event for same-tab updates
  const localHandler = () => emit();
  window.addEventListener("dearmydeer:local-changed", localHandler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("dearmydeer:local-changed", localHandler);
  };
}

// ─── localStorage helpers ───────────────────────────────────
function _readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}
function _writeLocal(arr) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
    window.dispatchEvent(new Event("dearmydeer:local-changed"));
  } catch (err) {
    console.error("[dearmydeer] local write failed", err);
  }
}
