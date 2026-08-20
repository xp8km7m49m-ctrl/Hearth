import { state, onStateChange, memberById, currentMember } from "../state.js";
import * as store from "../store.js";
import { TASK_CATEGORIES } from "../store.js";
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
  todayKey,
  groupBy,
} from "../utils.js";

const WEEKDAYS = [
  { code: "SUN", label: "S" },
  { code: "MON", label: "M" },
  { code: "TUE", label: "T" },
  { code: "WED", label: "W" },
  { code: "THU", label: "T" },
  { code: "FRI", label: "F" },
  { code: "SAT", label: "S" },
];

let activeTab = "todo";
const visibleMembers = new Set();
let redeemAsId = null;

export default function renderTasks(root, { setFab }) {
  root.innerHTML = `
    <div class="tabs" id="tTabs">
      <button data-tab="todo" class="${activeTab === "todo" ? "is-active" : ""}">To-do</button>
      <button data-tab="rewards" class="${activeTab === "rewards" ? "is-active" : ""}">Rewards</button>
    </div>
    <div id="tabBody"></div>
  `;
  $$('[data-tab]', $("#tTabs")).forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      draw();
    });
  });

  function draw() {
    if (!document.body.contains(root)) return;
    $$('[data-tab]', root).forEach((b) => b.classList.toggle("is-active", b.dataset.tab === activeTab));

    if (activeTab === "todo") {
      setFab({ iconName: "plus", label: "Add task", onClick: () => openTaskEditor(null) });
      drawTodo(root);
    } else {
      setFab({ iconName: "plus", label: "Add reward", onClick: () => openRewardEditor(null) });
      if (!redeemAsId) redeemAsId = currentMember()?.id || state.members[0]?.id || null;
      drawRewards(root);
    }
  }

  const unsub = onStateChange(draw);
  draw();
  return () => unsub();
}

// ---------------------------------------------------------------------
// To-do
// ---------------------------------------------------------------------
export function isActiveToday(task) {
  const rec = task.recurrence || "daily";
  const dow = new Date().getDay();
  const map = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  if (rec === "daily") return true;
  if (rec === "once") {
    const doneDates = Object.keys(task.completions || {}).filter((k) => task.completions[k]);
    if (!doneDates.length) return true;
    return !!(task.completions && task.completions[todayKey()]);
  }
  return rec.split(",").map((s) => s.trim()).includes(map[dow]);
}

function drawTodo(root) {
  const me = currentMember();
  const body = root.querySelector("#tabBody");

  const chips =
    `<button class="chip ${visibleMembers.size === 0 ? "is-active" : ""}" data-all>Everyone</button>` +
    state.members
      .map(
        (m) => `
      <button class="chip chip--member ${visibleMembers.has(m.id) ? "is-active" : ""}" data-m="${m.id}"
        style="${visibleMembers.has(m.id) ? `background:var(--${m.color});border-color:var(--${m.color})` : ""}">${esc(m.name)}</button>`
      )
      .join("");

  const today = state.tasks.filter(isActiveToday).filter((t) => {
    if (!visibleMembers.size) return true;
    return t.memberId ? visibleMembers.has(t.memberId) : true;
  });
  const byCat = groupBy(today, (t) => t.category || "todo");

  const groupsHtml = TASK_CATEGORIES.map((cat) => {
    const rows = byCat[cat.key];
    if (!rows || !rows.length) return "";
    return `
      <div class="mb-16">
        <div class="eyebrow mb-8">${icon(cat.icon, { size: 12 })} ${esc(cat.label)}</div>
        <div class="card card--pad" style="padding-top:2px;padding-bottom:2px;">
          ${rows.map(taskRowHtml).join("")}
        </div>
      </div>`;
  }).join("");

  body.innerHTML = `
    ${
      me
        ? `<div class="card card--pad row between mb-16">
            <div class="row gap-10">${avatarHtml(me)}<div>
              <div style="font-weight:700;font-size:14.5px;">${esc(me.name)}</div>
              <div class="faint text-sm">Today's points</div>
            </div></div>
            <div class="points-badge">${icon("sparkle")}${me.points || 0}</div>
          </div>`
        : ""
    }
    <div class="scroller mb-16" id="taskChips">${chips}</div>
    ${groupsHtml || emptyTasksHtml(today.length === 0 && state.tasks.length > 0)}
  `;

  if (!state.tasks.length) {
    body.insertAdjacentHTML(
      "beforeend",
      `<div class="empty">${icon("checkCircle", { size: 28 })}<strong>No tasks yet</strong><p>Add morning routines, chores, or to-dos — tap the + button to start.</p></div>`
    );
  }

  $('[data-all]', body).addEventListener("click", () => {
    visibleMembers.clear();
    drawTodo(root);
  });
  $$('[data-m]', body).forEach((chip) => {
    chip.addEventListener("click", () => {
      const id = chip.dataset.m;
      if (visibleMembers.has(id)) visibleMembers.delete(id);
      else visibleMembers.add(id);
      drawTodo(root);
    });
  });

  $$(".check-row", body).forEach((row) => {
    const id = row.dataset.id;
    row.querySelector("[data-toggle]").addEventListener("click", async () => {
      const task = state.tasks.find((t) => t.id === id);
      const assignee = task.memberId || currentMember()?.id;
      try {
        const nowDone = await store.toggleTaskCompletion(state.householdId, task, assignee, todayKey());
        if (nowDone && task.points) toast(`+${task.points} points`);
      } catch (err) {
        toast(err.message || "Couldn't update that task.");
      }
    });
    row.querySelector("[data-label]").addEventListener("click", () => {
      const task = state.tasks.find((t) => t.id === id);
      openTaskEditor(task);
    });
  });
}

function emptyTasksHtml() {
  return "";
}

function taskRowHtml(task) {
  const done = !!(task.completions && task.completions[todayKey()]);
  const assignee = task.memberId ? memberById(task.memberId) : null;
  const metaParts = [];
  if (assignee) metaParts.push(assignee.name);
  else metaParts.push("Whole family");
  if (task.points) metaParts.push(`${task.points} pts`);
  return `
    <div class="check-row ${done ? "is-done" : ""}" data-id="${task.id}">
      <button class="checkbox ${done ? "is-checked" : ""}" data-toggle>${icon("check")}</button>
      <div style="flex:1;min-width:0;cursor:pointer;" data-label>
        <div class="check-row__label">${esc(task.title)}</div>
        <div class="check-row__meta">${esc(metaParts.join(" · "))}</div>
      </div>
      ${assignee ? `<span style="width:9px;height:9px;border-radius:50%;background:var(--${assignee.color});flex-shrink:0;"></span>` : ""}
    </div>`;
}

export function openTaskEditor(existing) {
  const isEdit = !!existing;
  let recurrence = existing?.recurrence || "daily";
  const selectedDays = new Set(recurrence && !["daily", "once"].includes(recurrence) ? recurrence.split(",") : []);

  const bodyHtml = `
    <div class="field">
      <label for="tkTitle">Task</label>
      <input class="input" id="tkTitle" placeholder="e.g. Make bed" maxlength="60" value="${esc(existing?.title || "")}" />
    </div>
    <div class="field">
      <label for="tkCat">Category</label>
      <select class="select" id="tkCat">
        ${TASK_CATEGORIES.map((c) => `<option value="${c.key}" ${existing?.category === c.key ? "selected" : ""}>${esc(c.label)}</option>`).join("")}
      </select>
    </div>
    <div class="field-row">
      <div class="field">
        <label for="tkMember">Assign to</label>
        <select class="select" id="tkMember">
          <option value="">Whole family</option>
          ${state.members.map((m) => `<option value="${m.id}" ${existing?.memberId === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="tkPoints">Points</label>
        <input class="input num" type="number" min="0" id="tkPoints" value="${existing?.points ?? 5}" />
      </div>
    </div>
    <div class="field">
      <label>Repeats</label>
      <div class="segmented">
        <button type="button" data-rec="daily" class="${recurrence === "daily" ? "is-active" : ""}">Every day</button>
        <button type="button" data-rec="once" class="${recurrence === "once" ? "is-active" : ""}">Once</button>
        <button type="button" data-rec="days" class="${!["daily", "once"].includes(recurrence) ? "is-active" : ""}">Some days</button>
      </div>
      <div class="chip-row mt-8" id="dayPicker" style="${["daily", "once"].includes(recurrence) ? "display:none;" : ""}">
        ${WEEKDAYS.map((d) => `<button type="button" class="chip ${selectedDays.has(d.code) ? "is-active" : ""}" data-day="${d.code}">${d.label}</button>`).join("")}
      </div>
    </div>
    <div class="modal-actions" style="margin-top:4px;">
      ${isEdit ? `<button class="btn btn--danger" id="tkDelete">Delete</button>` : ""}
      <button class="btn btn--primary" id="tkSave">${isEdit ? "Save changes" : "Add task"}</button>
    </div>
  `;

  openSheet({
    title: isEdit ? "Edit task" : "Add task",
    bodyHtml,
    onMount: (overlay) => {
      $$('[data-rec]', overlay).forEach((btn) => {
        btn.addEventListener("click", () => {
          recurrence = btn.dataset.rec;
          $$('[data-rec]', overlay).forEach((b) => b.classList.toggle("is-active", b === btn));
          overlay.querySelector("#dayPicker").style.display = recurrence === "days" ? "flex" : "none";
        });
      });
      $$('[data-day]', overlay).forEach((chip) => {
        chip.addEventListener("click", () => {
          const code = chip.dataset.day;
          chip.classList.toggle("is-active");
          if (selectedDays.has(code)) selectedDays.delete(code);
          else selectedDays.add(code);
        });
      });
      overlay.querySelector("#tkSave").addEventListener("click", async () => {
        const title = overlay.querySelector("#tkTitle").value.trim();
        if (!title) return toast("Give the task a title.");
        let rec = recurrence;
        if (rec === "days") {
          if (!selectedDays.size) return toast("Pick at least one day.");
          rec = Array.from(selectedDays).join(",");
        }
        const payload = {
          title,
          category: overlay.querySelector("#tkCat").value,
          memberId: overlay.querySelector("#tkMember").value || null,
          points: parseInt(overlay.querySelector("#tkPoints").value, 10) || 0,
          recurrence: rec,
        };
        try {
          if (isEdit) await store.updateTask(state.householdId, existing.id, payload);
          else await store.addTask(state.householdId, payload);
          closeOverlay();
          toast(isEdit ? "Task updated" : "Task added");
        } catch (err) {
          toast(err.message || "Couldn't save that task.");
        }
      });
      if (isEdit) {
        overlay.querySelector("#tkDelete").addEventListener("click", async () => {
          const ok = await confirmDialog(`Delete "${existing.title}"?`);
          if (!ok) return;
          await store.deleteTask(state.householdId, existing.id);
          toast("Task deleted");
        });
      }
    },
  });
}

// ---------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------
function drawRewards(root) {
  const body = root.querySelector("#tabBody");

  const memberCards = state.members
    .map(
      (m) => `
    <button class="chip chip--member ${redeemAsId === m.id ? "is-active" : ""}" data-redeem-as="${m.id}"
      style="${redeemAsId === m.id ? `background:var(--${m.color});border-color:var(--${m.color})` : ""}">
      ${esc(m.name)} · ${m.points || 0}
    </button>`
    )
    .join("");

  const redeemer = memberById(redeemAsId);

  const rewardsHtml = state.rewards.length
    ? `<div class="grid-2">${state.rewards.map((r) => rewardCardHtml(r, redeemer)).join("")}</div>`
    : `<div class="empty">${icon("gift", { size: 28 })}<strong>No rewards yet</strong><p>Add something worth working toward — tap the + button.</p></div>`;

  const recent = [...state.redemptions]
    .sort((a, b) => tsSeconds(b.at) - tsSeconds(a.at))
    .slice(0, 5);

  body.innerHTML = `
    <div class="eyebrow mb-8">Redeeming as</div>
    <div class="scroller mb-16" id="redeemChips">${memberCards}</div>
    <div class="section-head" style="margin-top:0;">
      <h2>Reward catalog</h2>
    </div>
    ${rewardsHtml}
    ${
      recent.length
        ? `<div class="section-head"><h2>Recent redemptions</h2></div>
      <div class="card card--pad"><div class="ledger">
        ${recent
          .map(
            (r) => `<div class="ledger__row" style="cursor:default;">
              <div class="ledger__icon">🎉</div>
              <div class="ledger__body">
                <div class="ledger__label">${esc(r.rewardName)}</div>
                <div class="ledger__meta">${esc(r.memberName || "")}</div>
              </div>
              <div class="ledger__value">−${r.cost}</div>
            </div>`
          )
          .join("")}
      </div></div>`
        : ""
    }
  `;

  $$('[data-redeem-as]', body).forEach((chip) => {
    chip.addEventListener("click", () => {
      redeemAsId = chip.dataset.redeemAs;
      drawRewards(root);
    });
  });

  $$('[data-redeem]', body).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const reward = state.rewards.find((r) => r.id === btn.dataset.redeem);
      const member = memberById(redeemAsId);
      if (!reward || !member) return;
      const ok = await confirmDialog(`Redeem "${reward.name}" for ${reward.cost} points?`, {
        confirmLabel: "Redeem",
        tone: "primary",
      });
      if (!ok) return;
      try {
        await store.redeemReward(state.householdId, reward, member);
        toast(`Redeemed! Enjoy, ${member.name}.`);
      } catch (err) {
        toast(err.message || "Couldn't redeem that reward.");
      }
    });
  });

  $$('[data-edit-reward]', body).forEach((el) => {
    el.addEventListener("click", () => {
      const reward = state.rewards.find((r) => r.id === el.dataset.editReward);
      openRewardEditor(reward);
    });
  });
}

function tsSeconds(at) {
  if (!at) return Date.now() / 1000;
  if (typeof at === "number") return at / 1000;
  if (at.seconds) return at.seconds;
  return Date.now() / 1000;
}

function rewardCardHtml(r, redeemer) {
  const affordable = redeemer && (redeemer.points || 0) >= r.cost;
  return `
    <div class="card card--pad" style="text-align:center;">
      <div style="cursor:pointer;" data-edit-reward="${r.id}">
        <div style="font-size:30px;line-height:1;margin-bottom:8px;">${esc(r.emoji || "🎁")}</div>
        <div style="font-weight:700;font-size:14px;min-height:36px;">${esc(r.name)}</div>
        <div class="pill pill--points mt-4" style="margin:8px auto;">${icon("sparkle", { size: 11 })} ${r.cost} pts</div>
      </div>
      <button class="btn ${affordable ? "btn--primary" : "btn--ghost"} btn--block btn--sm" data-redeem="${r.id}" ${
    affordable ? "" : "disabled"
  }>Redeem</button>
    </div>`;
}

function openRewardEditor(existing) {
  const isEdit = !!existing;
  openSheet({
    title: isEdit ? "Edit reward" : "Add reward",
    bodyHtml: `
      <div class="field-row">
        <div class="field" style="flex:0 0 70px;">
          <label for="rwEmoji">Icon</label>
          <input class="input" id="rwEmoji" maxlength="4" style="text-align:center;font-size:20px;" value="${esc(existing?.emoji || "🎁")}" />
        </div>
        <div class="field" style="flex:1;">
          <label for="rwName">Reward</label>
          <input class="input" id="rwName" placeholder="e.g. Pick the movie" maxlength="60" value="${esc(existing?.name || "")}" />
        </div>
      </div>
      <div class="field">
        <label for="rwCost">Cost in points</label>
        <input class="input num" type="number" min="1" id="rwCost" value="${existing?.cost || 20}" />
      </div>
      <div class="modal-actions" style="margin-top:4px;">
        ${isEdit ? `<button class="btn btn--danger" id="rwDelete">Delete</button>` : ""}
        <button class="btn btn--primary" id="rwSave">${isEdit ? "Save changes" : "Add reward"}</button>
      </div>
    `,
    onMount: (overlay) => {
      overlay.querySelector("#rwSave").addEventListener("click", async () => {
        const name = overlay.querySelector("#rwName").value.trim();
        if (!name) return toast("Give the reward a name.");
        const cost = parseInt(overlay.querySelector("#rwCost").value, 10);
        if (!cost || cost <= 0) return toast("Enter a point cost greater than zero.");
        const payload = { name, cost, emoji: overlay.querySelector("#rwEmoji").value.trim() || "🎁" };
        try {
          if (isEdit) await store.updateReward(state.householdId, existing.id, payload);
          else await store.addReward(state.householdId, payload);
          closeOverlay();
        } catch (err) {
          toast(err.message || "Couldn't save that reward.");
        }
      });
      if (isEdit) {
        overlay.querySelector("#rwDelete").addEventListener("click", async () => {
          const ok = await confirmDialog(`Delete "${existing.name}"?`);
          if (!ok) return;
          await store.deleteReward(state.householdId, existing.id);
          toast("Reward deleted");
        });
      }
    },
  });
}
