/*
  storage.js
  ----------
  Everything that touches localStorage lives here so the rest of the app
  doesn't need to know or care that we're using localStorage at all
  (could swap this out for a real backend later without touching app.js much).
*/

const STORAGE_KEYS = {
  transactions: 'et_transactions',
  budget: 'et_budget',
  goals: 'et_goals',
  recurring: 'et_recurring',
  darkMode: 'et_dark_mode',
  meta: 'et_meta' // last recurring-check date etc
};

const Store = {

  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('Storage read failed for', key, e);
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage write failed for', key, e);
      Utils.toast('Could not save — your browser storage might be full', 'error');
      return false;
    }
  },

  // --- Transactions ---
  getTransactions() {
    return this.get(STORAGE_KEYS.transactions, []);
  },
  saveTransactions(list) {
    return this.set(STORAGE_KEYS.transactions, list);
  },

  // --- Budget (kept as { month: 'YYYY-MM', amount: number } ) ---
  getBudget() {
    return this.get(STORAGE_KEYS.budget, null);
  },
  saveBudget(budget) {
    return this.set(STORAGE_KEYS.budget, budget);
  },

  // --- Goals ---
  getGoals() {
    return this.get(STORAGE_KEYS.goals, []);
  },
  saveGoals(goals) {
    return this.set(STORAGE_KEYS.goals, goals);
  },

  // --- Recurring templates ---
  getRecurring() {
    return this.get(STORAGE_KEYS.recurring, []);
  },
  saveRecurring(list) {
    return this.set(STORAGE_KEYS.recurring, list);
  },

  // --- Dark mode preference ---
  getDarkMode() {
    return this.get(STORAGE_KEYS.darkMode, false);
  },
  saveDarkMode(isDark) {
    return this.set(STORAGE_KEYS.darkMode, isDark);
  },

  getMeta() {
    return this.get(STORAGE_KEYS.meta, {});
  },
  saveMeta(meta) {
    return this.set(STORAGE_KEYS.meta, meta);
  }
};
