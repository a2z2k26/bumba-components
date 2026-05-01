/**
 * MCP Manager
 * Main integration point for all MCP functionality
 */

const { EventEmitter } = require('events');
const chalk = require('chalk');

// Core components
const { MCPServerRegistry, getInstance: getRegistry } = require('./server-registry');
const { MCPEnvConfigLoader, getInstance: getConfigLoader } = require('./env-config-loader');
const { MCPDynamicLoader, getInstance: getDynamicLoader } = require('./dynamic-loader');
const { MCPSessionState, getInstance: getSessionState } = require('./session-state');
// Optional resilience components — graceful fallback if not present
let MCPHealthMonitor = null;
let getHealthMonitor = () => null;
let MCPErrorRecovery = null;
let getErrorRecovery = () => null;
try {
  ({ MCPHealthMonitor, getInstance: getHealthMonitor } = require('./health-monitor'));
} catch (_) { /* health-monitor optional */ }
try {
  ({ MCPErrorRecovery, getInstance: getErrorRecovery } = require('./error-recovery'));
} catch (_) { /* error-recovery optional */ }

// UI components
const MCPNaturalLanguageParser = require('./nl-parser');
const MCPStatusDisplay = require('./status-display');
const MCPControlUI = require('./control-ui');
const MCPDialogInterface = require('./dialog-interface');
const MCPInteractiveCommands = require('./interactive-commands');
const MCPSetupWizard = require('./setup-wizard');

class MCPManager extends EventEmitter {
  constructor() {
    super();

    // Initialize core components
    this.registry = getRegistry();
    this.configLoader = getConfigLoader();
    this.sessionState = getSessionState();
    this.dynamicLoader = getDynamicLoader(this.registry, this.configLoader);
    this.healthMonitor = getHealthMonitor(this.dynamicLoader, this.sessionState);
    this.errorRecovery = getErrorRecovery(this.dynamicLoader, this.sessionState, this.healthMonitor);

    // Initialize UI components
    this.nlParser = new MCPNaturalLanguageParser();
    this.statusDisplay = new MCPStatusDisplay(
      this.registry,
      this.dynamicLoader,
      this.healthMonitor,
      this.sessionState,
      this.errorRecovery
    );
    this.controlUI = new MCPControlUI(
      this.registry,
      this.dynamicLoader,
      this.healthMonitor,
      this.sessionState
    );
    this.dialogInterface = new MCPDialogInterface(
      this.registry,
      this.configLoader,
      this.dynamicLoader,
      this.sessionState,
      this.healthMonitor
    );
    this.interactiveCommands = new MCPInteractiveCommands(
      this.registry,
      this.dynamicLoader,
      this.healthMonitor,
      this.sessionState,
      this.errorRecovery,
      this.statusDisplay,
      this.nlParser
    );
    this.setupWizard = new MCPSetupWizard(
      this.registry,
      this.configLoader,
      this.sessionState
    );

    // State
    this.initialized = false;
    this.mode = 'command'; // 'command', 'dialog', 'dashboard'
  }

  /**
   * Initialize MCP system
   */
  async initialize() {
    if (this.initialized) return;

    console.log(chalk.cyan('Initializing MCP Management System...'));

    try {
      // Load configuration
      await this.configLoader.loadConfiguration();
      console.log(chalk.green('  ✓ Configuration loaded'));

      // Initialize session
      await this.sessionState.initialize();
      console.log(chalk.green('  ✓ Session initialized'));

      // Start health monitoring
      this.healthMonitor.start();
      console.log(chalk.green('  ✓ Health monitoring started'));

      // Setup error recovery
      this.errorRecovery.start();
      console.log(chalk.green('  ✓ Error recovery enabled'));

      // Check for auto-start (skip in testing)
      const autoStart = this.sessionState.currentSession.preferences.autoStartCore;
      if (autoStart && !process.env.BUMBA_TESTING) {
        console.log(chalk.yellow('  ▶ Auto-starting core servers...'));
        await this.startCoreServers();
      }

      this.initialized = true;
      console.log(chalk.green('\n✅ MCP System Ready!\n'));

      this.emit('initialized');
    } catch (error) {
      console.error(chalk.red(`Initialization failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Execute a command (natural language or structured)
   */
  async executeCommand(input) {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.interactiveCommands.executeCommand(input);
  }

  /**
   * Launch dialog interface
   */
  async launchDialog() {
    if (!this.initialized) {
      await this.initialize();
    }

    this.mode = 'dialog';
    await this.dialogInterface.launch();
  }

  /**
   * Launch dashboard
   */
  async launchDashboard() {
    if (!this.initialized) {
      await this.initialize();
    }

    this.mode = 'dashboard';
    await this.controlUI.launchDashboard();
  }

  /**
   * Show status
   */
  async showStatus(type = 'full') {
    if (!this.initialized) {
      await this.initialize();
    }

    switch (type) {
      case 'full':
        await this.statusDisplay.displayFullStatus();
        break;
      case 'compact':
        await this.statusDisplay.displayCompactStatus();
        break;
      case 'live':
        await this.statusDisplay.displayLiveStatus();
        break;
      default:
        await this.statusDisplay.displayFullStatus();
    }
  }

  /**
   * Start core servers
   */
  async startCoreServers() {
    const results = await this.dynamicLoader.startCoreServers();
    this.emit('coreServersStarted', results);
    return results;
  }

  /**
   * Start all enabled servers
   */
  async startEnabledServers() {
    const results = await this.dynamicLoader.startEnabledServers();
    this.emit('enabledServersStarted', results);
    return results;
  }

  /**
   * Stop all servers
   */
  async stopAllServers() {
    const results = await this.dynamicLoader.stopAllServers();
    this.emit('allServersStopped', results);
    return results;
  }

  /**
   * Get server info
   */
  getServerInfo(serverName) {
    const def = this.registry.getServer(serverName);
    const config = this.configLoader.getServerConfig(serverName);
    const isRunning = this.dynamicLoader.isServerRunning(serverName);
    const metrics = this.healthMonitor.getServerMetrics(serverName);

    return {
      definition: def,
      config,
      running: isRunning,
      metrics
    };
  }

  /**
   * Get system stats
   */
  getSystemStats() {
    return {
      registry: this.registry.getStats(),
      status: this.dynamicLoader.getServerStatus(),
      health: this.healthMonitor.getHealthSummary(),
      session: this.sessionState.getSessionStats(),
      recovery: this.errorRecovery.getRecoveryStatus()
    };
  }

  /**
   * Export report
   */
  async exportReport(outputPath) {
    await this.statusDisplay.exportStatusReport(outputPath);
  }

  /**
   * Launch setup wizard
   */
  async launchWizard() {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.setupWizard.launch();
  }

  /**
   * Quick setup
   */
  async quickSetup(profile) {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.setupWizard.quickSetup(profile);
  }

  /**
   * Shutdown
   */
  async shutdown() {
    console.log(chalk.yellow('\nShutting down MCP system...'));

    // Stop health monitoring
    this.healthMonitor.stop();

    // Stop error recovery
    this.errorRecovery.stop();

    // Save session state
    await this.sessionState.saveState();

    // Stop all servers if configured
    const stopOnExit = this.sessionState.currentSession.preferences.stopServersOnExit;
    if (stopOnExit) {
      await this.stopAllServers();
    }

    console.log(chalk.green('MCP system shutdown complete'));
    this.emit('shutdown');
  }

  /**
   * Handle process signals
   */
  setupSignalHandlers() {
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\nReceived SIGINT...'));
      await this.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log(chalk.yellow('\nReceived SIGTERM...'));
      await this.shutdown();
      process.exit(0);
    });
  }
}

// Singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new MCPManager();
  }
  return instance;
}

module.exports = {
  MCPManager,
  getInstance
};