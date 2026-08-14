/*
  app.js
  ------
  Main app logic. Wrote this as one big module object (App) instead of a
  bunch of loose functions floating around global scope - easier to reason
  about, and I got tired of scrolling to find where things were defined.

  Quick note to future me: state.transactions is the single source of truth.
  Every render function just reads from it, nothing mutates the DOM directly
  outside of render*() functions.
*/

const CATEGORIES = {
  income: ['Salary', 'Freelancing', 'Business', 'Investment', 'Gift', 'Bonus', 'Refund', 'Other'],
  expense: ['Food', 'Shopping', 'Travel', 'Education', 'Medical', 'Entertainment', 'Bills', 'Rent', 'EMI', 'Fuel', 'Subscriptions', 'Other']
};

const App = {

  state: {
    transactions: [],
    goals: [],
    recurring: [],
    budget: null,
    editingTxnId: null,
    currentType: 'expense',
    page: 1,
    pageSize: 8,
    calDate: new Date(),
    pendingDelete: null // {type: 'txn'|'goal'|'recurring', id}
  },

  init() {
    this.state.transactions = Store.getTransactions();
    this.state.goals = Store.getGoals();
    this.state.recurring = Store.getRecurring();
    this.state.budget = Store.getBudget();

    // seed a tiny bit of sample data on very first run so the dashboard
    // doesn't look completely dead/empty for a first-time visitor
    if (this.state.transactions.length === 0 && !Store.getMeta().seeded) {
      this.seedSampleData();
    }

    this.applyDarkModePreference();
    this.processRecurringDue();
    this.bindEvents();
    this.populateCategoryDropdowns();
    this.setDefaultDate();
    this.renderEverything();

    setTimeout(() => {
      document.getElementById('preloader').classList.add('hide');
    }, 550);
  },

  seedSampleData() {
    const today = new Date();
    const iso = (d) => d.toISOString().split('T')[0];
    const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

    this.state.transactions = [
      { id: Utils.uid(), type: 'income', name: 'Monthly Salary', amount: 42000, category: 'Salary', date: daysAgo(2), payment: 'Bank Transfer', notes: '', recurring: true },
      { id: Utils.uid(), type: 'expense', name: 'Grocery run', amount: 2350, category: 'Food', date: daysAgo(1), payment: 'UPI', notes: 'Big Bazaar' },
      { id: Utils.uid(), type: 'expense', name: 'Netflix', amount: 649, category: 'Subscriptions', date: daysAgo(3), payment: 'Card', notes: '', recurring: true },
      { id: Utils.uid(), type: 'expense', name: 'Room rent', amount: 9500, category: 'Rent', date: daysAgo(5), payment: 'Bank Transfer', notes: '', recurring: true },
      { id: Utils.uid(), type: 'expense', name: 'Bus pass', amount: 450, category: 'Travel', date: daysAgo(6), payment: 'Cash', notes: '' },
      { id: Utils.uid(), type: 'expense', name: 'Movie with friends', amount: 600, category: 'Entertainment', date: daysAgo(8), payment: 'UPI', notes: 'PVR' },
      { id: Utils.uid(), type: 'income', name: 'Freelance logo work', amount: 5000, category: 'Freelancing', date: daysAgo(10), payment: 'UPI', notes: '' }
    ];
    Store.saveTransactions(this.state.transactions);
    Store.saveMeta({ ...Store.getMeta(), seeded: true });

    this.state.goals = [
      { id: Utils.uid(), name: 'New Laptop', target: 60000, saved: 15000, icon: 'fa-laptop' },
      { id: Utils.uid(), name: 'Emergency Fund', target: 30000, saved: 12000, icon: 'fa-shield-halved' }
    ];
    Store.saveGoals(this.state.goals);
  },

  setDefaultDate() {
    document.getElementById('txnDate').value = Utils.todayISO();
  },

  populateCategoryDropdowns() {
    const catSelect = document.getElementById('txnCategory');
    const filterCat = document.getElementById('filterCategory');
    const fillCats = (type) => {
      catSelect.innerHTML = CATEGORIES[type].map(c => `<option value="${c}">${c}</option>`).join('');
    };
    fillCats(this.state.currentType);

    const allCats = [...new Set([...CATEGORIES.income, ...CATEGORIES.expense])];
    filterCat.innerHTML = '<option value="all">All categories</option>' +
      allCats.map(c => `<option value="${c}">${c}</option>`).join('');

    this._fillCatsForType = fillCats;
  },

  // ==================================================================
  // EVENT BINDING
  // ==================================================================
  bindEvents() {
    // sidebar nav
    document.querySelectorAll('.nav-link, .link-view-all').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchView(link.dataset.view);
      });
    });

    // mobile sidebar toggle
    document.getElementById('openSidebar').addEventListener('click', () => this.toggleSidebar(true));
    document.getElementById('closeSidebar').addEventListener('click', () => this.toggleSidebar(false));
    document.getElementById('sidebarOverlay').addEventListener('click', () => this.toggleSidebar(false));

    // dark mode
    document.getElementById('darkModeToggle').addEventListener('click', () => this.toggleDarkMode());

    // add transaction modal
    document.getElementById('addTxnBtn').addEventListener('click', () => this.openTxnModal());
    document.getElementById('closeTxnModal').addEventListener('click', () => this.closeTxnModal());
    document.getElementById('cancelTxnBtn').addEventListener('click', () => this.closeTxnModal());
    document.getElementById('txnModalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'txnModalOverlay') this.closeTxnModal();
    });
    document.getElementById('txnForm').addEventListener('submit', (e) => this.handleTxnSubmit(e));

    document.getElementById('typeExpenseBtn').addEventListener('click', () => this.setTxnType('expense'));
    document.getElementById('typeIncomeBtn').addEventListener('click', () => this.setTxnType('income'));

    // search + filters
    document.getElementById('globalSearch').addEventListener('input', Utils.debounce(() => {
      this.state.page = 1;
      this.renderTransactionTable();
    }, 200));
    ['filterType', 'filterCategory', 'filterPayment', 'filterFrom', 'filterTo', 'sortBy'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        this.state.page = 1;
        this.renderTransactionTable();
      });
    });
    document.getElementById('resetFiltersBtn').addEventListener('click', () => this.resetFilters());

    // confirm modal
    document.getElementById('confirmCancelBtn').addEventListener('click', () => this.closeConfirmModal());
    document.getElementById('confirmOkBtn').addEventListener('click', () => this.executeConfirmedDelete());

    // budget
    document.getElementById('saveBudgetBtn').addEventListener('click', () => this.saveBudget());

    // goals
    document.getElementById('addGoalBtn').addEventListener('click', () => this.openGoalModal());
    document.getElementById('closeGoalModal').addEventListener('click', () => this.closeGoalModal());
    document.getElementById('cancelGoalBtn').addEventListener('click', () => this.closeGoalModal());
    document.getElementById('goalForm').addEventListener('submit', (e) => this.handleGoalSubmit(e));

    // recurring
    document.getElementById('addRecurringBtn').addEventListener('click', () => {
      this.openTxnModal();
      document.getElementById('txnRecurring').checked = true;
    });

    // calendar
    document.getElementById('calPrev').addEventListener('click', () => this.shiftCalendar(-1));
    document.getElementById('calNext').addEventListener('click', () => this.shiftCalendar(1));

    // reports / export / import / print
    document.getElementById('reportType').addEventListener('change', () => this.renderReport());
    document.getElementById('exportCsvBtn').addEventListener('click', () => this.exportCSV());
    document.getElementById('exportJsonBtn').addEventListener('click', () => this.exportJSON());
    document.getElementById('importJsonFile').addEventListener('change', (e) => this.importJSON(e));
    document.getElementById('printReportBtn').addEventListener('click', () => window.print());

    // keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));
  },

  // ==================================================================
  // VIEW SWITCHING
  // ==================================================================
  switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));

    const titles = {
      dashboard: ['Dashboard', "Here's where your money went this month."],
      transactions: ['Transactions', 'Every rupee, searchable and sortable.'],
      stats: ['Statistics', 'The numbers, charted out.'],
      budget: ['Budget', 'Keep your spending in check.'],
      goals: ['Goals', "Things you're saving up for."],
      calendar: ['Calendar', 'Your spending, day by day.'],
      reports: ['Reports', 'Export or print a summary.']
    };
    document.getElementById('pageTitle').textContent = titles[view][0];
    document.getElementById('pageSubtitle').textContent = titles[view][1];

    if (view === 'stats') Charts.renderAll(this.state.transactions);
    if (view === 'calendar') this.renderCalendar();
    if (view === 'reports') this.renderReport();
    if (view === 'budget') this.renderBudget();

    this.toggleSidebar(false);
  },

  toggleSidebar(open) {
    document.getElementById('sidebar').classList.toggle('open', open);
    document.getElementById('sidebarOverlay').classList.toggle('show', open);
  },

  // ==================================================================
  // DARK MODE
  // ==================================================================
  applyDarkModePreference() {
    const isDark = Store.getDarkMode();
    document.body.classList.toggle('dark', isDark);
    this.updateDarkModeIcon(isDark);
  },
  toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark');
    Store.saveDarkMode(isDark);
    this.updateDarkModeIcon(isDark);
    // re-render charts so grid/text colors update to the new theme
    if (document.getElementById('view-stats').classList.contains('active')) {
      Charts.renderAll(this.state.transactions);
    }
    Charts.renderBarChart(this.state.transactions, 'dashBarChart', 6);
  },
  updateDarkModeIcon(isDark) {
    const btn = document.getElementById('darkModeToggle');
    btn.innerHTML = isDark
      ? '<i class="fa-solid fa-sun"></i><span>Light mode</span>'
      : '<i class="fa-solid fa-moon"></i><span>Dark mode</span>';
  },

  // ==================================================================
  // TRANSACTION MODAL
  // ==================================================================
  setTxnType(type) {
    this.state.currentType = type;
    document.getElementById('typeExpenseBtn').classList.toggle('active', type === 'expense');
    document.getElementById('typeIncomeBtn').classList.toggle('active', type === 'income');
    this._fillCatsForType(type);
  },

  openTxnModal(txn = null) {
    const form = document.getElementById('txnForm');
    form.reset();
    this.clearFormErrors();
    this.setDefaultDate();

    if (txn) {
      this.state.editingTxnId = txn.id;
      document.getElementById('txnModalTitle').textContent = 'Edit Transaction';
      document.getElementById('saveTxnBtn').textContent = 'Update Transaction';
      this.setTxnType(txn.type);
      document.getElementById('txnId').value = txn.id;
      document.getElementById('txnName').value = txn.name;
      document.getElementById('txnAmount').value = txn.amount;
      document.getElementById('txnDate').value = txn.date;
      document.getElementById('txnCategory').value = txn.category;
      document.getElementById('txnPayment').value = txn.payment;
      document.getElementById('txnNotes').value = txn.notes || '';
      document.getElementById('txnRecurring').checked = !!txn.recurring;
    } else {
      this.state.editingTxnId = null;
      document.getElementById('txnModalTitle').textContent = 'Add Transaction';
      document.getElementById('saveTxnBtn').textContent = 'Save Transaction';
      this.setTxnType('expense');
    }
    document.getElementById('txnModalOverlay').classList.add('show');
    setTimeout(() => document.getElementById('txnName').focus(), 100);
  },

  closeTxnModal() {
    document.getElementById('txnModalOverlay').classList.remove('show');
  },

  clearFormErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
    document.querySelectorAll('.form-row input, .form-row select').forEach(el => el.classList.remove('invalid'));
  },

  validateTxnForm() {
    this.clearFormErrors();
    let valid = true;
    const name = document.getElementById('txnName').value.trim();
    const amount = parseFloat(document.getElementById('txnAmount').value);
    const date = document.getElementById('txnDate').value;

    if (!name) {
      document.getElementById('err-txnName').textContent = 'Please enter a name for this transaction.';
      document.getElementById('txnName').classList.add('invalid');
      valid = false;
    }
    if (isNaN(amount) || amount <= 0) {
      document.getElementById('err-txnAmount').textContent = 'Amount must be a number greater than 0.';
      document.getElementById('txnAmount').classList.add('invalid');
      valid = false;
    }
    if (!date) {
      document.getElementById('err-txnDate').textContent = 'Please pick a date.';
      document.getElementById('txnDate').classList.add('invalid');
      valid = false;
    } else {
      const picked = new Date(date);
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 1);
      if (isNaN(picked) || picked > maxDate) {
        document.getElementById('err-txnDate').textContent = "That date doesn't look right.";
        document.getElementById('txnDate').classList.add('invalid');
        valid = false;
      }
    }
    return valid;
  },

  handleTxnSubmit(e) {
    e.preventDefault();
    if (!this.validateTxnForm()) return;

    const data = {
      type: this.state.currentType,
      name: document.getElementById('txnName').value.trim(),
      amount: parseFloat(document.getElementById('txnAmount').value),
      date: document.getElementById('txnDate').value,
      category: document.getElementById('txnCategory').value,
      payment: document.getElementById('txnPayment').value,
      notes: document.getElementById('txnNotes').value.trim(),
      recurring: document.getElementById('txnRecurring').checked
    };

    if (this.state.editingTxnId) {
      const idx = this.state.transactions.findIndex(t => t.id === this.state.editingTxnId);
      if (idx !== -1) {
        this.state.transactions[idx] = { ...this.state.transactions[idx], ...data };
        Utils.toast('Transaction updated', 'success');
      }
    } else {
      data.id = Utils.uid();
      this.state.transactions.unshift(data);
      Utils.toast('Transaction added', 'success');
    }

    // keep a lightweight recurring template list in sync
    if (data.recurring) {
      const exists = this.state.recurring.find(r => r.name === data.name && r.category === data.category);
      if (!exists) {
        this.state.recurring.push({
          id: Utils.uid(), name: data.name, amount: data.amount, type: data.type,
          category: data.category, payment: data.payment, dayOfMonth: new Date(data.date + 'T00:00:00').getDate()
        });
        Store.saveRecurring(this.state.recurring);
      }
    }

    Store.saveTransactions(this.state.transactions);
    this.closeTxnModal();
    this.renderEverything();
  },

  editTransaction(id) {
    const txn = this.state.transactions.find(t => t.id === id);
    if (txn) this.openTxnModal(txn);
  },

  duplicateTransaction(id) {
    const txn = this.state.transactions.find(t => t.id === id);
    if (!txn) return;
    const copy = { ...txn, id: Utils.uid(), date: Utils.todayISO(), name: txn.name + ' (copy)' };
    this.state.transactions.unshift(copy);
    Store.saveTransactions(this.state.transactions);
    Utils.toast('Transaction duplicated', 'success');
    this.renderEverything();
  },

  deleteTransaction(id) {
    this.state.pendingDelete = { type: 'txn', id };
    document.getElementById('confirmMsg').textContent = 'This will permanently delete this transaction. This can\'t be undone.';
    document.getElementById('confirmModalOverlay').classList.add('show');
  },

  closeConfirmModal() {
    document.getElementById('confirmModalOverlay').classList.remove('show');
    this.state.pendingDelete = null;
  },

  executeConfirmedDelete() {
    const pending = this.state.pendingDelete;
    if (!pending) return this.closeConfirmModal();

    if (pending.type === 'txn') {
      this.state.transactions = this.state.transactions.filter(t => t.id !== pending.id);
      Store.saveTransactions(this.state.transactions);
      Utils.toast('Transaction deleted', 'info');
      this.renderEverything();
    } else if (pending.type === 'goal') {
      this.state.goals = this.state.goals.filter(g => g.id !== pending.id);
      Store.saveGoals(this.state.goals);
      Utils.toast('Goal removed', 'info');
      this.renderGoals();
    } else if (pending.type === 'recurring') {
      this.state.recurring = this.state.recurring.filter(r => r.id !== pending.id);
      Store.saveRecurring(this.state.recurring);
      Utils.toast('Recurring item removed', 'info');
      this.renderRecurring();
    }
    this.closeConfirmModal();
  },

  // ==================================================================
  // DASHBOARD RENDERING
  // ==================================================================
  renderEverything() {
    this.renderDashboardStats();
    this.renderMiniStats();
    this.renderRecentActivity();
    this.renderRecurring();
    this.renderTransactionTable();
    this.renderGoals();
    Charts.renderBarChart(this.state.transactions, 'dashBarChart', 6);
    if (document.getElementById('view-budget').classList.contains('active')) this.renderBudget();
  },

  calcTotals() {
    const income = this.state.transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = this.state.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const balance = income - expense;

    const thisMonth = Utils.todayISO().slice(0, 7);
    const monthIncome = this.state.transactions.filter(t => t.type === 'income' && t.date.startsWith(thisMonth)).reduce((s, t) => s + Number(t.amount), 0);
    const monthExpense = this.state.transactions.filter(t => t.type === 'expense' && t.date.startsWith(thisMonth)).reduce((s, t) => s + Number(t.amount), 0);

    return { income, expense, balance, monthIncome, monthExpense, monthSavings: monthIncome - monthExpense };
  },

  renderDashboardStats() {
    const t = this.calcTotals();
    Utils.animateCount(document.getElementById('statBalance'), t.balance);
    Utils.animateCount(document.getElementById('statIncome'), t.income);
    Utils.animateCount(document.getElementById('statExpense'), t.expense);
    Utils.animateCount(document.getElementById('statSavings'), t.monthSavings);
    Utils.animateCount(document.getElementById('statCount'), this.state.transactions.length, false);
  },

  renderMiniStats() {
    const list = document.getElementById('miniStatsList');
    const expenses = this.state.transactions.filter(t => t.type === 'expense');
    const incomes = this.state.transactions.filter(t => t.type === 'income');

    const highestExpense = expenses.length ? Math.max(...expenses.map(t => t.amount)) : 0;
    const highestIncome = incomes.length ? Math.max(...incomes.map(t => t.amount)) : 0;
    const avgExpense = expenses.length ? expenses.reduce((s, t) => s + t.amount, 0) / expenses.length : 0;
    const avgIncome = incomes.length ? incomes.reduce((s, t) => s + t.amount, 0) / incomes.length : 0;

    const catTotals = {};
    expenses.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
    const topCategory = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a])[0] || '—';

    const rows = [
      ['fa-arrow-up-long', 'Highest Expense', Utils.formatMoney(highestExpense)],
      ['fa-arrow-down-long', 'Highest Income', Utils.formatMoney(highestIncome)],
      ['fa-calculator', 'Average Expense', Utils.formatMoney(avgExpense)],
      ['fa-calculator', 'Average Income', Utils.formatMoney(avgIncome)],
      ['fa-tags', 'Top Category', topCategory]
    ];
    list.innerHTML = rows.map(r => `
      <li><span class="mini-icon"><i class="fa-solid ${r[0]}"></i></span><span class="mini-label">${r[1]}</span><span class="mini-value">${r[2]}</span></li>
    `).join('');
  },

  renderRecentActivity() {
    const container = document.getElementById('recentTxnList');
    const recent = [...this.state.transactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    if (recent.length === 0) {
      container.innerHTML = `<div class="empty-state small"><i class="fa-solid fa-inbox"></i><p>Nothing here yet. Add your first transaction!</p></div>`;
      return;
    }

    container.innerHTML = recent.map(t => `
      <div class="recent-item">
        <span class="recent-icon" style="background:${Utils.categoryColor(t.category)}22; color:${Utils.categoryColor(t.category)}">
          <i class="fa-solid ${Utils.categoryIcon(t.category)}"></i>
        </span>
        <div class="recent-mid">
          <span class="recent-name">${Utils.escapeHtml(t.name)}</span>
          <span class="recent-cat">${t.category} · ${Utils.relativeDate(t.date)}</span>
        </div>
        <span class="recent-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${Utils.formatMoney(t.amount)}</span>
      </div>
    `).join('');
  },

  // ==================================================================
  // RECURRING
  // ==================================================================
  processRecurringDue() {
    // very lightweight auto-add: if a recurring template's "day of month"
    // has passed this month and no matching transaction exists yet for
    // this month, add it automatically. Not trying to be a full cron here.
    const meta = Store.getMeta();
    const thisMonth = Utils.todayISO().slice(0, 7);
    if (meta.lastRecurringCheck === thisMonth) return;

    const todayDay = new Date().getDate();
    this.state.recurring.forEach(r => {
      if (todayDay < r.dayOfMonth) return;
      const already = this.state.transactions.some(t =>
        t.name === r.name && t.category === r.category && t.date.startsWith(thisMonth)
      );
      if (!already) {
        this.state.transactions.unshift({
          id: Utils.uid(), type: r.type, name: r.name, amount: r.amount,
          category: r.category, date: `${thisMonth}-${String(r.dayOfMonth).padStart(2, '0')}`,
          payment: r.payment, notes: 'Auto-added recurring transaction', recurring: true
        });
      }
    });
    Store.saveTransactions(this.state.transactions);
    Store.saveMeta({ ...meta, lastRecurringCheck: thisMonth });
  },

  renderRecurring() {
    const container = document.getElementById('recurringList');
    if (this.state.recurring.length === 0) {
      container.innerHTML = `<div class="empty-state small"><i class="fa-solid fa-rotate"></i><p>No recurring transactions set up yet.</p></div>`;
      return;
    }
    container.innerHTML = this.state.recurring.map(r => `
      <div class="recurring-item">
        <span class="recent-icon" style="background:${Utils.categoryColor(r.category)}22; color:${Utils.categoryColor(r.category)}">
          <i class="fa-solid ${Utils.categoryIcon(r.category)}"></i>
        </span>
        <div class="recent-mid">
          <span class="recent-name">${Utils.escapeHtml(r.name)}</span>
          <span class="recent-cat">Every month on day ${r.dayOfMonth}</span>
        </div>
        <span class="recent-amount ${r.type}">${Utils.formatMoney(r.amount)}</span>
        <button class="row-btn danger" onclick="App.deleteRecurring('${r.id}')" title="Remove"><i class="fa-solid fa-trash"></i></button>
      </div>
    `).join('');
  },

  deleteRecurring(id) {
    this.state.pendingDelete = { type: 'recurring', id };
    document.getElementById('confirmMsg').textContent = 'Remove this recurring transaction template? Past transactions from it will stay.';
    document.getElementById('confirmModalOverlay').classList.add('show');
  },

  // ==================================================================
  // TRANSACTIONS TABLE (search / filter / sort / pagination)
  // ==================================================================
  getFilteredTransactions() {
    const search = document.getElementById('globalSearch').value.trim().toLowerCase();
    const type = document.getElementById('filterType').value;
    const category = document.getElementById('filterCategory').value;
    const payment = document.getElementById('filterPayment').value;
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;
    const sortBy = document.getElementById('sortBy').value;

    let list = [...this.state.transactions];

    if (search) {
      list = list.filter(t =>
        t.name.toLowerCase().includes(search) ||
        t.category.toLowerCase().includes(search) ||
        String(t.amount).includes(search) ||
        t.date.includes(search)
      );
    }
    if (type !== 'all') list = list.filter(t => t.type === type);
    if (category !== 'all') list = list.filter(t => t.category === category);
    if (payment !== 'all') list = list.filter(t => t.payment === payment);
    if (from) list = list.filter(t => t.date >= from);
    if (to) list = list.filter(t => t.date <= to);

    switch (sortBy) {
      case 'oldest': list.sort((a, b) => new Date(a.date) - new Date(b.date)); break;
      case 'highest': list.sort((a, b) => b.amount - a.amount); break;
      case 'lowest': list.sort((a, b) => a.amount - b.amount); break;
      case 'az': list.sort((a, b) => a.name.localeCompare(b.name)); break;
      default: list.sort((a, b) => new Date(b.date) - new Date(a.date)); // newest
    }
    return list;
  },

  resetFilters() {
    document.getElementById('globalSearch').value = '';
    document.getElementById('filterType').value = 'all';
    document.getElementById('filterCategory').value = 'all';
    document.getElementById('filterPayment').value = 'all';
    document.getElementById('filterFrom').value = '';
    document.getElementById('filterTo').value = '';
    document.getElementById('sortBy').value = 'newest';
    this.state.page = 1;
    this.renderTransactionTable();
  },

  renderTransactionTable() {
    const list = this.getFilteredTransactions();
    const tbody = document.getElementById('txnTableBody');
    const emptyState = document.getElementById('txnEmptyState');

    if (list.length === 0) {
      tbody.innerHTML = '';
      emptyState.style.display = 'flex';
      document.getElementById('pagination').innerHTML = '';
      return;
    }
    emptyState.style.display = 'none';

    const totalPages = Math.max(1, Math.ceil(list.length / this.state.pageSize));
    if (this.state.page > totalPages) this.state.page = totalPages;
    const start = (this.state.page - 1) * this.state.pageSize;
    const pageItems = list.slice(start, start + this.state.pageSize);

    tbody.innerHTML = pageItems.map(t => `
      <tr>
        <td>
          <div class="txn-name-cell">
            <span class="txn-dot" style="background:${Utils.categoryColor(t.category)}"></span>
            <div>
              <div class="txn-name">${Utils.escapeHtml(t.name)} ${t.recurring ? '<i class="fa-solid fa-rotate recurring-flag" title="Recurring"></i>' : ''}</div>
              ${t.notes ? `<div class="txn-notes">${Utils.escapeHtml(t.notes)}</div>` : ''}
            </div>
          </div>
        </td>
        <td><span class="cat-pill" style="background:${Utils.categoryColor(t.category)}1a; color:${Utils.categoryColor(t.category)}"><i class="fa-solid ${Utils.categoryIcon(t.category)}"></i> ${t.category}</span></td>
        <td>${Utils.formatDate(t.date)}</td>
        <td>${t.payment}</td>
        <td class="amount-cell ${t.type}">${t.type === 'income' ? '+' : '-'}${Utils.formatMoney(t.amount)}</td>
        <td>
          <div class="row-actions">
            <button class="row-btn" title="Edit" onclick="App.editTransaction('${t.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="row-btn" title="Duplicate" onclick="App.duplicateTransaction('${t.id}')"><i class="fa-solid fa-copy"></i></button>
            <button class="row-btn danger" title="Delete" onclick="App.deleteTransaction('${t.id}')"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');

    this.renderPagination(totalPages, list.length);
  },

  renderPagination(totalPages, totalItems) {
    const el = document.getElementById('pagination');
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    let html = `<span class="page-info">${totalItems} transaction${totalItems === 1 ? '' : 's'}</span><div class="page-btns">`;
    html += `<button class="page-btn" ${this.state.page === 1 ? 'disabled' : ''} onclick="App.goToPage(${this.state.page - 1})"><i class="fa-solid fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (totalPages > 7 && Math.abs(i - this.state.page) > 2 && i !== 1 && i !== totalPages) {
        if (i === 2 || i === totalPages - 1) html += `<span class="page-dots">…</span>`;
        continue;
      }
      html += `<button class="page-btn ${i === this.state.page ? 'active' : ''}" onclick="App.goToPage(${i})">${i}</button>`;
    }
    html += `<button class="page-btn" ${this.state.page === totalPages ? 'disabled' : ''} onclick="App.goToPage(${this.state.page + 1})"><i class="fa-solid fa-chevron-right"></i></button>`;
    html += `</div>`;
    el.innerHTML = html;
  },

  goToPage(page) {
    this.state.page = page;
    this.renderTransactionTable();
    document.getElementById('view-transactions').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  // ==================================================================
  // BUDGET
  // ==================================================================
  saveBudget() {
    const val = parseFloat(document.getElementById('budgetInput').value);
    if (isNaN(val) || val <= 0) {
      Utils.toast('Enter a valid budget amount first', 'error');
      return;
    }
    this.state.budget = { month: Utils.todayISO().slice(0, 7), amount: val };
    Store.saveBudget(this.state.budget);
    Utils.toast('Budget saved', 'success');
    this.renderBudget();
  },

  renderBudget() {
    const wrap = document.getElementById('budgetProgressWrap');
    if (!this.state.budget || this.state.budget.month !== Utils.todayISO().slice(0, 7)) {
      wrap.style.display = 'none';
      document.getElementById('budgetInput').value = this.state.budget ? this.state.budget.amount : '';
      return;
    }
    document.getElementById('budgetInput').value = this.state.budget.amount;

    const thisMonth = Utils.todayISO().slice(0, 7);
    const spent = this.state.transactions
      .filter(t => t.type === 'expense' && t.date.startsWith(thisMonth))
      .reduce((s, t) => s + Number(t.amount), 0);

    const pct = Math.min(100, Math.round((spent / this.state.budget.amount) * 100));
    const remaining = this.state.budget.amount - spent;

    wrap.style.display = 'block';
    const fill = document.getElementById('budgetBarFill');
    fill.style.width = pct + '%';
    fill.classList.toggle('over', spent > this.state.budget.amount);

    document.getElementById('budgetUsedPct').textContent = pct + '%';
    document.getElementById('budgetSpent').textContent = Utils.formatMoney(spent);
    document.getElementById('budgetRemaining').textContent = Utils.formatMoney(Math.max(0, remaining));

    const alertEl = document.getElementById('budgetAlert');
    alertEl.style.display = spent > this.state.budget.amount ? 'flex' : 'none';
  },

  // ==================================================================
  // GOALS
  // ==================================================================
  openGoalModal() {
    document.getElementById('goalForm').reset();
    document.getElementById('goalModalOverlay').classList.add('show');
  },
  closeGoalModal() {
    document.getElementById('goalModalOverlay').classList.remove('show');
  },
  handleGoalSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('goalName').value.trim();
    const target = parseFloat(document.getElementById('goalTarget').value);
    const saved = parseFloat(document.getElementById('goalSaved').value) || 0;
    const icon = document.getElementById('goalIcon').value;

    if (!name || isNaN(target) || target <= 0) {
      Utils.toast('Please fill in the goal name and a valid target amount', 'error');
      return;
    }
    this.state.goals.push({ id: Utils.uid(), name, target, saved, icon });
    Store.saveGoals(this.state.goals);
    this.closeGoalModal();
    this.renderGoals();
    Utils.toast('Goal created', 'success');
  },

  renderGoals() {
    const grid = document.getElementById('goalsGrid');
    if (this.state.goals.length === 0) {
      grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-bullseye"></i><p>No goals yet. Set one and start tracking your progress!</p></div>`;
      return;
    }
    grid.innerHTML = this.state.goals.map(g => {
      const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
      return `
      <div class="goal-card">
        <div class="goal-top">
          <span class="goal-icon"><i class="fa-solid ${g.icon}"></i></span>
          <button class="row-btn danger" onclick="App.deleteGoal('${g.id}')" title="Delete goal"><i class="fa-solid fa-trash"></i></button>
        </div>
        <h4>${Utils.escapeHtml(g.name)}</h4>
        <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
        <div class="goal-numbers">
          <span>${Utils.formatMoney(g.saved)} saved</span>
          <span>${pct}%</span>
        </div>
        <p class="goal-target">Target: ${Utils.formatMoney(g.target)}</p>
        <div class="goal-add-row">
          <input type="number" placeholder="Add amount" id="goalAdd-${g.id}" min="1">
          <button class="btn btn-secondary btn-sm" onclick="App.addToGoal('${g.id}')">Add</button>
        </div>
      </div>`;
    }).join('');
  },

  addToGoal(id) {
    const input = document.getElementById(`goalAdd-${id}`);
    const amount = parseFloat(input.value);
    if (isNaN(amount) || amount <= 0) {
      Utils.toast('Enter an amount to add first', 'error');
      return;
    }
    const goal = this.state.goals.find(g => g.id === id);
    goal.saved = Math.min(goal.target, goal.saved + amount);
    Store.saveGoals(this.state.goals);
    this.renderGoals();
    Utils.toast(goal.saved >= goal.target ? `🎉 "${goal.name}" goal reached!` : 'Progress updated', 'success');
  },

  deleteGoal(id) {
    this.state.pendingDelete = { type: 'goal', id };
    document.getElementById('confirmMsg').textContent = 'Delete this goal? Your saved progress will be lost.';
    document.getElementById('confirmModalOverlay').classList.add('show');
  },

  // ==================================================================
  // CALENDAR
  // ==================================================================
  shiftCalendar(dir) {
    this.state.calDate.setMonth(this.state.calDate.getMonth() + dir);
    this.renderCalendar();
  },

  renderCalendar() {
    const d = this.state.calDate;
    const year = d.getFullYear();
    const month = d.getMonth();
    document.getElementById('calTitle').textContent = `${Utils.monthName(month)} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

    const dayTotals = {};
    this.state.transactions.filter(t => t.date.startsWith(monthKey)).forEach(t => {
      const day = parseInt(t.date.split('-')[2], 10);
      dayTotals[day] = dayTotals[day] || { income: 0, expense: 0 };
      dayTotals[day][t.type] += Number(t.amount);
    });

    let html = '';
    for (let i = 0; i < firstDay; i++) html += `<span class="cal-cell empty"></span>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const totals = dayTotals[day];
      const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
      html += `<button class="cal-cell ${isToday ? 'today' : ''} ${totals ? 'has-data' : ''}" onclick="App.showDayDetail(${year}, ${month}, ${day})">
        <span class="cal-day-num">${day}</span>
        ${totals ? `<span class="cal-dots">${totals.income ? '<i class="dot income"></i>' : ''}${totals.expense ? '<i class="dot expense"></i>' : ''}</span>` : ''}
      </button>`;
    }
    document.getElementById('calDays').innerHTML = html;
    document.getElementById('calDayDetail').style.display = 'none';
  },

  showDayDetail(year, month, day) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const txns = this.state.transactions.filter(t => t.date === dateStr);
    const detail = document.getElementById('calDayDetail');
    document.getElementById('calDayTitle').textContent = `Transactions on ${Utils.formatDate(dateStr)}`;

    const list = document.getElementById('calDayList');
    if (txns.length === 0) {
      list.innerHTML = `<div class="empty-state small"><i class="fa-solid fa-calendar-xmark"></i><p>Nothing recorded on this day.</p></div>`;
    } else {
      list.innerHTML = txns.map(t => `
        <div class="recent-item">
          <span class="recent-icon" style="background:${Utils.categoryColor(t.category)}22; color:${Utils.categoryColor(t.category)}"><i class="fa-solid ${Utils.categoryIcon(t.category)}"></i></span>
          <div class="recent-mid"><span class="recent-name">${Utils.escapeHtml(t.name)}</span><span class="recent-cat">${t.category}</span></div>
          <span class="recent-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${Utils.formatMoney(t.amount)}</span>
        </div>
      `).join('');
    }
    detail.style.display = 'block';
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  // ==================================================================
  // REPORTS + EXPORT/IMPORT
  // ==================================================================
  renderReport() {
    const type = document.getElementById('reportType').value;
    const out = document.getElementById('reportOutput');
    const t = this.calcTotals();

    if (type === 'summary') {
      out.innerHTML = `
        <h4>Summary Report</h4>
        <table class="report-table">
          <tr><td>Total Income</td><td>${Utils.formatMoney(t.income)}</td></tr>
          <tr><td>Total Expenses</td><td>${Utils.formatMoney(t.expense)}</td></tr>
          <tr><td>Current Balance</td><td>${Utils.formatMoney(t.balance)}</td></tr>
          <tr><td>Total Transactions</td><td>${this.state.transactions.length}</td></tr>
        </table>`;
    } else if (type === 'category') {
      const totals = {};
      this.state.transactions.filter(x => x.type === 'expense').forEach(x => { totals[x.category] = (totals[x.category] || 0) + x.amount; });
      const rows = Object.entries(totals).sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => `<tr><td>${cat}</td><td>${Utils.formatMoney(amt)}</td></tr>`).join('');
      out.innerHTML = `<h4>Category Report (Expenses)</h4><table class="report-table">${rows || '<tr><td colspan="2">No expenses recorded.</td></tr>'}</table>`;
    } else if (type === 'monthly') {
      const months = Charts.lastNMonths(6);
      const rows = months.map(m => {
        const inc = this.state.transactions.filter(x => x.type === 'income' && x.date.startsWith(m.key)).reduce((s, x) => s + x.amount, 0);
        const exp = this.state.transactions.filter(x => x.type === 'expense' && x.date.startsWith(m.key)).reduce((s, x) => s + x.amount, 0);
        return `<tr><td>${m.label}</td><td>${Utils.formatMoney(inc)}</td><td>${Utils.formatMoney(exp)}</td><td>${Utils.formatMoney(inc - exp)}</td></tr>`;
      }).join('');
      out.innerHTML = `<h4>Monthly Report</h4><table class="report-table"><tr><th>Month</th><th>Income</th><th>Expense</th><th>Net</th></tr>${rows}</table>`;
    } else if (type === 'yearly') {
      const years = [...new Set(this.state.transactions.map(x => x.date.slice(0, 4)))].sort();
      const rows = years.map(y => {
        const inc = this.state.transactions.filter(x => x.type === 'income' && x.date.startsWith(y)).reduce((s, x) => s + x.amount, 0);
        const exp = this.state.transactions.filter(x => x.type === 'expense' && x.date.startsWith(y)).reduce((s, x) => s + x.amount, 0);
        return `<tr><td>${y}</td><td>${Utils.formatMoney(inc)}</td><td>${Utils.formatMoney(exp)}</td><td>${Utils.formatMoney(inc - exp)}</td></tr>`;
      }).join('');
      out.innerHTML = `<h4>Yearly Report</h4><table class="report-table"><tr><th>Year</th><th>Income</th><th>Expense</th><th>Net</th></tr>${rows || '<tr><td colspan="4">No data yet.</td></tr>'}</table>`;
    }
  },

  exportCSV() {
    if (this.state.transactions.length === 0) {
      Utils.toast('Nothing to export yet', 'error');
      return;
    }
    const header = ['Name', 'Type', 'Amount', 'Category', 'Date', 'Payment Method', 'Notes'];
    const rows = this.state.transactions.map(t => [t.name, t.type, t.amount, t.category, t.date, t.payment, t.notes || ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    Utils.downloadFile(`expense-tracker-export-${Utils.todayISO()}.csv`, csv, 'text/csv');
    Utils.toast('CSV exported', 'success');
  },

  exportJSON() {
    const payload = {
      transactions: this.state.transactions,
      goals: this.state.goals,
      recurring: this.state.recurring,
      budget: this.state.budget,
      exportedAt: new Date().toISOString()
    };
    Utils.downloadFile(`expense-tracker-backup-${Utils.todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    Utils.toast('JSON backup exported', 'success');
  },

  importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!Array.isArray(data.transactions)) throw new Error('bad file');
        this.state.transactions = data.transactions;
        this.state.goals = data.goals || [];
        this.state.recurring = data.recurring || [];
        this.state.budget = data.budget || null;
        Store.saveTransactions(this.state.transactions);
        Store.saveGoals(this.state.goals);
        Store.saveRecurring(this.state.recurring);
        Store.saveBudget(this.state.budget);
        this.renderEverything();
        Utils.toast('Backup imported successfully', 'success');
      } catch (err) {
        Utils.toast("That doesn't look like a valid backup file", 'error');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  },

  // ==================================================================
  // KEYBOARD SHORTCUTS
  // ==================================================================
  handleKeyboard(e) {
    // ignore shortcuts while typing in a field, except for Escape
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

    if (e.key === 'Escape') {
      this.closeTxnModal();
      this.closeGoalModal();
      this.closeConfirmModal();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      this.openTxnModal();
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      this.switchView('transactions');
      document.getElementById('globalSearch').focus();
    }
    if (e.key === 'Delete' && !typing && this._lastFocusedTxnId) {
      this.deleteTransaction(this._lastFocusedTxnId);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
