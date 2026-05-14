// =============================================================
// render.js
// SVG rendering: curved staffs + notes (eighth/quarter/half/whole).
// =============================================================

import {
  NUM_STAFFS, TOTAL_MONTHS, fromIndex, ymKey,
  buildStaffGeometry, placeMonth, shapeForCount, seededInt
} from "./mapping.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// ─── Build & draw curved staff ──────────────────────────────
export function drawStaff(svg, opts = {}) {
  const layer  = svg.querySelector("#staff-layer");
  const labels = svg.querySelector("#staff-labels");
  layer.innerHTML  = "";
  labels.innerHTML = "";

  const vb = svg.viewBox.baseVal;
  const geom = buildStaffGeometry({
    width:  vb.width,
    height: vb.height,
    top:    opts.top ?? 80,
    bot:    opts.bot ?? vb.height - 40,
    lineGap: opts.lineGap ?? 11,
    xMargin: opts.xMargin ?? 90
  });

  for (const s of geom.staffs) {
    // 5 staff lines (top → bottom)
    for (let li = 0; li < 5; li++) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", _curvePath(s, li));
      path.setAttribute("class", "staff-line" + (li === 2 ? "" : ""));
      layer.appendChild(path);
    }

    // ornamental clef / bar at the start
    const clef = document.createElementNS(SVG_NS, "text");
    clef.setAttribute("x", s.x0 - 50);
    clef.setAttribute("y", s.yCenter + 22);
    clef.setAttribute("class", "staff-clef");
    clef.textContent = "𝄞";
    labels.appendChild(clef);

    // start bar line
    const bar = document.createElementNS(SVG_NS, "line");
    bar.setAttribute("x1", s.x0 - 4);
    bar.setAttribute("x2", s.x0 - 4);
    bar.setAttribute("y1", s.curveY(s.x0, 0) - 2);
    bar.setAttribute("y2", s.curveY(s.x0, 4) + 2);
    bar.setAttribute("class", "staff-line staff-line--bold");
    layer.appendChild(bar);

    // end bar line (double, like end of musical phrase)
    const endX = s.x1;
    [endX - 6, endX].forEach((x, idx) => {
      const e = document.createElementNS(SVG_NS, "line");
      e.setAttribute("x1", x); e.setAttribute("x2", x);
      e.setAttribute("y1", s.curveY(x, 0) - 2);
      e.setAttribute("y2", s.curveY(x, 4) + 2);
      e.setAttribute("class", "staff-line" + (idx === 1 ? " staff-line--bold" : ""));
      layer.appendChild(e);
    });

    // staff range label
    const first = fromIndex(s.firstIdx);
    const last  = fromIndex(s.lastIdx);
    const lbl = document.createElementNS(SVG_NS, "text");
    lbl.setAttribute("x", s.x0 - 50);
    lbl.setAttribute("y", s.curveY(s.x0, 4) + 45);
    lbl.setAttribute("class", "staff-label");
    lbl.textContent =
      `${first.year}.${String(first.month).padStart(2,"0")}  →  ${last.year}.${String(last.month).padStart(2,"0")}`;
    labels.appendChild(lbl);

    // line index label (LINE 01..04)
    const num = document.createElementNS(SVG_NS, "text");
    num.setAttribute("x", s.x1 + 6);
    num.setAttribute("y", s.curveY(s.x1, 2) + 4);
    num.setAttribute("class", "staff-label staff-label--accent");
    num.textContent = `L.${String(s.i + 1).padStart(2, "0")}`;
    labels.appendChild(num);
  }

  return geom;
}

function _curvePath(staff, lineIdx) {
  const steps = 64;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const x = staff.x0 + (i / steps) * staff.span;
    const y = staff.curveY(x, lineIdx);
    d += (i === 0 ? "M " : " L ") + x.toFixed(2) + " " + y.toFixed(2);
  }
  return d;
}

// ─── Note SVG building blocks ───────────────────────────────
// Notes are rendered in their own coordinate frame, then translated +
// rotated to the desired stage location. Coordinates centered on the head.

const HEAD_W = 14;
const HEAD_H = 10;
const HEAD_ROT = -22;     // tilt of the note head
const STEM_X = HEAD_W / 2 - 1;
const STEM_LEN = 38;

function _noteHead(filled) {
  const head = document.createElementNS(SVG_NS, "ellipse");
  head.setAttribute("cx", 0);
  head.setAttribute("cy", 0);
  head.setAttribute("rx", HEAD_W / 2);
  head.setAttribute("ry", HEAD_H / 2);
  head.setAttribute("transform", `rotate(${HEAD_ROT})`);
  head.setAttribute("class", filled ? "note__head--filled" : "note__head--hollow");
  return head;
}

function _stem() {
  const s = document.createElementNS(SVG_NS, "line");
  s.setAttribute("x1", STEM_X); s.setAttribute("y1", -2);
  s.setAttribute("x2", STEM_X); s.setAttribute("y2", -STEM_LEN);
  s.setAttribute("class", "note__stem");
  return s;
}

function _flag() {
  const p = document.createElementNS(SVG_NS, "path");
  // single eighth-note flag
  p.setAttribute("d",
    `M ${STEM_X} ${-STEM_LEN}
     c 12 6 14 14 6 22
     c 6 -10 4 -16 -6 -22 z`);
  p.setAttribute("class", "note__flag");
  return p;
}

function _wholeBody() {
  // "온음표": wider hollow oval, no stem
  const head = document.createElementNS(SVG_NS, "ellipse");
  head.setAttribute("cx", 0); head.setAttribute("cy", 0);
  head.setAttribute("rx", HEAD_W * 0.78);
  head.setAttribute("ry", HEAD_H * 0.62);
  head.setAttribute("class", "note__head--hollow");
  return head;
}

function _tieArc() {
  // small "붙임줄" hint above/around the note for >10 cluster
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", "M -16 -6 q 16 -14 32 0");
  p.setAttribute("class", "note__tie");
  return p;
}

export function buildNoteGroup(shape, count) {
  const g = document.createElementNS(SVG_NS, "g");
  g.classList.add("note", `note--${shape}`);

  if (shape === "eighth") {
    g.appendChild(_noteHead(true));
    g.appendChild(_stem());
    g.appendChild(_flag());
  } else if (shape === "quarter") {
    g.appendChild(_noteHead(true));
    g.appendChild(_stem());
  } else if (shape === "half") {
    g.appendChild(_noteHead(false));
    g.appendChild(_stem());
  } else { // whole
    g.appendChild(_wholeBody());
    g.appendChild(_tieArc());
  }

  // count badge for clusters >= 3 (so users sense the density)
  if (count >= 3) {
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", 12);
    t.setAttribute("y", -STEM_LEN - 4);
    t.setAttribute("class", "note-badge");
    t.textContent = `×${count}`;
    g.appendChild(t);
  }

  // generous hit area so taps work on small notes
  const hit = document.createElementNS(SVG_NS, "rect");
  hit.setAttribute("x", -22); hit.setAttribute("y", -STEM_LEN - 8);
  hit.setAttribute("width", 44); hit.setAttribute("height", STEM_LEN + 22);
  hit.setAttribute("fill", "transparent");
  hit.setAttribute("class", "note__hit");
  g.appendChild(hit);

  return g;
}

// ─── Render all notes from grouped data ─────────────────────
// groups: Map<ymKey, {year, month, monthIndex, items: [{id, message, nickname, slot, createdAt}]}>
export function renderNotes(svg, geom, groups, onNoteClick, justAddedKey) {
  const layer = svg.querySelector("#notes-layer");
  layer.innerHTML = "";

  for (const [key, g] of groups) {
    const count = g.items.length;
    const shape = shapeForCount(count);
    const placed = placeMonth(g.monthIndex, geom);
    const staff = geom.staffs[placed.staffIdx];

    // Pick a representative slot for the cluster (deterministic)
    // slot range: -3..+3 (above middle line ↔ below) — keep notes inside staff
    const repSeed = (g.items[0]?.id || key) + ":" + count;
    const slot = seededInt(repSeed, -3, 3);
    const slotY = staff.curveY(placed.x, 2 + slot * 0.5) - placed.yMid + placed.yMid; // explicit
    // simpler: y at slot offset directly
    const y = placed.yMid + slot * (staff.lineGap / 2);

    const node = buildNoteGroup(shape, count);
    node.setAttribute("data-ym", key);
    node.setAttribute("data-month-index", g.monthIndex);
    node.setAttribute("data-count", count);
    node.style.setProperty("--tx", `${placed.x}px`);
    node.style.setProperty("--ty", `${y}px`);
    node.style.setProperty("--rot", `${placed.angle}deg`);
    node.setAttribute("transform", `translate(${placed.x}, ${y}) rotate(${placed.angle})`);
    if (key === justAddedKey) node.classList.add("note--enter");

    node.addEventListener("click", (e) => {
      e.stopPropagation();
      onNoteClick && onNoteClick(g, node);
    });

    layer.appendChild(node);
  }
}

// ─── Group raw messages by year-month ───────────────────────
export function groupByYearMonth(messages) {
  const map = new Map();
  for (const m of messages) {
    const key = ymKey(m.year, m.month);
    if (!map.has(key)) {
      map.set(key, {
        key,
        year: m.year, month: m.month,
        monthIndex: m.monthIndex,
        items: []
      });
    }
    map.get(key).items.push(m);
  }
  // sort items inside each group by creation time
  for (const g of map.values()) {
    g.items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }
  return map;
}
