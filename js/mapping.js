// =============================================================
// mapping.js
// Pure helpers: time <-> month index, time -> staff coordinates,
// density -> note shape, simple deterministic hashing for slots.
// =============================================================

// Range covered by the project: 2014.11 → 2026.06 (inclusive)
export const RANGE_START = { year: 2014, month: 11 };
export const RANGE_END   = { year: 2026, month: 6  };

// Number of staff "lines" stacked on the page (each is a 5-line musical staff)
export const NUM_STAFFS = 4;

// Total months in the range (inclusive on both ends)
export const TOTAL_MONTHS =
  (RANGE_END.year - RANGE_START.year) * 12 + (RANGE_END.month - RANGE_START.month) + 1; // 140

// ─── Year/Month <-> Index ────────────────────────────────────
export function toIndex(year, month) {
  return (year - RANGE_START.year) * 12 + (month - RANGE_START.month);
}

export function fromIndex(idx) {
  const total = idx + RANGE_START.month;
  const year  = RANGE_START.year + Math.floor((total - 1) / 12);
  const month = ((total - 1) % 12) + 1;
  return { year, month };
}

export function isValidYM(year, month) {
  if (year < RANGE_START.year || year > RANGE_END.year) return false;
  if (year === RANGE_START.year && month < RANGE_START.month) return false;
  if (year === RANGE_END.year   && month > RANGE_END.month)   return false;
  if (month < 1 || month > 12) return false;
  return true;
}

export function ymKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ─── Density → note shape ───────────────────────────────────
// Spec:
//  1–2  → eighth (꼬리 음표)
//  3–5  → quarter
//  6–10 → half (hollow)
//  >10  → whole (with tie effect)
export function shapeForCount(n) {
  if (n < 2)  return "sixteenth"; // 1개: 16분음표
  if (n < 4)  return "eighth";    // 2~3개: 8분음표
  if (n < 8)  return "quarter";   // 4~7개: 4분음표
  if (n < 16) return "half";      // 8~15개: 2분음표
  return "whole";                 // 16개 이상: 온음표
}

// ─── Simple deterministic hash for vertical slot ────────────
// Stable per-document so notes don't jump around on reload.
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// pick an integer in [min, max] from a string seed
export function seededInt(seed, min, max) {
  const h = hashStr(seed);
  return min + (h % (max - min + 1));
}

// ─── Time → Stage coordinates ───────────────────────────────
// stageWidth/stageHeight are SVG viewBox units (1400x900 by default).
// Returns the staff index, normalized x within that staff (0..1),
// and the geometry of the staff line so the caller can place a note.
export function placeMonth(monthIndex, geometry) {
  const monthsPerStaff = TOTAL_MONTHS / NUM_STAFFS; // 35
  const staffIdx = Math.min(NUM_STAFFS - 1, Math.floor(monthIndex / monthsPerStaff));
  const tInStaff = (monthIndex - staffIdx * monthsPerStaff) / monthsPerStaff;
  // padding so notes don't touch the very ends
  const pad = 0.04;
  const t = pad + tInStaff * (1 - 2 * pad);
  const staff = geometry.staffs[staffIdx];
  const x = staff.x0 + t * (staff.x1 - staff.x0);
  // y on the curve at that x (use the middle line, line 2 of 0..4)
  const yMid = staff.curveY(x, 2);
  // tangent angle (degrees)
  const angle = staff.curveAngle(x);
  return { staffIdx, x, yMid, angle, tInStaff: t };
}

// ─── Build staff geometry ───────────────────────────────────
// Each staff is a 5-line musical staff that follows a gentle sine curve.
// All five lines share the same wave; they're vertically offset by lineGap.
//
// lineGap auto-scales with the per-staff block height so that on tall
// (mobile portrait) viewports the staff visually fills its block instead
// of looking like a thin band clustered toward the centre.
export function buildStaffGeometry(opts = {}) {
  const W = opts.width  ?? 1400;
  const H = opts.height ?? 900;
  const top = opts.top  ?? 30;
  const bot = opts.bot  ?? H - 30;
  const usable = bot - top;
  const blockH = usable / NUM_STAFFS;
  // 5-line staff height = 4 * lineGap → aim for ~60% of block.
  // Clamp so the staff stays legible on either extreme.
  // 0.08 로 줄여둔 값이 너무 좁아서 음표가 오선지 밖으로 튀어 나갔음.
  // 0.13 으로 복구하고 최소값도 8 → 12 로 올려서 모바일에서도 stem이 살게.
  const autoLineGap = Math.round(blockH * 0.13);
  const lineGap = Math.max(12, Math.min(opts.lineGap ?? autoLineGap, 26));
  const xMargin = opts.xMargin ?? 90;

  const staffs = [];
  for (let i = 0; i < NUM_STAFFS; i++) {
    const yCenter = top + blockH * (i + 0.5);
    // alternate amplitude + phase for organic feel; tracks lineGap so the
    // curve looks proportional whether lines are tight or generous.
    const amp   = Math.round(lineGap * 0.9) + (i % 2 === 0 ? 4 : 0);
    const freq  = 1.4 + (i * 0.18);
    const phase = i * 0.9;

    const x0 = xMargin;
    const x1 = W - 30;
    const span = x1 - x0;

    const curveY = (x, lineIdx /* 0..4, top→bottom */) => {
      const u = (x - x0) / span;
      const offset = (lineIdx - 2) * lineGap; // line 2 is the middle
      return yCenter + amp * Math.sin(u * Math.PI * 2 * freq + phase) + offset;
    };
    const curveAngle = (x) => {
      const u = (x - x0) / span;
      const dyDx = amp * Math.cos(u * Math.PI * 2 * freq + phase) * (Math.PI * 2 * freq / span);
      const deg = Math.atan(dyDx) * 180 / Math.PI;
      // soften — half tangent, capped
      const soft = deg * 0.6;
      return Math.max(-12, Math.min(12, soft));
    };

    // Useful labels for first/last month on this staff
    const monthsPerStaff = TOTAL_MONTHS / NUM_STAFFS;
    const firstIdx = Math.round(i * monthsPerStaff);
    const lastIdx  = Math.round((i + 1) * monthsPerStaff) - 1;

    staffs.push({
      i, yCenter, amp, freq, phase, lineGap,
      x0, x1, span,
      curveY, curveAngle,
      firstIdx, lastIdx
    });
  }
  return { width: W, height: H, top, bot, lineGap, staffs };
}
