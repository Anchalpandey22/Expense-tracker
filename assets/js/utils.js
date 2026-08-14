/*
  utils.js
  -------
  Small helper functions used all over the app. Kept separate from app.js
  so that file doesn't turn into a 2000 line mess (learned that the hard way
  on a earlier project lol).
*/

const Utils = {

  // formats a number as Indian Rupees. Using Intl because writing my own
  // comma-placement logic for lakhs/crores sounded like a nightmare.
  formatMoney(amount) {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  },

  // same as above but keeps decimals, used in a couple of spots where
  // rounding to whole rupees looked wrong
  formatMoneyDecimal(amount) {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(num);
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  // "3 days ago" style relative dates for the recent activity list
  relativeDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.round((now - d) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
    return this.formatDate(dateStr);
  },

  todayISO() {
    const d = new Date();
    return d.toISOString().split('T')[0];
  },

  // simple unique id, good enough for a client-side only app
  uid() {
    return 'txn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  },

  // debounce for the search box so we're not re-rendering on every keystroke
  debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // quick category -> icon mapping, mostly just picked whatever felt right
  categoryIcon(category) {
    const icons = {
      Salary: 'fa-money-check-dollar', Freelancing: 'fa-laptop-code', Business: 'fa-briefcase',
      Investment: 'fa-chart-line', Gift: 'fa-gift', Bonus: 'fa-star', Refund: 'fa-rotate-left',
      Food: 'fa-utensils', Shopping: 'fa-bag-shopping', Travel: 'fa-plane', Education: 'fa-book',
      Medical: 'fa-briefcase-medical', Entertainment: 'fa-film', Bills: 'fa-file-invoice-dollar',
      Rent: 'fa-house', EMI: 'fa-credit-card', Fuel: 'fa-gas-pump', Subscriptions: 'fa-rotate',
      Other: 'fa-circle-dot'
    };
    return icons[category] || 'fa-circle-dot';
  },

  // small library of colors used consistently across pie/bar charts
  categoryColor(category) {
    const map = {
      Food: '#f59e0b', Shopping: '#ec4899', Travel: '#06b6d4', Education: '#8b5cf6',
      Medical: '#ef4444', Entertainment: '#a855f7', Bills: '#f97316', Rent: '#6366f1',
      EMI: '#e11d48', Fuel: '#84cc16', Subscriptions: '#14b8a6', Other: '#64748b',
      Salary: '#22c55e', Freelancing: '#0ea5e9', Business: '#10b981', Investment: '#3b82f6',
      Gift: '#f43f5e', Bonus: '#eab308', Refund: '#94a3b8'
    };
    return map[category] || '#94a3b8';
  },

  toast(msg, type = 'info') {
    const box = document.getElementById('toastBox');
    if (!box) return;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${this.escapeHtml(msg)}</span>`;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  },

  // animates a number counting up, used for the dashboard stat cards
  animateCount(el, endValue, isMoney = true, duration = 800) {
    const startValue = 0;
    const startTime = performance.now();
    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      // ease-out, felt smoother than linear
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * eased;
      el.textContent = isMoney ? Utils.formatMoney(current) : Math.round(current);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = isMoney ? Utils.formatMoney(endValue) : Math.round(endValue);
    }
    requestAnimationFrame(step);
  },

  monthName(monthIndex) {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[monthIndex];
  },

  downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

};
