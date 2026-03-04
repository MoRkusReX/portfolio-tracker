// Wraps Chart.js creation and update logic for allocation and history charts.
(function () {
  var PT = (window.PT = window.PT || {});

  function chartAvailable() {
    return typeof window.Chart !== 'undefined';
  }

  function destroy(chart) {
    if (chart && typeof chart.destroy === 'function') chart.destroy();
  }

  function palette(count) {
    var colors = ['#2cb6ff', '#14f1b2', '#f59e0b', '#fb7185', '#8b5cf6', '#22c55e', '#f97316', '#38bdf8', '#eab308', '#a78bfa'];
    var arr = [];
    for (var i = 0; i < count; i++) arr.push(colors[i % colors.length]);
    return arr;
  }

  PT.ChartManager = {
    pie: null,
    line: null,
    dominance: null,
    renderAllocation: function (canvas, fallbackEl, labels, values) {
      destroy(this.pie);
      if (!chartAvailable() || !canvas) {
        if (fallbackEl) fallbackEl.classList.remove('hidden');
        return;
      }
      if (fallbackEl) fallbackEl.classList.add('hidden');
      this.pie = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{ data: values, backgroundColor: palette(values.length), borderWidth: 0, hoverOffset: 10 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: { legend: { display: false } }
        }
      });
    },
    highlightAllocationIndex: function (index) {
      if (!this.pie || !isFinite(Number(index))) return;
      var i = Number(index);
      var values = this.pie.data && this.pie.data.datasets && this.pie.data.datasets[0] ? this.pie.data.datasets[0].data : [];
      if (i < 0 || i >= values.length) {
        this.clearAllocationHighlight();
        return;
      }
      this.pie.setActiveElements([{ datasetIndex: 0, index: i }]);
      if (this.pie.tooltip && typeof this.pie.tooltip.setActiveElements === 'function') {
        this.pie.tooltip.setActiveElements([{ datasetIndex: 0, index: i }], { x: 0, y: 0 });
      }
      this.pie.update('none');
    },
    clearAllocationHighlight: function () {
      if (!this.pie) return;
      this.pie.setActiveElements([]);
      if (this.pie.tooltip && typeof this.pie.tooltip.setActiveElements === 'function') {
        this.pie.tooltip.setActiveElements([], { x: 0, y: 0 });
      }
      this.pie.update('none');
    },
    renderAssetLine: function (canvas, fallbackEl, labels, values, label) {
      destroy(this.line);
      if (!chartAvailable() || !canvas) {
        if (fallbackEl) fallbackEl.classList.remove('hidden');
        return;
      }
      if (fallbackEl) fallbackEl.classList.add('hidden');
      this.line = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: label,
            data: values,
            borderColor: '#2cb6ff',
            backgroundColor: 'rgba(44, 182, 255, 0.12)',
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.22
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: { color: 'rgba(150,170,190,0.9)', maxTicksLimit: 6 },
              grid: { display: false }
            },
            y: {
              ticks: {
                color: 'rgba(150,170,190,0.9)',
                callback: function (v) { return '$' + Number(v).toLocaleString(); }
              },
              grid: { color: 'rgba(140,160,190,0.1)' }
            }
          }
        }
      });
    },
    renderBtcDominance: function (canvas, fallbackEl, labels, values) {
      destroy(this.dominance);
      if (!chartAvailable() || !canvas) {
        if (fallbackEl) fallbackEl.classList.remove('hidden');
        return;
      }
      if (fallbackEl) fallbackEl.classList.add('hidden');
      this.dominance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'BTC Dominance %',
            data: values,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: 'rgba(150,170,190,0.9)', maxTicksLimit: 5 }, grid: { display: false } },
            y: {
              ticks: {
                color: 'rgba(150,170,190,0.9)',
                callback: function (v) { return Number(v).toFixed(1) + '%'; }
              },
              grid: { color: 'rgba(140,160,190,0.1)' }
            }
          }
        }
      });
    }
  };
})();
