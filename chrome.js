import { state, notify } from "./state.js";
import * as store from "./store.js";
import { icon } from "./icons.js";
import {
  $,
  $$,
  esc,
  avatarHtml,
  openSheet,
  closeOverlay,
  confirmDialog,
  toast,
  copyToClipboard,
  colorPickerHtml,
  wireColorPicker,
} from "./utils.js";

// ---------------------------------------------------------------------
// Floating action button — every view sets its own icon + handler
// ---------------------------------------------------------------------
export function setFab({ iconName, label = "Add", onClick }) {
  const fab = document.getElementById("fab");
  if (!fab) return;
  fab.style.display = "flex";
  fab.innerHTML = `${icon(iconName)}<span class="sr-only">${esc(label)}</span>`;
  fab.setAttribute("aria-label", label);
  fab.onclick = onClick;
}

export function clearFab() {
  const fab = document.getElementById("fab");
  if (fab) fab.style.display = "none";
}

// ---------------------------------------------------------------------
// Profile switcher — supports the "shared family tablet" pattern, where
// several members pick their own tile rather than each having a login.
// ---------------------------------------------------------------------
export function openProfileSwitcher() {
  const cells = state.members
    .map(
      (m) => `
      <button class="profile-cell" data-member="${m.id}">
        ${avatarHtml(m, "lg")}
        <span>${esc(m.name)}${m.id === state.memberId ? " · you" : ""}</span>
      </button>`
    )
    .join("");

  openSheet({
    title: "Switch profile",
    bodyHtml: `
      <p class="muted text-sm mb-12">Pick who's using Hearth right now.</p>
      <div class="profile-grid">
        ${cells}
        <button class="profile-cell is-add" data-add>
          <div class="avatar avatar--lg avatar--ghost">${icon("plus", { size: 22 })}</div>
          <span>Add profile</span>
        </button>
      </div>
      <div class="add-profile-form" style="display:none;margin-top:20px;">
        <div class="field">
          <label for="npName">Name</label>
          <input class="input" id="npName" placeholder="e.g. Sam" maxlength="24" />
        </div>
        <div class="field">
          <label>Color</label>
          ${colorPickerHtml("m2")}
        </div>
        <div class="field">
          <label for="npRole">Role</label>
          <select class="select" id="npRole">
            <option value="parent">Parent / guardian</option>
            <option value="member">Child / family member</option>
          </select>
        </div>
        <button class="btn btn--primary btn--block" data-save>Add & switch to profile</button>
      </div>
      <div class="row" style="justify-content:space-between;margin-top:22px;padding-top:16px;border-top:1px solid var(--line);">
        <button class="link-btn" data-share>${icon("share", { size: 15 })} Share invite code</button>
        <button class="link-btn" data-leave style="color:var(--clay);">${icon("logout", { size: 15 })} Leave household</button>
      </div>
    `,
    onMount: (overlay) => {
      let color = "m2";
      wireColorPicker(overlay, (c) => (color = c));

      $$(".profile-cell[data-member]", overlay).forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.member;
          if (id === state.memberId) return closeOverlay();
          state.memberId = id;
          localStorage.setItem("hearth.memberId", id);
          notify();
          closeOverlay();
          const m = state.members.find((x) => x.id === id);
          toast(`Switched to ${m ? m.name : "profile"}`);
        });
      });

      overlay.querySelector("[data-add]").addEventListener("click", () => {
        overlay.querySelector(".add-profile-form").style.display = "block";
        overlay.querySelector("[data-add]").style.display = "none";
        overlay.querySelector("#npName").focus();
      });

      overlay.querySelector("[data-save]").addEventListener("click", async () => {
        const name = overlay.querySelector("#npName").value.trim();
        if (!name) return toast("Give this profile a name first.");
        const role = overlay.querySelector("#npRole").value;
        const btn = overlay.querySelector("[data-save]");
        btn.disabled = true;
        btn.textContent = "Adding…";
        try {
          const ref = await store.addMember(state.householdId, { name, color, role });
          state.memberId = ref.id;
          localStorage.setItem("hearth.memberId", ref.id);
          notify();
          closeOverlay();
          toast(`Welcome, ${name}!`);
        } catch (err) {
          toast(err.message || "Couldn't add that profile.");
          btn.disabled = false;
          btn.textContent = "Add & switch to profile";
        }
      });

      overlay.querySelector("[data-share]").addEventListener("click", openShareSheet);
      overlay.querySelector("[data-leave]").addEventListener("click", confirmLeaveHousehold);
    },
  });
}

// ---------------------------------------------------------------------
// Share / invite sheet
// ---------------------------------------------------------------------
export function openShareSheet() {
  const code = state.household?.code || state.householdId || "";
  openSheet({
    title: "Invite your family",
    bodyHtml: `
      <p class="muted text-sm mb-12">Anyone with this code can join <strong>${esc(
        state.household?.name || "your household"
      )}</strong> from the "Join with a code" screen.</p>
      <div class="code-display">${esc(code)}</div>
      <button class="btn btn--primary btn--block mt-16" data-copy>${icon("copy", { size: 16 })} Copy code</button>
    `,
    onMount: (overlay) => {
      overlay.querySelector("[data-copy]").addEventListener("click", async () => {
        await copyToClipboard(code);
        toast("Code copied");
      });
    },
  });
}

// ---------------------------------------------------------------------
// Leave household — clearing local identity and reloading is the
// simplest reliable way to reset every subscription and view.
// ---------------------------------------------------------------------
export async function confirmLeaveHousehold() {
  const ok = await confirmDialog(
    "You'll be signed out of this household on this device. Anyone else in your family keeps their access.",
    { confirmLabel: "Leave household" }
  );
  if (!ok) return;
  localStorage.removeItem("hearth.householdId");
  localStorage.removeItem("hearth.memberId");
  window.location.reload();
}
