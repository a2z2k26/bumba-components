/**
 * Advanced Cache Manager
 * Implements multi-layer caching with different strategies and adaptive algorithms
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class AdvancedCacheManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      enabled: true,
      strategy: 'adaptive', // lru, lfu, lru-ttl, adaptive
      maxSize: 1000000, // 1MB
      layers: {
        l1: { type: 'memory', size: 100000, ttl: 300 }, // 100KB, 5min
        l2: { type: 'disk', size: 500000, ttl: 3600 }, // 500KB, 1hour
        l3: { type: 'distributed', size: 1000000, ttl: 86400 } // 1MB, 24hours
      },
      adaptive: {
        learningRate: 0.1,
        decayFactor: 0.95,
        rebalanceInterval: 30000 // 30 seconds
      },
      compression: {
        enabled: true,
        threshold: 1024, // Compress entries larger than 1KB
        algorithm: 'gzip'
      },
      ...config
    };

    this.logger = new Logger('AdvancedCacheManager');

    // Cache layers
    this.layers = new Map();

    // Access patterns for adaptive caching
    this.accessPatterns = new Map();
    this.hotKeys = new Set();
    this.coldKeys = new Set();

    // Performance metrics
    this.metrics = {
      hits: { l1: 0, l2: 0, l3: 0 },
      misses: { l1: 0, l2: 0, l3: 0 },
      evictions: { l1: 0, l2: 0, l3: 0 },
      promotions: 0,
      demotions: 0,
      compressionRatio: 0,
      totalSize: 0,
      operations: 0
    };

    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize cache layers
      await this.initializeLayers();

      // Start adaptive rebalancing if enabled
      if (this.config.strategy === 'adaptive') {
        this.startAdaptiveRebalancing();
      }

      // Start cleanup processes
      this.startCleanupProcesses();

      this.initialized = true;
      this.logger.info('Advanced cache manager initialized');
    } catch (error) {
      this.logger.error('Failed to initialize cache manager:', error);
      throw error;
    }
  }

  /**
   * Initialize cache layers
   */
  async initializeLayers() {
    for (const [layerName, layerConfig] of Object.entries(this.config.layers)) {
      const layer = this.createCacheLayer(layerName, layerConfig);
      this.layers.set(layerName, layer);
    }

    this.logger.info('Cache layers initialized:', Array.from(this.layers.keys()));
  }

  /**
   * Create cache layer based on type
   */
  createCacheLayer(name, config) {
    switch (config.type) {
      case 'memory':
        return new MemoryCacheLayer(name, config);
      case 'disk':
        return new DiskCacheLayer(name, config);
      case 'distributed':
        return new DistributedCacheLayer(name, config);
      default:
        throw new Error(`Unknown cache layer type: ${config.type}`);
    }
  }

  /**
   * Get value from cache with multi-layer lookup
   */
  async get(segment, key, options = {}) {
    this.metrics.operations++;

    try {
      const cacheKey = this.buildCacheKey(segment, key);

      // Record access pattern
      this.recordAccess(cacheKey);

      // Try each layer in order
      for (const [layerName, layer] of this.layers) {
        const entry = await layer.get(cacheKey);

        if (entry) {
          this.metrics.hits[layerName]++;

          // Promote to higher layers if beneficial
          if (this.shouldPromote(cacheKey, layerName)) {
            await this.promoteEntry(cacheKey, entry, layerName);
          }

          // Update access statistics
          this.updateAccessStats(cacheKey, true);

          // Decompress and parse the cached data
          const value = await this.deserializeCacheEntry(entry);
          return value;
        } else {
          this.metrics.misses[layerName]++;
        }
      }

      // Cache miss - update statistics
      this.updateAccessStats(cacheKey, false);
      return null;

    } catch (error) {
      this.logger.error(`Cache get failed for ${segment}:${key}:`, error);
      throw error;
    }
  }

  /**
   * Set value in cache with intelligent layer selection
   */
  async set(segment, key, value, options = {}) {
    this.metrics.operations++;

    try {
      const cacheKey = this.buildCacheKey(segment, key);

      // Create cache entry
      const entry = await this.createCacheEntry(value, options);

      // Select optimal layer based on strategy
      const targetLayer = this.selectOptimalLayer(cacheKey, entry, options);

      // Store in selected layer
      await this.storeInLayer(targetLayer, cacheKey, entry);

      // Update access patterns
      this.recordAccess(cacheKey);

      this.emit('set', { segment, key, layer: targetLayer, size: entry.size });

    } catch (error) {
      this.logger.error(`Cache set failed for ${segment}:${key}:`, error);
      throw error;
    }
  }

  /**
   * Create cache entry with compression if needed
   */
  async createCacheEntry(value, options = {}) {
    const serialized = JSON.stringify(value);
    const originalSize = Buffer.byteLength(serialized, 'utf8');

    let data = serialized;
    let compressed = false;

    // Apply compression if enabled and threshold met
    if (this.config.compression.enabled && originalSize > this.config.compression.threshold) {
      data = await this.compress(serialized);
      compressed = true;

      const compressedSize = Buffer.byteLength(data, 'utf8');
      this.metrics.compressionRatio = compressedSize / originalSize;
    }

    return {
      data,
      originalSize,
      size: Buffer.byteLength(data, 'utf8'),
      compressed,
      timestamp: Date.now(),
      ttl: options.ttl,
      accessCount: 0,
      lastAccess: Date.now(),
      checksum: this.calculateChecksum(data)
    };
  }

  /**
   * Deserialize cache entry back to original value
   */
  async deserializeCacheEntry(entry) {
    let data = entry.data;

    // Decompress if needed
    if (entry.compressed) {
      data = await this.decompress(data);
    }

    // Parse JSON back to original value
    return JSON.parse(data);
  }

  /**
   * Select optimal cache layer based on strategy and patterns
   */
  selectOptimalLayer(key, entry, options = {}) {
    // Use specified layer if provided
    if (options.layer && this.layers.has(options.layer)) {
      return options.layer;
    }

    switch (this.config.strategy) {
      case 'adaptive':
        return this.selectAdaptiveLayer(key, entry);
      case 'lru':
      case 'lfu':
      case 'lru-ttl':
        return this.selectBasedOnSize(entry);
      default:
        return 'l1'; // Default to L1
    }
  }

  /**
   * Select layer using adaptive algorithm
   */
  selectAdaptiveLayer(key, entry) {
    const pattern = this.accessPatterns.get(key);

    if (!pattern) {
      return 'l1'; // New keys start in L1
    }

    // Consider access frequency, recency, and size
    const frequency = pattern.accessCount / pattern.age;
    const recency = Date.now() - pattern.lastAccess;
    const size = entry.size;

    // Adaptive scoring algorithm
    let score = 0;
    score += frequency * 0.4; // 40% weight on frequency
    score += (1 / (recency + 1)) * 0.3; // 30% weight on recency (inverse)
    score += (1 / (size + 1)) * 0.2; // 20% weight on size (inverse)
    score += (this.hotKeys.has(key) ? 1 : 0) * 0.1; // 10% weight on hot key status

    if (score > 0.7) return 'l1';
    if (score > 0.4) return 'l2';
    return 'l3';
  }

  /**
   * Select layer based on entry size
   */
  selectBasedOnSize(entry) {
    for (const [layerName, layer] of this.layers) {
      if (entry.size <= layer.config.size) {
        return layerName;
      }
    }
    return Array.from(this.layers.keys()).pop(); // Use largest layer
  }

  /**
   * Store entry in specified layer
   */
  async storeInLayer(layerName, key, entry) {
    const layer = this.layers.get(layerName);
    if (!layer) {
      throw new Error(`Cache layer not found: ${layerName}`);
    }

    // Check if eviction is needed
    if (await layer.needsEviction(entry.size)) {
      await this.performEviction(layerName, entry.size);
    }

    await layer.set(key, entry);
    this.metrics.totalSize += entry.size;
  }

  /**
   * Promote entry to higher cache layer
   */
  async promoteEntry(key, entry, currentLayer) {
    const layers = Array.from(this.layers.keys());
    const currentIndex = layers.indexOf(currentLayer);

    if (currentIndex > 0) {
      const targetLayer = layers[currentIndex - 1];
      const targetLayerObj = this.layers.get(targetLayer);

      // Check if promotion is possible
      if (await targetLayerObj.canAccommodate(entry.size)) {
        await this.storeInLayer(targetLayer, key, entry);
        this.metrics.promotions++;

        this.logger.debug(`Promoted ${key} from ${currentLayer} to ${targetLayer}`);
      }
    }
  }

  /**
   * Should promote entry based on access patterns
   */
  shouldPromote(key, currentLayer) {
    const pattern = this.accessPatterns.get(key);
    if (!pattern) return false;

    // Promote if frequently accessed
    const frequency = pattern.accessCount / pattern.age;
    const promotionThreshold = currentLayer === 'l3' ? 0.3 : 0.5;

    return frequency > promotionThreshold;
  }

  /**
   * Perform cache eviction using configured strategy
   */
  async performEviction(layerName, requiredSpace) {
    const layer = this.layers.get(layerName);
    let evicted = 0;

    while (evicted < requiredSpace && layer.size > 0) {
      const victimKey = await this.selectEvictionVictim(layer);
      if (!victimKey) break;

      const entry = await layer.get(victimKey);
      await layer.delete(victimKey);

      if (entry) {
        evicted += entry.size;
        this.metrics.evictions[layerName]++;
        this.metrics.totalSize -= entry.size;

        // Optionally demote to lower layer
        await this.considerDemotion(victimKey, entry, layerName);
      }
    }

    this.logger.debug(`Evicted ${evicted} bytes from ${layerName}`);
  }

  /**
   * Select eviction victim based on strategy
   */
  async selectEvictionVictim(layer) {
    switch (this.config.strategy) {
      case 'lru':
        return layer.getLRUKey();
      case 'lfu':
        return layer.getLFUKey();
      case 'lru-ttl':
        return layer.getExpiredOrLRUKey();
      case 'adaptive':
        return this.selectAdaptiveVictim(layer);
      default:
        return layer.getLRUKey();
    }
  }

  /**
   * Select eviction victim using adaptive algorithm
   */
  selectAdaptiveVictim(layer) {
    // Implement adaptive victim selection based on access patterns
    const keys = layer.getKeys();
    let worstKey = null;
    let worstScore = Infinity;

    for (const key of keys) {
      const pattern = this.accessPatterns.get(key);
      if (!pattern) continue;

      const frequency = pattern.accessCount / pattern.age;
      const recency = Date.now() - pattern.lastAccess;

      // Lower score = better eviction candidate
      const score = frequency * 0.6 + (1 / (recency + 1)) * 0.4;

      if (score < worstScore) {
        worstScore = score;
        worstKey = key;
      }
    }

    return worstKey;
  }

  /**
   * Consider demoting evicted entry to lower layer
   */
  async considerDemotion(key, entry, currentLayer) {
    const layers = Array.from(this.layers.keys());
    const currentIndex = layers.indexOf(currentLayer);

    if (currentIndex < layers.length - 1) {
      const targetLayer = layers[currentIndex + 1];
      const targetLayerObj = this.layers.get(targetLayer);

      if (await targetLayerObj.canAccommodate(entry.size)) {
        await this.storeInLayer(targetLayer, key, entry);
        this.metrics.demotions++;

        this.logger.debug(`Demoted ${key} from ${currentLayer} to ${targetLayer}`);
      }
    }
  }

  /**
   * Record access pattern for adaptive caching
   */
  recordAccess(key) {
    const now = Date.now();
    const pattern = this.accessPatterns.get(key) || {
      accessCount: 0,
      firstAccess: now,
      lastAccess: now,
      age: 0
    };

    pattern.accessCount++;
    pattern.lastAccess = now;
    pattern.age = now - pattern.firstAccess;

    this.accessPatterns.set(key, pattern);

    // Update hot/cold key classification
    this.classifyKey(key, pattern);
  }

  /**
   * Classify key as hot or cold based on access pattern
   */
  classifyKey(key, pattern) {
    const frequency = pattern.accessCount / (pattern.age || 1);
    const hotThreshold = 0.5; // Configurable
    const coldThreshold = 0.1; // Configurable

    if (frequency > hotThreshold) {
      this.hotKeys.add(key);
      this.coldKeys.delete(key);
    } else if (frequency < coldThreshold) {
      this.coldKeys.add(key);
      this.hotKeys.delete(key);
    }
  }

  /**
   * Update access statistics
   */
  updateAccessStats(key, hit) {
    // Implementation for detailed access statistics
  }

  /**
   * Start adaptive rebalancing process
   */
  startAdaptiveRebalancing() {
    setInterval(async () => {
      await this.rebalanceLayers();
    }, this.config.adaptive.rebalanceInterval);

    this.logger.info('Adaptive rebalancing started');
  }

  /**
   * Rebalance cache layers based on access patterns
   */
  async rebalanceLayers() {
    try {
      // Analyze access patterns and rebalance hot/cold data
      for (const [key, pattern] of this.accessPatterns) {
        const currentLayer = await this.findKeyLayer(key);
        if (!currentLayer) continue;

        const optimalLayer = this.selectAdaptiveLayer(key, { size: 0 }); // Size 0 for analysis

        if (currentLayer !== optimalLayer) {
          await this.moveKeyBetweenLayers(key, currentLayer, optimalLayer);
        }
      }

      this.logger.debug('Cache layers rebalanced');
    } catch (error) {
      this.logger.error('Cache rebalancing failed:', error);
    }
  }

  /**
   * Find which layer contains a key
   */
  async findKeyLayer(key) {
    for (const [layerName, layer] of this.layers) {
      if (await layer.has(key)) {
        return layerName;
      }
    }
    return null;
  }

  /**
   * Move key between cache layers
   */
  async moveKeyBetweenLayers(key, fromLayer, toLayer) {
    const sourceLayer = this.layers.get(fromLayer);
    const targetLayer = this.layers.get(toLayer);

    if (!sourceLayer || !targetLayer) return;

    const entry = await sourceLayer.get(key);
    if (!entry) return;

    if (await targetLayer.canAccommodate(entry.size)) {
      await targetLayer.set(key, entry);
      await sourceLayer.delete(key);

      this.logger.debug(`Moved ${key} from ${fromLayer} to ${toLayer}`);
    }
  }

  /**
   * Start cleanup processes
   */
  startCleanupProcesses() {
    // TTL cleanup
    setInterval(async () => {
      await this.cleanupExpiredEntries();
    }, 60000); // Every minute

    // Pattern cleanup
    setInterval(() => {
      this.cleanupAccessPatterns();
    }, 300000); // Every 5 minutes

    this.logger.info('Cache cleanup processes started');
  }

  /**
   * Cleanup expired entries
   */
  async cleanupExpiredEntries() {
    const now = Date.now();

    for (const [layerName, layer] of this.layers) {
      await layer.cleanupExpired(now);
    }
  }

  /**
   * Cleanup old access patterns
   */
  cleanupAccessPatterns() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [key, pattern] of this.accessPatterns) {
      if (now - pattern.lastAccess > maxAge) {
        this.accessPatterns.delete(key);
        this.hotKeys.delete(key);
        this.coldKeys.delete(key);
      }
    }
  }

  /**
   * Compress data
   */
  async compress(data) {
    // Implement compression (gzip, etc.)
    // For now, return as-is
    return data;
  }

  /**
   * Decompress data
   */
  async decompress(data) {
    // Implement decompression (gzip, etc.)
    // For now, return as-is
    return data;
  }

  /**
   * Calculate checksum
   */
  calculateChecksum(data) {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Build cache key
   */
  buildCacheKey(segment, key) {
    return `${segment}:${key}`;
  }

  /**
   * Get cache statistics
   */
  getStatistics() {
    return {
      metrics: this.metrics,
      layers: Object.fromEntries(
        Array.from(this.layers.entries()).map(([name, layer]) => [
          name,
          layer.getStatistics()
        ])
      ),
      accessPatterns: this.accessPatterns.size,
      hotKeys: this.hotKeys.size,
      coldKeys: this.coldKeys.size,
      strategy: this.config.strategy
    };
  }

  /**
   * Cleanup cache
   */
  async cleanup() {
    await this.cleanupExpiredEntries();
    this.cleanupAccessPatterns();
  }

  /**
   * Shutdown cache manager
   */
  async shutdown() {
    for (const [layerName, layer] of this.layers) {
      await layer.shutdown();
    }

    this.logger.info('Advanced cache manager shutdown complete');
  }
}

/**
 * Base cache layer class
 */
class CacheLayer {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.data = new Map();
    this.accessOrder = [];
    this.size = 0;
  }

  async get(key) {
    const entry = this.data.get(key);
    if (!entry) return null;

    // Check TTL
    if (entry.ttl && Date.now() > entry.timestamp + entry.ttl * 1000) {
      await this.delete(key);
      return null;
    }

    // Update access order
    this.updateAccessOrder(key);
    entry.accessCount++;
    entry.lastAccess = Date.now();

    return entry;
  }

  async set(key, entry) {
    // Remove existing entry if present
    if (this.data.has(key)) {
      await this.delete(key);
    }

    this.data.set(key, entry);
    this.size += entry.size;
    this.updateAccessOrder(key);
  }

  async delete(key) {
    const entry = this.data.get(key);
    if (entry) {
      this.data.delete(key);
      this.size -= entry.size;
      this.removeFromAccessOrder(key);
    }
  }

  async has(key) {
    return this.data.has(key);
  }

  async needsEviction(requiredSize) {
    return this.size + requiredSize > this.config.size;
  }

  async canAccommodate(requiredSize) {
    return requiredSize <= this.config.size;
  }

  updateAccessOrder(key) {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  removeFromAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  getLRUKey() {
    return this.accessOrder.length > 0 ? this.accessOrder[0] : null;
  }

  getLFUKey() {
    let lfu = null;
    let minAccess = Infinity;

    for (const [key, entry] of this.data) {
      if (entry.accessCount < minAccess) {
        minAccess = entry.accessCount;
        lfu = key;
      }
    }

    return lfu;
  }

  getExpiredOrLRUKey() {
    const now = Date.now();

    // First try to find expired entry
    for (const [key, entry] of this.data) {
      if (entry.ttl && now > entry.timestamp + entry.ttl * 1000) {
        return key;
      }
    }

    // Fall back to LRU
    return this.getLRUKey();
  }

  getKeys() {
    return Array.from(this.data.keys());
  }

  async cleanupExpired(now) {
    const keysToDelete = [];

    for (const [key, entry] of this.data) {
      if (entry.ttl && now > entry.timestamp + entry.ttl * 1000) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.delete(key);
    }
  }

  getStatistics() {
    return {
      name: this.name,
      type: this.config.type,
      entries: this.data.size,
      size: this.size,
      maxSize: this.config.size,
      utilization: this.size / this.config.size
    };
  }

  async shutdown() {
    this.data.clear();
    this.accessOrder = [];
    this.size = 0;
  }
}

/**
 * Memory cache layer - fastest access
 */
class MemoryCacheLayer extends CacheLayer {
  constructor(name, config) {
    super(name, config);
  }
}

/**
 * Disk cache layer - persistent storage
 */
class DiskCacheLayer extends CacheLayer {
  constructor(name, config) {
    super(name, config);
    // Would implement disk-based storage
  }
}

/**
 * Distributed cache layer - network-based
 */
class DistributedCacheLayer extends CacheLayer {
  constructor(name, config) {
    super(name, config);
    // Would implement distributed caching
  }
}

module.exports = AdvancedCacheManager;