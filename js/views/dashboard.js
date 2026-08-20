import { state, onStateChange, currentMember, memberById } from "../state.js";
import { icon } from "../icons.js";
import { esc, avatarHtml, formatMoney, formatTime, todayKey, monthKey } from "../utils.js";
import { openProfileSwitcher } from "../chrome.js";

import { openEventEditor } from "./calendar.js";
import { openTransactionEditor } from "./budget.js";
import { openTaskEditor, isActiveToday } from "./tasks.js";
import { openMealEditor, openAddShoppingItem } from "./kitchen.js";
import { openSheet, closeOverlay } from "../utils.js";

export default function renderDashboard(root, { setFab }) {
  const draw = () => {
    if (!document.body.contains(root)) return;
    root.innerHTML = buildHtml();
    wire(root);
  };

  setFab({ iconName: "plus", label: "Quick add", onClick: openQuickAdd });

  const unsub = onStateChange(draw);
  draw();
  return () => unsub();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function todayLong() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function buildHtml() {
  const me = currentMember();
  const tk = todayKey();

  const mk = monthKey(new Date());
  const txThisMonth = state.transactions.filter((t) => (t.date || "").startsWith(mk));
  const income = txThisMonth.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
  const expense = txThisMonth.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);

  const activeTasks = state.tasks.filter(isActiveToday);
  const doneCount = activeTasks.filter((t) => t.completions && t.completions[tk]).length;

  const todaysEvents = state.events
    .filter((e) => (e.start || "").slice(0, 10) === tk)
    .sort((a, b) => (a.start || "").localeCompare(b.start || ""));

  const meal = state.mealPlan.find((m) => m.id === tk || m.date === tk) || {};
  const shoppingOpen = state.shoppingItems.filter((i) => !i.checked);

  return `
    <div class="row gap-12 mb-20" style="align-items:center;">
      <button id="heroAvatar" style="border:0;background:none;padding:0;cursor:pointer;">${avatarHtml(me, "lg")}</button>
      <div style="min-width:0;">
        <div class="eyebrow">${esc(state.household?.name || "Your household")}</div>
        <h1 style="font-size:23px;line-height:1.2;">${greeting()}${me ? ", " + esc(me.name.split(" ")[0]) : ""}</h1>
        <div class="faint text-sm">${todayLong()}</div>
      </div>
    </div>

    <div class="scroller mb-20">
      <div class="stat-card stat-card--brand" style="min-width:150px;flex-shrink:0;">
        <div class="eyebrow">Available this month</div>
        <div class="stat-value">${formatMoney(income - expense)}</div>
        <div class="stat-sub">${formatMoney(expense)} spent so far</div>
      </div>
      <div class="stat-card" style="min-width:130px;flex-shrink:0;">
        <div class="eyebrow">Tasks today</div>
        <div class="stat-value">${doneCount}/${activeTasks.length}</div>
        <div class="stat-sub">${activeTasks.length ? "keep going" : "all clear"}</div>
      </div>
      <div class="stat-card" style="min-width:130px;flex-shrink:0;">
        <div class="eyebrow">Your points</div>
        <div class="stat-value">${me ? me.points || 0 : "—"}</div>
        <div class="stat-sub">redeem in Tasks</div>
      </div>
    </div>

    <div class="section-head">
      <h2>Today's schedule</h2>
      <button class="link-btn" data-goto="calendar">See calendar</button>
    </div>
    <div class="card card--pad" id="agendaCard">
      ${
        todaysEvents.length
          ? `<div class="stack" style="gap:0;">${todaysEvents
              .map((e) => {
                const members = (e.memberIds || []).map((id) => memberById(id)).filter(Boolean);
                const color = members[0] ? `var(--${members[0].color})` : "var(--brand)";
                return `<div class="agenda-item" data-event="${e.id}" style="cursor:pointer;">
                  <div class="agenda-item__time">${e.allDay ? "All day" : formatTime((e.start || "").slice(11, 16))}</div>
                  <div class="agenda-item__bar" style="background:${color}"></div>
                  <div class="agenda-item__body">
                    <div class="agenda-item__title">${esc(e.title)}</div>
                    ${members.length ? `<div class="agenda-item__meta">${esc(members.map((m) => m.name).join(", "))}</div>` : ""}
                  </div>
                </div>`;
              })
              .join("")}</div>`
          : emptyRow("calendar", "Nothing scheduled today", "Tap Quick Add to plan something.")
      }
    </div>

    <div class="section-head">
      <h2>Today's meals</h2>
      <button class="link-btn" data-goto="kitchen">Open kitchen</button>
    </div>
    <div class="card card--pad mb-4">
      <div class="ledger">
        ${["breakfast", "lunch", "dinner"]
          .map((slot) => {
            const label = slot[0].toUpperCase() + slot.slice(1);
            return `<button class="ledger__row" data-meal="${slot}">
              <div class="ledger__body"><div class="ledger__label">${label}</div></div>
              <div class="ledger__leader"></div>
              <div class="ledger__value" style="font-weight:500;color:${meal[slot] ? "var(--ink)" : "var(--ink-faint)"}">${esc(
              meal[slot] || "Tap to add"
            )}</div>
            </button>`;
          })
          .join("")}
      </div>
    </div>

    <div class="section-head">
      <h2>Family progress today</h2>
      <button class="link-btn" data-goto="tasks">Open tasks</button>
    </div>
    <div class="card card--pad mb-4">
      ${
        state.members.length
          ? `<div class="stack">${state.members.map((m) => memberProgressRow(m, activeTasks, tk)).join("")}</div>`
          : emptyRow("users", "No family members yet", "Add your household in Family & settings.")
      }
    </div>

    <div class="section-head">
      <h2>Shopping list</h2>
      <button class="link-btn" data-goto="kitchen">Open list</button>
    </div>
    <div class="card card--pad" id="shopTeaser" style="cursor:pointer;">
      ${
        shoppingOpen.length
          ? `<div class="row between">
              <span>${shoppingOpen
                .slice(0, 3)
                .map((i) => esc(i.name))
                .join(", ")}${shoppingOpen.length > 3 ? ` +${shoppingOpen.length - 3} more` : ""}</span>
              <span class="pill">${shoppingOpen.length}</span>
            </div>`
          : emptyRow("cart", "Nothing on the list", "Tap Quick Add to add something.")
      }
    </div>
  `;
}

function memberProgressRow(m, activeTasks, tk) {
  const mine = activeTasks.filter((t) => t.memberId === m.id);
  const done = mine.filter((t) => t.completions && t.completions[tk]).length;
  const pct = mine.length ? Math.round((done / mine.length) * 100) : 0;
  return `
    <div class="row gap-10">
      ${avatarHtml(m, "sm")}
      <div style="flex:1;min-width:0;">
        <div class="row between text-sm"><strong>${esc(m.name)}</strong><span class="faint num">${done}/${mine.length}</span></div>
        <div class="progress-track mt-4"><i style="width:${mine.length ? pct : 0}%;background:var(--${m.color})"></i></div>
      </div>
    </div>`;
}

function emptyRow(iconName, title, sub) {
  return `<div class="empty" style="border:none;padding:10px 4px;">${icon(iconName, { size: 24 })}<strong>${esc(
    title
  )}</strong><p>${esc(sub)}</p></div>`;
}

function wire(root) {
  const heroAvatar = root.querySelector("#heroAvatar");
  if (heroAvatar) heroAvatar.addEventListener("click", openProfileSwitcher);

  root.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => (location.hash = "#/" + btn.dataset.goto));
  });
  root.querySelectorAll("[data-event]").forEach((row) => {
    row.addEventListener("click", () => {
      const evt = state.events.find((e) => e.id === row.dataset.event);
      if (evt) openEventEditor(evt);
    });
  });
  root.querySelectorAll("[data-meal]").forEach((row) => {
    row.addEventListener("click", () => {
      const slot = row.dataset.meal;
      const tk = todayKey();
      const meal = state.mealPlan.find((m) => m.id === tk || m.date === tk) || {};
      openMealEditor(tk, slot, meal[slot]);
    });
  });
  const shopTeaser = root.querySelector("#shopTeaser");
  if (shopTeaser) shopTeaser.addEventListener("click", () => (location.hash = "#/kitchen"));
}

function openQuickAdd() {
  openSheet({
    title: "Quick add",
    bodyHtml: `
      <div class="stack">
        <button class="gate-card" data-qa="event" style="margin-bottom:0;">
          <div class="gate-card__icon">${icon("calendar")}</div>
          <div><h3>Event</h3><p>Add something to the family calendar</p></div>
        </button>
        <button class="gate-card" data-qa="expense" style="margin-bottom:0;">
          <div class="gate-card__icon">${icon("wallet")}</div>
          <div><h3>Expense or income</h3><p>Log a transaction</p></div>
        </button>
        <button class="gate-card" data-qa="task" style="margin-bottom:0;">
          <div class="gate-card__icon">${icon("checkCircle")}</div>
          <div><h3>Task</h3><p>Add a chore, routine, or to-do</p></div>
        </button>
        <button class="gate-card" data-qa="shopping" style="margin-bottom:0;">
          <div class="gate-card__icon">${icon("cart")}</div>
          <div><h3>Shopping item</h3><p>Add something to the list</p></div>
        </button>
      </div>
    `,
    onMount: (overlay) => {
      overlay.querySelector('[data-qa="event"]').addEventListener("click", () => {
        closeOverlay();
        openEventEditor(null);
      });
      overlay.querySelector('[data-qa="expense"]').addEventListener("click", () => {
        closeOverlay();
        openTransactionEditor(null);
      });
      overlay.querySelector('[data-qa="task"]').addEventListener("click", () => {
        closeOverlay();
        openTaskEditor(null);
      });
      overlay.querySelector('[data-qa="shopping"]').addEventListener("click", () => {
        closeOverlay();
        openAddShoppingItem();
      });
    },
  });
}
