/**
 * Service Manager for BUMBA Setup Wizard
 * Manages bridge service lifecycle and monitoring
 */

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const net = require('net');
const chalk = require('chalk');
const EventEmitter = require('events');

class ServiceManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serviceName: options.serviceName || 'bumba-bridge',
      pidFile: options.pidFile || path.join(process.cwd(), '.bumba', 'bridge.pid'),
      logFile: options.logFile || path.join(process.cwd(), '.bumba', 'logs', 'bridge.log'),
      autoRestart: options.autoRestart !== false,
      maxRestarts: options.maxRestarts || 3,
      healthCheckInterval: options.healthCheckInterval || 30000,
      ...options
    };
    
    // Service state
    this.state = {
      status: 'stopped',
      pid: null,
      port: null,
      startTime: null,
      restartCount: 0,
      lastError: null
    };
    
    // Process reference
    this.process = null;
    
    // Health check timer
    this.healthCheckTimer = null;
    
    // Service configuration
    this.config = null;
  }

  /**
   * Initialize service manager
   */
  async initialize(config) {
    this.config = config;
    
    // Ensure directories exist
    await fs.mkdir(path.dirname(this.options.pidFile), { recursive: true });
    await fs.mkdir(path.dirname(this.options.logFile), { recursive: true });
    
    // Check for existing service
    await this.checkExistingService();
    
    return true;
  }

  /**
   * Start the bridge service
   */
  async start() {
    if (this.state.status === 'running') {
      return {
        success: false,
        error: 'Service is already running'
      };
    }
    
    try {
      console.log(chalk.cyan('Starting Bridge Service...'));
      
      // Check port availability
      const portAvailable = await this.isPortAvailable(this.config.bridge?.port || 3456);
      if (!portAvailable) {
        throw new Error(`Port ${this.config.bridge?.port || 3456} is already in use`);
      }
      
      // Prepare environment variables
      const env = {
        ...process.env,
        NODE_ENV: this.config.environment || 'production',
        BRIDGE_PORT: this.config.bridge?.port || 3456,
        BRIDGE_HOST: this.config.bridge?.host || 'localhost',
        BRIDGE_SECRET: this.config.bridge?.sessionSecret || 'development-secret'
      };
      
      // Add API keys to environment
      if (this.config.apiKeys) {
        Object.entries(this.config.apiKeys).forEach(([provider, key]) => {
          if (key) {
            env[`${provider.toUpperCase()}_API_KEY`] = key;
          }
        });
      }
      
      // Start the bridge process
      const bridgeScript = path.join(process.cwd(), 'src', 'bridge', 'index.js');
      
      this.process = spawn('node', [bridgeScript], {
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Handle process events
      this.process.on('error', (error) => {
        this.handleProcessError(error);
      });
      
      this.process.on('exit', (code, signal) => {
        this.handleProcessExit(code, signal);
      });
      
      // Pipe output to log file
      const logStream = require('fs').createWriteStream(this.options.logFile, { flags: 'a' });
      this.process.stdout.pipe(logStream);
      this.process.stderr.pipe(logStream);
      
      // Update state
      this.state = {
        status: 'running',
        pid: this.process.pid,
        port: this.config.bridge?.port || 3456,
        startTime: new Date(),
        restartCount: 0,
        lastError: null
      };
      
      // Save PID file
      await this.savePidFile();
      
      // Wait for service to be ready
      const ready = await this.waitForService();
      
      if (!ready) {
        throw new Error('Service failed to start properly');
      }
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      // Emit start event
      this.emit('started', this.state);
      
      console.log(chalk.green(`✓ Bridge Service started on port ${this.state.port}`));
      console.log(chalk.gray(`  PID: ${this.state.pid}`));
      console.log(chalk.gray(`  Logs: ${this.options.logFile}`));
      
      return {
        success: true,
        pid: this.state.pid,
        port: this.state.port
      };
      
    } catch (error) {
      this.state.status = 'error';
      this.state.lastError = error.message;
      
      console.error(chalk.red(`Failed to start service: ${error.message}`));
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stop the bridge service
   */
  async stop() {
    if (this.state.status !== 'running') {
      return {
        success: false,
        error: 'Service is not running'
      };
    }
    
    try {
      console.log(chalk.cyan('Stopping Bridge Service...'));
      
      // Stop health monitoring
      this.stopHealthMonitoring();
      
      // Try graceful shutdown first
      if (this.process) {
        this.process.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise((resolve) => {
          let timeout = setTimeout(() => {
            // Force kill if not stopped
            this.process.kill('SIGKILL');
            resolve();
          }, 5000);
          
          this.process.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      } else if (this.state.pid) {
        // Kill by PID if process reference is lost
        try {
          process.kill(this.state.pid, 'SIGTERM');
          await new Promise(resolve => setTimeout(resolve, 1000));
          process.kill(this.state.pid, 'SIGKILL');
        } catch (error) {
          // Process might already be dead
        }
      }
      
      // Clean up PID file
      await this.removePidFile();
      
      // Update state
      this.state = {
        status: 'stopped',
        pid: null,
        port: null,
        startTime: null,
        restartCount: 0,
        lastError: null
      };
      
      // Emit stop event
      this.emit('stopped');
      
      console.log(chalk.green('✓ Bridge Service stopped'));
      
      return {
        success: true
      };
      
    } catch (error) {
      console.error(chalk.red(`Error stopping service: ${error.message}`));
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Restart the bridge service
   */
  async restart() {
    console.log(chalk.cyan('Restarting Bridge Service...'));
    
    const stopResult = await this.stop();
    if (!stopResult.success && this.state.status === 'running') {
      return stopResult;
    }
    
    // Wait a moment before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const startResult = await this.start();
    
    if (startResult.success) {
      this.state.restartCount++;
    }
    
    return startResult;
  }

  /**
   * Get service status
   */
  async status() {
    // Check if process is actually running
    if (this.state.pid) {
      const running = await this.isProcessRunning(this.state.pid);
      
      if (!running) {
        this.state.status = 'stopped';
        this.state.pid = null;
      }
    }
    
    // Check service health if running
    let health = null;
    if (this.state.status === 'running') {
      health = await this.checkHealth();
    }
    
    return {
      ...this.state,
      health,
      uptime: this.state.startTime ? Date.now() - this.state.startTime : null
    };
  }

  /**
   * Check service health
   */
  async checkHealth() {
    if (this.state.status !== 'running') {
      return {
        healthy: false,
        reason: 'Service not running'
      };
    }
    
    try {
      // Check if port is listening
      const portOpen = await this.isPortOpen(this.state.port);
      
      if (!portOpen) {
        return {
          healthy: false,
          reason: 'Port not responding'
        };
      }
      
      // Make health check request
      const response = await fetch(`http://localhost:${this.state.port}/health`, {
        timeout: 5000
      }).catch(() => null);
      
      if (!response || !response.ok) {
        return {
          healthy: false,
          reason: 'Health endpoint not responding'
        };
      }
      
      const data = await response.json().catch(() => ({}));
      
      return {
        healthy: true,
        status: data.status || 'unknown',
        memory: process.memoryUsage(),
        uptime: Date.now() - this.state.startTime
      };
      
    } catch (error) {
      return {
        healthy: false,
        reason: error.message
      };
    }
  }

  /**
   * Enable service (auto-start on boot)
   */
  async enable() {
    const platform = process.platform;
    
    try {
      if (platform === 'darwin') {
        // macOS: Create launchd plist
        const plist = this.generateLaunchdPlist();
        const plistPath = path.join(
          require('os').homedir(),
          'Library',
          'LaunchAgents',
          `com.bumba.bridge.plist`
        );
        
        await fs.writeFile(plistPath, plist, 'utf8');
        await execAsync(`launchctl load ${plistPath}`);
        
      } else if (platform === 'linux') {
        // Linux: Create systemd service
        const service = this.generateSystemdService();
        const servicePath = `/etc/systemd/system/${this.options.serviceName}.service`;
        
        await fs.writeFile(servicePath, service, 'utf8');
        await execAsync('systemctl daemon-reload');
        await execAsync(`systemctl enable ${this.options.serviceName}`);
        
      } else if (platform === 'win32') {
        // Windows: Create Windows service
        const servicePath = path.join(process.cwd(), 'src', 'bridge', 'index.js');
        await execAsync(
          `sc create ${this.options.serviceName} binPath= "node ${servicePath}" start= auto`
        );
      }
      
      console.log(chalk.green(`✓ Service enabled for auto-start`));
      
      return {
        success: true,
        platform
      };
      
    } catch (error) {
      console.error(chalk.red(`Failed to enable service: ${error.message}`));
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Disable service (remove auto-start)
   */
  async disable() {
    const platform = process.platform;
    
    try {
      if (platform === 'darwin') {
        const plistPath = path.join(
          require('os').homedir(),
          'Library',
          'LaunchAgents',
          `com.bumba.bridge.plist`
        );
        
        await execAsync(`launchctl unload ${plistPath}`);
        await fs.unlink(plistPath);
        
      } else if (platform === 'linux') {
        await execAsync(`systemctl disable ${this.options.serviceName}`);
        await execAsync(`systemctl stop ${this.options.serviceName}`);
        await fs.unlink(`/etc/systemd/system/${this.options.serviceName}.service`);
        
      } else if (platform === 'win32') {
        await execAsync(`sc delete ${this.options.serviceName}`);
      }
      
      console.log(chalk.green(`✓ Service disabled`));
      
      return {
        success: true,
        platform
      };
      
    } catch (error) {
      console.error(chalk.red(`Failed to disable service: ${error.message}`));
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get service logs
   */
  async getLogs(lines = 50) {
    try {
      const content = await fs.readFile(this.options.logFile, 'utf8');
      const logLines = content.split('\n');
      
      return {
        success: true,
        logs: logLines.slice(-lines).join('\n'),
        totalLines: logLines.length,
        path: this.options.logFile
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clear service logs
   */
  async clearLogs() {
    try {
      await fs.writeFile(this.options.logFile, '', 'utf8');
      
      return {
        success: true,
        message: 'Logs cleared'
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle process error
   */
  handleProcessError(error) {
    console.error(chalk.red(`Bridge process error: ${error.message}`));
    
    this.state.status = 'error';
    this.state.lastError = error.message;
    
    this.emit('error', error);
    
    // Attempt auto-restart if enabled
    if (this.options.autoRestart && this.state.restartCount < this.options.maxRestarts) {
      console.log(chalk.yellow('Attempting auto-restart...'));
      setTimeout(() => this.restart(), 5000);
    }
  }

  /**
   * Handle process exit
   */
  handleProcessExit(code, signal) {
    console.log(chalk.yellow(`Bridge process exited (code: ${code}, signal: ${signal})`));
    
    this.state.status = 'stopped';
    this.state.pid = null;
    
    this.emit('exit', { code, signal });
    
    // Attempt auto-restart if unexpected exit
    if (code !== 0 && this.options.autoRestart && this.state.restartCount < this.options.maxRestarts) {
      console.log(chalk.yellow('Attempting auto-restart after unexpected exit...'));
      setTimeout(() => this.restart(), 5000);
    }
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    this.stopHealthMonitoring();
    
    this.healthCheckTimer = setInterval(async () => {
      const health = await this.checkHealth();
      
      if (!health.healthy) {
        console.log(chalk.yellow(`Health check failed: ${health.reason}`));
        this.emit('unhealthy', health);
        
        // Attempt restart if unhealthy
        if (this.options.autoRestart && this.state.restartCount < this.options.maxRestarts) {
          console.log(chalk.yellow('Restarting unhealthy service...'));
          await this.restart();
        }
      }
    }, this.options.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Wait for service to be ready
   */
  async waitForService(timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const portOpen = await this.isPortOpen(this.state.port);
      
      if (portOpen) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return false;
  }

  /**
   * Check if port is available
   */
  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', () => {
        resolve(false);
      });
      
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      
      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * Check if port is open
   */
  async isPortOpen(port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      socket.setTimeout(1000);
      
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.once('error', () => {
        resolve(false);
      });
      
      socket.connect(port, '127.0.0.1');
    });
  }

  /**
   * Check if process is running
   */
  async isProcessRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check for existing service
   */
  async checkExistingService() {
    try {
      const pidContent = await fs.readFile(this.options.pidFile, 'utf8');
      const pid = parseInt(pidContent.trim());
      
      if (pid && await this.isProcessRunning(pid)) {
        this.state = {
          status: 'running',
          pid,
          port: this.config?.bridge?.port || 3456,
          startTime: new Date(),
          restartCount: 0,
          lastError: null
        };
        
        console.log(chalk.yellow(`Found existing service (PID: ${pid})`));
      } else {
        // Clean up stale PID file
        await this.removePidFile();
      }
    } catch {
      // No PID file or can't read it
    }
  }

  /**
   * Save PID file
   */
  async savePidFile() {
    await fs.writeFile(this.options.pidFile, String(this.state.pid), 'utf8');
  }

  /**
   * Remove PID file
   */
  async removePidFile() {
    try {
      await fs.unlink(this.options.pidFile);
    } catch {
      // File might not exist
    }
  }

  /**
   * Generate launchd plist for macOS
   */
  generateLaunchdPlist() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bumba.bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>${path.join(process.cwd(), 'src', 'bridge', 'index.js')}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${this.options.logFile}</string>
    <key>StandardErrorPath</key>
    <string>${this.options.logFile}</string>
</dict>
</plist>`;
  }

  /**
   * Generate systemd service for Linux
   */
  generateSystemdService() {
    return `[Unit]
Description=BUMBA Bridge Service
After=network.target

[Service]
Type=simple
User=${require('os').userInfo().username}
WorkingDirectory=${process.cwd()}
ExecStart=/usr/bin/node ${path.join(process.cwd(), 'src', 'bridge', 'index.js')}
Restart=on-failure
RestartSec=10
StandardOutput=append:${this.options.logFile}
StandardError=append:${this.options.logFile}

[Install]
WantedBy=multi-user.target`;
  }
}

module.exports = ServiceManager;