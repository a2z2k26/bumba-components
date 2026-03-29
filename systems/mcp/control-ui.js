/**
 * MCP Server Control UI
 * Advanced control interface for MCP servers
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

class MCPControlUI {
  constructor(registry, loader, healthMonitor, sessionState) {
    this.registry = registry;
    this.loader = loader;
    this.healthMonitor = healthMonitor;
    this.sessionState = sessionState;

    this.screen = null;
    this.grid = null;
    this.widgets = {};
    this.updateInterval = null;
  }

  /**
   * Launch dashboard view
   */
  async launchDashboard() {
    this.initScreen();
    this.createLayout();
    this.bindKeys();
    this.startUpdates();

    this.screen.render();
  }

  /**
   * Initialize blessed screen
   */
  initScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'BUMBA MCP Control Center',
      fullUnicode: true
    });
  }

  /**
   * Create dashboard layout
   */
  createLayout() {
    // Create grid
    this.grid = new contrib.grid({
      rows: 12,
      cols: 12,
      screen: this.screen
    });

    // Server list (left side)
    this.widgets.serverList = this.grid.set(0, 0, 8, 6, blessed.list, {
      label: ' 📦 MCP Servers ',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue' }
      },
      keys: true,
      vi: true,
      mouse: true
    });

    // Status monitor (right top)
    this.widgets.statusMonitor = this.grid.set(0, 6, 4, 6, contrib.table, {
      label: ' 📊 Server Status ',
      columnWidth: [20, 10, 10, 10],
      border: { type: 'line' },
      style: { border: { fg: 'green' } }
    });

    // Performance chart (right middle)
    this.widgets.perfChart = this.grid.set(4, 6, 4, 6, contrib.line, {
      label: ' 📈 Performance ',
      showLegend: true,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } }
    });

    // Control panel (bottom)
    this.widgets.controlPanel = this.grid.set(8, 0, 2, 12, blessed.box, {
      label: ' ⚙️ Controls ',
      border: { type: 'line' },
      style: { border: { fg: 'magenta' } }
    });

    // Log viewer (very bottom)
    this.widgets.logViewer = this.grid.set(10, 0, 2, 12, contrib.log, {
      label: ' 📜 Activity Log ',
      border: { type: 'line' },
      style: { border: { fg: 'gray' } }
    });

    this.populateServerList();
    this.updateControlPanel();
  }

  /**
   * Populate server list
   */
  populateServerList() {
    const items = [];
    const status = this.loader.getServerStatus();

    // Group by category
    for (const category of this.registry.getCategories()) {
      items.push(chalk.cyan.bold(`──── ${category.icon} ${category.name} ────`));

      const servers = this.registry.getServersByCategory(category.key);
      for (const server of servers) {
        const isActive = status.active.some(s => s.name === server.name);
        const icon = isActive ? '🟢' : '⚪';
        items.push(`  ${icon} ${server.displayName}`);
      }
    }

    this.widgets.serverList.setItems(items);
  }

  /**
   * Update control panel
   */
  updateControlPanel() {
    const controls = [
      'Space: Toggle Server',
      'Enter: Server Details',
      's: Start All',
      'x: Stop All',
      'r: Restart',
      'h: Health Check',
      'q: Quit'
    ].join('  |  ');

    this.widgets.controlPanel.setContent(chalk.white(controls));
  }

  /**
   * Bind keyboard controls
   */
  bindKeys() {
    // Server list navigation
    this.widgets.serverList.on('select', (item, index) => {
      this.handleServerSelect(item, index);
    });

    // Global keys
    this.screen.key(['q', 'C-c'], () => {
      this.shutdown();
    });

    this.screen.key(['space'], () => {
      this.toggleSelectedServer();
    });

    this.screen.key(['enter'], () => {
      this.showServerDetails();
    });

    this.screen.key(['s'], () => {
      this.startAllServers();
    });

    this.screen.key(['x'], () => {
      this.stopAllServers();
    });

    this.screen.key(['r'], () => {
      this.restartSelectedServer();
    });

    this.screen.key(['h'], () => {
      this.performHealthCheck();
    });
  }

  /**
   * Start periodic updates
   */
  startUpdates() {
    this.updateStatus();
    this.updatePerformance();

    this.updateInterval = setInterval(() => {
      this.updateStatus();
      this.updatePerformance();
      this.screen.render();
    }, 5000);
  }

  /**
   * Update status monitor
   */
  updateStatus() {
    const status = this.loader.getServerStatus();
    const data = [];

    // Headers
    data.push(['Server', 'Status', 'Memory', 'CPU']);

    // Active servers
    for (const server of status.active) {
      const metrics = this.healthMonitor.getServerMetrics(server.name);
      const def = this.registry.getServer(server.name);

      if (def && metrics.health) {
        data.push([
          def.displayName.substring(0, 20),
          this.getStatusText(metrics.health.status),
          metrics.health.memoryUsage ?
            `${Math.round(metrics.health.memoryUsage / 1024 / 1024)}MB` : 'N/A',
          metrics.health.cpuUsage ?
            `${metrics.health.cpuUsage}%` : 'N/A'
        ]);
      }
    }

    this.widgets.statusMonitor.setData({
      headers: data[0],
      data: data.slice(1)
    });
  }

  /**
   * Update performance chart
   */
  updatePerformance() {
    const status = this.loader.getServerStatus();
    const memoryData = [];
    const cpuData = [];

    // Collect data for active servers
    for (const server of status.active.slice(0, 3)) { // Top 3 for clarity
      const metrics = this.healthMonitor.getServerMetrics(server.name);

      if (metrics.metrics && metrics.metrics.samples) {
        const samples = metrics.metrics.samples.slice(-20); // Last 20 samples

        const memSeries = {
          title: server.name,
          x: samples.map((s, i) => i.toString()),
          y: samples.map(s => Math.round((s.memory || 0) / 1024 / 1024))
        };

        const cpuSeries = {
          title: server.name,
          x: samples.map((s, i) => i.toString()),
          y: samples.map(s => s.cpu || 0)
        };

        memoryData.push(memSeries);
        cpuData.push(cpuSeries);
      }
    }

    if (memoryData.length > 0) {
      this.widgets.perfChart.setData(memoryData);
    }
  }

  /**
   * Handle server selection
   */
  handleServerSelect(item, index) {
    const text = item.toString();

    // Skip category headers
    if (text.includes('────')) return;

    // Extract server name
    const serverName = this.getServerNameFromItem(text);
    if (serverName) {
      this.selectedServer = serverName;
      this.logActivity(`Selected: ${serverName}`);
    }
  }

  /**
   * Toggle selected server
   */
  async toggleSelectedServer() {
    if (!this.selectedServer) return;

    const isRunning = this.loader.isServerRunning(this.selectedServer);

    if (isRunning) {
      await this.loader.stopServer(this.selectedServer);
      this.logActivity(`Stopped: ${this.selectedServer}`);
    } else {
      await this.loader.startServer(this.selectedServer);
      this.logActivity(`Started: ${this.selectedServer}`);
    }

    this.populateServerList();
    this.screen.render();
  }

  /**
   * Show server details
   */
  showServerDetails() {
    if (!this.selectedServer) return;

    const def = this.registry.getServer(this.selectedServer);
    const metrics = this.healthMonitor.getServerMetrics(this.selectedServer);

    const detailBox = blessed.box({
      parent: this.screen,
      label: ` ${def.displayName} Details `,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      top: 'center',
      left: 'center',
      width: '60%',
      height: '60%',
      content: this.formatServerDetails(def, metrics),
      keys: true,
      vi: true,
      scrollable: true,
      alwaysScroll: true
    });

    detailBox.key(['escape', 'q'], () => {
      detailBox.destroy();
      this.screen.render();
    });

    detailBox.focus();
    this.screen.render();
  }

  /**
   * Format server details
   */
  formatServerDetails(def, metrics) {
    let details = chalk.cyan.bold(`\n  ${def.displayName}\n`);
    details += chalk.gray('  ' + '─'.repeat(30) + '\n\n');

    details += chalk.white(`  Category: ${def.category}\n`);
    details += chalk.white(`  Description: ${def.description}\n`);
    details += chalk.white(`  Requires Auth: ${def.requiresAuth ? 'Yes' : 'No'}\n`);
    details += chalk.white(`  Command: ${def.command} ${def.args.join(' ')}\n`);

    if (metrics.health) {
      details += chalk.white(`\n  Health Status: ${metrics.health.status}\n`);
      details += chalk.white(`  Responsive: ${metrics.health.responsive ? 'Yes' : 'No'}\n`);
      details += chalk.white(`  Errors: ${metrics.health.errorCount || 0}\n`);
      details += chalk.white(`  Warnings: ${metrics.health.warningCount || 0}\n`);
    }

    if (metrics.metrics) {
      details += chalk.white(`\n  Availability: ${Math.round(metrics.metrics.availability)}%\n`);
      details += chalk.white(`  Avg Memory: ${Math.round(metrics.metrics.avgMemory / 1024 / 1024)}MB\n`);
      details += chalk.white(`  Avg CPU: ${Math.round(metrics.metrics.avgCpu)}%\n`);
    }

    details += chalk.gray('\n  Press ESC or Q to close\n');

    return details;
  }

  /**
   * Start all servers
   */
  async startAllServers() {
    this.logActivity('Starting all enabled servers...');
    const results = await this.loader.startEnabledServers();

    for (const result of results) {
      if (result.success) {
        this.logActivity(`✓ Started: ${result.serverName}`);
      } else {
        this.logActivity(`✗ Failed: ${result.serverName}`);
      }
    }

    this.populateServerList();
    this.screen.render();
  }

  /**
   * Stop all servers
   */
  async stopAllServers() {
    this.logActivity('Stopping all servers...');
    const results = await this.loader.stopAllServers();

    for (const result of results) {
      if (result.success) {
        this.logActivity(`✓ Stopped: ${result.serverName}`);
      } else {
        this.logActivity(`✗ Failed: ${result.serverName}`);
      }
    }

    this.populateServerList();
    this.screen.render();
  }

  /**
   * Restart selected server
   */
  async restartSelectedServer() {
    if (!this.selectedServer) return;

    this.logActivity(`Restarting: ${this.selectedServer}`);
    const result = await this.loader.restartServer(this.selectedServer);

    if (result.success) {
      this.logActivity(`✓ Restarted: ${this.selectedServer}`);
    } else {
      this.logActivity(`✗ Failed: ${result.error}`);
    }

    this.populateServerList();
    this.screen.render();
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    this.logActivity('Performing health check...');
    await this.healthMonitor.performHealthCheck();

    const summary = this.healthMonitor.getHealthSummary();
    this.logActivity(`Health Status: ${summary.overall}`);

    this.updateStatus();
    this.screen.render();
  }

  /**
   * Get server name from list item
   */
  getServerNameFromItem(text) {
    // Remove status icon and padding
    const cleaned = text.replace(/^[\s🟢⚪]+/, '').trim();

    // Find matching server
    for (const [name, def] of this.registry.servers) {
      if (def.displayName === cleaned) {
        return name;
      }
    }

    return null;
  }

  /**
   * Get status text with color
   */
  getStatusText(status) {
    const colors = {
      healthy: chalk.green,
      degraded: chalk.yellow,
      unhealthy: chalk.red,
      critical: chalk.red.bold,
      error: chalk.red.bold
    };

    const color = colors[status] || chalk.white;
    return color(status);
  }

  /**
   * Log activity
   */
  logActivity(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.widgets.logViewer.log(`[${timestamp}] ${message}`);
  }

  /**
   * Shutdown dashboard
   */
  async shutdown() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.logActivity('Saving session...');
    await this.sessionState.saveState();

    process.exit(0);
  }
}

module.exports = MCPControlUI;