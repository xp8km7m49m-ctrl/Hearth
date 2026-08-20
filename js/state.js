// ==========================================================================
// A deliberately small central store. No framework — just a shared object,
// a list of listeners, and a notify() call after every Firestore snapshot.
// Views call onStateChange() when mounted and unsubscribe when unmounted.
// ==========================================================================

export const state = {
  householdId: null,
  memberId: null,
  household: null,
  members: [],
  events: [],
  categories: [],
  transactions: [],
  bills: [],
  mealPlan: [],
  shoppingItems: [],
  tasks: [],
  rewards: [],
  redemptions: [],
  ready: false, // true once the core collections have loaded at least once
};

const listeners = new Set();

export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (err) {
      console.error("[hearth] listener error:", err);
    }
  });
}

export function currentMember() {
  return state.members.find((m) => m.id === state.memberId) || null;
}

export function memberById(id) {
  return state.members.find((m) => m.id === id) || null;
}

export function isParent() {
  const m = currentMember();
  return !m || m.role === "parent"; // default to trusted if unknown
}
