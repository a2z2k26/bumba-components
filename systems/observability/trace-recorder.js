/**
 * BUMBA Trace Recorder
 * Records orchestration decisions for debugging and replay
 *
 * Part of BUMBA Observability Enhancement - Phase 2: Replay Mode
 * Sprint P2-S1: Base Structure
 * Updated in Phase 5 for configuration integration
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { promisify } = require('util');
const EventEmitter = require('events');
const ObservabilityConfig = require('./observability-config');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class TraceRecorder extends EventEmitter {
  constructor(config = {}) {
    super(); // Sprint 1-A-10: Call EventEmitter constructor

    // Initialize observability config
    this.obsConfig = new ObservabilityConfig();

    // Storage location: Will be loaded from config
    this.tracesDir = path.join(os.homedir(), '.bumba', 'traces');

    // In-memory cache of loaded traces (for getTrace)
    this.traces = new Map();

    // Current active trace
    this.currentTrace = null;

    // Sprint 7: Async write queue for performance
    this.writeQueue = [];
    this.isProcessingQueue = false;
    this.writeQueueInterval = null;

    // Sprint 7: Last storage check time (cache for 60 seconds)
    this.lastStorageCheck = 0;
    this.lastStorageSize = 0;
    this.STORAGE_CHECK_CACHE_MS = 60000; // 60 seconds

    // Legacy configuration support (Sprint 1-A-09)
    // Will be overridden by observability config if available
    this.config = {
      traceRetentionDays: config.traceRetentionDays || 30,
      minTracesToKeep: config.minTracesToKeep || 100,
      compressionLevel: config.compressionLevel || 6, // Sprint 7: Balanced speed/size
      asyncWrites: config.asyncWrites !== false, // Sprint 7: Enable by default
      ...config
    };

    // Initialize with configuration
    this.initialize();
  }

  /**
   * Initialize with observability configuration
   * Phase 5: Configuration Integration
   */
  async initialize() {
    try {
      const traceConfig = await this.obsConfig.getMode('trace');

      // Update traces directory from config
      if (traceConfig.storage && traceConfig.storage.directory) {
        this.tracesDir = traceConfig.storage.directory;
      }

      // Update retention settings from config
      if (traceConfig.retention) {
        this.config.traceRetentionDays = traceConfig.retention.maxDays;
        this.config.minTracesToKeep = traceConfig.retention.maxFiles;
        this.config.autoCleanup = traceConfig.retention.autoCleanup;
      }

      // Ensure traces directory exists
      await this.ensureTracesDir();

      // Run cleanup on initialization if enabled
      if (this.config.autoCleanup) {
        this.cleanupOldTraces().catch(err => {
          console.warn('Failed to cleanup old traces:', err.message);
        });
      }
    } catch (error) {
      // Fallback to default config if observability config fails
      console.warn('Failed to load observability config, using defaults:', error.message);

      // Ensure traces directory exists
      await this.ensureTracesDir();

      // Run cleanup on initialization
      this.cleanupOldTraces().catch(err => {
        console.warn('Failed to cleanup old traces:', err.message);
      });
    }
  }

  /**
   * Ensure traces directory exists
   */
  async ensureTracesDir() {
    try {
      await fs.mkdir(this.tracesDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create traces directory: ${error.message}`);
    }
  }

  /**
   * Sprint 7: Process write queue asynchronously
   * Batches multiple writes for better performance
   */
  async processWriteQueue() {
    if (this.isProcessingQueue || this.writeQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Process all queued writes
      while (this.writeQueue.length > 0) {
        const writeTask = this.writeQueue.shift();

        try {
          await writeTask.execute();
          if (writeTask.resolve) {
            writeTask.resolve(writeTask.filepath);
          }
        } catch (error) {
          console.warn('Failed to write trace:', error.message);
          if (writeTask.reject) {
            writeTask.reject(error);
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Sprint 7: Queue a trace write for async processing
   */
  queueTraceWrite(trace, compressed = true) {
    return new Promise((resolve, reject) => {
      const baseFilename = `trace-${trace.queryId || trace.id}-${Date.now()}`;
      const filepath = compressed
        ? path.join(this.tracesDir, `${baseFilename}.json.gz`)
        : path.join(this.tracesDir, `${baseFilename}.json`);

      const writeTask = {
        filepath,
        execute: async () => {
          if (compressed) {
            const compressedData = await this.compressTrace(trace);
            await fs.writeFile(filepath, compressedData);
          } else {
            await fs.writeFile(filepath, JSON.stringify(trace, null, 2), 'utf-8');
          }
        },
        resolve,
        reject
      };

      this.writeQueue.push(writeTask);

      // Process queue in next tick (non-blocking)
      setImmediate(() => this.processWriteQueue());
    });
  }

  /**
   * Sprint 7: Get cached storage size or calculate if expired
   */
  async getCachedStorageSize() {
    const now = Date.now();

    // Return cached value if still valid
    if (now - this.lastStorageCheck < this.STORAGE_CHECK_CACHE_MS) {
      return this.lastStorageSize;
    }

    // Recalculate and cache
    this.lastStorageSize = await this.calculateTotalStorageSize();
    this.lastStorageCheck = now;

    return this.lastStorageSize;
  }

  /**
   * Start recording a new trace
   * P2-S2: Implemented
   * Sprint 1-A-10: Added event emission
   * Phase 8-S131: Updated API to match documentation
   */
  startRecording(query, mode = 'orchestration') {
    const traceId = this.generateTraceId();

    this.currentTrace = {
      id: traceId,
      queryId: traceId, // Legacy compatibility
      query,
      userInput: query, // Legacy compatibility
      mode,
      startTime: Date.now(),
      steps: [],
      metadata: {
        timestamp: new Date().toISOString(),
        platform: process.platform,
        nodeVersion: process.version
      }
    };

    // Emit trace:started event (Sprint 1-A-10)
    this.emit('trace:started', {
      id: this.currentTrace.id,
      query: this.currentTrace.query,
      mode: this.currentTrace.mode,
      timestamp: this.currentTrace.metadata.timestamp
    });

    return this.currentTrace;
  }

  /**
   * Legacy alias for backward compatibility
   * @deprecated Use startRecording() instead
   */
  startTrace(queryId, userInput) {
    return this.startRecording(userInput, 'orchestration');
  }

  /**
   * Record an individual orchestration step
   * P2-S3: Implemented
   * Sprint 1-A-10: Added event emission
   * Phase 8-S131: Updated to accept object parameter
   */
  recordStep(stepData) {
    if (!this.currentTrace) {
      throw new Error('No active trace. Call startRecording() first.');
    }

    // Support both object and legacy positional parameters
    let step;
    if (typeof stepData === 'object' && stepData.type) {
      // New object-based API
      step = {
        stepNumber: this.currentTrace.steps.length + 1,
        timestamp: Date.now(),
        type: stepData.type,
        duration: stepData.duration || 0,
        description: stepData.description || '',
        specialist: stepData.specialist,
        data: stepData.data || {},
        ...stepData // Include any additional fields
      };
    } else {
      // Legacy positional parameters (system, action, data, duration)
      const [system, action, data, duration] = arguments;
      step = {
        stepNumber: this.currentTrace.steps.length + 1,
        timestamp: Date.now(),
        system,
        action,
        data,
        duration,
        type: action, // Map action to type
        description: `${system}: ${action}`
      };
    }

    this.currentTrace.steps.push(step);

    // Emit trace:step event (Sprint 1-A-10)
    this.emit('trace:step', {
      id: this.currentTrace.id,
      step: { ...step },
      totalSteps: this.currentTrace.steps.length
    });

    return step;
  }

  /**
   * Finalize trace recording
   * P2-S4: Implemented
   * Sprint 1-A-10: Added event emission
   * Phase 8-S131: Renamed to endRecording() to match documentation
   */
  async endRecording(result = {}) {
    if (!this.currentTrace) {
      throw new Error('No active trace to end.');
    }

    this.currentTrace.endTime = Date.now();
    this.currentTrace.totalDuration = this.currentTrace.endTime - this.currentTrace.startTime;
    this.currentTrace.duration = this.currentTrace.totalDuration; // Alias for compatibility
    this.currentTrace.result = result;
    this.currentTrace.success = result.success !== undefined ? result.success : true;
    this.currentTrace.status = this.currentTrace.success ? 'success' : 'failure';

    const completedTrace = this.currentTrace;
    this.currentTrace = null;

    // Save trace automatically
    try {
      await this.saveTrace(completedTrace);
    } catch (error) {
      console.warn('Failed to save trace:', error.message);
    }

    // Emit trace:ended event (Sprint 1-A-10)
    this.emit('trace:ended', {
      id: completedTrace.id,
      totalDuration: completedTrace.totalDuration,
      totalSteps: completedTrace.steps.length,
      result: completedTrace.result,
      success: completedTrace.success
    });

    return completedTrace;
  }

  /**
   * Legacy alias for backward compatibility
   * @deprecated Use endRecording() instead
   */
  endTrace(result) {
    return this.endRecording(result);
  }

  /**
   * Analyze trace for bottlenecks
   * P2-S5: Implemented
   */
  analyzeTrace(trace) {
    const analysis = {
      totalSteps: trace.steps.length,
      totalDuration: trace.totalDuration,
      orchestrationOverhead: 0,
      actualWork: 0,
      bottlenecks: [],
      specialistsUsed: 0
    };

    // Calculate overhead and identify bottlenecks
    trace.steps.forEach(step => {
      if (step.duration) {
        analysis.actualWork += step.duration;

        // Bottleneck = step taking >20% of total time
        const percentage = (step.duration / trace.totalDuration) * 100;
        if (percentage > 20) {
          analysis.bottlenecks.push({
            system: step.system,
            action: step.action,
            duration: step.duration,
            percentage: Math.round(percentage)
          });
        }

        // Count specialists
        if (step.system === 'SpecialistExecute') {
          analysis.specialistsUsed++;
        }
      }
    });

    analysis.orchestrationOverhead = trace.totalDuration - analysis.actualWork;
    analysis.overheadPercentage = Math.round((analysis.orchestrationOverhead / trace.totalDuration) * 100);

    return analysis;
  }

  /**
   * Calculate total storage size used by traces
   * Option A: Storage Safeguards
   */
  async calculateTotalStorageSize() {
    try {
      const files = await fs.readdir(this.tracesDir);
      const traceFiles = files.filter(f =>
        f.startsWith('trace-') && (f.endsWith('.json') || f.endsWith('.json.gz'))
      );

      let totalBytes = 0;
      for (const file of traceFiles) {
        const filepath = path.join(this.tracesDir, file);
        const stats = await fs.stat(filepath);
        totalBytes += stats.size;
      }

      // Return size in MB
      return totalBytes / (1024 * 1024);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return 0; // No traces directory yet
      }
      throw error;
    }
  }

  /**
   * Check if trace should be compressed
   * Sprint 1-A-08: Helper method
   * Option A: Updated to compress ALL traces by default
   */
  shouldCompress(trace) {
    // Option A: Compress all traces by default for storage efficiency
    return true;
  }

  /**
   * Compress trace data
   * Sprint 1-A-08: Implemented
   */
  async compressTrace(trace) {
    const traceStr = JSON.stringify(trace);
    // Sprint 7: Use configurable compression level (default 6 for balanced speed/size)
    // Level 9 = max compression but slow, Level 6 = good balance, Level 1 = fast but less compression
    const compressed = await gzip(Buffer.from(traceStr, 'utf-8'), {
      level: this.config.compressionLevel || 6
    });
    return compressed;
  }

  /**
   * Decompress trace data
   * Sprint 1-A-08: Implemented
   */
  async decompressTrace(compressedData) {
    const decompressed = await gunzip(compressedData);
    return JSON.parse(decompressed.toString('utf-8'));
  }

  /**
   * Generate a unique trace ID
   * Phase 8-S131: Added to match documentation
   */
  generateTraceId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `trace-${timestamp}-${random}`;
  }

  /**
   * Save trace to disk
   * P2-S6: Implemented
   * Sprint 1-A-08: Updated with compression support
   * Option A: Added storage safeguards
   */
  async saveTrace(trace) {
    await this.ensureTracesDir();

    // Sprint 7: Use cached storage check for better performance
    const totalStorageMB = await this.getCachedStorageSize();
    const STORAGE_WARNING_THRESHOLD = 100; // MB
    const STORAGE_CLEANUP_THRESHOLD = 150; // MB - auto-cleanup at 150MB

    // Option A: Warn if storage is getting high
    if (totalStorageMB > STORAGE_WARNING_THRESHOLD && totalStorageMB < STORAGE_CLEANUP_THRESHOLD) {
      console.warn(`⚠️  Trace storage is ${totalStorageMB.toFixed(1)}MB (${STORAGE_WARNING_THRESHOLD}MB threshold)`);
      console.warn(`   Old traces will be auto-deleted at ${STORAGE_CLEANUP_THRESHOLD}MB or after ${this.config.traceRetentionDays} days`);
    }

    // Option A: Auto-cleanup if storage exceeds cleanup threshold (async, non-blocking)
    if (totalStorageMB > STORAGE_CLEANUP_THRESHOLD) {
      // Sprint 7: Run cleanup async without blocking trace save
      setImmediate(async () => {
        try {
          console.log(`🧹 Storage at ${totalStorageMB.toFixed(1)}MB - running auto-cleanup...`);
          const cleanupResult = await this.cleanupOldTraces();
          if (cleanupResult.deletedCount > 0) {
            const newStorageMB = await this.calculateTotalStorageSize();
            console.log(`   Freed ${(totalStorageMB - newStorageMB).toFixed(1)}MB (${cleanupResult.deletedCount} traces deleted)`);
            // Invalidate cache after cleanup
            this.lastStorageCheck = 0;
          }
        } catch (error) {
          console.warn('Auto-cleanup failed:', error.message);
        }
      });
    }

    // Sprint 7: Use async write queue if enabled
    if (this.config.asyncWrites) {
      // Queue the write and return immediately (non-blocking)
      const shouldCompress = this.shouldCompress(trace);
      return this.queueTraceWrite(trace, shouldCompress);
    }

    // Fallback: Synchronous write (for compatibility)
    const baseFilename = `trace-${trace.queryId || trace.id}-${Date.now()}`;

    // Option A: Compress all traces by default (shouldCompress now returns true)
    if (this.shouldCompress(trace)) {
      const compressed = await this.compressTrace(trace);
      const filepath = path.join(this.tracesDir, `${baseFilename}.json.gz`);
      await fs.writeFile(filepath, compressed);
      return filepath;
    } else {
      const filepath = path.join(this.tracesDir, `${baseFilename}.json`);
      await fs.writeFile(filepath, JSON.stringify(trace, null, 2), 'utf-8');
      return filepath;
    }
  }

  /**
   * Load trace from disk
   * P2-S7: Implemented
   * Sprint 1-A-08: Updated to handle compressed traces
   */
  async loadTrace(queryId) {
    const files = await fs.readdir(this.tracesDir);
    const matchingFile = files.find(f => f.startsWith(`trace-${queryId}-`));

    if (!matchingFile) {
      throw new Error(`No trace found for queryId: ${queryId}`);
    }

    const filepath = path.join(this.tracesDir, matchingFile);

    // Check if file is compressed
    if (matchingFile.endsWith('.gz')) {
      const compressedData = await fs.readFile(filepath);
      return await this.decompressTrace(compressedData);
    } else {
      const content = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(content);
    }
  }

  /**
   * Get trace by ID (alias for loadTrace with caching)
   * Sprint 1-A-06: Implemented
   */
  async getTrace(traceId) {
    // Check in-memory cache first
    if (this.traces && this.traces.has(traceId)) {
      return this.traces.get(traceId);
    }

    // Load from disk
    try {
      const trace = await this.loadTrace(traceId);

      // Cache it
      if (!this.traces) {
        this.traces = new Map();
      }
      this.traces.set(traceId, trace);

      return trace;
    } catch (error) {
      // Return null if trace doesn't exist (as per sprint spec)
      if (error.message.includes('No trace found')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all saved traces
   * P2-S8: Implemented
   */
  async listTraces() {
    try {
      const files = await fs.readdir(this.tracesDir);
      const traceFiles = files.filter(f =>
        f.startsWith('trace-') && (f.endsWith('.json') || f.endsWith('.json.gz'))
      );

      const traces = [];
      for (const file of traceFiles) {
        try {
          const filepath = path.join(this.tracesDir, file);

          let trace;
          if (file.endsWith('.gz')) {
            const compressedData = await fs.readFile(filepath);
            trace = await this.decompressTrace(compressedData);
          } else {
            const content = await fs.readFile(filepath, 'utf-8');
            trace = JSON.parse(content);
          }

          traces.push({
            queryId: trace.queryId,
            userInput: trace.userInput,
            timestamp: trace.metadata.timestamp,
            duration: trace.totalDuration,
            steps: trace.steps.length,
            filename: file
          });
        } catch (error) {
          // Skip corrupted trace files
          console.error(`Skipping corrupted trace file: ${file}`);
        }
      }

      // Sort by timestamp (newest first)
      traces.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return traces;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // No traces directory yet
      }
      throw error;
    }
  }

  /**
   * Clean up old traces to prevent directory from growing indefinitely
   * Sprint 1-A-09: Implemented
   */
  async cleanupOldTraces(maxAgeDays = null) {
    try {
      const retentionDays = maxAgeDays || this.config.traceRetentionDays;
      const maxAge = retentionDays * 24 * 60 * 60 * 1000; // Convert to milliseconds
      const now = Date.now();

      const files = await fs.readdir(this.tracesDir);
      const traceFiles = files.filter(f =>
        f.startsWith('trace-') && (f.endsWith('.json') || f.endsWith('.json.gz'))
      );

      // Get file stats with timestamps
      const fileStats = await Promise.all(
        traceFiles.map(async file => {
          const filepath = path.join(this.tracesDir, file);
          const stats = await fs.stat(filepath);
          return {
            file,
            filepath,
            mtime: stats.mtime.getTime(),
            age: now - stats.mtime.getTime()
          };
        })
      );

      // Sort by modification time (newest first)
      fileStats.sort((a, b) => b.mtime - a.mtime);

      // Keep at least minTracesToKeep most recent traces
      const filesToConsider = fileStats.slice(this.config.minTracesToKeep);

      // Delete traces older than maxAge
      let deletedCount = 0;
      for (const fileInfo of filesToConsider) {
        if (fileInfo.age > maxAge) {
          await fs.unlink(fileInfo.filepath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} old trace(s)`);
      }

      return { deletedCount, totalTraces: traceFiles.length };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { deletedCount: 0, totalTraces: 0 }; // No traces directory yet
      }
      throw error;
    }
  }
}

module.exports = TraceRecorder;
