import { state, onStateChange, currentMember } from "../state.js";
import * as store from "../store.js";
import { icon } from "../icons.js";
import {
  $,
  $$,
  esc,
  avatarHtml,
  toast,
  openSheet,
  closeOverlay,
  confirmDialog,
  copyToClipboard,
  colorPickerHtml,
  wireColorPicker,
  formatMoney,
} from "../utils.js";
import { openProfileSwitcher, confirmLeaveHousehold } from "../chrome.js";
import { openBudgetTargetEditor } from "./budget.js";

export default function renderFamily(root, { clearFab }) {
  clearFab();
  const draw = () => {
    if (!document.body.contains(root)) return;
    root.innerHTML = buildHtml();
    wire(root);
  };
  const unsub = onStateChange(draw);
  draw();
  return () => unsub();
}

function buildHtml() {
  const code = state.household?.code || state.householdId || "";
  return `
    <div class="card card--pad mb-16">
      <div class="row between">
        <div>
          <div class="eyebrow">Household</div>
          <h2 style="font-size:20px;">${esc(state.household?.name || "Your household")}</h2>
        </div>
        <button class="icon-btn" id="editHhName">${icon("edit", { size: 15 })}</button>
      </div>
      <div class="row between mt-16" style="align-items:center;">
        <div>
          <div class="faint text-sm">Invite code</div>
          <div class="mono" style="font-size:18px;font-weight:600;letter-spacing:0.1em;">${esc(code)}</div>
        </div>
        <button class="btn btn--soft btn--sm" id="copyCode">${icon("copy", { size: 14 })} Copy</button>
      </div>
    </div>

    <button class="btn btn--ghost btn--block mb-20" id="switchProfileBtn">${icon("users", { size: 16 })} Switch profile</button>

    <div class="section-head">
      <h2>Members</h2>
      <button class="link-btn" id="addMemberBtn">${icon("plus", { size: 14 })} Add</button>
    </div>
    <div class="card card--pad mb-20">
      ${
        state.members.length
          ? `<div class="ledger">${state.members.map(memberRowHtml).join("")}</div>`
          : `<div class="empty" style="border:none;"><strong>No members yet</strong></div>`
      }
    </div>

    <div class="section-head">
      <h2>Budget settings</h2>
    </div>
    <div class="card card--pad mb-8">
      <div class="row between" style="cursor:pointer;" id="targetRow">
        <span>Monthly budget target</span>
        <span class="mono" style="font-weight:600;">${state.household?.monthlyBudget ? formatMoney(state.household.monthlyBudget) : "Not set"}</span>
      </div>
    </div>
    <div class="section-head" style="margin-top:12px;">
      <h2>Categories</h2>
      <button class="link-btn" id="addCatBtn">${icon("plus", { size: 14 })} Add</button>
    </div>
    <div class="card card--pad mb-20">
      ${
        state.categories.length
          ? `<div class="ledger">${state.categories.map(catRowHtml).join("")}</div>`
          : `<div class="empty" style="border:none;"><strong>No categories yet</strong></div>`
      }
    </div>

    <div class="card card--pad mb-20" style="text-align:center;">
      <div class="gate__mark" style="margin:0 auto 10px;">${icon("home", { size: 20 })}</div>
      <div style="font-family:var(--font-display);font-weight:700;">Hearth</div>
      <p class="faint text-sm mt-4">Open source, built on Firebase.<br/>Your family's data lives in your own Firebase project.</p>
    </div>

    <button class="btn btn--danger btn--block mb-24" id="leaveBtn">${icon("logout", { size: 16 })} Leave this household</button>
  `;
}

function memberRowHtml(m) {
  const isMe = m.id === state.memberId;
  return `
    <button class="ledger__row" data-member="${m.id}">
      <div style="width:36px;">${avatarHtml(m, "sm")}</div>
      <div class="ledger__body">
        <div class="ledger__label">${esc(m.name)}${isMe ? " · you" : ""}</div>
        <div class="ledger__meta">${m.role === "parent" ? "Parent / guardian" : "Family member"}</div>
      </div>
      <div class="ledger__value" style="color:var(--accent-dark);">${m.points || 0} pts</div>
    </button>`;
}

function catRowHtml(c) {
  return `
    <div class="ledger__row" style="cursor:default;">
      <div class="ledger__icon">${icon(c.icon || "inbox", { size: 16 })}</div>
      <div class="ledger__body">
        <div class="ledger__label">${esc(c.name)}</div>
        <div class="ledger__meta">${c.type === "income" ? "Income" : "Expense"}</div>
      </div>
      <button class="icon-btn icon-btn--ghost" data-del-cat="${c.id}" aria-label="Delete category">${icon("trash", { size: 15 })}</button>
    </div>`;
}

function wire(root) {
  $("#editHhName", root).addEventListener("click", openRenameHousehold);
  $("#copyCode", root).addEventListener("click", async () => {
    await copyToClipboard(state.household?.code || state.householdId || "");
    toast("Code copied");
  });
  $("#switchProfileBtn", root).addEventListener("click", openProfileSwitcher);
  $("#addMemberBtn", root).addEventListener("click", openAddMember);
  $("#targetRow", root).addEventListener("click", openBudgetTargetEditor);
  $("#addCatBtn", root).addEventListener("click", openAddCategory);
  $("#leaveBtn", root).addEventListener("click", confirmLeaveHousehold);

  $$("[data-member]", root).forEach((row) => {
    row.addEventListener("click", () => {
      const m = state.members.find((x) => x.id === row.dataset.member);
      if (m) openEditMember(m);
    });
  });
  $$("[data-del-cat]", root).forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog("Delete this category? Past transactions will keep the old name.");
      if (!ok) return;
      await store.deleteCategory(state.householdId, btn.dataset.delCat);
    });
  });
}

function openRenameHousehold() {
  openSheet({
    title: "Rename household",
    bodyHtml: `
      <div class="field">
        <label for="hhNameInput">Household name</label>
        <input class="input" id="hhNameInput" maxlength="40" value="${esc(state.household?.name || "")}" />
      </div>
      <button class="btn btn--primary btn--block" id="hhNameSave">Save</button>
    `,
    onMount: (overlay) => {
      overlay.querySelector("#hhNameSave").addEventListener("click", async () => {
        const name = overlay.querySelector("#hhNameInput").value.trim();
        if (!name) return toast("Give your household a name.");
        await store.updateHousehold(state.householdId, { name });
        closeOverlay();
      });
    },
  });
}

function openAddMember() {
  openSheet({
    title: "Add a family member",
    bodyHtml: `
      <div class="field">
        <label for="amName">Name</label>
        <input class="input" id="amName" maxlength="24" placeholder="e.g. Riley" />
      </div>
      <div class="field">
        <label>Color</label>
        ${colorPickerHtml("m3")}
      </div>
      <div class="field">
        <label for="amRole">Role</label>
        <select class="select" id="amRole">
          <option value="parent">Parent / guardian</option>
          <option value="member" selected>Child / family member</option>
        </select>
      </div>
      <button class="btn btn--primary btn--block" id="amSave">Add member</button>
    `,
    onMount: (overlay) => {
      let color = "m3";
      wireColorPicker(overlay, (c) => (color = c));
      overlay.querySelector("#amSave").addEventListener("click", async () => {
        const name = overlay.querySelector("#amName").value.trim();
        if (!name) return toast("Give them a name.");
        const role = overlay.querySelector("#amRole").value;
        await store.addMember(state.householdId, { name, color, role });
        closeOverlay();
        toast(`${name} added to the household`);
      });
    },
  });
}

function openEditMember(m) {
  openSheet({
    title: "Edit member",
    bodyHtml: `
      <div class="field">
        <label for="emName">Name</label>
        <input class="input" id="emName" maxlength="24" value="${esc(m.name)}" />
      </div>
      <div class="field">
        <label>Color</label>
        ${colorPickerHtml(m.color)}
      </div>
      <div class="field">
        <label for="emRole">Role</label>
        <select class="select" id="emRole">
          <option value="parent" ${m.role === "parent" ? "selected" : ""}>Parent / guardian</option>
          <option value="member" ${m.role !== "parent" ? "selected" : ""}>Child / family member</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn--danger" id="emDelete">Remove</button>
        <button class="btn btn--primary" id="emSave">Save changes</button>
      </div>
    `,
    onMount: (overlay) => {
      let color = m.color;
      wireColorPicker(overlay, (c) => (color = c));
      overlay.querySelector("#emSave").addEventListener("click", async () => {
        const name = overlay.querySelector("#emName").value.trim();
        if (!name) return toast("Name can't be empty.");
        await store.updateMember(state.householdId, m.id, { name, color, role: overlay.querySelector("#emRole").value });
        closeOverlay();
      });
      overlay.querySelector("#emDelete").addEventListener("click", async () => {
        const ok = await confirmDialog(`Remove ${m.name} from this household? Their points and history will be lost.`);
        if (!ok) return;
        await store.deleteMember(state.householdId, m.id);
        closeOverlay();
        if (m.id === state.memberId) {
          localStorage.removeItem("hearth.memberId");
        }
      });
    },
  });
}

function openAddCategory() {
  openSheet({
    title: "Add category",
    bodyHtml: `
      <div class="field">
        <label for="catName">Name</label>
        <input class="input" id="catName" maxlength="30" placeholder="e.g. Pet care" />
      </div>
      <div class="field">
        <label for="catType">Type</label>
        <select class="select" id="catType">
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>
      <button class="btn btn--primary btn--block" id="catSave">Add category</button>
    `,
    onMount: (overlay) => {
      overlay.querySelector("#catSave").addEventListener("click", async () => {
        const name = overlay.querySelector("#catName").value.trim();
        if (!name) return toast("Give the category a name.");
        await store.addCategory(state.householdId, {
          name,
          type: overlay.querySelector("#catType").value,
          icon: "inbox",
        });
        closeOverlay();
      });
    },
  });
}
