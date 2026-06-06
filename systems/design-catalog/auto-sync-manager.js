/**
 * Auto-Sync Manager
 * Sprint 39-41: Automatic synchronization with Figma on webhook events
 *
 * Manages automatic token extraction and catalog updates when Figma files change.
 * Includes debouncing, error handling, conflict resolution, and sync history tracking.
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const chalk = require('chalk');
const ConflictResolver = require('./conflict-resolver');
const SyncHistoryManager = require('./sync-history');

/**
 * Sync Status
 */
const SyncStatus = {
  IDLE: 'idle',
  PENDING: 'pending',
  SYNCING: 'syncing',
  SUCCESS: 'success',
  FAILED: 'failed',
  DEBOUNCING: 'debouncing'
};

/**
 * Sync Trigger Types
 */
const TriggerType = {
  WEBHOOK: 'webhook',
  MANUAL: 'manual',
  SCHEDULED: 'scheduled',
  RETRY: 'retry'
};

/**
 * Auto-Sync Manager
 * Handles automatic synchronization when Figma files change
 */
class AutoSyncManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.designBridge = options.designBridge;
    this.catalogOrchestrator = options.catalogOrchestrator;
    this.outputDir = options.outputDir || '.bumba-design';

    // Conflict resolution
    this.conflictResolver = new ConflictResolver({
      defaultStrategy: options.conflictStrategy || 'last_write_wins',
      autoResolve: options.autoResolveConflicts !== false
    });

    // Sync history tracking (Sprint 41)
    this.historyManager = new SyncHistoryManager({
      storageDir: path.join(this.outputDir, 'history'),
      retentionDays: options.historyRetentionDays || 30,
      autoSave: options.autoSaveHistory !== false,
      autoCleanup: options.autoCleanupHistory !== false
    });

    // Wire up conflict events
    this.conflictResolver.on('conflict:detected', (conflict) => {
      console.log(chalk.yellow(`  Conflict detected: ${conflict.type}`));
      this.emit('conflict:detected', conflict);
    });

    this.conflictResolver.on('conflict:resolved', (resolution) => {
      console.log(chalk.green(` Conflict auto-resolved: ${resolution.strategy}`));
      this.emit('conflict:resolved', resolution);
    });

    this.conflictResolver.on('conflict:requires_user', (resolution) => {
      console.log(chalk.red(` Conflict requires user input: ${resolution.conflictId}`));
      this.emit('conflict:requires_user', resolution);
    });

    // Debouncing configuration
    this.debounceDelay = options.debounceDelay || 5000; // 5 seconds
    this.debounceTimers = new Map();

    // Rate limiting
    this.maxSyncsPerMinute = options.maxSyncsPerMinute || 12;
    this.syncHistory = []; // Kept for backward compatibility
    this.syncHistoryRetention = 3600000; // 1 hour

    // Retry configuration
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 10000; // 10 seconds
    this.retryBackoffMultiplier = options.retryBackoffMultiplier || 2;

    // Current state
    this.currentSyncs = new Map();
    this.pendingSyncs = new Set();
    this.enabled = true;
    this.initialized = false;

    // Statistics
    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      debouncedEvents: 0,
      rateLimitedEvents: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      averageSyncDuration: 0
    };
  }

  /**
   * Initialize - load sync history
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      await this.historyManager.initialize();
      this.initialized = true;
      logger.info('Auto-sync manager initialized with persistent history');
    } catch (error) {
      logger.error('Failed to initialize sync history:', error);
      // Continue without history tracking
    }
  }

  /**
   * Enable auto-sync
   */
  enable() {
    this.enabled = true;
    console.log(chalk.green(' Auto-sync enabled'));
    this.emit('enabled');
  }

  /**
   * Disable auto-sync
   */
  disable() {
    this.enabled = false;

    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    console.log(chalk.yellow(' Auto-sync disabled'));
    this.emit('disabled');
  }

  /**
   * Trigger sync for a Figma file
   */
  async triggerSync(fileKey, options = {}) {
    if (!this.enabled) {
      logger.warn('Auto-sync is disabled, ignoring trigger');
      return { success: false, reason: 'disabled' };
    }

    const {
      trigger = TriggerType.WEBHOOK,
      eventType = 'FILE_UPDATE',
      force = false,
      metadata = {}
    } = options;

    // Check rate limiting (unless forced)
    if (!force && this.isRateLimited(fileKey)) {
      logger.warn(`Sync rate limited for file: ${fileKey}`);
      this.stats.rateLimitedEvents++;
      this.emit('sync:rate_limited', { fileKey, trigger });
      return { success: false, reason: 'rate_limited' };
    }

    // Check if sync already in progress
    if (this.currentSyncs.has(fileKey)) {
      logger.info(`Sync already in progress for file: ${fileKey}`);
      return { success: false, reason: 'already_syncing' };
    }

    // Apply debouncing (unless forced)
    if (!force && this.shouldDebounce(trigger)) {
      this.debounceSync(fileKey, trigger, eventType, metadata);
      return { success: true, reason: 'debounced' };
    }

    // Execute sync
    return await this.executeSync(fileKey, trigger, eventType, metadata);
  }

  /**
   * Check if sync should be rate limited
   */
  isRateLimited(fileKey) {
    const now = Date.now();
    const cutoff = now - 60000; // Last minute

    // Clean old history
    this.syncHistory = this.syncHistory.filter(s => s.timestamp > cutoff);

    // Count syncs for this file in last minute
    const recentSyncs = this.syncHistory.filter(
      s => s.fileKey === fileKey && s.timestamp > cutoff
    );

    return recentSyncs.length >= this.maxSyncsPerMinute;
  }

  /**
   * Check if trigger type should be debounced
   */
  shouldDebounce(trigger) {
    // Don't debounce manual or retry triggers
    return trigger !== TriggerType.MANUAL && trigger !== TriggerType.RETRY;
  }

  /**
   * Debounce sync - delay execution until changes stop
   */
  debounceSync(fileKey, trigger, eventType, metadata) {
    // Clear existing timer if any
    if (this.debounceTimers.has(fileKey)) {
      clearTimeout(this.debounceTimers.get(fileKey));
      this.stats.debouncedEvents++;
    }

    // Set new timer
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(fileKey);
      await this.executeSync(fileKey, trigger, eventType, metadata);
    }, this.debounceDelay);

    this.debounceTimers.set(fileKey, timer);

    // Mark as pending
    this.pendingSyncs.add(fileKey);

    logger.info(`Sync debounced for ${this.debounceDelay}ms: ${fileKey}`);
    this.emit('sync:debounced', { fileKey, delay: this.debounceDelay });
  }

  /**
   * Execute sync operation
   */
  async executeSync(fileKey, trigger, eventType, metadata, retryCount = 0) {
    const syncId = `sync_${Date.now()}_${fileKey}`;
    const startTime = Date.now();

    // Record sync event start in history
    let historyEvent = null;
    if (this.initialized && this.historyManager) {
      try {
        historyEvent = await this.historyManager.recordEvent({
          id: syncId,
          fileKey,
          trigger,
          eventType,
          status: 'started',
          retryCount,
          metadata
        });
      } catch (error) {
        logger.warn('Failed to record sync event in history:', error);
      }
    }

    // Mark as syncing
    this.currentSyncs.set(fileKey, {
      syncId,
      fileKey,
      trigger,
      eventType,
      startTime,
      status: SyncStatus.SYNCING,
      retryCount,
      historyEvent
    });

    this.pendingSyncs.delete(fileKey);
    this.emit('sync:started', { syncId, fileKey, trigger, eventType });

    console.log(chalk.blue(`\n Syncing file: ${fileKey}`));
    console.log(chalk.gray(`   Trigger: ${trigger}`));
    console.log(chalk.gray(`   Event: ${eventType}`));
    if (retryCount > 0) {
      console.log(chalk.yellow(`   Retry: ${retryCount}/${this.maxRetries}`));
    }

    try {
      // Extract tokens from Figma
      if (!this.designBridge) {
        throw new Error('Design Bridge not initialized');
      }

      const result = await this.designBridge.extractFromFigma(fileKey, {
        includeMetadata: true,
        includeComponents: true
      });

      // Prepare remote data
      const remoteData = result.tokens;

      // Check for conflicts with local data
      const catalogDataPath = path.join(this.outputDir, 'catalog-data.json');
      let finalData = remoteData;
      let conflictResolutions = [];

      try {
        // Read local catalog data if it exists
        const localDataStr = await fs.readFile(catalogDataPath, 'utf8');
        const localData = JSON.parse(localDataStr);

        // Detect conflicts
        const conflicts = await this.conflictResolver.detectConflicts(
          localData,
          remoteData,
          fileKey
        );

        if (conflicts.length > 0) {
          console.log(chalk.yellow(`     ${conflicts.length} conflict(s) detected`));
          this.stats.conflictsDetected += conflicts.length;

          // Resolve conflicts
          const resolution = await this.conflictResolver.resolveConflicts(
            localData,
            remoteData,
            conflicts,
            fileKey
          );

          finalData = resolution.data;
          conflictResolutions = resolution.conflicts;

          const resolvedCount = conflictResolutions.filter(r => r.status === 'resolved').length;
          console.log(chalk.green(`    ${resolvedCount} conflict(s) auto-resolved`));
          this.stats.conflictsResolved += resolvedCount;
        }

      } catch (error) {
        // Local data doesn't exist or is corrupted - use remote data as-is
        if (error.code !== 'ENOENT') {
          logger.warn('Error reading local catalog data:', error.message);
        }
      }

      // Save final resolved data to catalog
      await fs.mkdir(path.dirname(catalogDataPath), { recursive: true });
      await fs.writeFile(catalogDataPath, JSON.stringify(finalData, null, 2));

      // Also save to tokens directory for backward compatibility
      const tokenFile = path.join(this.outputDir, 'tokens', 'design-tokens.json');
      await fs.mkdir(path.dirname(tokenFile), { recursive: true });
      await fs.writeFile(tokenFile, JSON.stringify(finalData, null, 2));

      // Calculate duration
      const duration = Date.now() - startTime;

      // Update stats
      this.stats.totalSyncs++;
      this.stats.successfulSyncs++;
      this.updateAverageDuration(duration);

      // Update history event with completion
      if (historyEvent && this.historyManager) {
        try {
          historyEvent.complete(duration, result.changes || {});
          if (conflictResolutions.length > 0) {
            historyEvent.addConflictInfo(
              conflictResolutions.length,
              conflictResolutions.filter(r => r.status === 'resolved').length
            );
          }
          await this.historyManager.updateEvent(syncId, historyEvent.toJSON());
        } catch (error) {
          logger.warn('Failed to update sync event in history:', error);
        }
      }

      // Record in legacy in-memory history (backward compatibility)
      this.recordSync({
        syncId,
        fileKey,
        trigger,
        eventType,
        status: SyncStatus.SUCCESS,
        duration,
        timestamp: Date.now(),
        changes: result.changes || {},
        metadata
      });

      // Remove from current syncs
      this.currentSyncs.delete(fileKey);

      console.log(chalk.green(`    Sync completed (${duration}ms)`));
      if (result.changes) {
        console.log(chalk.gray(`   Changes: ${JSON.stringify(result.changes)}`));
      }

      this.emit('sync:completed', {
        syncId,
        fileKey,
        trigger,
        duration,
        changes: result.changes
      });

      return {
        success: true,
        syncId,
        duration,
        changes: result.changes
      };

    } catch (error) {
      logger.error(`Sync failed for ${fileKey}:`, error);

      const duration = Date.now() - startTime;

      // Check if should retry
      if (retryCount < this.maxRetries) {
        console.log(chalk.yellow(`     Sync failed, will retry...`));

        // Schedule retry with exponential backoff
        const retryDelay = this.retryDelay * Math.pow(this.retryBackoffMultiplier, retryCount);

        setTimeout(async () => {
          await this.executeSync(fileKey, TriggerType.RETRY, eventType, metadata, retryCount + 1);
        }, retryDelay);

        this.emit('sync:retry_scheduled', {
          syncId,
          fileKey,
          retryCount: retryCount + 1,
          retryDelay
        });

      } else {
        // Max retries reached
        console.log(chalk.red(`    Sync failed after ${retryCount} retries`));

        this.stats.totalSyncs++;
        this.stats.failedSyncs++;

        // Update history event with failure
        if (historyEvent && this.historyManager) {
          try {
            historyEvent.fail(error.message, duration);
            await this.historyManager.updateEvent(syncId, historyEvent.toJSON());
          } catch (updateError) {
            logger.warn('Failed to update sync event in history:', updateError);
          }
        }

        // Record failure in legacy in-memory history
        this.recordSync({
          syncId,
          fileKey,
          trigger,
          eventType,
          status: SyncStatus.FAILED,
          duration,
          timestamp: Date.now(),
          error: error.message,
          metadata
        });

        this.currentSyncs.delete(fileKey);

        this.emit('sync:failed', {
          syncId,
          fileKey,
          trigger,
          error: error.message,
          retries: retryCount
        });
      }

      return {
        success: false,
        syncId,
        error: error.message,
        retryCount
      };
    }
  }

  /**
   * Record sync in history
   */
  recordSync(syncData) {
    this.syncHistory.push(syncData);

    // Limit history size
    const maxHistory = 1000;
    if (this.syncHistory.length > maxHistory) {
      this.syncHistory = this.syncHistory.slice(-maxHistory);
    }

    // Clean old entries
    const cutoff = Date.now() - this.syncHistoryRetention;
    this.syncHistory = this.syncHistory.filter(s => s.timestamp > cutoff);
  }

  /**
   * Update average sync duration
   */
  updateAverageDuration(newDuration) {
    const { successfulSyncs, averageSyncDuration } = this.stats;

    if (successfulSyncs === 1) {
      this.stats.averageSyncDuration = newDuration;
    } else {
      this.stats.averageSyncDuration =
        ((averageSyncDuration * (successfulSyncs - 1)) + newDuration) / successfulSyncs;
    }
  }

  /**
   * Get sync status for a file
   */
  getSyncStatus(fileKey) {
    if (this.currentSyncs.has(fileKey)) {
      return this.currentSyncs.get(fileKey);
    }

    if (this.pendingSyncs.has(fileKey)) {
      return {
        fileKey,
        status: SyncStatus.DEBOUNCING,
        message: 'Sync pending (debounced)'
      };
    }

    return {
      fileKey,
      status: SyncStatus.IDLE,
      message: 'No active sync'
    };
  }

  /**
   * Get sync history for a file
   */
  getSyncHistory(fileKey, limit = 10) {
    return this.syncHistory
      .filter(s => s.fileKey === fileKey)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get all sync history
   */
  getAllSyncHistory(limit = 50) {
    return this.syncHistory
      .slice(-limit)
      .reverse();
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      enabled: this.enabled,
      currentSyncs: this.currentSyncs.size,
      pendingSyncs: this.pendingSyncs.size,
      historySize: this.syncHistory.length,
      successRate: this.stats.totalSyncs > 0
        ? ((this.stats.successfulSyncs / this.stats.totalSyncs) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Clear sync history
   */
  clearHistory() {
    this.syncHistory = [];
    console.log(chalk.gray('Sync history cleared'));
    this.emit('history:cleared');
  }

  /**
   * Cancel pending sync
   */
  cancelSync(fileKey) {
    if (this.debounceTimers.has(fileKey)) {
      clearTimeout(this.debounceTimers.get(fileKey));
      this.debounceTimers.delete(fileKey);
      this.pendingSyncs.delete(fileKey);

      console.log(chalk.yellow(`⏹  Cancelled pending sync for: ${fileKey}`));
      this.emit('sync:cancelled', { fileKey });

      return true;
    }

    return false;
  }

  /**
   * Cancel all pending syncs
   */
  cancelAllSyncs() {
    const count = this.debounceTimers.size;

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }

    this.debounceTimers.clear();
    this.pendingSyncs.clear();

    console.log(chalk.yellow(`⏹  Cancelled ${count} pending sync(s)`));
    this.emit('syncs:cancelled_all', { count });

    return count;
  }

  /**
   * Shutdown - clean up resources
   */
  async shutdown() {
    this.disable();
    this.cancelAllSyncs();

    // Wait for active syncs to complete (max 30 seconds)
    const timeout = 30000;
    const start = Date.now();

    while (this.currentSyncs.size > 0 && Date.now() - start < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Shutdown history manager
    if (this.historyManager) {
      await this.historyManager.shutdown();
    }

    console.log(chalk.gray('Auto-sync manager shutdown complete'));
    this.emit('shutdown');
  }
}

module.exports = AutoSyncManager;
module.exports.SyncStatus = SyncStatus;
module.exports.TriggerType = TriggerType;
