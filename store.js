import { db } from "./firebase-config.js";
import { generateHouseholdCode, dateKey, todayKey } from "./utils.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  runTransaction,
  increment,
  writeBatch,
  deleteField,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// ---------------------------------------------------------------------
// Defaults used to seed a brand-new household
// ---------------------------------------------------------------------
export const DEFAULT_CATEGORIES = [
  { name: "Income", type: "income", icon: "coins" },
  { name: "Home / Rent", type: "expense", icon: "home" },
  { name: "Utilities", type: "expense", icon: "bell" },
  { name: "Groceries", type: "expense", icon: "cart" },
  { name: "Transportation", type: "expense", icon: "arrowUpRight" },
  { name: "Medical", type: "expense", icon: "checkCircle" },
  { name: "Insurance", type: "expense", icon: "book" },
  { name: "Entertainment", type: "expense", icon: "star" },
  { name: "Debt Payments", type: "expense", icon: "wallet" },
  { name: "Savings", type: "expense", icon: "gift" },
  { name: "Personal", type: "expense", icon: "users" },
  { name: "Miscellaneous", type: "expense", icon: "inbox" },
];

export const DEFAULT_REWARDS = [
  { name: "30 min extra screen time", cost: 20, emoji: "📱" },
  { name: "Pick tonight's dinner", cost: 15, emoji: "🍽️" },
  { name: "Family movie night pick", cost: 25, emoji: "🎬" },
  { name: "Stay up 30 min late", cost: 30, emoji: "🌙" },
  { name: "$5 allowance bonus", cost: 40, emoji: "💵" },
  { name: "Day trip of your choice", cost: 100, emoji: "🎡" },
];

export const SHOPPING_CATEGORIES = [
  "Fruit & Veg", "Meat & Fish", "Bakery", "Dairy & Eggs", "Pantry & Larder",
  "Frozen", "Snacks", "Drinks", "Household", "Toiletries", "Baby & Pet", "Other",
];

export const TASK_CATEGORIES = [
  { key: "morning", label: "Morning routine", icon: "sun" },
  { key: "chore", label: "Chores", icon: "checkCircle" },
  { key: "afternoon", label: "Afternoon", icon: "sunset" },
  { key: "evening", label: "Evening routine", icon: "moon" },
  { key: "todo", label: "To-do", icon: "inbox" },
];

// ---------------------------------------------------------------------
// Household lifecycle
// ---------------------------------------------------------------------
export async function createHousehold({ householdName, memberName, color }) {
  let code, ref, snap;
  for (let attempt = 0; attempt < 6; attempt++) {
    code = generateHouseholdCode();
    ref = doc(db, "households", code);
    snap = await getDoc(ref);
    if (!snap.exists()) break;
    code = null;
  }
  if (!code) throw new Error("Could not generate a unique code, please try again.");

  await setDoc(ref, {
    name: householdName || "Our Household",
    code,
    createdAt: serverTimestamp(),
  });

  const batch = writeBatch(db);
  DEFAULT_CATEGORIES.forEach((c) => {
    const cRef = doc(collection(db, "households", code, "categories"));
    batch.set(cRef, c);
  });
  DEFAULT_REWARDS.forEach((r) => {
    const rRef = doc(collection(db, "households", code, "rewards"));
    batch.set(rRef, { ...r, createdAt: Date.now() });
  });
  await batch.commit();

  const memberRef = await addDoc(collection(db, "households", code, "members"), {
    name: memberName || "Me",
    color: color || "m1",
    role: "parent",
    points: 0,
    createdAt: serverTimestamp(),
  });

  return { householdId: code, memberId: memberRef.id };
}

export async function joinHousehold({ code, memberName, color, role = "member" }) {
  const cleanCode = code.trim().toUpperCase();
  const ref = doc(db, "households", cleanCode);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("We couldn't find a household with that code. Double-check it and try again.");
  }
  const memberRef = await addDoc(collection(db, "households", cleanCode, "members"), {
    name: memberName || "Me",
    color: color || "m2",
    role,
    points: 0,
    createdAt: serverTimestamp(),
  });
  return { householdId: cleanCode, memberId: memberRef.id, household: snap.data() };
}

export async function getHousehold(code) {
  const snap = await getDoc(doc(db, "households", code));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateHousehold(code, patch) {
  await updateDoc(doc(db, "households", code), patch);
}

export function subscribeHousehold(code, cb) {
  return onSnapshot(
    doc(db, "households", code),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => console.error("[hearth] household subscription error:", err)
  );
}

// ---------------------------------------------------------------------
// Generic realtime subscription helper
// ---------------------------------------------------------------------
function subscribeCollection(path, cb, orderField) {
  const ref = collection(db, ...path);
  const q = orderField ? query(ref, orderBy(orderField)) : ref;
  return onSnapshot(
    q,
    (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      cb(rows);
    },
    (err) => console.error(`[hearth] subscription error on ${path.join("/")}:`, err)
  );
}

// ---------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------
export const subscribeMembers = (hh, cb) =>
  subscribeCollection(["households", hh, "members"], cb, "createdAt");

export const updateMember = (hh, id, patch) =>
  updateDoc(doc(db, "households", hh, "members", id), patch);

export const deleteMember = (hh, id) =>
  deleteDoc(doc(db, "households", hh, "members", id));

export const addMember = (hh, data) =>
  addDoc(collection(db, "households", hh, "members"), { ...data, points: 0, createdAt: serverTimestamp() });

export async function adjustPoints(hh, memberId, delta) {
  await updateDoc(doc(db, "households", hh, "members", memberId), {
    points: increment(delta),
  });
}

// ---------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------
export const subscribeEvents = (hh, cb) =>
  subscribeCollection(["households", hh, "events"], cb, "start");

export const addEvent = (hh, data) =>
  addDoc(collection(db, "households", hh, "events"), { ...data, createdAt: serverTimestamp() });

export const updateEvent = (hh, id, patch) =>
  updateDoc(doc(db, "households", hh, "events", id), patch);

export const deleteEvent = (hh, id) =>
  deleteDoc(doc(db, "households", hh, "events", id));

// ---------------------------------------------------------------------
// Budget: categories, transactions, bills
// ---------------------------------------------------------------------
export const subscribeCategories = (hh, cb) =>
  subscribeCollection(["households", hh, "categories"], cb);

export const addCategory = (hh, data) =>
  addDoc(collection(db, "households", hh, "categories"), data);

export const deleteCategory = (hh, id) =>
  deleteDoc(doc(db, "households", hh, "categories", id));

export const subscribeTransactions = (hh, cb) =>
  subscribeCollection(["households", hh, "transactions"], cb, "date");

export const addTransaction = (hh, data) =>
  addDoc(collection(db, "households", hh, "transactions"), { ...data, createdAt: serverTimestamp() });

export const updateTransaction = (hh, id, patch) =>
  updateDoc(doc(db, "households", hh, "transactions", id), patch);

export const deleteTransaction = (hh, id) =>
  deleteDoc(doc(db, "households", hh, "transactions", id));

export const subscribeBills = (hh, cb) =>
  subscribeCollection(["households", hh, "bills"], cb, "dueDay");

export const addBill = (hh, data) =>
  addDoc(collection(db, "households", hh, "bills"), data);

export const updateBill = (hh, id, patch) =>
  updateDoc(doc(db, "households", hh, "bills", id), patch);

export const deleteBill = (hh, id) =>
  deleteDoc(doc(db, "households", hh, "bills", id));

// ---------------------------------------------------------------------
// Meal plan — one document per ISO date, e.g. "2026-08-19"
// ---------------------------------------------------------------------
export const subscribeMealPlan = (hh, cb) =>
  subscribeCollection(["households", hh, "mealPlan"], cb);

export async function setMeal(hh, dateKeyStr, slot, value) {
  const ref = doc(db, "households", hh, "mealPlan", dateKeyStr);
  await setDoc(ref, { [slot]: value, date: dateKeyStr }, { merge: true });
}

// ---------------------------------------------------------------------
// Shopping list
// ---------------------------------------------------------------------
export const subscribeShoppingList = (hh, cb) =>
  subscribeCollection(["households", hh, "shoppingItems"], cb, "createdAt");

export const addShoppingItem = (hh, data) =>
  addDoc(collection(db, "households", hh, "shoppingItems"), {
    checked: false,
    qty: "",
    category: "Other",
    ...data,
    createdAt: serverTimestamp(),
  });

export const updateShoppingItem = (hh, id, patch) =>
  updateDoc(doc(db, "households", hh, "shoppingItems", id), patch);

export const deleteShoppingItem = (hh, id) =>
  deleteDoc(doc(db, "households", hh, "shoppingItems", id));

export async function clearCheckedShoppingItems(hh, items) {
  const batch = writeBatch(db);
  items.filter((i) => i.checked).forEach((i) => {
    batch.delete(doc(db, "households", hh, "shoppingItems", i.id));
  });
  await batch.commit();
}

// ---------------------------------------------------------------------
// Tasks (chores / routines / to-dos) — completions keyed by date string
// ---------------------------------------------------------------------
export const subscribeTasks = (hh, cb) =>
  subscribeCollection(["households", hh, "tasks"], cb, "createdAt");

export const addTask = (hh, data) =>
  addDoc(collection(db, "households", hh, "tasks"), {
    completions: {},
    ...data,
    createdAt: serverTimestamp(),
  });

export const updateTask = (hh, id, patch) =>
  updateDoc(doc(db, "households", hh, "tasks", id), patch);

export const deleteTask = (hh, id) =>
  deleteDoc(doc(db, "households", hh, "tasks", id));

/**
 * Toggle a task's completion for a given day and award/revoke points to the
 * assigned member atomically.
 */
export async function toggleTaskCompletion(hh, task, memberId, dayKey = todayKey()) {
  const taskRef = doc(db, "households", hh, "tasks", task.id);
  const wasDone = !!(task.completions && task.completions[dayKey]);
  const points = Number(task.points) || 0;

  await runTransaction(db, async (tx) => {
    tx.update(taskRef, { [`completions.${dayKey}`]: wasDone ? deleteField() : { by: memberId, at: Date.now() } });
    if (memberId && points) {
      const memberRef = doc(db, "households", hh, "members", memberId);
      tx.update(memberRef, { points: increment(wasDone ? -points : points) });
    }
  });
  return !wasDone;
}

// ---------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------
export const subscribeRewards = (hh, cb) =>
  subscribeCollection(["households", hh, "rewards"], cb);

export const addReward = (hh, data) =>
  addDoc(collection(db, "households", hh, "rewards"), { ...data, createdAt: Date.now() });

export const updateReward = (hh, id, patch) =>
  updateDoc(doc(db, "households", hh, "rewards", id), patch);

export const deleteReward = (hh, id) =>
  deleteDoc(doc(db, "households", hh, "rewards", id));

/** Redeem a reward: fails safely if the member no longer has enough points. */
export async function redeemReward(hh, reward, member) {
  const memberRef = doc(db, "households", hh, "members", member.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(memberRef);
    const current = snap.data()?.points || 0;
    if (current < reward.cost) {
      throw new Error("Not enough points yet.");
    }
    tx.update(memberRef, { points: increment(-reward.cost) });
  });
  const logRef = doc(collection(db, "households", hh, "redemptions"));
  await setDoc(logRef, {
    rewardName: reward.name,
    cost: reward.cost,
    memberId: member.id,
    memberName: member.name,
    at: serverTimestamp(),
  });
}

export const subscribeRedemptions = (hh, cb) =>
  subscribeCollection(["households", hh, "redemptions"], cb);
