/**
 * MCP Interactive Commands
 * Handles user commands and executes MCP operations
 */

const chalk = require('chalk');
const ora = require('ora');
const { EventEmitter } = require('events');

class MCPInteractiveCommands extends EventEmitter {
  constructor(registry, loader, healthMonitor, sessionState, errorRecovery, statusDisplay, nlParser) {
    super();
    this.registry = registry;
    this.loader = loader;
    this.healthMonitor = healthMonitor;
    this.sessionState = sessionState;
    this.errorRecovery = errorRecovery;
    this.statusDisplay = statusDisplay;
    this.nlParser = nlParser;

    // Command handlers
    this.handlers = {
      start: this.handleStart.bind(this),
      stop: this.handleStop.bind(this),
      restart: this.handleRestart.bind(this),
      status: this.handleStatus.bind(this),
      help: this.handleHelp.bind(this),
      quickStart: this.handleQuickStart.bind(this),
      category: this.handleCategory.bind(this),
      config: this.handleConfig.bind(this)
    };

    // Command history
    this.history = [];
    this.historyIndex = 0;
  }

  /**
   * Execute a command (natural language or structured)
   */
  async executeCommand(input) {
    // Add to history
    this.addToHistory(input);

    // Parse command
    const parsed = this.nlParser.parse(input);

    // Validate command
    const validation = this.nlParser.validate(parsed);
    if (!validation.valid) {
      console.log(chalk.red(`Error: ${validation.error}`));
      return { success: false, error: validation.error };
    }

    // Log command
    console.log(chalk.gray(`Executing: ${this.nlParser.formatCommand(parsed)}`));

    // Execute handler
    const handler = this.handlers[parsed.action];
    if (handler) {
      return await handler(parsed.targets, parsed);
    } else {
      console.log(chalk.red(`Unknown action: ${parsed.action}`));
      return { success: false, error: `Unknown action: ${parsed.action}` };
    }
  }

  /**
   * Handle start command
   */
  async handleStart(targets, context) {
    const spinner = ora('Starting servers...').start();
    const results = [];

    try {
      // Handle special targets
      if (targets.includes('all')) {
        const allResults = await this.loader.startAllServers();
        spinner.succeed('All servers processed');
        return { success: true, results: allResults };
      }

      if (targets.includes('core')) {
        const coreResults = await this.loader.startCoreServers();
        spinner.succeed('Core servers started');
        return { success: true, results: coreResults };
      }

      if (targets.includes('enabled')) {
        const enabledResults = await this.loader.startEnabledServers();
        spinner.succeed('Enabled servers started');
        return { success: true, results: enabledResults };
      }

      // Handle individual servers and categories
      for (const target of targets) {
        if (target.startsWith('category:')) {
          const category = target.replace('category:', '');
          const servers = this.registry.getServersByCategory(category);

          for (const server of servers) {
            const result = await this.loader.startServer(server.name);
            results.push(result);
          }
        } else {
          const result = await this.loader.startServer(target);
          results.push(result);
        }
      }

      spinner.succeed('Servers started');
      this.displayResults(results);
      return { success: true, results };

    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle stop command
   */
  async handleStop(targets, context) {
    const spinner = ora('Stopping servers...').start();
    const results = [];

    try {
      // Handle special targets
      if (targets.includes('all')) {
        const allResults = await this.loader.stopAllServers();
        spinner.succeed('All servers stopped');
        return { success: true, results: allResults };
      }

      // Handle individual servers and categories
      for (const target of targets) {
        if (target.startsWith('category:')) {
          const category = target.replace('category:', '');
          const servers = this.registry.getServersByCategory(category);

          for (const server of servers) {
            const result = await this.loader.stopServer(server.name);
            results.push(result);
          }
        } else {
          const result = await this.loader.stopServer(target);
          results.push(result);
        }
      }

      spinner.succeed('Servers stopped');
      this.displayResults(results);
      return { success: true, results };

    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle restart command
   */
  async handleRestart(targets, context) {
    const spinner = ora('Restarting servers...').start();
    const results = [];

    try {
      for (const target of targets) {
        if (target.startsWith('category:')) {
          const category = target.replace('category:', '');
          const servers = this.registry.getServersByCategory(category);

          for (const server of servers) {
            const result = await this.loader.restartServer(server.name);
            results.push(result);
          }
        } else {
          const result = await this.loader.restartServer(target);
          results.push(result);
        }
      }

      spinner.succeed('Servers restarted');
      this.displayResults(results);
      return { success: true, results };

    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle status command
   */
  async handleStatus(targets, context) {
    try {
      if (targets.includes('all') || targets.length === 0) {
        await this.statusDisplay.displayFullStatus();
      } else {
        for (const target of targets) {
          if (target.startsWith('category:')) {
            const category = target.replace('category:', '');
            await this.displayCategoryStatus(category);
          } else {
            await this.statusDisplay.displayServerStatus(target);
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.log(chalk.red(`Status error: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle help command
   */
  async handleHelp(targets, context) {
    console.log(chalk.cyan('\n📚 MCP Command Help\n'));

    const commands = [
      { cmd: 'start [server|all|core]', desc: 'Start MCP servers' },
      { cmd: 'stop [server|all]', desc: 'Stop MCP servers' },
      { cmd: 'restart [server]', desc: 'Restart MCP servers' },
      { cmd: 'status [server|all]', desc: 'Show server status' },
      { cmd: 'list [category]', desc: 'List servers by category' },
      { cmd: 'health', desc: 'Show health dashboard' },
      { cmd: 'config', desc: 'Configure settings' },
      { cmd: 'help', desc: 'Show this help' }
    ];

    console.log(chalk.white('Commands:'));
    commands.forEach(({ cmd, desc }) => {
      console.log(chalk.yellow(`  ${cmd.padEnd(25)} ${chalk.gray(desc)}`));
    });

    console.log(chalk.white('\nExamples:'));
    console.log(chalk.gray('  start github'));
    console.log(chalk.gray('  stop all'));
    console.log(chalk.gray('  show status'));
    console.log(chalk.gray('  restart databases'));

    console.log(chalk.white('\nServer Categories:'));
    const categories = this.registry.getCategories();
    categories.forEach(cat => {
      const count = this.registry.getServersByCategory(cat.key).length;
      console.log(chalk.gray(`  ${cat.icon} ${cat.name} (${count} servers)`));
    });

    return { success: true };
  }

  /**
   * Handle quick start
   */
  async handleQuickStart(targets, context) {
    console.log(chalk.cyan('\n🚀 Quick Start - Enabling Core Servers\n'));

    const spinner = ora('Starting core servers...').start();

    try {
      const results = await this.loader.startCoreServers();

      spinner.succeed('Core servers initialized');

      // Display results
      for (const result of results) {
        if (result.success) {
          console.log(chalk.green(`  ✓ ${result.serverName}`));
        } else {
          console.log(chalk.red(`  ✗ ${result.serverName}: ${result.error}`));
        }
      }

      // Show quick stats
      const status = this.loader.getServerStatus();
      console.log(chalk.gray(`\n  Active: ${status.active.length} servers`));

      return { success: true, results };
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle category command
   */
  async handleCategory(targets, context) {
    if (targets.length === 0) {
      // List all categories
      console.log(chalk.cyan('\n📁 Server Categories\n'));

      const categories = this.registry.getCategories();
      for (const cat of categories) {
        const servers = this.registry.getServersByCategory(cat.key);
        console.log(chalk.yellow(`${cat.icon} ${cat.name} (${servers.length})`));
        console.log(chalk.gray(`  ${cat.description}`));

        // Show first 3 servers
        servers.slice(0, 3).forEach(s => {
          const isRunning = this.loader.isServerRunning(s.name);
          const status = isRunning ? chalk.green('●') : chalk.gray('○');
          console.log(`    ${status} ${s.displayName}`);
        });

        if (servers.length > 3) {
          console.log(chalk.gray(`    ... and ${servers.length - 3} more`));
        }
        console.log();
      }
    } else {
      // Show specific category
      for (const categoryName of targets) {
        await this.displayCategoryStatus(categoryName);
      }
    }

    return { success: true };
  }

  /**
   * Handle config command
   */
  async handleConfig(targets, context) {
    console.log(chalk.cyan('\n⚙️  Configuration\n'));

    const config = this.sessionState.currentSession.preferences;

    console.log(chalk.white('Current Settings:'));
    console.log(chalk.gray(`  Auto-start core: ${config.autoStartCore || false}`));
    console.log(chalk.gray(`  Health monitoring: ${config.healthMonitoring || true}`));
    console.log(chalk.gray(`  Error recovery: ${config.errorRecovery || true}`));
    console.log(chalk.gray(`  Session persistence: ${config.sessionPersistence || true}`));

    console.log(chalk.white('\nEnvironment:'));
    console.log(chalk.gray(`  Config source: ${process.env.MCP_CONFIG_SOURCE || '.env'}`));
    console.log(chalk.gray(`  Session file: .mcp-session.json`));

    return { success: true };
  }

  /**
   * Display category status
   */
  async displayCategoryStatus(categoryName) {
    const category = this.registry.categories[categoryName];
    if (!category) {
      console.log(chalk.red(`Unknown category: ${categoryName}`));
      return;
    }

    console.log(chalk.cyan(`\n${category.icon} ${category.name}`));
    console.log(chalk.gray(category.description));
    console.log();

    const servers = this.registry.getServersByCategory(categoryName);
    for (const server of servers) {
      const isRunning = this.loader.isServerRunning(server.name);
      const config = this.loader.configLoader.getServerConfig(server.name);
      const metrics = this.healthMonitor.getServerMetrics(server.name);

      const status = isRunning ? chalk.green('● Running') : chalk.gray('○ Stopped');
      const enabled = config?.enabled ? chalk.green('Enabled') : chalk.gray('Disabled');
      const health = metrics.health ? 
        this.getHealthColor(metrics.health.status)(metrics.health.status) : 
        chalk.gray('Unknown');

      console.log(`  ${server.displayName.padEnd(20)} ${status.padEnd(20)} ${enabled.padEnd(15)} ${health}`);
    }
  }

  /**
   * Get health color
   */
  getHealthColor(status) {
    const colors = {
      healthy: chalk.green,
      degraded: chalk.yellow,
      unhealthy: chalk.red,
      critical: chalk.red.bold,
      error: chalk.red.bold
    };
    return colors[status] || chalk.gray;
  }

  /**
   * Display results
   */
  displayResults(results) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (successful.length > 0) {
      console.log(chalk.green('\nSuccessful:'));
      successful.forEach(r => {
        console.log(chalk.green(`  ✓ ${r.serverName}`));
      });
    }

    if (failed.length > 0) {
      console.log(chalk.red('\nFailed:'));
      failed.forEach(r => {
        console.log(chalk.red(`  ✗ ${r.serverName}: ${r.error}`));
      });
    }
  }

  /**
   * Add command to history
   */
  addToHistory(command) {
    this.history.push(command);
    if (this.history.length > 100) {
      this.history.shift();
    }
    this.historyIndex = this.history.length;
  }

  /**
   * Get previous command from history
   */
  getPreviousCommand() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      return this.history[this.historyIndex];
    }
    return null;
  }

  /**
   * Get next command from history
   */
  getNextCommand() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      return this.history[this.historyIndex];
    }
    return '';
  }

  /**
   * Get command suggestions
   */
  getSuggestions(partial) {
    return this.nlParser.getSuggestions(partial);
  }
}

module.exports = MCPInteractiveCommands;