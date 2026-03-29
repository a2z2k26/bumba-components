/**
 * MCP Session State Manager
 * Persists and restores MCP server state across sessions
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

class MCPSessionState extends EventEmitter {
  constructor() {
    super();

    // State file location
    this.stateDir = path.join(os.homedir(), '.bumba', 'mcp');
    this.stateFile = path.join(this.stateDir, 'session-state.json');
    this.historyFile = path.join(this.stateDir, 'session-history.json');

    // Current session state
    this.currentSession = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      servers: new Map(),
      preferences: {},
      lastActivity: Date.now()
    };

    // Session history
    this.history = [];
    this.maxHistorySize = 50;
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `mcp_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize state manager
   */
  async initialize() {
    try {
      // Ensure state directory exists
      await fs.mkdir(this.stateDir, { recursive: true });

      // Load previous state if exists
      await this.loadState();

      // Load history
      await this.loadHistory();

      console.log('✓ MCP session state initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize session state:', error);
      return false;
    }
  }

  /**
   * Save current state
   */
  async saveState() {
    try {
      const stateData = {
        sessionId: this.currentSession.id,
        startTime: this.currentSession.startTime,
        lastActivity: Date.now(),
        servers: Array.from(this.currentSession.servers.entries()).map(([name, config]) => ({
          name,
          ...config
        })),
        preferences: this.currentSession.preferences,
        timestamp: Date.now()
      };

      await fs.writeFile(
        this.stateFile,
        JSON.stringify(stateData, null, 2),
        'utf8'
      );

      this.emit('state:saved', stateData);
      return true;
    } catch (error) {
      console.error('Failed to save session state:', error);
      return false;
    }
  }

  /**
   * Load previous state
   */
  async loadState() {
    try {
      const data = await fs.readFile(this.stateFile, 'utf8');
      const stateData = JSON.parse(data);

      // Check if state is recent (within 24 hours)
      const isRecent = (Date.now() - stateData.timestamp) < 24 * 60 * 60 * 1000;

      if (isRecent && stateData.servers) {
        // Restore server states
        stateData.servers.forEach(server => {
          this.currentSession.servers.set(server.name, {
            enabled: server.enabled,
            autoStart: server.autoStart,
            lastUsed: server.lastUsed,
            config: server.config
          });
        });

        // Restore preferences
        this.currentSession.preferences = stateData.preferences || {};

        console.log(`✓ Restored ${stateData.servers.length} server states from previous session`);
        this.emit('state:loaded', stateData);
      }

      return stateData;
    } catch (error) {
      // No previous state or error reading
      return null;
    }
  }

  /**
   * Update server state
   */
  updateServerState(serverName, state) {
    const currentState = this.currentSession.servers.get(serverName) || {};

    this.currentSession.servers.set(serverName, {
      ...currentState,
      ...state,
      lastModified: Date.now()
    });

    this.currentSession.lastActivity = Date.now();

    // Auto-save state
    this.saveState().catch(console.error);

    this.emit('server:state:updated', { serverName, state });
  }

  /**
   * Get server state
   */
  getServerState(serverName) {
    return this.currentSession.servers.get(serverName);
  }

  /**
   * Mark server as started
   */
  markServerStarted(serverName, config = {}) {
    this.updateServerState(serverName, {
      enabled: true,
      running: true,
      startedAt: Date.now(),
      config
    });
  }

  /**
   * Mark server as stopped
   */
  markServerStopped(serverName) {
    const state = this.getServerState(serverName) || {};

    this.updateServerState(serverName, {
      running: false,
      stoppedAt: Date.now(),
      uptime: state.startedAt ? Date.now() - state.startedAt : 0
    });
  }

  /**
   * Update user preference
   */
  updatePreference(key, value) {
    this.currentSession.preferences[key] = value;
    this.currentSession.lastActivity = Date.now();

    this.saveState().catch(console.error);
    this.emit('preference:updated', { key, value });
  }

  /**
   * Get user preference
   */
  getPreference(key, defaultValue = null) {
    return this.currentSession.preferences[key] || defaultValue;
  }

  /**
   * Get servers that should auto-start
   */
  getAutoStartServers() {
    const autoStart = [];

    for (const [name, state] of this.currentSession.servers) {
      if (state.autoStart || (state.enabled && state.running)) {
        autoStart.push(name);
      }
    }

    return autoStart;
  }

  /**
   * Save session to history
   */
  async saveToHistory() {
    try {
      const sessionSummary = {
        id: this.currentSession.id,
        startTime: this.currentSession.startTime,
        endTime: Date.now(),
        duration: Date.now() - this.currentSession.startTime,
        serversUsed: Array.from(this.currentSession.servers.keys()),
        serverCount: this.currentSession.servers.size,
        preferences: this.currentSession.preferences
      };

      // Add to history
      this.history.unshift(sessionSummary);

      // Trim history to max size
      if (this.history.length > this.maxHistorySize) {
        this.history = this.history.slice(0, this.maxHistorySize);
      }

      // Save history file
      await fs.writeFile(
        this.historyFile,
        JSON.stringify(this.history, null, 2),
        'utf8'
      );

      return sessionSummary;
    } catch (error) {
      console.error('Failed to save session history:', error);
      return null;
    }
  }

  /**
   * Load session history
   */
  async loadHistory() {
    try {
      const data = await fs.readFile(this.historyFile, 'utf8');
      this.history = JSON.parse(data);
      return this.history;
    } catch (error) {
      // No history or error reading
      this.history = [];
      return [];
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    const stats = {
      currentSession: {
        id: this.currentSession.id,
        uptime: Date.now() - this.currentSession.startTime,
        activeServers: 0,
        totalServers: this.currentSession.servers.size
      },
      history: {
        totalSessions: this.history.length,
        averageDuration: 0,
        mostUsedServers: {}
      }
    };

    // Count active servers
    for (const [name, state] of this.currentSession.servers) {
      if (state.running) {
        stats.currentSession.activeServers++;
      }
    }

    // Calculate history stats
    if (this.history.length > 0) {
      let totalDuration = 0;
      const serverUsage = {};

      this.history.forEach(session => {
        totalDuration += session.duration || 0;

        (session.serversUsed || []).forEach(server => {
          serverUsage[server] = (serverUsage[server] || 0) + 1;
        });
      });

      stats.history.averageDuration = Math.round(totalDuration / this.history.length);

      // Get top 5 most used servers
      stats.history.mostUsedServers = Object.entries(serverUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .reduce((acc, [server, count]) => {
          acc[server] = count;
          return acc;
        }, {});
    }

    return stats;
  }

  /**
   * Clear session state
   */
  async clearState() {
    // Save current session to history first
    await this.saveToHistory();

    // Reset current session
    this.currentSession = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      servers: new Map(),
      preferences: {},
      lastActivity: Date.now()
    };

    // Clear state file
    await this.saveState();

    this.emit('state:cleared');
  }

  /**
   * Export session data
   */
  async exportSession(outputPath) {
    try {
      const exportData = {
        currentSession: {
          id: this.currentSession.id,
          startTime: this.currentSession.startTime,
          servers: Array.from(this.currentSession.servers.entries()),
          preferences: this.currentSession.preferences
        },
        history: this.history,
        exported: new Date().toISOString()
      };

      await fs.writeFile(
        outputPath,
        JSON.stringify(exportData, null, 2),
        'utf8'
      );

      return true;
    } catch (error) {
      console.error('Failed to export session:', error);
      return false;
    }
  }

  /**
   * Import session data
   */
  async importSession(inputPath) {
    try {
      const data = await fs.readFile(inputPath, 'utf8');
      const importData = JSON.parse(data);

      if (importData.currentSession) {
        // Restore current session
        this.currentSession.servers = new Map(importData.currentSession.servers);
        this.currentSession.preferences = importData.currentSession.preferences;
      }

      if (importData.history) {
        this.history = importData.history;
        await this.saveToHistory();
      }

      await this.saveState();

      this.emit('session:imported', importData);
      return true;
    } catch (error) {
      console.error('Failed to import session:', error);
      return false;
    }
  }
}

// Export singleton
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new MCPSessionState();
  }
  return instance;
}

module.exports = {
  MCPSessionState,
  getInstance
};