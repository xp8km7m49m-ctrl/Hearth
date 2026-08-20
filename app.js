import { ensureSignedIn } from "./firebase-config.js";
import * as store from "./store.js";
import { state, notify, onStateChange, currentMember } from "./state.js";
import { icon } from "./icons.js";
import {
  $,
  $$,
  esc,
  h,
  avatarHtml,
  toast,
  openSheet,
  closeOverlay,
  colorPickerHtml,
  wireColorPicker,
} from "./utils.js";
import { openProfileSwitcher, setFab, clearFab } from "./chrome.js";

import renderDashboard from "./views/dashboard.js";
import renderCalendar from "./views/calendar.js";
import renderBudget from "./views/budget.js";
import renderKitchen from "./views/kitchen.js";
import renderTasks from "./views/tasks.js";
import renderFamily from "./views/family.js";

const ROUTES = {
  home: { render: renderDashboard, label: "Home", icon: "home" },
  calendar: { render: renderCalendar, label: "Calendar", icon: "calendar" },
  budget: { render: renderBudget, label: "Budget", icon: "wallet" },
  kitchen: { render: renderKitchen, label: "Kitchen", icon: "chef" },
  tasks: { render: renderTasks, label: "Tasks", icon: "checkCircle" },
  family: { render: renderFamily, label: "Family & settings", icon: "users" },
};
const NAV_KEYS = ["home", "calendar", "budget", "kitchen", "tasks"];

const appEl = document.getElementById("app");
let destroyCurrentView = null;
const dataUnsubs = [];
let promptedMissingProfile = false;

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
async function boot() {
  appEl.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
  try {
    await ensureSignedIn();
  } catch (err) {
    renderErrorScreen(
      "We couldn't connect",
      "Hearth couldn't sign in to Firebase. Check your internet connection, or make sure Anonymous authentication is enabled for this project. " +
        (err && err.message ? err.message : "")
    );
    return;
  }

  const savedHH = localStorage.getItem("hearth.householdId");
  const savedMember = localStorage.getItem("hearth.memberId");

  if (savedHH && savedMember) {
    try {
      const hh = await store.getHousehold(savedHH);
      if (!hh) throw new Error("This household no longer exists.");
      state.householdId = savedHH;
      state.memberId = savedMember;
      state.household = hh;
      startHousehold();
      return;
    } catch (err) {
      localStorage.removeItem("hearth.householdId");
      localStorage.removeItem("hearth.memberId");
    }
  }
  renderGate();
}

function renderErrorScreen(title, message) {
  appEl.innerHTML = `
    <div class="gate">
      <div class="empty" style="border-style:solid;">
        <strong>${esc(title)}</strong>
        <p>${esc(message)}</p>
        <button class="btn btn--primary mt-16" id="retryBtn">Try again</button>
      </div>
    </div>`;
  $("#retryBtn").addEventListener("click", () => window.location.reload());
}

// ---------------------------------------------------------------------
// Gate: create or join a household
// ---------------------------------------------------------------------
function renderGate() {
  appEl.innerHTML = `
    <div class="gate">
      <div class="gate__brand">
        <div class="gate__mark">${icon("home", { size: 24 })}</div>
        <span>Hearth</span>
      </div>
      <h1>Everything your family runs on, in one place.</h1>
      <p class="lede">A shared calendar, budget, meal plan, shopping list and chore chart that stays in sync on every phone in the house.</p>
      <div class="gate-card" data-action="create">
        <div class="gate-card__icon">${icon("plus")}</div>
        <div><h3>Start a new household</h3><p>Set up Hearth for your family in under a minute.</p></div>
      </div>
      <div class="gate-card" data-action="join">
        <div class="gate-card__icon">${icon("users")}</div>
        <div><h3>Join with a code</h3><p>Already got a household code from a family member?</p></div>
      </div>
    </div>`;
  $('[data-action="create"]').addEventListener("click", openCreateForm);
  $('[data-action="join"]').addEventListener("click", openJoinForm);
}

function roleFieldHtml(defaultRole) {
  return `
    <div class="field">
      <label for="roleSelect">Your role</label>
      <select class="select" id="roleSelect">
        <option value="parent" ${defaultRole === "parent" ? "selected" : ""}>Parent / guardian</option>
        <option value="member" ${defaultRole === "member" ? "selected" : ""}>Child / family member</option>
      </select>
    </div>`;
}

function openCreateForm() {
  openSheet({
    title: "Start a new household",
    bodyHtml: `
      <div class="field">
        <label for="hhName">Household name</label>
        <input class="input" id="hhName" placeholder="e.g. The Whitfield House" maxlength="40" />
      </div>
      <div class="field">
        <label for="yourName">Your name</label>
        <input class="input" id="yourName" placeholder="e.g. Jordan" maxlength="24" />
      </div>
      <div class="field">
        <label>Your color</label>
        ${colorPickerHtml("m1")}
      </div>
      <button class="btn btn--primary btn--block mt-8" id="createBtn">Create household</button>
    `,
    onMount: (overlay) => {
      let color = "m1";
      wireColorPicker(overlay, (c) => (color = c));
      overlay.querySelector("#createBtn").addEventListener("click", async () => {
        const householdName = overlay.querySelector("#hhName").value.trim();
        const memberName = overlay.querySelector("#yourName").value.trim();
        if (!memberName) return toast("Tell us your name first.");
        const btn = overlay.querySelector("#createBtn");
        btn.disabled = true;
        btn.textContent = "Creating…";
        try {
          const { householdId, memberId } = await store.createHousehold({
            householdName,
            memberName,
            color,
          });
          state.householdId = householdId;
          state.memberId = memberId;
          state.household = await store.getHousehold(householdId);
          closeOverlay();
          startHousehold();
        } catch (err) {
          toast(err.message || "Something went wrong creating your household.");
          btn.disabled = false;
          btn.textContent = "Create household";
        }
      });
    },
  });
}

function openJoinForm() {
  openSheet({
    title: "Join with a code",
    bodyHtml: `
      <div class="field">
        <label for="joinCode">Household code</label>
        <input class="input mono" id="joinCode" style="letter-spacing:0.18em;text-transform:uppercase;" placeholder="ABC123" maxlength="6" />
      </div>
      <div class="field">
        <label for="yourName2">Your name</label>
        <input class="input" id="yourName2" placeholder="e.g. Sam" maxlength="24" />
      </div>
      <div class="field">
        <label>Your color</label>
        ${colorPickerHtml("m2")}
      </div>
      ${roleFieldHtml("parent")}
      <button class="btn btn--primary btn--block mt-8" id="joinBtn">Join household</button>
    `,
    onMount: (overlay) => {
      let color = "m2";
      wireColorPicker(overlay, (c) => (color = c));
      const codeInput = overlay.querySelector("#joinCode");
      codeInput.addEventListener("input", () => {
        codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      });
      overlay.querySelector("#joinBtn").addEventListener("click", async () => {
        const code = codeInput.value.trim();
        const memberName = overlay.querySelector("#yourName2").value.trim();
        const role = overlay.querySelector("#roleSelect").value;
        if (!code) return toast("Enter your household code.");
        if (!memberName) return toast("Tell us your name first.");
        const btn = overlay.querySelector("#joinBtn");
        btn.disabled = true;
        btn.textContent = "Joining…";
        try {
          const { householdId, memberId, household } = await store.joinHousehold({
            code,
            memberName,
            color,
            role,
          });
          state.householdId = householdId;
          state.memberId = memberId;
          state.household = household;
          closeOverlay();
          startHousehold();
        } catch (err) {
          toast(err.message || "Couldn't join that household.");
          btn.disabled = false;
          btn.textContent = "Join household";
        }
      });
    },
  });
}

// ---------------------------------------------------------------------
// Household session: subscriptions + shell
// ---------------------------------------------------------------------
function startHousehold() {
  localStorage.setItem("hearth.householdId", state.householdId);
  localStorage.setItem("hearth.memberId", state.memberId);

  dataUnsubs.forEach((fn) => fn());
  dataUnsubs.length = 0;

  const hh = state.householdId;
  dataUnsubs.push(store.subscribeHousehold(hh, (d) => { if (d) state.household = d; notify(); }));
  dataUnsubs.push(store.subscribeMembers(hh, (rows) => { state.members = rows; state.ready = true; notify(); }));
  dataUnsubs.push(store.subscribeEvents(hh, (rows) => { state.events = rows; notify(); }));
  dataUnsubs.push(store.subscribeCategories(hh, (rows) => { state.categories = rows; notify(); }));
  dataUnsubs.push(store.subscribeTransactions(hh, (rows) => { state.transactions = rows; notify(); }));
  dataUnsubs.push(store.subscribeBills(hh, (rows) => { state.bills = rows; notify(); }));
  dataUnsubs.push(store.subscribeMealPlan(hh, (rows) => { state.mealPlan = rows; notify(); }));
  dataUnsubs.push(store.subscribeShoppingList(hh, (rows) => { state.shoppingItems = rows; notify(); }));
  dataUnsubs.push(store.subscribeTasks(hh, (rows) => { state.tasks = rows; notify(); }));
  dataUnsubs.push(store.subscribeRewards(hh, (rows) => { state.rewards = rows; notify(); }));
  dataUnsubs.push(store.subscribeRedemptions(hh, (rows) => { state.redemptions = rows; notify(); }));

  renderShell();
  onStateChange(handleStateChange);
  handleStateChange();
  mountRoute();
  window.addEventListener("hashchange", mountRoute);
}

function renderShell() {
  appEl.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="topbar__title"><h1 id="viewTitle">Home</h1></div>
        <div class="topbar__actions">
          <button id="avatarBtn" aria-label="Family & settings" style="border:0;background:none;padding:0;cursor:pointer;"></button>
        </div>
      </header>
      <main class="view" id="viewRoot"></main>
    </div>
    <button class="fab" id="fab" aria-label="Add"></button>
    <nav class="navbar"><div class="navbar__inner" id="navInner"></div></nav>
  `;
  $("#navInner").innerHTML = NAV_KEYS.map((k) => {
    const r = ROUTES[k];
    return `<button class="nav-item" data-route="${k}">${icon(r.icon)}<span>${esc(r.label)}</span></button>`;
  }).join("");
  $$(".nav-item", $("#navInner")).forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = "#/" + btn.dataset.route;
    });
  });
  $("#avatarBtn").addEventListener("click", () => (location.hash = "#/family"));
}

function handleStateChange() {
  const btn = $("#avatarBtn");
  if (btn) btn.innerHTML = avatarHtml(currentMember(), "sm");

  if (state.ready && state.members.length && !currentMember() && !promptedMissingProfile) {
    promptedMissingProfile = true;
    toast("Pick which profile is you on this device.");
    openProfileSwitcher();
  }
}

// ---------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------
function currentRouteKey() {
  const raw = (location.hash || "#/home").replace(/^#\/?/, "");
  const key = raw.split("?")[0] || "home";
  return ROUTES[key] ? key : "home";
}

function mountRoute() {
  const key = currentRouteKey();
  const route = ROUTES[key];

  if (destroyCurrentView) {
    try {
      destroyCurrentView();
    } catch (err) {
      console.error(err);
    }
    destroyCurrentView = null;
  }

  $("#viewTitle").textContent = route.label;
  $$(".nav-item", $("#navInner")).forEach((n) => n.classList.toggle("is-active", n.dataset.route === key));

  const root = $("#viewRoot");
  root.innerHTML = "";
  clearFab();
  window.scrollTo({ top: 0 });

  const result = route.render(root, { setFab, clearFab });
  if (typeof result === "function") destroyCurrentView = result;
}

// ---------------------------------------------------------------------
boot();
