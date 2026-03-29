/**
 * MCP Dynamic Server Loader
 * Handles runtime loading and unloading of MCP servers
 */

const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');

class MCPDynamicLoader extends EventEmitter {
  constructor(registry, configLoader) {
    super();
    this.registry = registry;
    this.configLoader = configLoader;
    this.activeProcesses = new Map();
    this.connectionAttempts = new Map();
    this.maxRetries = 3;
  }

  /**
   * Start an MCP server
   */
  async startServer(serverName) {
    try {
      // Check if already running
      if (this.activeProcesses.has(serverName)) {
        console.log(`Server ${serverName} is already running`);
        return { success: true, already: true };
      }

      // Get server configuration
      const serverDef = this.registry.getServer(serverName);
      if (!serverDef) {
        throw new Error(`Unknown server: ${serverName}`);
      }

      const serverConfig = this.configLoader.getServerConfig(serverName);
      if (!serverConfig || !serverConfig.enabled) {
        throw new Error(`Server ${serverName} is not enabled`);
      }

      // Prepare environment variables
      const env = { ...process.env };
      if (serverDef.env) {
        for (const [key, envVar] of Object.entries(serverDef.env)) {
          const value = process.env[envVar];
          if (value) {
            env[key] = value;
          }
        }
      }

      // Handle special command cases
      let command, args;
      if (serverDef.isScript) {
        // For script-based servers like CHATTA
        command = process.env[serverDef.command] || serverDef.command;
        args = [];
      } else {
        command = serverDef.command;
        args = [...serverDef.args];
      }

      // Add configuration-specific arguments
      if (serverDef.configurable) {
        if (serverDef.configurable.paths && serverConfig.config.paths) {
          args.push('--paths', serverConfig.config.paths.join(','));
        }
        if (serverDef.configurable.url && serverConfig.config.url) {
          env.DATABASE_URL = serverConfig.config.url;
        }
      }

      // Spawn the server process
      console.log(`Starting ${serverName} server...`);
      const serverProcess = spawn(command, args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      // Handle process events
      serverProcess.on('error', (error) => {
        console.error(`Failed to start ${serverName}:`, error);
        this.handleServerError(serverName, error);
      });

      serverProcess.stdout.on('data', (data) => {
        this.emit('server:output', { server: serverName, data: data.toString() });
      });

      serverProcess.stderr.on('data', (data) => {
        this.emit('server:error', { server: serverName, data: data.toString() });
      });

      serverProcess.on('close', (code) => {
        console.log(`${serverName} server exited with code ${code}`);
        this.activeProcesses.delete(serverName);
        this.registry.setInactive(serverName);
        this.emit('server:stopped', serverName);
      });

      // Store the process
      this.activeProcesses.set(serverName, {
        process: serverProcess,
        startTime: Date.now(),
        config: serverConfig
      });

      // Mark as active
      this.registry.setActive(serverName);
      this.emit('server:started', serverName);

      return {
        success: true,
        serverName,
        pid: serverProcess.pid
      };

    } catch (error) {
      console.error(`Failed to start server ${serverName}:`, error);
      return {
        success: false,
        serverName,
        error: error.message
      };
    }
  }

  /**
   * Stop an MCP server
   */
  async stopServer(serverName) {
    try {
      const serverInfo = this.activeProcesses.get(serverName);
      if (!serverInfo) {
        console.log(`Server ${serverName} is not running`);
        return { success: true, already: true };
      }

      console.log(`Stopping ${serverName} server...`);

      // Graceful shutdown attempt
      serverInfo.process.kill('SIGTERM');

      // Wait for graceful shutdown
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if not stopped
          if (this.activeProcesses.has(serverName)) {
            console.log(`Force stopping ${serverName}...`);
            serverInfo.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        serverInfo.process.once('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Clean up
      this.activeProcesses.delete(serverName);
      this.registry.setInactive(serverName);
      this.emit('server:stopped', serverName);

      return {
        success: true,
        serverName
      };

    } catch (error) {
      console.error(`Failed to stop server ${serverName}:`, error);
      return {
        success: false,
        serverName,
        error: error.message
      };
    }
  }

  /**
   * Restart a server
   */
  async restartServer(serverName) {
    console.log(`Restarting ${serverName} server...`);
    await this.stopServer(serverName);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
    return await this.startServer(serverName);
  }

  /**
   * Start all core servers
   */
  async startCoreServers() {
    const results = [];
    const coreServers = this.registry.getCoreServers();

    for (const server of coreServers) {
      const result = await this.startServer(server.name);
      results.push(result);
    }

    return results;
  }

  /**
   * Start all enabled servers
   */
  async startEnabledServers() {
    const results = [];
    const enabledServers = this.configLoader.getEnabledServers();

    // Start core servers first
    const coreResults = await this.startCoreServers();
    results.push(...coreResults);

    // Then start other enabled servers
    for (const server of enabledServers) {
      if (!this.registry.isCore(server.name)) {
        const result = await this.startServer(server.name);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Stop all active servers
   */
  async stopAllServers() {
    const results = [];
    const activeServers = [...this.activeProcesses.keys()];

    for (const serverName of activeServers) {
      const result = await this.stopServer(serverName);
      results.push(result);
    }

    return results;
  }

  /**
   * Handle server errors with retry logic
   */
  async handleServerError(serverName, error) {
    const attempts = this.connectionAttempts.get(serverName) || 0;

    if (attempts < this.maxRetries) {
      console.log(`Retrying ${serverName} (attempt ${attempts + 1}/${this.maxRetries})...`);
      this.connectionAttempts.set(serverName, attempts + 1);

      setTimeout(async () => {
        await this.startServer(serverName);
      }, 2000 * (attempts + 1)); // Exponential backoff
    } else {
      console.error(`Failed to start ${serverName} after ${this.maxRetries} attempts`);
      this.connectionAttempts.delete(serverName);
      this.emit('server:failed', { serverName, error });
    }
  }

  /**
   * Get status of all servers
   */
  getServerStatus() {
    const status = {
      active: [],
      inactive: [],
      failed: []
    };

    // Get all registered servers
    for (const [name, config] of this.registry.servers) {
      if (this.activeProcesses.has(name)) {
        const info = this.activeProcesses.get(name);
        status.active.push({
          name,
          pid: info.process.pid,
          uptime: Date.now() - info.startTime,
          category: config.category
        });
      } else {
        status.inactive.push({
          name,
          category: config.category,
          enabled: this.configLoader.getServerConfig(name)?.enabled || false
        });
      }
    }

    return status;
  }

  /**
   * Check if a server is running
   */
  isServerRunning(serverName) {
    return this.activeProcesses.has(serverName);
  }

  /**
   * Get active server count
   */
  getActiveCount() {
    return this.activeProcesses.size;
  }

  /**
   * Clean up on exit
   */
  async cleanup() {
    console.log('Shutting down MCP servers...');
    await this.stopAllServers();
  }
}

// Export singleton
let instance = null;

function getInstance(registry, configLoader) {
  if (!instance) {
    instance = new MCPDynamicLoader(registry, configLoader);

    // Set up cleanup on exit
    process.on('SIGINT', async () => {
      await instance.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await instance.cleanup();
      process.exit(0);
    });
  }
  return instance;
}

module.exports = {
  MCPDynamicLoader,
  getInstance
};