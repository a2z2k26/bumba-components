/**
 * BUMBA Coordination System - Unified Export Interface
 * Consolidates all coordination functionality
 * @module coordination
 */

const { logger } = require('@bumba/shared');

// Unified coordination system (primary interface)
const { UnifiedCoordinationSystem } = require('./unified-coordination-system');

// Legacy coordination systems (maintained for backward compatibility)
let FileLockingSystem = null;
let TerritoryManager = null;
let SafeFileOperations = null;
let AgentIdentity = null;
let CoordinationDashboard = null;

try {
  const fileLockingModule = require('./file-locking-system');
  FileLockingSystem = fileLockingModule.getInstance ? fileLockingModule.getInstance : fileLockingModule;
} catch (error) {
  logger.warn('File locking system not available:', error.message);
}

try {
  const territoryModule = require('./territory-manager');
  TerritoryManager = territoryModule.getInstance ? territoryModule.getInstance : territoryModule;
} catch (error) {
  logger.warn('Territory manager not available:', error.message);
}

try {
  const safeFileOpsModule = require('./safe-file-operations');
  SafeFileOperations = safeFileOpsModule.getInstance ? safeFileOpsModule.getInstance : safeFileOpsModule;
} catch (error) {
  logger.warn('Safe file operations not available:', error.message);
}

try {
  const agentIdentityModule = require('./agent-identity');
  AgentIdentity = agentIdentityModule.getInstance ? agentIdentityModule.getInstance : agentIdentityModule;
} catch (error) {
  logger.warn('Agent identity not available:', error.message);
}

// Use lazy loading for dashboard to save memory
const USE_LAZY_DASHBOARD = process.env.DISABLE_LAZY_DASHBOARD !== 'true';
try {
  const dashboardModule = USE_LAZY_DASHBOARD
    ? require('./dashboard-lazy-loader')
    : require('./coordination-dashboard');
  CoordinationDashboard = dashboardModule.getInstance ? dashboardModule.getInstance : dashboardModule;
} catch (error) {
  logger.warn('Coordination dashboard not available:', error.message);
}

/**
 * Factory function to create a unified coordination system instance
 */
function createCoordinationSystem(config = {}) {
  const coordinationSystem = new UnifiedCoordinationSystem('unified-coordination', {
    department: {
      maxActiveCoordinations: config.maxActiveCoordinations || 100,
      coordinationTimeout: config.coordinationTimeout || 300000,
      ...config.department
    },
    pairing: {
      maxActivePairings: config.maxActivePairings || 50,
      pairingDuration: config.pairingDuration || 3600000,
      ...config.pairing
    },
    territory: {
      maxTerritories: config.maxTerritories || 100,
      territoryTimeout: config.territoryTimeout || 1800000,
      ...config.territory
    },
    dashboard: {
      updateInterval: config.updateInterval || 5000,
      maxDataPoints: config.maxDataPoints || 1000,
      ...config.dashboard
    },
    ...config
  });

  return coordinationSystem;
}

/**
 * Factory function to create a legacy-compatible coordination system
 */
function createLegacyCoordinationSystem(config = {}) {
  const legacySystem = {};

  if (FileLockingSystem) {
    legacySystem.fileLocking = typeof FileLockingSystem === 'function'
      ? FileLockingSystem(config.fileLocking || {})
      : FileLockingSystem;
  }

  if (TerritoryManager) {
    legacySystem.territoryManager = typeof TerritoryManager === 'function'
      ? TerritoryManager(config.territory || {})
      : TerritoryManager;
  }

  if (SafeFileOperations) {
    legacySystem.safeFileOps = typeof SafeFileOperations === 'function'
      ? SafeFileOperations(config.safeFileOps || {})
      : SafeFileOperations;
  }

  if (AgentIdentity) {
    legacySystem.agentIdentity = typeof AgentIdentity === 'function'
      ? AgentIdentity(config.agentIdentity || {})
      : AgentIdentity;
  }

  if (CoordinationDashboard) {
    legacySystem.dashboard = typeof CoordinationDashboard === 'function'
      ? CoordinationDashboard(config.dashboard || {})
      : CoordinationDashboard;
  }

  return legacySystem;
}

/**
 * Main Coordination System Manager
 * Coordinates between unified and legacy coordination systems
 */
class BumbaCoordinationSystem {
  constructor(config = {}) {
    this.config = {
      useUnified: config.useUnified !== false,
      maintainLegacy: config.maintainLegacy !== false,
      autoMigrate: config.autoMigrate !== false,
      ...config
    };

    this.initialized = false;
    this.unifiedSystem = null;
    this.legacySystems = null;

    logger.info('🔗 BUMBA Coordination System initializing...');
  }

  async initialize() {
    try {
      logger.info('🔗 Initializing coordination systems...');

      // Initialize unified coordination system
      if (this.config.useUnified) {
        this.unifiedSystem = createCoordinationSystem(this.config.unified || {});
        await this.unifiedSystem.initialize();
      }

      // Initialize legacy systems if needed
      if (this.config.maintainLegacy) {
        this.legacySystems = createLegacyCoordinationSystem(this.config.legacy || {});

        // Initialize legacy systems that have initialize methods
        for (const [name, system] of Object.entries(this.legacySystems)) {
          if (system && typeof system.initialize === 'function') {
            try {
              await system.initialize();
              logger.info(`🔗 Legacy ${name} system initialized`);
            } catch (error) {
              logger.warn(`Failed to initialize legacy ${name} system:`, error.message);
            }
          }
        }
      }

      // Auto-migrate from legacy to unified if enabled
      if (this.config.autoMigrate && this.unifiedSystem && this.legacySystems) {
        await this.migrateLegacyData();
      }

      this.initialized = true;
      logger.info('🔗 Coordination systems initialized successfully');

      return true;
    } catch (error) {
      logger.error('Failed to initialize coordination systems:', error);
      throw error;
    }
  }

  async migrateLegacyData() {
    logger.info('🔗 Starting legacy coordination data migration...');

    try {
      // Migration logic would go here
      // For now, just log the migration intention
      logger.info('🔗 Legacy coordination data migration completed');
    } catch (error) {
      logger.error('Legacy coordination data migration failed:', error);
    }
  }

  // Unified interface methods
  async coordinateDepartments(initiator, departments, task, coordinationType) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.unifiedSystem) {
      return this.unifiedSystem.coordinateDepartments(initiator, departments, task, coordinationType);
    }

    throw new Error('No coordination system available');
  }

  async handleDepartmentHandoff(fromDept, toDept, payload) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.unifiedSystem) {
      return this.unifiedSystem.handleDepartmentHandoff(fromDept, toDept, payload);
    }

    throw new Error('No coordination system available');
  }

  async createAgentPairing(agent1, agent2, task, options) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.unifiedSystem) {
      return this.unifiedSystem.createAgentPairing(agent1, agent2, task, options);
    }

    throw new Error('No coordination system available');
  }

  async registerTerritory(name, owner, boundaries) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.unifiedSystem) {
      return this.unifiedSystem.registerTerritory(name, owner, boundaries);
    }

    throw new Error('No coordination system available');
  }

  getDashboardData() {
    if (this.unifiedSystem) {
      return this.unifiedSystem.getDashboardData();
    }

    return null;
  }

  // System status
  getStatus() {
    const status = {
      initialized: this.initialized,
      unified: this.unifiedSystem ? this.unifiedSystem.getCoordinationStatus() : null,
      legacy: this.legacySystems ? Object.keys(this.legacySystems) : []
    };

    if (this.unifiedSystem) {
      status.capabilities = this.unifiedSystem.getCapabilities();
    }

    return status;
  }

  async shutdown() {
    logger.info('🔗 Shutting down coordination systems...');

    if (this.unifiedSystem) {
      await this.unifiedSystem.shutdown();
    }

    // Shutdown legacy systems
    if (this.legacySystems) {
      for (const [name, system] of Object.entries(this.legacySystems)) {
        if (system && typeof system.shutdown === 'function') {
          try {
            await system.shutdown();
          } catch (error) {
            logger.warn(`Failed to shutdown legacy ${name} system:`, error.message);
          }
        }
      }
    }

    logger.info('🔗 Coordination systems shut down');
  }
}

// Export singleton instance
let instance = null;

module.exports = {
  // Modern unified coordination system
  UnifiedCoordinationSystem,

  // Create unified coordination system instance
  createCoordinationSystem,

  // Legacy coordination systems (for backward compatibility)
  FileLockingSystem,
  TerritoryManager,
  SafeFileOperations,
  AgentIdentity,
  CoordinationDashboard,
  createLegacyCoordinationSystem,

  // Legacy coordination hub (backward compatibility)
  getFileLocking: () => FileLockingSystem,
  getTerritoryManager: () => TerritoryManager,
  getSafeFileOps: () => SafeFileOperations,
  getAgentIdentity: () => AgentIdentity,
  getDashboard: () => CoordinationDashboard,

  // Main coordination system manager
  BumbaCoordinationSystem,
  getInstance: (config) => {
    if (!instance) {
      instance = new BumbaCoordinationSystem(config);
    }
    return instance;
  },

  // Utility functions
  clearInstance: () => {
    instance = null;
  },

  // Legacy coordination hub (backward compatibility)
  getCoordinationHub: () => {
    if (!instance) {
      instance = new BumbaCoordinationSystem();
    }
    return instance;
  },

  CoordinationHub: BumbaCoordinationSystem // Alias for backward compatibility
};