/**
 * MCP Dialog Interface
 * User-friendly dialog for MCP server management
 */

const inquirer = require('inquirer');
const chalk = require('chalk');
const Table = require('cli-table3');
const { EventEmitter } = require('events');

// BUMBA color palette - smooth 6-step gradient (standardized)
const green = chalk.hex('#00FF00');        // Bright green
const lime = chalk.hex('#88FF00');         // Lime green
const yellow = chalk.hex('#FFFF00');       // Pure yellow
const amber = chalk.hex('#FFAA00');        // Amber/Golden
const orange = chalk.hex('#FF5500');       // Orange
const red = chalk.hex('#FF0000');          // Pure red
const gray = chalk.gray;
const white = chalk.white;

class MCPDialogInterface extends EventEmitter {
  constructor(registry, configLoader, dynamicLoader, sessionState, healthMonitor) {
    super();
    this.registry = registry;
    this.configLoader = configLoader;
    this.loader = dynamicLoader;
    this.sessionState = sessionState;
    this.healthMonitor = healthMonitor;

    // UI configuration
    this.config = {
      showEmojis: true,
      showColors: true,
      compactMode: false,
      autoRefresh: true
    };

    // Menu structure
    this.menus = {
      main: this.mainMenu.bind(this),
      servers: this.serversMenu.bind(this),
      categories: this.categoriesMenu.bind(this),
      manage: this.manageSelectedServers.bind(this),
      settings: this.settingsMenu.bind(this),
      health: this.healthMenu.bind(this)
    };
  }

  /**
   * Launch the dialog interface
   */
  async launch() {
    console.clear();
    await this.showHeader();
    await this.mainMenu();
  }

  /**
   * Show header
   */
  async showHeader() {
    console.log(lime.bold('\n╔═══════════════════════════════════════════╗'));
    console.log(lime.bold('║       BUMBA MCP Management Console        ║'));
    console.log(lime.bold('╚═══════════════════════════════════════════╝'));

    // Show quick stats
    const stats = this.registry.getStats();
    const status = this.loader.getServerStatus();

    console.log(gray('\n🟡 Quick Stats:'));
    console.log(white(`   Total Servers: ${stats.total}`));
    console.log(green(`   Active: ${status.active.length}`));
    console.log(yellow(`   Inactive: ${status.inactive.length}`));
    console.log();
  }

  /**
   * Main menu
   */
  async mainMenu() {
    const choices = [
      { name: '🏁 Quick Start (Enable Core Servers)', value: 'quickstart' },
      { name: '🟢 Manage Servers', value: 'servers' },
      { name: '🟡 Browse by Category', value: 'categories' },
      { name: '🟢 Health Dashboard', value: 'health' },
      { name: '🟡 Settings', value: 'settings' },
      new inquirer.Separator(),
      { name: '🟡 Refresh Status', value: 'refresh' },
      { name: '✗ Exit', value: 'exit' }
    ];

    const { action } = await inquirer.prompt({
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices
    });

    switch (action) {
      case 'quickstart':
        await this.quickStart();
        break;
      case 'servers':
        await this.serversMenu();
        break;
      case 'categories':
        await this.categoriesMenu();
        break;
      case 'health':
        await this.healthMenu();
        break;
      case 'settings':
        await this.settingsMenu();
        break;
      case 'refresh':
        console.clear();
        await this.showHeader();
        await this.mainMenu();
        break;
      case 'exit':
        await this.exit();
        break;
    }
  }

  /**
   * Quick start - enable core servers
   */
  async quickStart() {
    console.log(lime('\n🏁 Starting core MCP servers...\n'));

    const results = await this.loader.startCoreServers();

    for (const result of results) {
      if (result.success) {
        console.log(green(`  ✓ ${result.serverName} started`));
      } else {
        console.log(red(`  ✗ ${result.serverName} failed: ${result.error}`));
      }
    }

    console.log(green('\n✓ Core servers initialized!\n'));
    await this.pause();
    await this.mainMenu();
  }

  /**
   * Servers menu
   */
  async serversMenu() {
    const servers = [];

    // Get all servers with status
    for (const [name, def] of this.registry.servers) {
      const config = this.configLoader.getServerConfig(name);
      const isActive = this.loader.isServerRunning(name);

      servers.push({
        name: `${this.getCategoryEmoji(def.category)} ${def.displayName}`,
        value: name,
        short: def.displayName,
        disabled: !config || !config.enabled,
        checked: isActive
      });
    }

    const { selected } = await inquirer.prompt({
      type: 'checkbox',
      name: 'selected',
      message: 'Select servers to manage (Space to select, Enter to proceed):',
      choices: servers,
      pageSize: 15
    });

    if (selected.length === 0) {
      await this.mainMenu();
      return;
    }

    await this.manageSelectedServers(selected);
  }

  /**
   * Categories menu
   */
  async categoriesMenu() {
    const categories = this.registry.getCategories();

    const { category } = await inquirer.prompt({
      type: 'list',
      name: 'category',
      message: 'Select a category:',
      choices: categories.map(cat => ({
        name: `${cat.icon} ${cat.name} (${this.registry.getServersByCategory(cat.key).length} servers)`,
        value: cat.key
      })).concat([
        new inquirer.Separator(),
        { name: '← Back', value: 'back' }
      ])
    });

    if (category === 'back') {
      await this.mainMenu();
      return;
    }

    await this.categoryServersMenu(category);
  }

  /**
   * Category servers menu
   */
  async categoryServersMenu(category) {
    const servers = this.registry.getServersByCategory(category);
    const categoryMeta = this.registry.categories[category];

    console.log(lime(`\n${categoryMeta.icon} ${categoryMeta.name}`));
    console.log(gray(categoryMeta.description));

    const { selected } = await inquirer.prompt({
      type: 'checkbox',
      name: 'selected',
      message: 'Select servers to enable:',
      choices: servers.map(server => ({
        name: server.displayName,
        value: server.name,
        checked: this.loader.isServerRunning(server.name),
        disabled: !this.configLoader.getServerConfig(server.name)?.enabled
      }))
    });

    if (selected.length > 0) {
      await this.manageSelectedServers(selected);
    } else {
      await this.categoriesMenu();
    }
  }

  /**
   * Manage selected servers
   */
  async manageSelectedServers(serverNames) {
    const { action } = await inquirer.prompt({
      type: 'list',
      name: 'action',
      message: `What would you like to do with ${serverNames.length} selected server(s)?`,
      choices: [
        { name: '▶️  Start', value: 'start' },
        { name: '⏹  Stop', value: 'stop' },
        { name: '🔄 Restart', value: 'restart' },
        { name: 'ℹ️  View Details', value: 'details' },
        new inquirer.Separator(),
        { name: '← Back', value: 'back' }
      ]
    });

    switch (action) {
      case 'start':
        await this.startServers(serverNames);
        break;
      case 'stop':
        await this.stopServers(serverNames);
        break;
      case 'restart':
        await this.restartServers(serverNames);
        break;
      case 'details':
        await this.showServerDetails(serverNames);
        break;
      case 'back':
        await this.serversMenu();
        break;
    }
  }

  /**
   * Start servers
   */
  async startServers(serverNames) {
    console.log(lime('\n🟢 Starting servers...\n'));

    for (const name of serverNames) {
      const result = await this.loader.startServer(name);
      if (result.success) {
        console.log(green(`  ✓ ${name} started`));
      } else {
        console.log(red(`  ✗ ${name} failed: ${result.error}`));
      }
    }

    await this.pause();
    await this.serversMenu();
  }

  /**
   * Stop servers
   */
  async stopServers(serverNames) {
    console.log(lime('\n🔴 Stopping servers...\n'));

    for (const name of serverNames) {
      const result = await this.loader.stopServer(name);
      if (result.success) {
        console.log(green(`  ✓ ${name} stopped`));
      } else {
        console.log(red(`  ✗ ${name} failed: ${result.error}`));
      }
    }

    await this.pause();
    await this.serversMenu();
  }

  /**
   * Restart servers
   */
  async restartServers(serverNames) {
    console.log(lime('\n🟡 Restarting servers...\n'));

    for (const name of serverNames) {
      const result = await this.loader.restartServer(name);
      if (result.success) {
        console.log(green(`  ✓ ${name} restarted`));
      } else {
        console.log(red(`  ✗ ${name} failed: ${result.error}`));
      }
    }

    await this.pause();
    await this.serversMenu();
  }

  /**
   * Show server details
   */
  async showServerDetails(serverNames) {
    for (const name of serverNames) {
      const def = this.registry.getServer(name);
      const config = this.configLoader.getServerConfig(name);
      const metrics = this.healthMonitor.getServerMetrics(name);

      console.log(lime(`\n━━━ ${def.displayName} ━━━`));
      console.log(white(`Category: ${def.category}`));
      console.log(white(`Description: ${def.description}`));
      console.log(white(`Requires Auth: ${def.requiresAuth ? 'Yes' : 'No'}`));
      console.log(white(`Status: ${this.loader.isServerRunning(name) ? green('Running') : gray('Stopped')}`));

      if (metrics.health) {
        console.log(white(`Health: ${this.getHealthEmoji(metrics.health.status)} ${metrics.health.status}`));
      }

      if (config) {
        console.log(white(`Enabled: ${config.enabled ? 'Yes' : 'No'}`));
      }

      console.log();
    }

    await this.pause();
    await this.serversMenu();
  }

  /**
   * Health menu
   */
  async healthMenu() {
    const summary = this.healthMonitor.getHealthSummary();

    console.log(lime('\n🟢 Health Dashboard\n'));

    // Create health table
    const table = new Table({
      head: ['Server', 'Status', 'Memory', 'CPU', 'Uptime'],
      style: {
        head: ['cyan']
      }
    });

    for (const [name, health] of Object.entries(summary.servers)) {
      const def = this.registry.getServer(name);
      if (def && health) {
        table.push([
          def.displayName,
          this.getHealthEmoji(health.status) + ' ' + health.status,
          health.memoryUsage ? `${Math.round(health.memoryUsage / 1024 / 1024)}MB` : 'N/A',
          health.cpuUsage ? `${health.cpuUsage}%` : 'N/A',
          health.uptime ? this.formatUptime(health.uptime) : 'N/A'
        ]);
      }
    }

    console.log(table.toString());
    console.log(white(`\nOverall Status: ${this.getHealthEmoji(summary.overall)} ${summary.overall}`));

    await this.pause();
    await this.mainMenu();
  }

  /**
   * Settings menu
   */
  async settingsMenu() {
    const { settings } = await inquirer.prompt({
      type: 'checkbox',
      name: 'settings',
      message: 'Configure settings:',
      choices: [
        {
          name: 'Show Emojis',
          value: 'showEmojis',
          checked: this.config.showEmojis
        },
        {
          name: 'Show Colors',
          value: 'showColors',
          checked: this.config.showColors
        },
        {
          name: 'Compact Mode',
          value: 'compactMode',
          checked: this.config.compactMode
        },
        {
          name: 'Auto Refresh',
          value: 'autoRefresh',
          checked: this.config.autoRefresh
        }
      ]
    });

    // Update settings
    this.config.showEmojis = settings.includes('showEmojis');
    this.config.showColors = settings.includes('showColors');
    this.config.compactMode = settings.includes('compactMode');
    this.config.autoRefresh = settings.includes('autoRefresh');

    // Save to session
    this.sessionState.updatePreference('dialogConfig', this.config);

    console.log(green('\n✓ Settings saved!\n'));
    await this.pause();
    await this.mainMenu();
  }

  /**
   * Get category emoji
   */
  getCategoryEmoji(category) {
    const cat = this.registry.categories[category];
    return this.config.showEmojis && cat ? cat.icon : '';
  }

  /**
   * Get health emoji
   */
  getHealthEmoji(status) {
    if (!this.config.showEmojis) return '';

    const emojis = {
      healthy: '🟢',
      degraded: '🟡',
      unhealthy: '🟠',
      critical: '🔴',
      error: '✗'
    };

    return emojis[status] || '⚪';
  }

  /**
   * Format uptime
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Pause for user
   */
  async pause() {
    await inquirer.prompt({
      type: 'input',
      name: 'continue',
      message: 'Press Enter to continue...'
    });
  }

  /**
   * Exit dialog
   */
  async exit() {
    const { confirm } = await inquirer.prompt({
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to exit?',
      default: false
    });

    if (confirm) {
      console.log(lime('\nSaving session state...'));
      await this.sessionState.saveState();
      console.log(green('✓ Session saved'));
      console.log(lime('\nGoodbye! 🏁\n'));
      process.exit(0);
    } else {
      await this.mainMenu();
    }
  }
}

module.exports = MCPDialogInterface;