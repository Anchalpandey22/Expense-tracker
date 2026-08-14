/*
  charts.js
  ---------
  All the Chart.js instances live here. Named this "charts.js" (plural)
  instead of "chart.js" so it doesn't get confused with the actual
  Chart.js library file in dev tools - tripped me up once, not doing it again.
*/

const Charts = {
  instances: {},

  // grabs the last N months as {key: 'YYYY-MM', label: 'Jan'} objects
  lastNMonths(n) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: Utils.monthName(d.getMonth())
      });
    }
    return out;
  },

  destroy(id) {
    if (this.instances[id]) {
      this.instances[id].destroy();
      delete this.instances[id];
    }
  },

  isDark() {
    return document.body.classList.contains('dark');
  },

  gridColor() {
    return this.isDark() ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)';
  },

  textColor() {
    return this.isDark() ? '#b7bfd6' : '#5a6479';
  },

  // ---- 1. Monthly Expenses (line) ----
  renderLineChart(transactions) {
    const ctx = document.getElementById('lineChart');
    if (!ctx) return;
    const months = this.lastNMonths(6);
    const data = months.map(m => {
      return transactions
        .filter(t => t.type === 'expense' && t.date.startsWith(m.key))
        .reduce((sum, t) => sum + Number(t.amount), 0);
    });

    this.destroy('line');
    this.instances.line = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months.map(m => m.label),
        datasets: [{
          label: 'Expenses',
          data,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,0.12)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#ef4444'
        }]
      },
      options: this.baseOptions('Expenses')
    });
  },

  // ---- 2. Expense by Category (pie) ----
  renderPieChart(transactions) {
    const ctx = document.getElementById('pieChart');
    if (!ctx) return;
    const totals = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      totals[t.category] = (totals[t.category] || 0) + Number(t.amount);
    });
    const labels = Object.keys(totals);
    const values = Object.values(totals);
    const colors = labels.map(l => Utils.categoryColor(l));

    this.destroy('pie');
    if (labels.length === 0) {
      this.instances.pie = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['No expenses yet'], datasets: [{ data: [1], backgroundColor: ['#e2e8f0'] }] },
        options: { plugins: { legend: { display: false } } }
      });
      return;
    }
    this.instances.pie = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: this.isDark() ? '#171b2e' : '#fff' }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { color: this.textColor(), boxWidth: 12, padding: 14, font: { family: 'Poppins' } } }
        }
      }
    });
  },

  // ---- 3. Income vs Expense (bar) ----
  renderBarChart(transactions, canvasId = 'barChart', months = 6) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const monthList = this.lastNMonths(months);
    const income = monthList.map(m => transactions.filter(t => t.type === 'income' && t.date.startsWith(m.key)).reduce((s, t) => s + Number(t.amount), 0));
    const expense = monthList.map(m => transactions.filter(t => t.type === 'expense' && t.date.startsWith(m.key)).reduce((s, t) => s + Number(t.amount), 0));

    this.destroy(canvasId);
    this.instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthList.map(m => m.label),
        datasets: [
          { label: 'Income', data: income, backgroundColor: '#22c55e', borderRadius: 6, maxBarThickness: 26 },
          { label: 'Expense', data: expense, backgroundColor: '#ef4444', borderRadius: 6, maxBarThickness: 26 }
        ]
      },
      options: this.baseOptions(null, true)
    });
  },

  // ---- 4. Savings Trend (area) ----
  renderAreaChart(transactions) {
    const ctx = document.getElementById('areaChart');
    if (!ctx) return;
    const months = this.lastNMonths(6);
    const data = months.map(m => {
      const income = transactions.filter(t => t.type === 'income' && t.date.startsWith(m.key)).reduce((s, t) => s + Number(t.amount), 0);
      const expense = transactions.filter(t => t.type === 'expense' && t.date.startsWith(m.key)).reduce((s, t) => s + Number(t.amount), 0);
      return income - expense;
    });

    this.destroy('area');
    this.instances.area = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months.map(m => m.label),
        datasets: [{
          label: 'Savings',
          data,
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124,58,237,0.18)',
          fill: 'origin',
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: '#7c3aed'
        }]
      },
      options: this.baseOptions('Savings')
    });
  },

  baseOptions(singleLabel, isBar = false) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: isBar, position: 'bottom', labels: { color: this.textColor(), font: { family: 'Poppins' } } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label || singleLabel}: ${Utils.formatMoney(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: { grid: { color: this.gridColor() }, ticks: { color: this.textColor(), font: { family: 'Poppins' } } },
        y: { grid: { color: this.gridColor() }, ticks: { color: this.textColor(), font: { family: 'Poppins' }, callback: (v) => '₹' + v } }
      }
    };
  },

  renderAll(transactions) {
    this.renderLineChart(transactions);
    this.renderPieChart(transactions);
    this.renderBarChart(transactions, 'barChart', 6);
    this.renderAreaChart(transactions);
    this.renderBarChart(transactions, 'dashBarChart', 6);
  }
};
