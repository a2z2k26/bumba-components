/**
 * BUMBA Advanced Dashboard Visualizations
 * Sprint 2: Terminal and Web-based visualizations
 */

// Try to load chalk, fallback to no-op if not available
let chalk;
try {
  chalk = require('chalk');
} catch (e) {
  // Chalk not available, create stub
  chalk = new Proxy({}, {
    get: () => (str) => str
  });
}

class AdvancedVisualizations {
  constructor() {
    this.chartTypes = [
      'bar', 'line', 'sparkline', 'heatmap', 'network',
      'treemap', 'gauge', 'progress', 'timeline', 'flowchart'
    ];

    this.themes = {
      dark: {
        primary: '#00ff00',
        secondary: '#00aaff',
        warning: '#ffaa00',
        danger: '#ff0000',
        background: '#000000'
      },
      light: {
        primary: '#0066cc',
        secondary: '#00aa00',
        warning: '#ff9900',
        danger: '#cc0000',
        background: '#ffffff'
      }
    };

    this.currentTheme = 'dark';
  }

  // ========== ASCII CHARTS ==========

  /**
   * Create ASCII bar chart
   */
  createBarChart(data, title = 'BAR CHART', width = 60) {
    const maxValue = Math.max(...Object.values(data));
    const scale = width / maxValue;

    let chart = `\n╔${'═'.repeat(width + 2)}╗\n`;
    chart += `║ ${title.padEnd(width)} ║\n`;
    chart += `╠${'═'.repeat(width + 2)}╣\n`;

    for (const [label, value] of Object.entries(data)) {
      const barLength = Math.floor(value * scale);
      const bar = '█'.repeat(barLength);
      const percentage = ((value / maxValue) * 100).toFixed(1);

      chart += `║ ${label.padEnd(15)} ${bar.padEnd(width - 25)} ${percentage.padStart(6)}% ║\n`;
    }

    chart += `╚${'═'.repeat(width + 2)}╝`;

    return chart;
  }

  /**
   * Create sparkline chart
   */
  createSparkline(data, width = 40) {
    if (data.length === 0) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;

    if (range === 0) return '─'.repeat(width);

    const sparkChars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const normalized = data.map(v => Math.floor(((v - min) / range) * 7));

    return normalized.slice(-width).map(n => sparkChars[n]).join('');
  }

  /**
   * Create heatmap visualization
   */
  createHeatmap(matrix, title = 'HEATMAP') {
    const heatChars = [' ', '░', '▒', '▓', '█'];
    const maxValue = Math.max(...matrix.flat());

    let heatmap = `\n╔${'═'.repeat(matrix[0].length * 2 + 2)}╗\n`;
    heatmap += `║ ${title.padEnd(matrix[0].length * 2)} ║\n`;
    heatmap += `╠${'═'.repeat(matrix[0].length * 2 + 2)}╣\n`;

    for (const row of matrix) {
      heatmap += '║ ';
      for (const value of row) {
        const intensity = Math.floor((value / maxValue) * 4);
        heatmap += heatChars[intensity] + ' ';
      }
      heatmap += '║\n';
    }

    heatmap += `╚${'═'.repeat(matrix[0].length * 2 + 2)}╝`;

    return heatmap;
  }

  /**
   * Create network diagram
   */
  createNetworkDiagram(nodes, connections) {
    let diagram = '\n NETWORK TOPOLOGY\n';
    diagram += '═'.repeat(50) + '\n\n';

    // Create adjacency visualization
    for (const node of nodes) {
      const nodeConnections = connections.filter(c =>
        c.from === node.id || c.to === node.id
      );

      diagram += `  [${node.id}] ${node.name}\n`;

      for (const conn of nodeConnections) {
        const target = conn.from === node.id ? conn.to : conn.from;
        const targetNode = nodes.find(n => n.id === target);
        if (targetNode) {
          diagram += `    ├── ${targetNode.name} (${conn.type || 'connected'})\n`;
        }
      }

      diagram += '\n';
    }

    return diagram;
  }

  /**
   * Create progress bars
   */
  createProgressBar(value, max = 100, width = 40, label = '') {
    const percentage = Math.min(100, (value / max) * 100);
    const filled = Math.floor((percentage / 100) * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percentStr = `${percentage.toFixed(1)}%`;

    return `${label} [${bar}] ${percentStr}`;
  }

  /**
   * Create gauge visualization
   */
  createGauge(value, min = 0, max = 100, label = 'GAUGE') {
    const percentage = ((value - min) / (max - min)) * 100;
    const angle = (percentage / 100) * 180;

    let gauge = '\n     ' + label + '\n';
    gauge += '    ╭─────────╮\n';
    gauge += '   ╱           ╲\n';
    gauge += '  │';

    // Draw needle position
    if (angle < 45) {
      gauge += '    ╱      ';
    } else if (angle < 90) {
      gauge += '     │     ';
    } else if (angle < 135) {
      gauge += '      ╲    ';
    } else {
      gauge += '       ─── ';
    }

    gauge += '│\n';
    gauge += `  │     ${value.toFixed(1).padStart(6)} │\n`;
    gauge += '  ╰─────────────╯\n';
    gauge += `  ${min}         ${max}\n`;

    return gauge;
  }

  /**
   * Create timeline visualization
   */
  createTimeline(events, windowMs = 60000) {
    if (events.length === 0) return 'No events';

    const now = Date.now();
    const start = now - windowMs;

    let timeline = '\n TIMELINE\n';
    timeline += '═'.repeat(60) + '\n';

    const recentEvents = events.filter(e => e.timestamp > start);

    for (const event of recentEvents.slice(-10)) {
      const age = now - event.timestamp;
      const ageStr = this.formatAge(age);
      const icon = this.getEventIcon(event.type);

      timeline += `${icon} ${ageStr.padEnd(10)} │ ${event.message || event.type}\n`;
    }

    return timeline;
  }

  /**
   * Create treemap visualization
   */
  createTreemap(data, width = 60, height = 20) {
    const total = Object.values(data).reduce((sum, v) => sum + v, 0);

    let treemap = '\n╔' + '═'.repeat(width) + '╗\n';

    let currentRow = '║';
    let currentWidth = 0;

    for (const [label, value] of Object.entries(data)) {
      const boxWidth = Math.floor((value / total) * width);

      if (currentWidth + boxWidth > width && currentWidth > 0) {
        currentRow += ' '.repeat(width - currentWidth) + '║\n';
        treemap += currentRow;
        currentRow = '║';
        currentWidth = 0;
      }

      const box = label.substring(0, boxWidth - 1).padEnd(boxWidth - 1);
      currentRow += box + '│';
      currentWidth += boxWidth;
    }

    if (currentWidth > 0) {
      currentRow += ' '.repeat(Math.max(0, width - currentWidth)) + '║\n';
      treemap += currentRow;
    }

    // Fill remaining height
    const usedHeight = treemap.split('\n').length - 2;
    for (let i = usedHeight; i < height; i++) {
      treemap += '║' + ' '.repeat(width) + '║\n';
    }

    treemap += '╚' + '═'.repeat(width) + '╝';

    return treemap;
  }

  /**
   * Create flowchart
   */
  createFlowchart(steps) {
    let flowchart = '\n PROCESS FLOW\n';
    flowchart += '═'.repeat(50) + '\n\n';

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const isLast = i === steps.length - 1;

      flowchart += `  ┌${'─'.repeat(step.label.length + 4)}┐\n`;
      flowchart += `  │  ${step.label}  │\n`;
      flowchart += `  └${'─'.repeat(step.label.length + 4)}┘\n`;

      if (!isLast) {
        flowchart += '         │\n';
        flowchart += '         ▼\n';
      }
    }

    return flowchart;
  }

  // ========== WEB VISUALIZATIONS ==========

  /**
   * Generate HTML dashboard
   */
  generateHTMLDashboard(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BUMBA Coordination Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: ${this.currentTheme === 'dark' ? '#0a0a0a' : '#f5f5f5'};
            color: ${this.currentTheme === 'dark' ? '#00ff00' : '#333'};
            padding: 20px;
        }
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            max-width: 1400px;
            margin: 0 auto;
        }
        .widget {
            background: ${this.currentTheme === 'dark' ? '#1a1a1a' : '#fff'};
            border: 2px solid ${this.currentTheme === 'dark' ? '#00ff00' : '#ddd'};
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .widget h3 {
            margin-bottom: 15px;
            color: ${this.currentTheme === 'dark' ? '#00aaff' : '#0066cc'};
        }
        .metric {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
            padding: 10px;
            background: ${this.currentTheme === 'dark' ? '#0a0a0a' : '#f9f9f9'};
            border-radius: 4px;
        }
        .metric-value {
            font-weight: bold;
            color: ${this.currentTheme === 'dark' ? '#00ff00' : '#0066cc'};
        }
        .chart-container {
            width: 100%;
            height: 200px;
            position: relative;
        }
        canvas {
            width: 100% !important;
            height: 100% !important;
        }
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-active { background: #00ff00; }
        .status-warning { background: #ffaa00; }
        .status-error { background: #ff0000; }
        .theme-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            background: ${this.currentTheme === 'dark' ? '#00ff00' : '#0066cc'};
            color: ${this.currentTheme === 'dark' ? '#000' : '#fff'};
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <button class="theme-toggle" onclick="toggleTheme()">Toggle Theme</button>

    <h1 style="text-align: center; margin-bottom: 30px;">
         BUMBA Coordination Dashboard
    </h1>

    <div class="dashboard">
        ${this.generateWidgets(data)}
    </div>

    <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
    <script>
        ${this.generateChartScripts(data)}

        function toggleTheme() {
            document.body.classList.toggle('light-theme');
        }
    </script>
</body>
</html>`;
  }

  /**
   * Generate dashboard widgets
   */
  generateWidgets(data) {
    const widgets = [];

    // System Status Widget
    widgets.push(`
      <div class="widget">
        <h3>System Status</h3>
        <div class="metric">
          <span>Operational Level</span>
          <span class="metric-value">100%</span>
        </div>
        <div class="metric">
          <span>Active Agents</span>
          <span class="metric-value">${data.agents || 0}</span>
        </div>
        <div class="metric">
          <span>Lock Contention</span>
          <span class="metric-value">${data.lockContention || 0}%</span>
        </div>
      </div>
    `);

    // Performance Metrics Widget
    widgets.push(`
      <div class="widget">
        <h3>Performance Metrics</h3>
        <div class="chart-container">
          <canvas id="performanceChart"></canvas>
        </div>
      </div>
    `);

    // Real-time Activity Widget
    widgets.push(`
      <div class="widget">
        <h3>Real-time Activity</h3>
        <div class="chart-container">
          <canvas id="activityChart"></canvas>
        </div>
      </div>
    `);

    // Predictions Widget
    widgets.push(`
      <div class="widget">
        <h3>ML Predictions</h3>
        <div class="metric">
          <span>Next Conflict</span>
          <span class="metric-value">${data.nextConflict || 'Low Risk'}</span>
        </div>
        <div class="metric">
          <span>Resource Utilization</span>
          <span class="metric-value">${data.utilization || 0}%</span>
        </div>
        <div class="metric">
          <span>Performance Trend</span>
          <span class="metric-value">${data.trend || 'Stable'}</span>
        </div>
      </div>
    `);

    return widgets.join('');
  }

  /**
   * Generate chart scripts
   */
  generateChartScripts(data) {
    return `
      // Performance Chart
      new Chart(document.getElementById('performanceChart'), {
        type: 'line',
        data: {
          labels: ${JSON.stringify(data.labels || ['1', '2', '3', '4', '5'])},
          datasets: [{
            label: 'Throughput',
            data: ${JSON.stringify(data.throughput || [100, 120, 115, 130, 125])},
            borderColor: '#00ff00',
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });

      // Activity Chart
      new Chart(document.getElementById('activityChart'), {
        type: 'bar',
        data: {
          labels: ${JSON.stringify(data.activityLabels || ['Reads', 'Writes', 'Locks', 'Conflicts'])},
          datasets: [{
            label: 'Operations',
            data: ${JSON.stringify(data.activityData || [45, 30, 15, 5])},
            backgroundColor: ['#00ff00', '#00aaff', '#ffaa00', '#ff0000']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });
    `;
  }

  // ========== EXPORT CAPABILITIES ==========

  /**
   * Export to SVG
   */
  exportToSVG(visualization, width = 800, height = 600) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${this.themes[this.currentTheme].background}"/>
  <text x="50%" y="50%" text-anchor="middle" fill="${this.themes[this.currentTheme].primary}">
    ${visualization}
  </text>
</svg>`;
  }

  /**
   * Export to CSV
   */
  exportToCSV(data) {
    const headers = Object.keys(data[0] || {});
    const rows = data.map(row => headers.map(h => row[h] || '').join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Export to JSON
   */
  exportToJSON(data) {
    return JSON.stringify(data, null, 2);
  }

  // ========== HELPER METHODS ==========

  formatAge(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
    return `${Math.floor(ms / 3600000)}h`;
  }

  getEventIcon(type) {
    const icons = {
      success: '',
      warning: '',
      error: '',
      info: 'ℹ',
      lock: '',
      unlock: '',
      conflict: '',
      resolved: ''
    };
    return icons[type] || '•';
  }

  /**
   * Set theme
   */
  setTheme(theme) {
    if (this.themes[theme]) {
      this.currentTheme = theme;
    }
  }
}

module.exports = AdvancedVisualizations;