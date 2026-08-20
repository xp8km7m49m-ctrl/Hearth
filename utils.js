import { icon } from "./icons.js";

// ---------------------------------------------------------------------
// DOM shortcuts
// ---------------------------------------------------------------------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Build a DOM node from an HTML string (must have exactly one root). */
export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------------------------------------------------------------------
// IDs & codes
// ---------------------------------------------------------------------
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateHouseholdCode(len = 6) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------------------------------------------------------------------
// Member colors
// ---------------------------------------------------------------------
export const MEMBER_COLORS = [
  { key: "m1", var: "--m1", label: "Clay" },
  { key: "m2", var: "--m2", label: "Denim" },
  { key: "m3", var: "--m3", label: "Plum" },
  { key: "m4", var: "--m4", label: "Moss" },
  { key: "m5", var: "--m5", label: "Berry" },
  { key: "m6", var: "--m6", label: "Slate" },
];

export function colorValue(key) {
  return getComputedStyle(document.documentElement).getPropertyValue(
    MEMBER_COLORS.find((c) => c.key === key)?.var || "--m1"
  ) || "#B3543A";
}

export function colorPickerHtml(selected) {
  return `<div class="color-picker">${MEMBER_COLORS.map(
    (c) =>
      `<button type="button" class="color-swatch ${c.key === selected ? "is-active" : ""}" data-color="${c.key}" style="background:var(${c.var})" aria-label="${c.label}"></button>`
  ).join("")}</div>`;
}

export function wireColorPicker(root, onPick) {
  $$(".color-swatch", root).forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".color-swatch", root).forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      onPick(btn.dataset.color);
    });
  });
}

export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarHtml(member, size = "") {
  const sizeCls = size ? `avatar--${size}` : "";
  if (!member) {
    return `<div class="avatar avatar--ghost ${sizeCls}">?</div>`;
  }
  return `<div class="avatar ${sizeCls}" style="background:var(${
    MEMBER_COLORS.find((c) => c.key === member.color)?.var || "--m1"
  })">${esc(initials(member.name))}</div>`;
}

// ---------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey() {
  return dateKey(new Date());
}

/** "YYYY-MM" in LOCAL time — never use toISOString() for this, it's UTC
 *  and drifts a day near midnight in western timezones. */
export function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

export function startOfWeek(d) {
  const nd = new Date(d);
  const day = nd.getDay(); // 0 = Sun
  nd.setDate(nd.getDate() - day);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isSameDay(a, b) {
  return dateKey(a) === dateKey(b);
}

export function friendlyDay(d) {
  const today = new Date();
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, addDays(today, 1))) return "Tomorrow";
  if (isSameDay(d, addDays(today, -1))) return "Yesterday";
  return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

export function monthLabel(d) {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function dowShort(i) { return DOW[i]; }
export function dowFull(i) { return DOW_FULL[i]; }

export function formatTime(t) {
  // t is "HH:MM" 24h -> "h:MM AM/PM"
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function monthMatrix(viewDate) {
  // Returns an array of Date objects covering the full 6-week grid for a
  // given month, starting on Sunday.
  const first = startOfMonth(viewDate);
  const gridStart = startOfWeek(first);
  const days = [];
  for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i));
  return days;
}

// ---------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------
let currencyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function setCurrency(code) {
  try {
    currencyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: code });
  } catch {
    /* keep previous */
  }
}

export function formatMoney(amount) {
  const n = Number(amount) || 0;
  return currencyFmt.format(n);
}

// ---------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------
let toastStack;
export function toast(message) {
  if (!toastStack) {
    toastStack = document.createElement("div");
    toastStack.className = "toast-stack";
    document.body.appendChild(toastStack);
  }
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  toastStack.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity 200ms ease";
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 220);
  }, 2200);
}

// ---------------------------------------------------------------------
// Overlays: bottom sheet, centered modal, confirm dialog
// ---------------------------------------------------------------------
export function closeOverlay() {
  $$(".overlay").forEach((o) => o.remove());
  document.body.style.overflow = "";
}

export function openSheet({ title, bodyHtml, onMount, wide = false }) {
  closeOverlay();
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title || "")}">
      <div class="sheet__grabber"></div>
      <div class="sheet__head">
        <h3>${esc(title || "")}</h3>
        <button class="icon-btn icon-btn--ghost" data-close>${icon("x")}</button>
      </div>
      <div class="sheet__body">${bodyHtml}</div>
    </div>`;
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) closeOverlay();
  });
  overlay.querySelector("[data-close]").addEventListener("click", closeOverlay);
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  if (onMount) onMount(overlay);
  return overlay;
}

export function openModal({ title, bodyHtml, onMount }) {
  closeOverlay();
  const overlay = document.createElement("div");
  overlay.className = "overlay is-center";
  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="${esc(title || "")}">
      <h3>${esc(title || "")}</h3>
      <div class="modal-body">${bodyHtml}</div>
    </div>`;
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) closeOverlay();
  });
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  if (onMount) onMount(overlay);
  return overlay;
}

export function confirmDialog(message, { confirmLabel = "Delete", tone = "danger" } = {}) {
  return new Promise((resolve) => {
    openModal({
      title: "Are you sure?",
      bodyHtml: `
        <p class="muted" style="margin-bottom:6px;font-size:14px;">${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn btn--ghost" data-no>Cancel</button>
          <button class="btn ${tone === "danger" ? "btn--danger" : "btn--primary"}" style="${
        tone === "danger" ? "background:var(--clay);color:#fff;border-color:var(--clay);" : ""
      }" data-yes>${esc(confirmLabel)}</button>
        </div>`,
      onMount: (overlay) => {
        overlay.querySelector("[data-no]").addEventListener("click", () => {
          closeOverlay();
          resolve(false);
        });
        overlay.querySelector("[data-yes]").addEventListener("click", () => {
          closeOverlay();
          resolve(true);
        });
      },
    });
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeOverlay();
});

// ---------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function groupBy(arr, keyFn) {
  const out = {};
  for (const item of arr) {
    const k = keyFn(item);
    (out[k] = out[k] || []).push(item);
  }
  return out;
}

export function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } finally {
    ta.remove();
  }
  return Promise.resolve();
}
