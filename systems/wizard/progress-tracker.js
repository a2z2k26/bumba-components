/**
 * Progress Tracker for BUMBA Setup Wizard
 * Tracks setup progress and allows resuming from interruption
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class ProgressTracker extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      saveInterval: options.saveInterval || 5000, // Auto-save every 5 seconds
      progressFile: options.progressFile || path.join(process.cwd(), '.bumba', 'setup-progress.json'),
      enableAutoSave: options.enableAutoSave !== false,
      ...options
    };
    
    // Progress state
    this.state = {
      startTime: null,
      endTime: null,
      currentPhase: null,
      currentStep: 0,
      totalSteps: 0,
      completedSteps: [],
      skippedSteps: [],
      failedSteps: [],
      configuration: {},
      checkpoints: [],
      metadata: {
        version: '1.0.0',
        sessionId: this.generateSessionId(),
        platform: process.platform,
        nodeVersion: process.version
      }
    };
    
    // Auto-save timer
    this.autoSaveTimer = null;
    
    // Step definitions
    this.steps = [];
    
    // Metrics
    this.metrics = {
      stepDurations: {},
      retryCount: {},
      errorCount: 0
    };
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Initialize progress tracker
   */
  async initialize(steps = []) {
    this.steps = steps;
    this.state.totalSteps = steps.length;
    this.state.startTime = Date.now();
    
    // Try to load existing progress
    const resumed = await this.loadProgress();
    
    if (resumed) {
      this.emit('resumed', this.state);
    } else {
      this.emit('started', this.state);
    }
    
    // Start auto-save if enabled
    if (this.options.enableAutoSave) {
      this.startAutoSave();
    }
    
    return resumed;
  }

  /**
   * Load existing progress
   */
  async loadProgress() {
    try {
      const content = await fs.readFile(this.options.progressFile, 'utf8');
      const savedState = JSON.parse(content);
      
      // Check if progress is recent (within 24 hours)
      const age = Date.now() - savedState.metadata.lastSaved;
      if (age > 24 * 60 * 60 * 1000) {
        return false; // Too old
      }
      
      // Restore state
      this.state = {
        ...savedState,
        metadata: {
          ...savedState.metadata,
          resumed: true,
          resumedAt: Date.now(),
          originalSessionId: savedState.metadata.sessionId,
          sessionId: this.generateSessionId()
        }
      };
      
      return true;
    } catch (error) {
      // No existing progress or invalid
      return false;
    }
  }

  /**
   * Save current progress
   */
  async saveProgress() {
    try {
      const dir = path.dirname(this.options.progressFile);
      await fs.mkdir(dir, { recursive: true });
      
      const stateToSave = {
        ...this.state,
        metadata: {
          ...this.state.metadata,
          lastSaved: Date.now()
        }
      };
      
      await fs.writeFile(
        this.options.progressFile,
        JSON.stringify(stateToSave, null, 2),
        'utf8'
      );
      
      this.emit('saved', stateToSave);
      return true;
    } catch (error) {
      this.emit('save-error', error);
      return false;
    }
  }

  /**
   * Start auto-save
   */
  startAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setInterval(() => {
      this.saveProgress();
    }, this.options.saveInterval);
  }

  /**
   * Stop auto-save
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Start a phase
   */
  startPhase(phaseName) {
    this.state.currentPhase = phaseName;
    this.emit('phase:start', phaseName);
  }

  /**
   * Start a step
   */
  startStep(stepId, stepName) {
    const stepIndex = this.steps.findIndex(s => s.id === stepId);
    
    if (stepIndex !== -1) {
      this.state.currentStep = stepIndex;
    }
    
    this.metrics.stepDurations[stepId] = {
      start: Date.now(),
      name: stepName
    };
    
    this.emit('step:start', {
      id: stepId,
      name: stepName,
      index: stepIndex,
      progress: this.getProgress()
    });
  }

  /**
   * Complete a step
   */
  completeStep(stepId, data = {}) {
    if (!this.state.completedSteps.includes(stepId)) {
      this.state.completedSteps.push(stepId);
    }
    
    // Record duration
    if (this.metrics.stepDurations[stepId]) {
      this.metrics.stepDurations[stepId].end = Date.now();
      this.metrics.stepDurations[stepId].duration = 
        this.metrics.stepDurations[stepId].end - 
        this.metrics.stepDurations[stepId].start;
    }
    
    // Store step data
    if (data && Object.keys(data).length > 0) {
      this.state.configuration[stepId] = data;
    }
    
    this.emit('step:complete', {
      id: stepId,
      data,
      progress: this.getProgress()
    });
    
    // Auto-save on step completion
    if (this.options.enableAutoSave) {
      this.saveProgress();
    }
  }

  /**
   * Skip a step
   */
  skipStep(stepId, reason) {
    if (!this.state.skippedSteps.includes(stepId)) {
      this.state.skippedSteps.push(stepId);
    }
    
    this.emit('step:skip', {
      id: stepId,
      reason,
      progress: this.getProgress()
    });
  }

  /**
   * Fail a step
   */
  failStep(stepId, error) {
    if (!this.state.failedSteps.includes(stepId)) {
      this.state.failedSteps.push(stepId);
    }
    
    // Track retry count
    if (!this.metrics.retryCount[stepId]) {
      this.metrics.retryCount[stepId] = 0;
    }
    this.metrics.retryCount[stepId]++;
    
    // Track errors
    this.metrics.errorCount++;
    
    this.emit('step:fail', {
      id: stepId,
      error: error.message,
      retries: this.metrics.retryCount[stepId],
      progress: this.getProgress()
    });
  }

  /**
   * Create checkpoint
   */
  createCheckpoint(name, data = {}) {
    const checkpoint = {
      id: `checkpoint-${Date.now()}`,
      name,
      timestamp: Date.now(),
      state: JSON.parse(JSON.stringify(this.state)),
      data
    };
    
    this.state.checkpoints.push(checkpoint);
    
    this.emit('checkpoint:created', checkpoint);
    
    return checkpoint.id;
  }

  /**
   * Restore from checkpoint
   */
  restoreCheckpoint(checkpointId) {
    const checkpoint = this.state.checkpoints.find(c => c.id === checkpointId);
    
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }
    
    this.state = {
      ...checkpoint.state,
      metadata: {
        ...checkpoint.state.metadata,
        restoredFrom: checkpointId,
        restoredAt: Date.now()
      }
    };
    
    this.emit('checkpoint:restored', checkpoint);
    
    return true;
  }

  /**
   * Get current progress
   */
  getProgress() {
    const completed = this.state.completedSteps.length;
    const skipped = this.state.skippedSteps.length;
    const failed = this.state.failedSteps.length;
    const total = this.state.totalSteps;
    
    const percentage = total > 0 ? Math.round(((completed + skipped) / total) * 100) : 0;
    
    return {
      percentage,
      completed,
      skipped,
      failed,
      remaining: total - completed - skipped - failed,
      total,
      currentStep: this.state.currentStep,
      currentPhase: this.state.currentPhase
    };
  }

  /**
   * Get remaining steps
   */
  getRemainingSteps() {
    const processed = new Set([
      ...this.state.completedSteps,
      ...this.state.skippedSteps,
      ...this.state.failedSteps
    ]);
    
    return this.steps.filter(step => !processed.has(step.id));
  }

  /**
   * Get step status
   */
  getStepStatus(stepId) {
    if (this.state.completedSteps.includes(stepId)) {
      return 'completed';
    }
    if (this.state.skippedSteps.includes(stepId)) {
      return 'skipped';
    }
    if (this.state.failedSteps.includes(stepId)) {
      return 'failed';
    }
    return 'pending';
  }

  /**
   * Get time elapsed
   */
  getElapsedTime() {
    if (!this.state.startTime) return 0;
    
    const end = this.state.endTime || Date.now();
    return end - this.state.startTime;
  }

  /**
   * Get estimated time remaining
   */
  getEstimatedTimeRemaining() {
    const progress = this.getProgress();
    
    if (progress.completed === 0) {
      return null; // Can't estimate yet
    }
    
    const elapsed = this.getElapsedTime();
    const averagePerStep = elapsed / progress.completed;
    const remaining = progress.remaining;
    
    return Math.round(averagePerStep * remaining);
  }

  /**
   * Format duration
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Get summary
   */
  getSummary() {
    const progress = this.getProgress();
    const elapsed = this.getElapsedTime();
    const estimated = this.getEstimatedTimeRemaining();
    
    return {
      sessionId: this.state.metadata.sessionId,
      resumed: this.state.metadata.resumed || false,
      progress,
      elapsed: this.formatDuration(elapsed),
      estimated: estimated ? this.formatDuration(estimated) : 'Unknown',
      metrics: {
        errorCount: this.metrics.errorCount,
        totalRetries: Object.values(this.metrics.retryCount).reduce((a, b) => a + b, 0),
        averageStepDuration: this.getAverageStepDuration()
      },
      checkpoints: this.state.checkpoints.length,
      configuration: Object.keys(this.state.configuration).length
    };
  }

  /**
   * Get average step duration
   */
  getAverageStepDuration() {
    const durations = Object.values(this.metrics.stepDurations)
      .filter(d => d.duration)
      .map(d => d.duration);
    
    if (durations.length === 0) return 0;
    
    const total = durations.reduce((a, b) => a + b, 0);
    return Math.round(total / durations.length);
  }

  /**
   * Complete setup
   */
  complete() {
    this.state.endTime = Date.now();
    this.stopAutoSave();
    
    const summary = this.getSummary();
    
    this.emit('complete', summary);
    
    // Final save
    this.saveProgress();
    
    return summary;
  }

  /**
   * Reset progress
   */
  async reset() {
    this.state = {
      startTime: Date.now(),
      endTime: null,
      currentPhase: null,
      currentStep: 0,
      totalSteps: this.steps.length,
      completedSteps: [],
      skippedSteps: [],
      failedSteps: [],
      configuration: {},
      checkpoints: [],
      metadata: {
        version: '1.0.0',
        sessionId: this.generateSessionId(),
        platform: process.platform,
        nodeVersion: process.version
      }
    };
    
    this.metrics = {
      stepDurations: {},
      retryCount: {},
      errorCount: 0
    };
    
    // Delete saved progress
    try {
      await fs.unlink(this.options.progressFile);
    } catch {
      // File might not exist
    }
    
    this.emit('reset');
  }

  /**
   * Export progress data
   */
  exportData() {
    return {
      state: this.state,
      metrics: this.metrics,
      summary: this.getSummary()
    };
  }
}

module.exports = ProgressTracker;