import { state, onStateChange } from "../state.js";
import * as store from "../store.js";
import { SHOPPING_CATEGORIES } from "../store.js";
import { icon } from "../icons.js";
import {
  $,
  $$,
  esc,
  toast,
  openSheet,
  openModal,
  closeOverlay,
  confirmDialog,
  dateKey,
  todayKey,
  fromKey,
  startOfWeek,
  addDays,
  dowFull,
  friendlyDay,
} from "../utils.js";

const SLOTS = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
];

let activeTab = "meals";
let viewWeek = startOfWeek(new Date());
let lastBuiltTab = null;
let setFabRef = () => {};

export default function renderKitchen(root, { setFab }) {
  setFabRef = setFab;
  lastBuiltTab = null;

  const draw = () => {
    if (!document.body.contains(root)) return;
    if (activeTab !== lastBuiltTab) {
      buildShell(root);
      lastBuiltTab = activeTab;
    }
    refreshDynamic(root);
  };

  const unsub = onStateChange(draw);
  draw();
  return () => unsub();

  function buildShell(root) {
    root.innerHTML = `
      <div class="tabs" id="kTabs">
        <button data-tab="meals" class="${activeTab === "meals" ? "is-active" : ""}">Meal plan</button>
        <button data-tab="shopping" class="${activeTab === "shopping" ? "is-active" : ""}">Shopping list</button>
      </div>
      <div id="tabBody"></div>
    `;
    $$('[data-tab]', $("#kTabs")).forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab;
        draw();
      });
    });

    if (activeTab === "meals") {
      $("#tabBody").innerHTML = `
        <div class="cal-nav">
          <button class="icon-btn" id="prevWeek">${icon("chevronLeft")}</button>
          <h2 id="weekLabel"></h2>
          <button class="icon-btn" id="nextWeek">${icon("chevronRight")}</button>
        </div>
        <div id="mealsSlot" class="stack"></div>
      `;
      $("#prevWeek").addEventListener("click", () => {
        viewWeek = addDays(viewWeek, -7);
        refreshDynamic(root);
      });
      $("#nextWeek").addEventListener("click", () => {
        viewWeek = addDays(viewWeek, 7);
        refreshDynamic(root);
      });
      setFabRef({
        iconName: "plus",
        label: "Add tonight's dinner",
        onClick: () => openMealEditor(todayKey(), "dinner"),
      });
    } else {
      root.querySelector("#tabBody").innerHTML = `
        <div class="card card--pad mb-16">
          <div class="row gap-8">
            <input class="input" id="quickAdd" placeholder="Add an item…" maxlength="60" />
            <button class="icon-btn icon-btn--brand" id="quickAddBtn" aria-label="Add item">${icon("plus")}</button>
          </div>
        </div>
        <div id="shopToolbar" class="row between mb-8"></div>
        <div id="shopList"></div>
      `;
      const input = $("#quickAdd");
      const submit = async () => {
        const name = input.value.trim();
        if (!name) return;
        input.value = "";
        input.focus();
        try {
          await store.addShoppingItem(state.householdId, { name, category: "Other" });
        } catch (err) {
          toast(err.message || "Couldn't add that item.");
        }
      };
      $("#quickAddBtn").addEventListener("click", submit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      setFabRef({ iconName: "plus", label: "Add item with details", onClick: () => openShoppingItemEditor(null) });
    }
  }

  function refreshDynamic(root) {
    if (activeTab === "meals") drawMeals(root);
    else drawShopping(root);
  }
}

// ---------------------------------------------------------------------
// Meal plan
// ---------------------------------------------------------------------
function mealFor(key) {
  return state.mealPlan.find((m) => m.id === key || m.date === key) || {};
}

function drawMeals() {
  const label = $("#weekLabel");
  if (!label) return;
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(viewWeek, i));
  label.textContent = `${monthShort(days[0])} ${days[0].getDate()} – ${monthShort(days[6])} ${days[6].getDate()}`;

  $("#mealsSlot").innerHTML = days
    .map((d) => {
      const key = dateKey(d);
      const meal = mealFor(key);
      const isToday = key === todayKey();
      return `
      <div class="card card--pad tab-card" style="--tab-color:${isToday ? "var(--accent)" : "var(--line)"}">
        <div class="row between mb-8">
          <span class="eyebrow">${dowFull(d.getDay())}${isToday ? " · today" : ""}</span>
          <span class="faint text-sm num">${monthShort(d)} ${d.getDate()}</span>
        </div>
        <div class="ledger">
          ${SLOTS.map(
            (s) => `
            <button class="ledger__row" data-key="${key}" data-slot="${s.key}">
              <div class="ledger__body">
                <div class="ledger__label">${s.label}</div>
              </div>
              <div class="ledger__leader"></div>
              <div class="ledger__value" style="font-weight:500;color:${meal[s.key] ? "var(--ink)" : "var(--ink-faint)"}">
                ${esc(meal[s.key] || "Tap to add")}
              </div>
            </button>`
          ).join("")}
        </div>
      </div>`;
    })
    .join("");

  $$(".ledger__row", $("#mealsSlot")).forEach((row) => {
    row.addEventListener("click", () => {
      const key = row.dataset.key;
      const slot = row.dataset.slot;
      openMealEditor(key, slot, mealFor(key)[slot]);
    });
  });
}

function monthShort(d) {
  return d.toLocaleDateString("en-US", { month: "short" });
}

export function openMealEditor(dateKeyStr, slot, existingValue = "") {
  const slotLabel = SLOTS.find((s) => s.key === slot)?.label || slot;
  const dayLabel = friendlyDay(fromKey(dateKeyStr));
  openModal({
    title: `${slotLabel} · ${dayLabel}`,
    bodyHtml: `
      <div class="field">
        <label for="mealInput">What's the plan?</label>
        <input class="input" id="mealInput" placeholder="e.g. Sheet-pan chicken fajitas" value="${esc(existingValue || "")}" maxlength="80" />
      </div>
      <div class="modal-actions">
        ${existingValue ? `<button class="btn btn--danger" id="mealClear">Clear</button>` : `<button class="btn btn--ghost" id="mealCancel">Cancel</button>`}
        <button class="btn btn--primary" id="mealSave">Save</button>
      </div>
    `,
    onMount: (overlay) => {
      const input = overlay.querySelector("#mealInput");
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      overlay.querySelector("#mealSave").addEventListener("click", async () => {
        await store.setMeal(state.householdId, dateKeyStr, slot, input.value.trim());
        closeOverlay();
      });
      const cancelBtn = overlay.querySelector("#mealCancel");
      if (cancelBtn) cancelBtn.addEventListener("click", closeOverlay);
      const clearBtn = overlay.querySelector("#mealClear");
      if (clearBtn) {
        clearBtn.addEventListener("click", async () => {
          await store.setMeal(state.householdId, dateKeyStr, slot, "");
          closeOverlay();
        });
      }
    },
  });
}

// ---------------------------------------------------------------------
// Shopping list
// ---------------------------------------------------------------------
function drawShopping() {
  const toolbar = $("#shopToolbar");
  const list = $("#shopList");
  if (!toolbar || !list) return;

  const items = state.shoppingItems;
  const checkedCount = items.filter((i) => i.checked).length;

  toolbar.innerHTML = `
    <span class="muted text-sm">${items.length} item${items.length === 1 ? "" : "s"}${checkedCount ? `, ${checkedCount} checked` : ""}</span>
    ${checkedCount ? `<button class="link-btn" id="clearChecked">${icon("trash", { size: 13 })} Clear checked</button>` : ""}
  `;
  const clearBtn = $("#clearChecked");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      const ok = await confirmDialog(`Remove ${checkedCount} checked item${checkedCount === 1 ? "" : "s"} from the list?`);
      if (ok) await store.clearCheckedShoppingItems(state.householdId, items);
    });
  }

  if (!items.length) {
    list.innerHTML = `
      <div class="empty">
        ${icon("cart", { size: 28 })}
        <strong>Your list is empty</strong>
        <p>Add anything the household is out of — it syncs to everyone instantly.</p>
      </div>`;
    return;
  }

  const groups = {};
  items.forEach((i) => {
    const cat = SHOPPING_CATEGORIES.includes(i.category) ? i.category : "Other";
    (groups[cat] = groups[cat] || []).push(i);
  });
  const orderedCats = SHOPPING_CATEGORIES.filter((c) => groups[c]);

  list.innerHTML = orderedCats
    .map((cat) => {
      const rows = [...groups[cat]].sort((a, b) => (a.checked === b.checked ? 0 : a.checked ? 1 : -1));
      return `
      <div class="mb-16">
        <div class="eyebrow mb-8">${esc(cat)}</div>
        <div class="card card--pad" style="padding-top:4px;padding-bottom:4px;">
          ${rows.map(shopRowHtml).join("")}
        </div>
      </div>`;
    })
    .join("");

  $$(".check-row", list).forEach((row) => {
    const id = row.dataset.id;
    row.querySelector("[data-toggle]").addEventListener("click", () => {
      const item = items.find((i) => i.id === id);
      store.updateShoppingItem(state.householdId, id, { checked: !item.checked });
    });
    row.querySelector("[data-label]").addEventListener("click", () => {
      const item = items.find((i) => i.id === id);
      openShoppingItemEditor(item);
    });
    row.querySelector("[data-del]").addEventListener("click", async (e) => {
      e.stopPropagation();
      await store.deleteShoppingItem(state.householdId, id);
    });
  });
}

function shopRowHtml(item) {
  return `
    <div class="check-row ${item.checked ? "is-done" : ""}" data-id="${item.id}">
      <button class="checkbox ${item.checked ? "is-checked" : ""}" data-toggle>${icon("check")}</button>
      <div style="flex:1;min-width:0;cursor:pointer;" data-label>
        <div class="check-row__label">${esc(item.name)}</div>
        ${item.qty ? `<div class="check-row__meta">${esc(item.qty)}</div>` : ""}
      </div>
      <button class="icon-btn icon-btn--ghost" data-del aria-label="Remove">${icon("x", { size: 15 })}</button>
    </div>`;
}

export function openAddShoppingItem() {
  openShoppingItemEditor(null);
}

function openShoppingItemEditor(existing) {
  const isEdit = !!existing;
  openSheet({
    title: isEdit ? "Edit item" : "Add item",
    bodyHtml: `
      <div class="field">
        <label for="siName">Item</label>
        <input class="input" id="siName" placeholder="e.g. Whole milk" maxlength="60" value="${esc(existing?.name || "")}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="siQty">Quantity <span class="faint">(optional)</span></label>
          <input class="input" id="siQty" placeholder="e.g. 2" maxlength="20" value="${esc(existing?.qty || "")}" />
        </div>
        <div class="field">
          <label for="siCat">Category</label>
          <select class="select" id="siCat">
            ${SHOPPING_CATEGORIES.map((c) => `<option value="${c}" ${existing?.category === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="modal-actions" style="margin-top:4px;">
        ${isEdit ? `<button class="btn btn--danger" id="siDelete">Delete</button>` : ""}
        <button class="btn btn--primary" id="siSave">${isEdit ? "Save changes" : "Add to list"}</button>
      </div>
    `,
    onMount: (overlay) => {
      overlay.querySelector("#siSave").addEventListener("click", async () => {
        const name = overlay.querySelector("#siName").value.trim();
        if (!name) return toast("What do you need?");
        const payload = {
          name,
          qty: overlay.querySelector("#siQty").value.trim(),
          category: overlay.querySelector("#siCat").value,
        };
        try {
          if (isEdit) await store.updateShoppingItem(state.householdId, existing.id, payload);
          else await store.addShoppingItem(state.householdId, payload);
          closeOverlay();
        } catch (err) {
          toast(err.message || "Couldn't save that item.");
        }
      });
      if (isEdit) {
        overlay.querySelector("#siDelete").addEventListener("click", async () => {
          await store.deleteShoppingItem(state.householdId, existing.id);
          closeOverlay();
        });
      }
    },
  });
}
