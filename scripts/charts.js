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

  // Builds a deterministic signature so allocation chart updates only when data truly changes.
  function allocationSignature(labels, values, mode) {
    var safeLabels = Array.isArray(labels) ? labels : [];
    var safeValues = Array.isArray(values) ? values : [];
    var parts = [String(mode || 'stocks')];
    for (var i = 0; i < Math.max(safeLabels.length, safeValues.length); i++) {
      var label = String(safeLabels[i] || '');
      var value = Number(safeValues[i]);
      var norm = isFinite(value) ? value.toFixed(8) : 'NaN';
      parts.push(label + ':' + norm);
    }
    return parts.join('|');
  }

  PT.ChartManager = {
    pie: null,
    pieSignature: '',
    line: null,
    lineCharts: {},
    dominance: null,
    renderAllocation: function (canvas, fallbackEl, labels, values, options) {
      if (!chartAvailable() || !canvas) {
        destroy(this.pie);
        this.pie = null;
        this.pieSignature = '';
        if (fallbackEl) fallbackEl.classList.remove('hidden');
        return;
      }
      var opts = options && typeof options === 'object' ? options : {};
      var mode = String(opts.mode || 'stocks').trim().toLowerCase() === 'sectors' ? 'sectors' : 'stocks';
      if (fallbackEl) fallbackEl.classList.add('hidden');
      var safeLabels = Array.isArray(labels) ? labels.slice() : [];
      var safeValues = Array.isArray(values) ? values.slice() : [];
      var signature = allocationSignature(safeLabels, safeValues, mode);
      var colors = palette(safeValues.length);
      var hasReusable = !!(this.pie && this.pie.canvas === canvas);

      if (!hasReusable && this.pie) {
        destroy(this.pie);
        this.pie = null;
        this.pieSignature = '';
      }

      if (!this.pie) {
        this.pie = new Chart(canvas.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: safeLabels,
            datasets: [{ data: safeValues, backgroundColor: colors, borderWidth: 0, hoverOffset: 10 }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            animation: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    var label = String(context && context.label || '').trim() || 'Allocation';
                    var value = Number(context && context.parsed || 0) || 0;
                    var dataset = context && context.dataset && Array.isArray(context.dataset.data) ? context.dataset.data : [];
                    var total = 0;
                    for (var i = 0; i < dataset.length; i++) total += Number(dataset[i] || 0) || 0;
                    var pct = total > 0 ? (value / total) * 100 : 0;
                    var viewMode = context && context.chart && context.chart.$ptAllocationMode === 'sectors' ? 'sectors' : 'stocks';
                    if (viewMode === 'sectors') return label + ': ' + pct.toFixed(1) + '% of portfolio';
                    return label + ': ' + value.toLocaleString(undefined, { maximumFractionDigits: 2 });
                  }
                }
              }
            }
          }
        });
        this.pieSignature = signature;
        this.pie.$ptAllocationMode = mode;
        return;
      }

      if (this.pieSignature === signature) return;

      this.pie.data.labels = safeLabels;
      if (!this.pie.data.datasets || !this.pie.data.datasets[0]) {
        this.pie.data.datasets = [{ data: safeValues, backgroundColor: colors, borderWidth: 0, hoverOffset: 10 }];
      } else {
        this.pie.data.datasets[0].data = safeValues;
        this.pie.data.datasets[0].backgroundColor = colors;
        this.pie.data.datasets[0].borderWidth = 0;
        this.pie.data.datasets[0].hoverOffset = 10;
      }
      this.pie.$ptAllocationMode = mode;
      this.pie.update('none');
      this.pieSignature = signature;
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
    renderAssetLine: function (canvas, fallbackEl, labels, values, label, key) {
      var chartKey = String(key || 'detail');
      if (!this.lineCharts) this.lineCharts = {};
      destroy(this.lineCharts[chartKey]);
      if (!chartAvailable() || !canvas) {
        if (fallbackEl) fallbackEl.classList.remove('hidden');
        return;
      }
      if (fallbackEl) fallbackEl.classList.add('hidden');
      this.lineCharts[chartKey] = new Chart(canvas.getContext('2d'), {
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
      if (chartKey === 'detail') this.line = this.lineCharts[chartKey];
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
