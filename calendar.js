import { state, onStateChange, memberById, currentMember } from "../state.js";
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
  monthMatrix,
  monthLabel,
  dowShort,
  addDays,
  startOfMonth,
  dateKey,
  todayKey,
  fromKey,
  friendlyDay,
  isSameDay,
  formatTime,
} from "../utils.js";

let viewDate = new Date(startOfMonth(new Date()));
let selectedKey = todayKey();
const visibleMembers = new Set(); // empty = show all

export default function renderCalendar(root, { setFab }) {
  root.innerHTML = `
    <div class="cal-nav">
      <button class="icon-btn" id="prevMonth">${icon("chevronLeft")}</button>
      <h2 id="monthLabel"></h2>
      <button class="icon-btn" id="nextMonth">${icon("chevronRight")}</button>
    </div>
    <div class="scroller mb-12" id="memberChips"></div>
    <div class="cal-grid" id="dow"></div>
    <div class="cal-grid" id="grid" style="margin-top:5px;"></div>
    <div class="section-head">
      <h2 id="agendaTitle">Today</h2>
    </div>
    <div class="card card--pad" id="agendaCard"></div>
  `;

  $("#dow").innerHTML = [0, 1, 2, 3, 4, 5, 6]
    .map((i) => `<div class="cal-dow">${dowShort(i)}</div>`)
    .join("");

  $("#prevMonth").addEventListener("click", () => {
    viewDate.setMonth(viewDate.getMonth() - 1);
    draw();
  });
  $("#nextMonth").addEventListener("click", () => {
    viewDate.setMonth(viewDate.getMonth() + 1);
    draw();
  });

  setFab({
    iconName: "plus",
    label: "Add event",
    onClick: () => openEventEditor(null, fromKey(selectedKey)),
  });

  const unsub = onStateChange(draw);
  draw();
  return () => unsub();
}

function eventsOnDay(key) {
  return state.events.filter((e) => {
    if (e.allDay || !e.end) return e.start && e.start.slice(0, 10) <= key && (e.end || e.start).slice(0, 10) >= key;
    return e.start && e.start.slice(0, 10) === key;
  });
}

function memberColorVar(memberIds) {
  const id = memberIds && memberIds[0];
  const m = id ? memberById(id) : null;
  return m ? `var(--${m.color})` : "var(--brand)";
}

function passesFilter(evt) {
  if (!visibleMembers.size) return true;
  const ids = evt.memberIds && evt.memberIds.length ? evt.memberIds : ["__unassigned"];
  return ids.some((id) => visibleMembers.has(id));
}

function draw() {
  if (!$("#monthLabel")) return;
  $("#monthLabel").textContent = monthLabel(viewDate);

  $("#memberChips").innerHTML =
    `<button class="chip ${visibleMembers.size === 0 ? "is-active" : ""}" data-all>All</button>` +
    state.members
      .map(
        (m) => `
      <button class="chip chip--member ${visibleMembers.has(m.id) ? "is-active" : ""}"
        data-m="${m.id}" style="${visibleMembers.has(m.id) ? `background:var(--${m.color});border-color:var(--${m.color})` : ""}">
        <span class="dot" style="color:var(--${m.color})"></span>${esc(m.name)}
      </button>`
      )
      .join("");

  $('[data-all]', $("#memberChips")).addEventListener("click", () => {
    visibleMembers.clear();
    draw();
  });
  $$('[data-m]', $("#memberChips")).forEach((chip) => {
    chip.addEventListener("click", () => {
      const id = chip.dataset.m;
      if (visibleMembers.has(id)) visibleMembers.delete(id);
      else visibleMembers.add(id);
      draw();
    });
  });

  const days = monthMatrix(viewDate);
  $("#grid").innerHTML = days
    .map((d) => {
      const key = dateKey(d);
      const muted = d.getMonth() !== viewDate.getMonth();
      const isToday = key === todayKey();
      const isSelected = key === selectedKey;
      const dayEvents = eventsOnDay(key).filter(passesFilter);
      const dots = dayEvents
        .slice(0, 4)
        .map((e) => `<i style="background:${memberColorVar(e.memberIds)}"></i>`)
        .join("");
      return `<button class="cal-day ${muted ? "is-muted" : ""} ${isToday ? "is-today" : ""} ${
        isSelected ? "is-selected" : ""
      }" data-key="${key}">
        <span class="cal-day__num">${d.getDate()}</span>
        <span class="cal-day__dots">${dots}</span>
      </button>`;
    })
    .join("");

  $$(".cal-day", $("#grid")).forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedKey = btn.dataset.key;
      draw();
    });
  });

  $("#agendaTitle").textContent = friendlyDay(fromKey(selectedKey));
  const dayEvents = eventsOnDay(selectedKey)
    .filter(passesFilter)
    .sort((a, b) => (a.start || "").localeCompare(b.start || ""));

  if (!dayEvents.length) {
    $("#agendaCard").innerHTML = `
      <div class="empty" style="border:none;padding:18px 4px;">
        ${icon("calendar", { size: 26 })}
        <strong>Nothing on the calendar</strong>
        <p>Tap the + button to add an event for this day.</p>
      </div>`;
    return;
  }

  $("#agendaCard").innerHTML = `<div class="stack" style="gap:0;">${dayEvents
    .map((e) => {
      const members = (e.memberIds || []).map((id) => memberById(id)).filter(Boolean);
      const metaParts = [];
      if (members.length) metaParts.push(members.map((m) => m.name).join(", "));
      if (e.location) metaParts.push(e.location);
      return `
      <div class="agenda-item" data-id="${e.id}" style="cursor:pointer;">
        <div class="agenda-item__time">${e.allDay ? "All day" : formatTime(e.start && e.start.slice(11, 16))}</div>
        <div class="agenda-item__bar" style="background:${memberColorVar(e.memberIds)}"></div>
        <div class="agenda-item__body">
          <div class="agenda-item__title">${esc(e.title)}</div>
          ${metaParts.length ? `<div class="agenda-item__meta">${esc(metaParts.join(" · "))}</div>` : ""}
        </div>
      </div>`;
    })
    .join("")}</div>`;

  $$(".agenda-item", $("#agendaCard")).forEach((row) => {
    row.addEventListener("click", () => {
      const evt = state.events.find((e) => e.id === row.dataset.id);
      if (evt) openEventEditor(evt);
    });
  });
}

// ---------------------------------------------------------------------
// Reusable event editor — also used by the dashboard's quick-add sheet
// ---------------------------------------------------------------------
export function openEventEditor(existing, defaultDate = new Date()) {
  const isEdit = !!existing;
  const d = existing ? fromKey(existing.start.slice(0, 10)) : defaultDate;
  const startTime = existing && !existing.allDay ? existing.start.slice(11, 16) : "09:00";
  const endTime = existing && !existing.allDay && existing.end ? existing.end.slice(11, 16) : "10:00";
  const selectedIds = new Set(existing?.memberIds || (currentMember() ? [currentMember().id] : []));

  openSheet({
    title: isEdit ? "Edit event" : "Add event",
    bodyHtml: `
      <div class="field">
        <label for="evTitle">Title</label>
        <input class="input" id="evTitle" placeholder="e.g. Soccer practice" value="${esc(existing?.title || "")}" maxlength="80" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="evDate">Date</label>
          <input class="input" type="date" id="evDate" value="${dateKey(d)}" />
        </div>
        <div class="field" style="flex:0 0 auto;justify-content:flex-end;">
          <label for="evAllDay">All day</label>
          <div class="segmented" style="min-width:110px;">
            <button type="button" data-allday="0" class="${!existing?.allDay ? "is-active" : ""}">Timed</button>
            <button type="button" data-allday="1" class="${existing?.allDay ? "is-active" : ""}">All day</button>
          </div>
        </div>
      </div>
      <div class="field-row" id="timeRow" style="${existing?.allDay ? "display:none;" : ""}">
        <div class="field">
          <label for="evStart">Starts</label>
          <input class="input" type="time" id="evStart" value="${startTime}" />
        </div>
        <div class="field">
          <label for="evEnd">Ends</label>
          <input class="input" type="time" id="evEnd" value="${endTime}" />
        </div>
      </div>
      <div class="field">
        <label>Who's this for</label>
        <div class="chip-row" id="memberPick">
          ${state.members
            .map(
              (m) => `<button type="button" class="chip chip--member ${selectedIds.has(m.id) ? "is-active" : ""}"
                data-m="${m.id}" style="${selectedIds.has(m.id) ? `background:var(--${m.color});border-color:var(--${m.color})` : ""}">
                ${esc(m.name)}</button>`
            )
            .join("")}
        </div>
        <p class="hint mt-4">Leave everyone unselected for a whole-family event.</p>
      </div>
      <div class="field">
        <label for="evLoc">Location <span class="faint">(optional)</span></label>
        <input class="input" id="evLoc" placeholder="e.g. Lincoln Park" value="${esc(existing?.location || "")}" maxlength="80" />
      </div>
      <div class="field">
        <label for="evNotes">Notes <span class="faint">(optional)</span></label>
        <textarea class="textarea" id="evNotes" maxlength="300">${esc(existing?.notes || "")}</textarea>
      </div>
      <div class="modal-actions" style="margin-top:4px;">
        ${isEdit ? `<button class="btn btn--danger" id="evDelete">Delete</button>` : ""}
        <button class="btn btn--primary" id="evSave">${isEdit ? "Save changes" : "Add event"}</button>
      </div>
    `,
    onMount: (overlay) => {
      let allDay = !!existing?.allDay;

      $$('[data-allday]', overlay).forEach((btn) => {
        btn.addEventListener("click", () => {
          allDay = btn.dataset.allday === "1";
          $$('[data-allday]', overlay).forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          overlay.querySelector("#timeRow").style.display = allDay ? "none" : "flex";
        });
      });

      $$('[data-m]', overlay).forEach((chip) => {
        chip.addEventListener("click", () => {
          const id = chip.dataset.m;
          const active = chip.classList.toggle("is-active");
          const m = state.members.find((x) => x.id === id);
          chip.style.background = active ? `var(--${m.color})` : "";
          chip.style.borderColor = active ? `var(--${m.color})` : "";
          if (active) selectedIds.add(id);
          else selectedIds.delete(id);
        });
      });

      overlay.querySelector("#evSave").addEventListener("click", async () => {
        const title = overlay.querySelector("#evTitle").value.trim();
        if (!title) return toast("Give the event a title.");
        const dateVal = overlay.querySelector("#evDate").value;
        if (!dateVal) return toast("Pick a date.");
        const btn = overlay.querySelector("#evSave");
        btn.disabled = true;
        btn.textContent = "Saving…";

        const payload = {
          title,
          allDay,
          start: allDay ? `${dateVal}T00:00` : `${dateVal}T${overlay.querySelector("#evStart").value}`,
          end: allDay ? `${dateVal}T23:59` : `${dateVal}T${overlay.querySelector("#evEnd").value}`,
          memberIds: Array.from(selectedIds),
          location: overlay.querySelector("#evLoc").value.trim(),
          notes: overlay.querySelector("#evNotes").value.trim(),
        };
        try {
          if (isEdit) await store.updateEvent(state.householdId, existing.id, payload);
          else await store.addEvent(state.householdId, payload);
          closeOverlay();
          toast(isEdit ? "Event updated" : "Event added");
        } catch (err) {
          toast(err.message || "Couldn't save that event.");
          btn.disabled = false;
          btn.textContent = isEdit ? "Save changes" : "Add event";
        }
      });

      if (isEdit) {
        overlay.querySelector("#evDelete").addEventListener("click", async () => {
          const ok = await confirmDialog(`Delete "${existing.title}"? This can't be undone.`);
          if (!ok) return;
          await store.deleteEvent(state.householdId, existing.id);
          toast("Event deleted");
        });
      }
    },
  });
}
