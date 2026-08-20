import { state, onStateChange, memberById, currentMember } from "../state.js";
import * as store from "../store.js";
import { icon } from "../icons.js";
import {
  $,
  $$,
  esc,
  toast,
  openSheet,
  closeOverlay,
  confirmDialog,
  formatMoney,
  monthLabel,
  monthKey,
  dateKey,
  todayKey,
} from "../utils.js";

const CHART_PALETTE = ["#2F5233", "#D89B3C", "#B3543A", "#3E6E8E", "#7A5980", "#5E7A46", "#9C4F6E", "#54707A", "#8C978E"];

let viewMonth = new Date();
let ledgerMode = "category"; // 'category' | 'date'

export default function renderBudget(root, { setFab }) {
  root.innerHTML = `
    <div class="cal-nav">
      <button class="icon-btn" id="prevMonth">${icon("chevronLeft")}</button>
      <h2 id="monthLabel"></h2>
      <button class="icon-btn" id="nextMonth">${icon("chevronRight")}</button>
    </div>

    <div class="scroller mb-12">
      <div class="stat-card" style="min-width:150px;flex-shrink:0;">
        <div class="eyebrow">Income</div>
        <div class="stat-value" id="statIncome">$0</div>
      </div>
      <div class="stat-card" style="min-width:150px;flex-shrink:0;">
        <div class="eyebrow">Expenses</div>
        <div class="stat-value" id="statExpense">$0</div>
      </div>
      <div class="stat-card stat-card--brand" style="min-width:150px;flex-shrink:0;">
        <div class="eyebrow">Available</div>
        <div class="stat-value" id="statAvail">$0</div>
      </div>
    </div>

    <div class="card card--pad mb-12">
      <div class="row between mb-8">
        <span class="eyebrow">Budget used this month</span>
        <button class="link-btn" id="editBudgetBtn">${icon("edit", { size: 13 })} Set target</button>
      </div>
      <div id="budgetProgressWrap"></div>
    </div>

    <div class="section-head">
      <h2>Spending</h2>
      <div class="segmented" style="width:170px;">
        <button data-mode="category" class="is-active">By category</button>
        <button data-mode="date">By date</button>
      </div>
    </div>
    <div class="card card--pad" id="spendCard"></div>

    <div class="section-head">
      <h2>Bills</h2>
      <button class="link-btn" id="addBillBtn">${icon("plus", { size: 14 })} Add bill</button>
    </div>
    <div class="card card--pad" id="billsCard"></div>
  `;

  $("#prevMonth").addEventListener("click", () => {
    viewMonth.setMonth(viewMonth.getMonth() - 1);
    draw();
  });
  $("#nextMonth").addEventListener("click", () => {
    viewMonth.setMonth(viewMonth.getMonth() + 1);
    draw();
  });
  $("#editBudgetBtn").addEventListener("click", openBudgetTargetEditor);
  $("#addBillBtn").addEventListener("click", () => openBillEditor(null));
  $$('[data-mode]').forEach((btn) => {
    btn.addEventListener("click", () => {
      ledgerMode = btn.dataset.mode;
      $$('[data-mode]').forEach((b) => b.classList.toggle("is-active", b === btn));
      drawSpend();
    });
  });

  setFab({ iconName: "plus", label: "Add transaction", onClick: () => openTransactionEditor(null) });

  const unsub = onStateChange(draw);
  draw();
  return () => unsub();
}

function txInMonth(d) {
  const mk = monthKey(d);
  return state.transactions.filter((t) => (t.date || "").startsWith(mk));
}

function draw() {
  if (!$("#monthLabel")) return;
  $("#monthLabel").textContent = monthLabel(viewMonth);

  const txs = txInMonth(viewMonth);
  const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
  const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
  $("#statIncome").textContent = formatMoney(income);
  $("#statExpense").textContent = formatMoney(expense);
  $("#statAvail").textContent = formatMoney(income - expense);

  const target = Number(state.household?.monthlyBudget) || 0;
  if (target > 0) {
    const pct = Math.min(100, Math.round((expense / target) * 100));
    const cls = pct >= 100 ? "over" : pct >= 80 ? "warn" : "";
    $("#budgetProgressWrap").innerHTML = `
      <div class="progress-track ${cls}"><i style="width:${pct}%"></i></div>
      <div class="row between mt-8" style="font-size:12.5px;">
        <span class="muted num">${formatMoney(expense)} spent</span>
        <span class="faint num">${pct}% of ${formatMoney(target)}</span>
      </div>`;
  } else {
    $("#budgetProgressWrap").innerHTML = `<p class="muted text-sm">Set a monthly target to track how spending stacks up.</p>`;
  }

  drawSpend();
  drawBills();
}

function drawSpend() {
  const card = $("#spendCard");
  if (!card) return;
  const txs = txInMonth(viewMonth);
  const expenses = txs.filter((t) => t.type === "expense");

  if (!expenses.length) {
    card.innerHTML = `
      <div class="empty" style="border:none;padding:14px 4px;">
        ${icon("wallet", { size: 26 })}
        <strong>No expenses logged yet</strong>
        <p>Tap the + button to add your first transaction this month.</p>
      </div>`;
    return;
  }

  if (ledgerMode === "date") {
    const sorted = [...expenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    card.innerHTML = `<div class="ledger">${sorted.map(txRowHtml).join("")}</div>`;
    wireTxRows(card);
    return;
  }

  const byCat = {};
  expenses.forEach((t) => {
    const cat = t.category || "Miscellaneous";
    byCat[cat] = (byCat[cat] || 0) + Number(t.amount || 0);
  });
  const total = Object.values(byCat).reduce((a, b) => a + b, 0);
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const colorFor = (i) => CHART_PALETTE[i % CHART_PALETTE.length];

  const R = 54,
    STROKE = 20,
    CIRC = 2 * Math.PI * R;
  let offset = 0;
  const arcs = entries
    .map(([name, amt], i) => {
      const frac = total ? amt / total : 0;
      const dash = frac * CIRC;
      const seg = `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${colorFor(i)}" stroke-width="${STROKE}"
        stroke-dasharray="${dash} ${CIRC - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"/>`;
      offset += dash;
      return seg;
    })
    .join("");

  card.innerHTML = `
    <div class="row" style="gap:20px;align-items:center;flex-wrap:wrap;">
      <svg width="160" height="160" viewBox="0 0 160 160" style="flex-shrink:0;">
        ${arcs}
        <circle cx="80" cy="80" r="${R - STROKE / 2 - 2}" fill="var(--card)"/>
      </svg>
      <div style="flex:1;min-width:160px;">
        <div class="eyebrow">Total spent</div>
        <div class="stat-value" style="font-size:22px;">${formatMoney(total)}</div>
      </div>
    </div>
    <div class="legend">
      ${entries
        .map(
          ([name, amt], i) => `
        <div class="legend__row">
          <span class="legend__swatch" style="background:${colorFor(i)}"></span>
          <span class="legend__label">${esc(name)}</span>
          <span class="legend__value">${formatMoney(amt)}</span>
        </div>`
        )
        .join("")}
    </div>`;
}

function txRowHtml(t) {
  const isExpense = t.type === "expense";
  const member = t.memberId ? memberById(t.memberId) : null;
  return `
    <button class="ledger__row" data-id="${t.id}">
      <div class="ledger__icon">${icon(isExpense ? "arrowDownRight" : "arrowUpRight")}</div>
      <div class="ledger__body">
        <div class="ledger__label">${esc(t.category || "Uncategorized")}</div>
        <div class="ledger__meta">${esc(t.date || "")}${member ? " · " + esc(member.name) : ""}${t.note ? " · " + esc(t.note) : ""}</div>
      </div>
      <div class="ledger__value ledger__value--${isExpense ? "neg" : "pos"}">${isExpense ? "−" : "+"}${formatMoney(t.amount)}</div>
    </button>`;
}

function wireTxRows(root) {
  $$(".ledger__row", root).forEach((row) => {
    row.addEventListener("click", () => {
      const tx = state.transactions.find((t) => t.id === row.dataset.id);
      if (tx) openTransactionEditor(tx);
    });
  });
}

function drawBills() {
  const card = $("#billsCard");
  if (!card) return;
  if (!state.bills.length) {
    card.innerHTML = `
      <div class="empty" style="border:none;padding:14px 4px;">
        ${icon("bell", { size: 26 })}
        <strong>No recurring bills yet</strong>
        <p>Add rent, utilities, or subscriptions to track what's paid each month.</p>
      </div>`;
    return;
  }
  const mk = monthKey(new Date());
  const sorted = [...state.bills].sort((a, b) => (Number(a.dueDay) || 0) - (Number(b.dueDay) || 0));
  card.innerHTML = `<div class="stack" style="gap:0;">${sorted
    .map((b) => {
      const paid = !!(b.paidMonths && b.paidMonths[mk]);
      return `
      <div class="check-row ${paid ? "is-done" : ""}" data-id="${b.id}">
        <button class="checkbox ${paid ? "is-checked" : ""}" data-toggle>${icon("check")}</button>
        <div style="flex:1;min-width:0;cursor:pointer;" data-edit>
          <div class="check-row__label">${esc(b.name)}</div>
          <div class="check-row__meta">Due on the ${ordinal(b.dueDay)} · ${esc(b.category || "")}</div>
        </div>
        <div class="ledger__value">${formatMoney(b.amount)}</div>
      </div>`;
    })
    .join("")}</div>`;

  $$(".check-row", card).forEach((row) => {
    const id = row.dataset.id;
    row.querySelector("[data-toggle]").addEventListener("click", async () => {
      const bill = state.bills.find((b) => b.id === id);
      const paid = !!(bill.paidMonths && bill.paidMonths[mk]);
      await store.updateBill(state.householdId, id, { [`paidMonths.${mk}`]: !paid });
    });
    row.querySelector("[data-edit]").addEventListener("click", () => {
      const bill = state.bills.find((b) => b.id === id);
      openBillEditor(bill);
    });
  });
}

function ordinal(n) {
  n = Number(n) || 1;
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function categoryOptionsHtml(type, selected) {
  return state.categories
    .filter((c) => c.type === type)
    .map((c) => `<option value="${esc(c.name)}" ${c.name === selected ? "selected" : ""}>${esc(c.name)}</option>`)
    .join("");
}

export function openTransactionEditor(existing) {
  const isEdit = !!existing;
  let type = existing?.type || "expense";

  const render = (overlay) => {
    overlay.querySelector("#txCatWrap").innerHTML = `
      <select class="select" id="txCat">${categoryOptionsHtml(type, existing?.category)}</select>`;
  };

  openSheet({
    title: isEdit ? "Edit transaction" : "Add transaction",
    bodyHtml: `
      <div class="segmented mb-12">
        <button type="button" data-type="expense" class="${type === "expense" ? "is-active" : ""}">Expense</button>
        <button type="button" data-type="income" class="${type === "income" ? "is-active" : ""}">Income</button>
      </div>
      <div class="field">
        <label for="txAmount">Amount</label>
        <input class="input num" type="number" inputmode="decimal" step="0.01" min="0" id="txAmount" placeholder="0.00" value="${
          existing?.amount || ""
        }" />
      </div>
      <div class="field" id="txCatWrap">
        <label for="txCat">Category</label>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="txDate">Date</label>
          <input class="input" type="date" id="txDate" value="${existing?.date || dateKey(new Date())}" />
        </div>
        <div class="field">
          <label for="txMember">Paid by</label>
          <select class="select" id="txMember">
            <option value="">—</option>
            ${state.members
              .map(
                (m) =>
                  `<option value="${m.id}" ${(existing?.memberId || currentMember()?.id) === m.id ? "selected" : ""}>${esc(
                    m.name
                  )}</option>`
              )
              .join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="txNote">Note <span class="faint">(optional)</span></label>
        <input class="input" id="txNote" maxlength="80" value="${esc(existing?.note || "")}" />
      </div>
      <div class="modal-actions" style="margin-top:4px;">
        ${isEdit ? `<button class="btn btn--danger" id="txDelete">Delete</button>` : ""}
        <button class="btn btn--primary" id="txSave">${isEdit ? "Save changes" : "Add transaction"}</button>
      </div>
    `,
    onMount: (overlay) => {
      render(overlay);
      $$('[data-type]', overlay).forEach((btn) => {
        btn.addEventListener("click", () => {
          type = btn.dataset.type;
          $$('[data-type]', overlay).forEach((b) => b.classList.toggle("is-active", b === btn));
          render(overlay);
        });
      });
      overlay.querySelector("#txSave").addEventListener("click", async () => {
        const amount = parseFloat(overlay.querySelector("#txAmount").value);
        if (!amount || amount <= 0) return toast("Enter an amount greater than zero.");
        const btn = overlay.querySelector("#txSave");
        btn.disabled = true;
        btn.textContent = "Saving…";
        const payload = {
          type,
          amount,
          category: overlay.querySelector("#txCat").value,
          date: overlay.querySelector("#txDate").value || dateKey(new Date()),
          memberId: overlay.querySelector("#txMember").value || null,
          note: overlay.querySelector("#txNote").value.trim(),
        };
        try {
          if (isEdit) await store.updateTransaction(state.householdId, existing.id, payload);
          else await store.addTransaction(state.householdId, payload);
          closeOverlay();
          toast(isEdit ? "Transaction updated" : "Transaction added");
        } catch (err) {
          toast(err.message || "Couldn't save that transaction.");
          btn.disabled = false;
          btn.textContent = isEdit ? "Save changes" : "Add transaction";
        }
      });
      if (isEdit) {
        overlay.querySelector("#txDelete").addEventListener("click", async () => {
          const ok = await confirmDialog("Delete this transaction? This can't be undone.");
          if (!ok) return;
          await store.deleteTransaction(state.householdId, existing.id);
          toast("Transaction deleted");
        });
      }
    },
  });
}

function openBillEditor(existing) {
  const isEdit = !!existing;
  openSheet({
    title: isEdit ? "Edit bill" : "Add bill",
    bodyHtml: `
      <div class="field">
        <label for="blName">Bill name</label>
        <input class="input" id="blName" placeholder="e.g. Electricity" maxlength="60" value="${esc(existing?.name || "")}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="blAmount">Amount</label>
          <input class="input num" type="number" inputmode="decimal" step="0.01" min="0" id="blAmount" value="${
            existing?.amount || ""
          }" />
        </div>
        <div class="field">
          <label for="blDue">Due day of month</label>
          <input class="input num" type="number" min="1" max="31" id="blDue" value="${existing?.dueDay || 1}" />
        </div>
      </div>
      <div class="field">
        <label for="blCat">Category</label>
        <select class="select" id="blCat">${categoryOptionsHtml("expense", existing?.category)}</select>
      </div>
      <div class="modal-actions" style="margin-top:4px;">
        ${isEdit ? `<button class="btn btn--danger" id="blDelete">Delete</button>` : ""}
        <button class="btn btn--primary" id="blSave">${isEdit ? "Save changes" : "Add bill"}</button>
      </div>
    `,
    onMount: (overlay) => {
      overlay.querySelector("#blSave").addEventListener("click", async () => {
        const name = overlay.querySelector("#blName").value.trim();
        const amount = parseFloat(overlay.querySelector("#blAmount").value);
        if (!name) return toast("Give the bill a name.");
        if (!amount || amount <= 0) return toast("Enter an amount greater than zero.");
        const payload = {
          name,
          amount,
          dueDay: parseInt(overlay.querySelector("#blDue").value, 10) || 1,
          category: overlay.querySelector("#blCat").value,
        };
        try {
          if (isEdit) await store.updateBill(state.householdId, existing.id, payload);
          else await store.addBill(state.householdId, { paidMonths: {}, ...payload });
          closeOverlay();
          toast(isEdit ? "Bill updated" : "Bill added");
        } catch (err) {
          toast(err.message || "Couldn't save that bill.");
        }
      });
      if (isEdit) {
        overlay.querySelector("#blDelete").addEventListener("click", async () => {
          const ok = await confirmDialog(`Delete "${existing.name}"?`);
          if (!ok) return;
          await store.deleteBill(state.householdId, existing.id);
          toast("Bill deleted");
        });
      }
    },
  });
}

export function openBudgetTargetEditor() {
  openSheet({
    title: "Monthly budget target",
    bodyHtml: `
      <div class="field">
        <label for="targetInput">Target amount per month</label>
        <input class="input num" type="number" inputmode="decimal" min="0" step="1" id="targetInput" value="${
          state.household?.monthlyBudget || ""
        }" />
      </div>
      <button class="btn btn--primary btn--block" id="targetSave">Save target</button>
    `,
    onMount: (overlay) => {
      overlay.querySelector("#targetSave").addEventListener("click", async () => {
        const val = parseFloat(overlay.querySelector("#targetInput").value) || 0;
        await store.updateHousehold(state.householdId, { monthlyBudget: val });
        closeOverlay();
        toast("Budget target updated");
      });
    },
  });
}
