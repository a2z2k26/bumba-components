/**
 * MCP Status Display
 * Comprehensive status reporting for MCP servers
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const ora = require('ora');
const boxen = require('boxen');

class MCPStatusDisplay {
  constructor(registry, loader, healthMonitor, sessionState, errorRecovery) {
    this.registry = registry;
    this.loader = loader;
    this.healthMonitor = healthMonitor;
    this.sessionState = sessionState;
    this.errorRecovery = errorRecovery;

    // Display configuration
    this.config = {
      useColors: true,
      useEmojis: true,
      compactMode: false,
      showDetails: true
    };
  }

  /**
   * Display full status report
   */
  async displayFullStatus() {
    console.clear();

    await this.displayHeader();
    await this.displayQuickStats();
    await this.displayServerStatus();
    await this.displayHealthSummary();
    await this.displayRecoveryStatus();
    await this.displaySessionInfo();
  }

  /**
   * Display header
   */
  async displayHeader() {
    const title = chalk.cyan.bold('BUMBA MCP Status Report');
    const timestamp = new Date().toLocaleString();

    console.log(boxen(
      `${title}\n${chalk.gray(timestamp)}`,
      {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: 'cyan'
      }
    ));
  }

  /**
   * Display quick statistics
   */
  async displayQuickStats() {
    const stats = this.registry.getStats();
    const status = this.loader.getServerStatus();
    const sessionStats = this.sessionState.getSessionStats();

    console.log(chalk.cyan.bold('\n Quick Statistics\n'));

    const quickTable = new Table({
      style: { head: ['cyan'] }
    });

    quickTable.push(
      [chalk.white('Total Servers'), stats.total],
      [chalk.green('Active'), status.active.length],
      [chalk.yellow('Inactive'), status.inactive.length],
      [chalk.white('Session Uptime'), this.formatDuration(sessionStats.currentSession.uptime)],
      [chalk.white('Total Sessions'), sessionStats.history.totalSessions]
    );

    console.log(quickTable.toString());
  }

  /**
   * Display server status by category
   */
  async displayServerStatus() {
    console.log(chalk.cyan.bold('\n Server Status by Category\n'));

    const categories = this.registry.getCategories();

    for (const category of categories) {
      const servers = this.registry.getServersByCategory(category.key);
      if (servers.length === 0) continue;

      // Category header
      console.log(chalk.yellow(`\n${category.icon} ${category.name}`));
      console.log(chalk.gray(category.description));

      // Server table
      const table = new Table({
        head: ['Server', 'Status', 'Enabled', 'Health', 'Uptime'],
        style: { head: ['cyan'] },
        colWidths: [25, 12, 10, 12, 15]
      });

      for (const server of servers) {
        const isRunning = this.loader.isServerRunning(server.name);
        const config = this.loader.configLoader.getServerConfig(server.name);
        const metrics = this.healthMonitor.getServerMetrics(server.name);
        const serverInfo = this.loader.activeProcesses.get(server.name);

        table.push([
          server.displayName,
          this.formatStatus(isRunning),
          config?.enabled ? '' : '',
          metrics.health ? this.formatHealth(metrics.health.status) : 'N/A',
          serverInfo ? this.formatDuration(Date.now() - serverInfo.startTime) : '-'
        ]);
      }

      console.log(table.toString());
    }
  }

  /**
   * Display health summary
   */
  async displayHealthSummary() {
    console.log(chalk.cyan.bold('\n Health Summary\n'));

    const summary = this.healthMonitor.getHealthSummary();

    // Overall health
    const healthBox = boxen(
      `Overall System Health: ${this.formatHealth(summary.overall)}`,
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: this.getHealthColor(summary.overall)
      }
    );

    console.log(healthBox);

    // Problem servers
    const problemServers = [];
    for (const [name, health] of Object.entries(summary.servers)) {
      if (health.status !== 'healthy') {
        problemServers.push({ name, health });
      }
    }

    if (problemServers.length > 0) {
      console.log(chalk.yellow('\n  Servers Needing Attention:\n'));

      const table = new Table({
        head: ['Server', 'Status', 'Issue', 'Action'],
        style: { head: ['yellow'] }
      });

      for (const { name, health } of problemServers) {
        const def = this.registry.getServer(name);
        table.push([
          def.displayName,
          this.formatHealth(health.status),
          health.lastError || 'Unknown',
          this.getSuggestedAction(health.status)
        ]);
      }

      console.log(table.toString());
    } else {
      console.log(chalk.green('\n All servers are healthy!\n'));
    }
  }

  /**
   * Display recovery status
   */
  async displayRecoveryStatus() {
    const recoveryStatus = this.errorRecovery.getRecoveryStatus();

    if (recoveryStatus.isolated.length > 0 || recoveryStatus.recovering.length > 0) {
      console.log(chalk.cyan.bold('\n Recovery Status\n'));

      if (recoveryStatus.isolated.length > 0) {
        console.log(chalk.red('Isolated Servers:'));
        for (const serverName of recoveryStatus.isolated) {
          const def = this.registry.getServer(serverName);
          console.log(chalk.red(`  • ${def.displayName}`));
        }
      }

      if (recoveryStatus.recovering.length > 0) {
        console.log(chalk.yellow('\nRecovering Servers:'));
        for (const serverName of recoveryStatus.recovering) {
          const def = this.registry.getServer(serverName);
          const attempts = recoveryStatus.recoveryAttempts[serverName];
          console.log(chalk.yellow(`  • ${def.displayName} (Attempt ${attempts})`));
        }
      }
    }
  }

  /**
   * Display session information
   */
  async displaySessionInfo() {
    console.log(chalk.cyan.bold('\n Session Information\n'));

    const sessionStats = this.sessionState.getSessionStats();
    const preferences = this.sessionState.currentSession.preferences;

    const sessionTable = new Table({
      style: { head: ['cyan'] }
    });

    sessionTable.push(
      ['Session ID', sessionStats.currentSession.id.substring(0, 30) + '...'],
      ['Uptime', this.formatDuration(sessionStats.currentSession.uptime)],
      ['Active Servers', `${sessionStats.currentSession.activeServers} / ${sessionStats.currentSession.totalServers}`],
      ['Average Session Duration', this.formatDuration(sessionStats.history.averageDuration)]
    );

    console.log(sessionTable.toString());

    // Most used servers
    if (Object.keys(sessionStats.history.mostUsedServers).length > 0) {
      console.log(chalk.gray('\nMost Used Servers:'));
      for (const [server, count] of Object.entries(sessionStats.history.mostUsedServers)) {
        const def = this.registry.getServer(server);
        if (def) {
          console.log(chalk.gray(`  • ${def.displayName}: ${count} sessions`));
        }
      }
    }
  }

  /**
   * Display compact status
   */
  async displayCompactStatus() {
    const status = this.loader.getServerStatus();
    const health = this.healthMonitor.getHealthSummary();

    console.log(chalk.cyan.bold('\nMCP Status: ') +
      chalk.green(`${status.active.length} active`) + ' | ' +
      chalk.yellow(`${status.inactive.length} inactive`) + ' | ' +
      `Health: ${this.formatHealth(health.overall)}`
    );

    if (status.active.length > 0) {
      console.log(chalk.gray('Active: ') +
        status.active.map(s => {
          const def = this.registry.getServer(s.name);
          return def.displayName;
        }).join(', ')
      );
    }
  }

  /**
   * Display live status with spinner
   */
  async displayLiveStatus(duration = 30000) {
    const spinner = ora('Monitoring MCP servers...').start();
    const startTime = Date.now();

    const interval = setInterval(async () => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= duration) {
        clearInterval(interval);
        spinner.succeed('Monitoring complete');
        await this.displayFullStatus();
        return;
      }

      const status = this.loader.getServerStatus();
      const health = this.healthMonitor.getHealthSummary();

      spinner.text = `Monitoring: ${status.active.length} active | Health: ${health.overall} | ${Math.round((duration - elapsed) / 1000)}s remaining`;

      // Check for issues
      if (health.overall === 'critical') {
        spinner.fail('Critical issue detected!');
        await this.displayHealthSummary();
        clearInterval(interval);
      }
    }, 1000);
  }

  /**
   * Export status report
   */
  async exportStatusReport(outputPath) {
    const report = {
      timestamp: new Date().toISOString(),
      registry: this.registry.getStats(),
      status: this.loader.getServerStatus(),
      health: this.healthMonitor.exportHealthReport(),
      recovery: this.errorRecovery.exportRecoveryReport(),
      session: this.sessionState.getSessionStats()
    };

    const fs = require('fs').promises;
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(chalk.green(` Status report exported to: ${outputPath}`));
  }

  /**
   * Format status
   */
  formatStatus(isRunning) {
    if (isRunning) {
      return this.config.useEmojis ? ' Running' : chalk.green('Running');
    }
    return this.config.useEmojis ? ' Stopped' : chalk.gray('Stopped');
  }

  /**
   * Format health status
   */
  formatHealth(status) {
    const emojis = {
      healthy: '',
      degraded: '',
      unhealthy: '',
      critical: '',
      error: ''
    };

    const colors = {
      healthy: chalk.green,
      degraded: chalk.yellow,
      unhealthy: chalk.rgb(255, 165, 0), // orange
      critical: chalk.red,
      error: chalk.red.bold
    };

    const emoji = this.config.useEmojis ? emojis[status] || '' : '';
    const color = colors[status] || chalk.white;

    return `${emoji} ${color(status)}`;
  }

  /**
   * Get health color
   */
  getHealthColor(status) {
    const colorMap = {
      healthy: 'green',
      degraded: 'yellow',
      unhealthy: 'yellow',
      critical: 'red',
      error: 'red'
    };

    return colorMap[status] || 'gray';
  }

  /**
   * Get suggested action
   */
  getSuggestedAction(status) {
    const actions = {
      healthy: 'None',
      degraded: 'Monitor',
      unhealthy: 'Restart',
      critical: 'Investigate',
      error: 'Repair'
    };

    return actions[status] || 'Check';
  }

  /**
   * Format duration
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Display specific server status
   */
  async displayServerStatus(serverName) {
    const def = this.registry.getServer(serverName);
    if (!def) {
      console.log(chalk.red(`Unknown server: ${serverName}`));
      return;
    }

    console.log(chalk.cyan.bold(`\n━━━ ${def.displayName} Status ━━━\n`));

    const isRunning = this.loader.isServerRunning(serverName);
    const config = this.loader.configLoader.getServerConfig(serverName);
    const metrics = this.healthMonitor.getServerMetrics(serverName);
    const state = this.sessionState.getServerState(serverName);

    const table = new Table({
      style: { head: ['cyan'] }
    });

    table.push(
      ['Category', def.category],
      ['Description', def.description],
      ['Status', this.formatStatus(isRunning)],
      ['Enabled', config?.enabled ? '' : ''],
      ['Requires Auth', def.requiresAuth ? 'Yes' : 'No']
    );

    if (metrics.health) {
      table.push(
        ['Health', this.formatHealth(metrics.health.status)],
        ['Memory', metrics.health.memoryUsage ?
          `${Math.round(metrics.health.memoryUsage / 1024 / 1024)}MB` : 'N/A'],
        ['CPU', metrics.health.cpuUsage ? `${metrics.health.cpuUsage}%` : 'N/A'],
        ['Errors', metrics.health.errorCount || 0],
        ['Warnings', metrics.health.warningCount || 0]
      );
    }

    if (state) {
      table.push(
        ['Last Used', state.lastUsed ? new Date(state.lastUsed).toLocaleString() : 'Never'],
        ['Auto Start', state.autoStart ? 'Yes' : 'No']
      );
    }

    console.log(table.toString());
  }
}

module.exports = MCPStatusDisplay;