// =============================================================
// app.js — main entry
// Wires UI ↔ store ↔ renderer.
// =============================================================

import {
  RANGE_START, RANGE_END, TOTAL_MONTHS,
  toIndex, fromIndex, isValidYM, ymKey
} from "./mapping.js";
import { drawStaff, renderNotes, groupByYearMonth } from "./render.js";
import { initStore, addMessage, subscribeMessages, getMode } from "./firebase.js";

// ─── DOM refs ───────────────────────────────────────────────
const stage     = document.getElementById("stage");
const svg       = document.getElementById("staff-svg");
const emptyHint = document.getElementById("empty-hint");
const noteCountEl = document.getElementById("note-count");

const btnView   = document.getElementById("btn-view");
const btnAdd    = document.getElementById("btn-add");

const modalAdd  = document.getElementById("modal-add");
const modalView = document.getElementById("modal-view");
const formAdd   = document.getElementById("form-add");
const selYear   = document.getElementById("sel-year");
const selMonth  = document.getElementById("sel-month");
const inpMsg    = document.getElementById("msg");
const inpNick   = document.getElementById("nick");
const charCount = document.getElementById("char-count");
const submitBtn = document.getElementById("submit-btn");
const viewContent = document.getElementById("view-content");
const toastEl   = document.getElementById("toast");

// ─── State ──────────────────────────────────────────────────
let messages = [];          // raw list from store
let geom     = null;        // staff geometry
let isViewing = false;
let lastAddedKey = null;

// ─── Year/Month picker ──────────────────────────────────────
function buildYearOptions() {
  selYear.innerHTML = "";
  for (let y = RANGE_START.year; y <= RANGE_END.year; y++) {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = `${y}년`;
    selYear.appendChild(opt);
  }
  // default: latest possible year (current era)
  selYear.value = RANGE_END.year;
}

function buildMonthOptions(year) {
  const y = +year;
  let from = 1, to = 12;
  if (y === RANGE_START.year) from = RANGE_START.month;
  if (y === RANGE_END.year)   to   = RANGE_END.month;

  const prev = +selMonth.value;
  selMonth.innerHTML = "";
  for (let m = from; m <= to; m++) {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = `${String(m).padStart(2, "0")}월`;
    selMonth.appendChild(opt);
  }
  // try to keep previous selection if valid
  if (prev >= from && prev <= to) selMonth.value = prev;
}

// ─── Modals ─────────────────────────────────────────────────
function openModal(modal) {
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  // focus first focusable
  const first = modal.querySelector("input, select, textarea, button");
  first && first.focus({ preventScroll: true });
}
function closeModal(modal) {
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.matches("[data-modal-close]")) {
    const modal = t.closest(".modal");
    if (modal) closeModal(modal);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    [modalAdd, modalView].forEach((m) => { if (!m.hidden) closeModal(m); });
  }
});

// ─── Toast ──────────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400);
}

// ─── View mode toggle ───────────────────────────────────────
function setViewing(on) {
  isViewing = on;
  btnView.setAttribute("aria-pressed", on ? "true" : "false");
  stage.classList.toggle("is-viewing", on);
  document.body.classList.toggle("is-viewing", on);
}

// ─── Submit handler ─────────────────────────────────────────
async function onSubmit(e) {
  e.preventDefault();
  const year  = +selYear.value;
  const month = +selMonth.value;
  const message = inpMsg.value.trim();
  const nickname = inpNick.value.trim();

  if (!isValidYM(year, month)) {
    toast("년/월을 다시 확인해주세요");
    return;
  }
  if (!message) {
    toast("메시지를 입력해주세요");
    inpMsg.focus();
    return;
  }
  submitBtn.disabled = true;
  try {
    const monthIndex = toIndex(year, month);
    const result = await addMessage({ year, month, monthIndex, message, nickname });
    lastAddedKey = ymKey(year, month);
    toast("successfully created ♪");
    formAdd.reset();
    charCount.textContent = "0";
    buildYearOptions();
    buildMonthOptions(selYear.value);
    closeModal(modalAdd);
  } catch (err) {
    console.error(err);
    toast("저장 실패 — 잠시 후 다시 시도");
  } finally {
    submitBtn.disabled = false;
  }
}

// ─── View modal builder ─────────────────────────────────────
function showCluster(group) {
  const items = group.items;
  let idx = items.length - 1; // start from latest

  function render() {
    const it = items[idx];
    const date = `${group.year}.${String(group.month).padStart(2, "0")}`;
    const author = it.nickname ? `from <em>${escapeHtml(it.nickname)}</em>` : `from <em>익명</em>`;
    const when = it.createdAt ? new Date(it.createdAt).toLocaleDateString() : "—";

    viewContent.innerHTML = `
      <div class="view">
        <div class="view__head">
          <span class="view__eyebrow">A NOTE FROM ${date}</span>
          <h2 class="view__title">${date}</h2>
          <div class="view__count">${items.length} message${items.length > 1 ? "s" : ""} · 같은 달의 음표</div>
        </div>
        <ul class="view__list">
          <li class="view__item">
            <div class="view__msg">${escapeHtml(it.message)}</div>
            <div class="view__byline">${author} · ${escapeHtml(when)}</div>
          </li>
        </ul>
        ${items.length > 1 ? `
          <div class="view__nav">
            <button type="button" id="view-prev" ${idx === 0 ? "disabled" : ""}>← PREV</button>
            <span>${idx + 1} / ${items.length}</span>
            <button type="button" id="view-next" ${idx === items.length - 1 ? "disabled" : ""}>NEXT →</button>
          </div>` : ""}
      </div>`;
    if (items.length > 1) {
      viewContent.querySelector("#view-prev").addEventListener("click", () => { if (idx > 0) { idx--; render(); } });
      viewContent.querySelector("#view-next").addEventListener("click", () => { if (idx < items.length - 1) { idx++; render(); } });
    }
  }
  render();
  openModal(modalView);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Render pipeline ────────────────────────────────────────
function rerender() {
  const groups = groupByYearMonth(messages);
  renderNotes(svg, geom, groups, (group) => {
    if (!isViewing) {
      toast("VIEW 버튼을 눌러 조회 모드로 전환하세요");
      return;
    }
    showCluster(group);
  }, lastAddedKey);

  // total count + empty state
  noteCountEl.textContent = `${messages.length} NOTE${messages.length === 1 ? "" : "S"}`;
  emptyHint.classList.toggle("is-visible", messages.length === 0);

  // clear "just added" once consumed
  lastAddedKey = null;
}

// ─── Bootstrap ──────────────────────────────────────────────
async function bootstrap() {
  // 1. picker
  buildYearOptions();
  buildMonthOptions(selYear.value);
  selYear.addEventListener("change", () => buildMonthOptions(selYear.value));

  // 2. char count
  inpMsg.addEventListener("input", () => {
    const n = inpMsg.value.length;
    charCount.textContent = n;
    charCount.parentElement.classList.toggle("is-near", n > 460);
  });

  // 3. controls
  btnView.addEventListener("click", () => setViewing(!isViewing));
  btnAdd.addEventListener("click", () => openModal(modalAdd));
  formAdd.addEventListener("submit", onSubmit);

  // 4. staff geometry — depends on viewport so redraw on resize.
  // We size the viewBox to actual stage dimensions so note glyphs render
  // at a consistent screen size regardless of viewport (no letterboxing,
  // no distortion).
  function redrawStaff() {
    const rect = stage.getBoundingClientRect();
    const W = Math.max(640, Math.round(rect.width));
    const H = Math.round(rect.height * (W / rect.width));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const isNarrow = W < 720;
    // Smaller top/bot margins → staffs distribute over the *full* stage
    // height, no more visual clustering in the middle on tall screens.
    // lineGap is auto-scaled inside buildStaffGeometry based on the
    // per-staff block height — leave it undefined here.
    geom = drawStaff(svg, {
      top:     isNarrow ? 22 : 40,
      bot:     H - (isNarrow ? 16 : 30),
      xMargin: isNarrow ? 56 : 90,
      // lineGap: isNarrow ? 15 : undefined
    });
    rerender();
  }
  redrawStaff();
  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(redrawStaff, 120);
  });

  // 5. store
  await initStore();
  if (getMode() === "memory") {
    console.info("[dearmydeer] running in LOCAL mode");
  }
  subscribeMessages((list) => {
    messages = list;
    rerender();
  });
}

bootstrap().catch((err) => {
  console.error(err);
  toast("초기화 실패 — 콘솔을 확인해주세요");
});
