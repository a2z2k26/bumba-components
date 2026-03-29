/**
 * BUMBA Unified Memory System
 * Consolidates all memory management functionality into a single unified manager
 */

const { UnifiedManagerBase, ManagerState } = require('@bumba/shared');
const { EventPatterns } = require('@bumba/shared');
const { logger } = require('@bumba/shared');

// Optional local dependencies - graceful fallback if not present
let MemoryOptimizationEngine, EnhancedMemoryOptimizations;
try { MemoryOptimizationEngine = require('./memory-optimization-engine').MemoryOptimizationEngine; } catch(e) { MemoryOptimizationEngine = null; }
try { EnhancedMemoryOptimizations = require('./enhanced-memory-optimizations').EnhancedMemoryOptimizations; } catch(e) { EnhancedMemoryOptimizations = null; }

// AI Integration Components - optional
let ContextManager, PromptTemplateEngine, ResponseProcessor;
try { ContextManager = require('@bumba/ai-gateway').ContextManager; } catch(e) { ContextManager = null; }
try { PromptTemplateEngine = require('@bumba/ai-gateway').PromptTemplateEngine; } catch(e) { PromptTemplateEngine = null; }
try { ResponseProcessor = require('@bumba/ai-gateway').ResponseProcessor; } catch(e) { ResponseProcessor = null; }

// SQLite Storage Adapter (Sprint 1.2)
const { SQLiteStorageAdapter } = require('./sqlite-storage-adapter');

class UnifiedMemorySystem extends UnifiedManagerBase {
  // Singleton instance
  static instance = null;

  /**
   * Get singleton instance of UnifiedMemorySystem
   * @param {Object} options - Configuration options (only used on first call)
   * @returns {UnifiedMemorySystem} The singleton instance
   */
  static getInstance(options = {}) {
    if (!UnifiedMemorySystem.instance) {
      UnifiedMemorySystem.instance = new UnifiedMemorySystem(options);
    }
    return UnifiedMemorySystem.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static resetInstance() {
    if (UnifiedMemorySystem.instance) {
      // Clean up if needed
      UnifiedMemorySystem.instance = null;
    }
  }

  constructor(options = {}) {
    super('unified-memory-system', {
      type: 'memory',
      description: 'Unified memory management system for agents, contexts, and knowledge',
      ...options
    });

    // Store options for later use (CRITICAL FIX: Was causing undefined access)
    this.options = options;

    // Memory subsystems
    this.contextMemory = null;
    this.agentMemory = null;
    this.knowledgeMemory = null;
    this.conversationMemory = null;
    this.performanceMemory = null;

    // SQLite storage adapter (Sprint 1.2)
    this.sqliteAdapter = null;
    this.useSQLite = options.useSQLite !== false; // Enable by default

    // Memory storage
    this.memoryStore = new Map();
    this.memoryIndex = new Map();
    this.maxMemorySize = options.maxMemorySize || 100 * 1024 * 1024; // 100MB default
    this.currentMemoryUsage = 0;
    this.memoryMetrics = {
      totalMemoryUsage: 0,
      activeContexts: 0,
      storedConversations: 0,
      knowledgeEntries: 0,
      cacheHitRate: 0,
      lastCleanupTime: Date.now()
    };

    // Cache and optimization
    this.memoryCache = new Map();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.maxCacheSize = options.maxCacheSize || 1000;
    this.memoryOptimizationEnabled = options.memoryOptimization !== false;

    // AI Integration
    this.aiContextManager = null;
    this.aiPromptEngine = null;
    this.aiResponseProcessor = null;
    this.semanticSearch = new Map();
    this.memoryEmbeddings = new Map();
    this.aiEnhancedStorage = new Map();

    // Initialize optimization engine
    this.optimizationEngine = new MemoryOptimizationEngine({
      maxHotMemory: options.maxHotMemory || 500,
      maxWarmMemory: options.maxWarmMemory || 2000,
      optimizationInterval: options.optimizationInterval || 60000,
      compressionEnabled: options.compressionEnabled !== false,
      analyticsEnabled: options.analyticsEnabled !== false
    });

    // Initialize enhanced optimizations
    this.enhancedOptimizations = new EnhancedMemoryOptimizations({
      enableIndexing: options.enableIndexing !== false,
      enableCompression: options.enableCompression !== false,
      enableSmartCaching: options.enableSmartCaching !== false,
      enablePrefetching: options.enablePrefetching !== false,
      enableBatchOperations: options.enableBatchOperations !== false,
      maxCacheSize: options.maxCacheSize || 1000
    });
  }

  async onInitialize() {
    logger.info('🧠 Initializing Unified Memory System with Enhanced Optimizations...');

    // Initialize SQLite storage (Sprint 1.2)
    if (this.useSQLite) {
      await this.initializeSQLiteStorage();
    }

    // Initialize memory subsystems
    await this.initializeContextMemory();
    await this.initializeAgentMemory();
    await this.initializeKnowledgeMemory();
    await this.initializeConversationMemory();
    await this.initializePerformanceMemory();

    // Initialize AI Integration (Sprint 73)
    await this.initializeAIIntegration();

    // Initialize enhanced optimizations (Sprint 52)
    await this.enhancedOptimizations.initialize();

    // Apply enhanced optimizations to subsystems
    this.applyEnhancedOptimizations();

    // Set up memory optimization
    if (this.memoryOptimizationEnabled) {
      await this.optimizationEngine.initialize();
      this.setupMemoryOptimization();
    }

    this.safeEmit(EventPatterns.CONFIG.LOADED, {
      subsystems: 5,
      capabilities: this.getCapabilities(),
      optimizations: this.enhancedOptimizations.getPerformanceMetrics()
    });

    logger.info('🧠 Unified Memory System initialized with enhanced performance');
  }

  async initializeSQLiteStorage() {
    try {
      // Check if better-sqlite3 is installed
      try {
        require.resolve('better-sqlite3');
      } catch (e) {
        logger.warn('better-sqlite3 not installed, using in-memory storage only');
        this.useSQLite = false;
        return;
      }

      this.sqliteAdapter = new SQLiteStorageAdapter({
        dbPath: this.options.dbPath || undefined
      });

      // Add timeout protection (5 seconds) to prevent indefinite hangs
      const initPromise = this.sqliteAdapter.initialize();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SQLite initialization timeout after 5s')), 5000)
      );

      await Promise.race([initPromise, timeoutPromise]);

      logger.info('📦 SQLite storage adapter initialized');
    } catch (error) {
      logger.warn(`SQLite initialization failed: ${error.message}, using in-memory storage`);
      this.useSQLite = false;
      this.sqliteAdapter = null;
    }
  }

  async initializeContextMemory() {
    // Context memory for agent and task contexts
    this.contextMemory = {
      activeContexts: new Map(),
      contextHistory: [],
      maxContextAge: 3600000, // 1 hour

      async storeContext(contextId, context) {
        const contextEntry = {
          id: contextId,
          data: context,
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: Date.now()
        };

        this.activeContexts.set(contextId, contextEntry);

        // Persist to SQLite (Sprint 1.2)
        if (this.sqliteAdapter) {
          await this.sqliteAdapter.storeContext(contextId, contextEntry);
        }

        return contextEntry;
      },

      async retrieveContext(contextId) {
        // Try in-memory first
        let context = this.activeContexts.get(contextId);

        // If not in memory but SQLite available, load from DB
        if (!context && this.sqliteAdapter) {
          const dbContext = await this.sqliteAdapter.retrieveContext(contextId);
          if (dbContext) {
            context = dbContext;
            this.activeContexts.set(contextId, dbContext);
          }
        }

        if (context) {
          context.accessCount++;
          context.lastAccessed = Date.now();
          return context.data;
        }

        return null;
      },

      async cleanupExpiredContexts() {
        const now = Date.now();
        let cleaned = 0;

        for (const [id, context] of this.activeContexts) {
          if (now - context.timestamp > this.maxContextAge) {
            this.contextHistory.push({
              id,
              archivedAt: now,
              metadata: {
                accessCount: context.accessCount,
                lifespan: now - context.timestamp
              }
            });
            this.activeContexts.delete(id);
            cleaned++;
          }
        }

        return cleaned;
      }
    };

    logger.info('🧠 Context memory subsystem initialized');
  }

  async initializeAgentMemory() {
    // Agent-specific memory storage
    this.agentMemory = {
      agentProfiles: new Map(),
      agentExperiences: new Map(),
      agentPreferences: new Map(),

      async storeAgentProfile(agentId, profile) {
        this.agentProfiles.set(agentId, {
          ...profile,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        return true;
      },

      async updateAgentExperience(agentId, experience) {
        if (!this.agentExperiences.has(agentId)) {
          this.agentExperiences.set(agentId, []);
        }

        const experiences = this.agentExperiences.get(agentId);
        experiences.push({
          ...experience,
          timestamp: Date.now()
        });

        // Keep only last 100 experiences per agent
        if (experiences.length > 100) {
          experiences.splice(0, experiences.length - 100);
        }

        return true;
      },

      async getAgentMemory(agentId) {
        return {
          profile: this.agentProfiles.get(agentId) || null,
          experiences: this.agentExperiences.get(agentId) || [],
          preferences: this.agentPreferences.get(agentId) || {}
        };
      }
    };

    logger.info('🧠 Agent memory subsystem initialized');
  }

  async initializeKnowledgeMemory() {
    // Knowledge and learning memory
    this.knowledgeMemory = {
      knowledgeBase: new Map(),
      patterns: new Map(),
      insights: new Map(),

      async storeKnowledge(key, knowledge) {
        const knowledgeEntry = {
          key,
          data: knowledge,
          timestamp: Date.now(),
          confidence: knowledge.confidence || 0.8,
          source: knowledge.source || 'unknown',
          tags: knowledge.tags || []
        };

        this.knowledgeBase.set(key, knowledgeEntry);
        this.indexKnowledge(key, knowledgeEntry);

        // Persist to SQLite (Sprint 1.2)
        if (this.sqliteAdapter) {
          await this.sqliteAdapter.storeKnowledge(key, knowledgeEntry);
        }

        return knowledgeEntry;
      },

      async retrieveKnowledge(key) {
        return this.knowledgeBase.get(key);
      },

      async searchKnowledge(query, tags = []) {
        // Use SQLite search if available (Sprint 1.2)
        if (this.sqliteAdapter) {
          return await this.sqliteAdapter.searchKnowledge(query, { tags });
        }

        // Fallback to in-memory search
        const results = [];

        for (const [key, knowledge] of this.knowledgeBase) {
          let score = 0;

          // Text matching
          if (key.toLowerCase().includes(query.toLowerCase())) {
            score += 0.5;
          }

          // Tag matching
          if (tags.length > 0) {
            const matchingTags = knowledge.tags.filter(tag => tags.includes(tag));
            score += (matchingTags.length / tags.length) * 0.5;
          }

          if (score > 0) {
            results.push({
              key,
              knowledge,
              relevanceScore: score
            });
          }
        }

        return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      },

      indexKnowledge(key, knowledge) {
        // Simple indexing by tags
        for (const tag of knowledge.tags) {
          if (!this.patterns.has(tag)) {
            this.patterns.set(tag, []);
          }
          this.patterns.get(tag).push(key);
        }
      }
    };

    logger.info('🧠 Knowledge memory subsystem initialized');
  }

  async initializeConversationMemory() {
    // Conversation and interaction memory
    this.conversationMemory = {
      conversations: new Map(),
      conversationSummaries: new Map(),
      maxConversationLength: 1000,

      async storeConversation(conversationId, messages) {
        const conversation = {
          id: conversationId,
          messages: Array.isArray(messages) ? messages : [messages],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: Array.isArray(messages) ? messages.length : 1
        };

        this.conversations.set(conversationId, conversation);

        // Generate summary if conversation is long
        if (conversation.messageCount > this.maxConversationLength) {
          await this.summarizeConversation(conversationId);
        }

        return conversation;
      },

      async appendToConversation(conversationId, message) {
        const conversation = this.conversations.get(conversationId);
        if (conversation) {
          conversation.messages.push({
            ...message,
            timestamp: Date.now()
          });
          conversation.updatedAt = Date.now();
          conversation.messageCount++;

          // Auto-summarize if needed
          if (conversation.messageCount > this.maxConversationLength) {
            await this.summarizeConversation(conversationId);
          }

          return true;
        }
        return false;
      },

      async summarizeConversation(conversationId) {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) return null;

        // Simple summarization (in real implementation, use AI)
        const summary = {
          id: conversationId,
          messageCount: conversation.messageCount,
          timespan: Date.now() - conversation.createdAt,
          keyTopics: this.extractKeyTopics(conversation.messages),
          lastActivity: conversation.updatedAt,
          summary: `Conversation with ${conversation.messageCount} messages over ${Math.round((Date.now() - conversation.createdAt) / 60000)} minutes`
        };

        this.conversationSummaries.set(conversationId, summary);
        return summary;
      },

      extractKeyTopics(messages) {
        // Simple keyword extraction
        const wordCounts = new Map();

        for (const message of messages) {
          if (message.content) {
            const words = message.content.toLowerCase().match(/\b\w+\b/g) || [];
            for (const word of words) {
              if (word.length > 3) { // Only count meaningful words
                wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
              }
            }
          }
        }

        return Array.from(wordCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([word]) => word);
      }
    };

    logger.info('🧠 Conversation memory subsystem initialized');
  }

  async initializePerformanceMemory() {
    // Performance and optimization memory
    this.performanceMemory = {
      performanceMetrics: new Map(),
      optimizationHistory: [],
      benchmarks: new Map(),

      async recordPerformance(operation, metrics) {
        const performanceEntry = {
          operation,
          metrics,
          timestamp: Date.now()
        };

        if (!this.performanceMetrics.has(operation)) {
          this.performanceMetrics.set(operation, []);
        }

        const history = this.performanceMetrics.get(operation);
        history.push(performanceEntry);

        // Keep only last 100 entries per operation
        if (history.length > 100) {
          history.splice(0, history.length - 100);
        }

        return performanceEntry;
      },

      async getPerformanceStats(operation) {
        const history = this.performanceMetrics.get(operation) || [];
        if (history.length === 0) return null;

        const latencies = history.map(entry => entry.metrics.latency || 0).filter(l => l > 0);
        const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;

        return {
          operation,
          totalRecords: history.length,
          averageLatency: avgLatency,
          lastRecorded: history[history.length - 1].timestamp,
          trendDirection: this.calculateTrend(latencies)
        };
      },

      calculateTrend(values) {
        if (values.length < 2) return 'stable';

        const recent = values.slice(-10);
        const older = values.slice(-20, -10);

        if (recent.length === 0 || older.length === 0) return 'stable';

        const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
        const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;

        const change = ((recentAvg - olderAvg) / olderAvg) * 100;

        if (change > 10) return 'degrading';
        if (change < -10) return 'improving';
        return 'stable';
      }
    };

    logger.info('🧠 Performance memory subsystem initialized');
  }

  async initializeAIIntegration() {
    // Initialize AI context management for memory operations
    // Disable garbage collection for CLI usage to prevent hanging processes
    this.aiContextManager = new ContextManager({
      maxContexts: 100,
      compressionEnabled: true,
      garbageCollectionEnabled: false // Prevent setInterval from keeping process alive
    });

    // Initialize prompt template engine for memory queries
    this.aiPromptEngine = new PromptTemplateEngine({
      templateDirectory: './templates/memory',
      enableCaching: true,
      enableCompilation: true
    });

    // Initialize response processor for AI-generated content
    this.aiResponseProcessor = new ResponseProcessor({
      enableCaching: true,
      enableFiltering: true,
      enableValidation: true,
      maxResponseLength: 10000
    });

    // Note: AI components initialize in their constructors
    // ContextManager and other AI components are self-initializing
    // No explicit initialize() calls needed

    // Set up AI-enhanced memory operations
    this.setupAIEnhancedOperations();

    // Set up semantic search capabilities
    this.setupSemanticSearch();

    logger.info('🧠 AI integration initialized for memory system');
  }

  setupAIEnhancedOperations() {
    // Enhance context storage with AI context management
    const originalStoreContext = this.contextMemory.storeContext;
    this.contextMemory.storeContext = async (contextId, context) => {
      // Store in traditional memory
      const result = await originalStoreContext.call(this.contextMemory, contextId, context);

      // Also store in AI context manager with compression
      await this.aiContextManager.createContext(contextId, {
        messages: context.messages || [],
        metadata: context.metadata || {},
        compressionStrategy: 'summarization'
      });

      return result;
    };

    // Enhance knowledge retrieval with semantic search
    const originalSearchKnowledge = this.knowledgeMemory.searchKnowledge;
    this.knowledgeMemory.searchKnowledge = async (query, options = {}) => {
      // Traditional search
      const traditionalResults = await originalSearchKnowledge.call(this.knowledgeMemory, query, options);

      // AI-enhanced semantic search
      if (options.enableSemanticSearch) {
        const semanticResults = await this.performSemanticSearch(query, options);

        // Merge and rank results
        return this.mergeSearchResults(traditionalResults, semanticResults);
      }

      return traditionalResults;
    };

    // Enhance conversation memory with AI processing
    const originalStoreConversation = this.conversationMemory.storeConversation;
    this.conversationMemory.storeConversation = async (conversationId, messages) => {
      // Process messages through AI response processor
      const processedMessages = await Promise.all(
        messages.map(msg => this.aiResponseProcessor.processResponse(msg, {
          validators: ['length', 'format'],
          filters: ['safety', 'pii'],
          optimizers: ['whitespace']
        }))
      );

      // Store processed conversation
      return originalStoreConversation.call(this.conversationMemory, conversationId, processedMessages);
    };
  }

  setupSemanticSearch() {
    // Initialize semantic search index
    this.semanticSearch.set('index', new Map());
    this.semanticSearch.set('embeddings', new Map());
    this.semanticSearch.set('clusters', new Map());

    // Add methods for semantic operations
    this.semanticSearch.set('addDocument', async (id, content, metadata = {}) => {
      // Store document
      this.semanticSearch.get('index').set(id, {
        content,
        metadata,
        timestamp: Date.now()
      });

      // Generate embedding (placeholder - would use actual AI provider)
      const embedding = this.generateSimpleEmbedding(content);
      this.semanticSearch.get('embeddings').set(id, embedding);

      return id;
    });

    this.semanticSearch.set('search', async (query, options = {}) => {
      const queryEmbedding = this.generateSimpleEmbedding(query);
      const results = [];

      // Calculate similarity with stored embeddings
      for (const [id, embedding] of this.semanticSearch.get('embeddings')) {
        const similarity = this.calculateCosineSimilarity(queryEmbedding, embedding);

        if (similarity > (options.threshold || 0.7)) {
          const document = this.semanticSearch.get('index').get(id);
          results.push({
            id,
            similarity,
            content: document.content,
            metadata: document.metadata
          });
        }
      }

      // Sort by similarity
      return results.sort((a, b) => b.similarity - a.similarity)
                   .slice(0, options.limit || 10);
    });
  }

  async performSemanticSearch(query, options = {}) {
    try {
      const search = this.semanticSearch.get('search');
      return await search(query, options);
    } catch (error) {
      logger.error('Semantic search failed:', error);
      return [];
    }
  }

  mergeSearchResults(traditional, semantic) {
    // Simple merge strategy - combine and deduplicate
    const combined = [...traditional];
    const traditionalIds = new Set(traditional.map(r => r.id));

    for (const semanticResult of semantic) {
      if (!traditionalIds.has(semanticResult.id)) {
        combined.push({
          ...semanticResult,
          source: 'semantic'
        });
      }
    }

    return combined.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  }

  generateSimpleEmbedding(text) {
    // Simple hash-based embedding (placeholder for real AI embeddings)
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(100).fill(0);

    for (const word of words) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash + word.charCodeAt(i)) & 0xffffffff;
      }
      const index = Math.abs(hash) % embedding.length;
      embedding[index] += 1;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  calculateCosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  applyEnhancedOptimizations() {
    // Apply optimizations to context memory
    if (this.contextMemory) {
      this.contextMemory = Object.assign(
        this.contextMemory,
        this.enhancedOptimizations.optimizeContextMemory(this.contextMemory)
      );
    }

    // Apply optimizations to knowledge memory
    if (this.knowledgeMemory) {
      this.knowledgeMemory = Object.assign(
        this.knowledgeMemory,
        this.enhancedOptimizations.optimizeKnowledgeMemory(this.knowledgeMemory)
      );
    }

    // Apply optimizations to conversation memory
    if (this.conversationMemory) {
      this.conversationMemory = Object.assign(
        this.conversationMemory,
        this.enhancedOptimizations.optimizeConversationMemory(this.conversationMemory)
      );
    }

    logger.info('🧠 Enhanced optimizations applied to all subsystems');
  }

  setupMemoryOptimization() {
    // Set up periodic memory cleanup
    this.addTimer(setInterval(() => {
      this.performMemoryCleanup();
    }, 300000)); // Every 5 minutes

    // Set up cache optimization
    this.addTimer(setInterval(() => {
      this.optimizeCache();
    }, 60000)); // Every minute

    // Set up performance monitoring
    this.addTimer(setInterval(() => {
      const metrics = this.enhancedOptimizations.getPerformanceMetrics();
      logger.info('🧠 Memory Performance:', {
        cacheHitRate: `${(metrics.cacheHitRate * 100).toFixed(2)}%`,
        compressionSaved: `${metrics.compressionSaved} bytes`,
        batchOptimizations: metrics.batchOptimizations
      });
    }, 120000)); // Every 2 minutes

    logger.info('🧠 Memory optimization and monitoring scheduled');
  }

  async performMemoryCleanup() {
    logger.info('🧠 Performing memory cleanup...');

    let totalCleaned = 0;

    // Cleanup expired contexts
    if (this.contextMemory) {
      const cleaned = await this.contextMemory.cleanupExpiredContexts();
      totalCleaned += cleaned;
    }

    // Cleanup cache if too large
    if (this.memoryCache.size > this.maxCacheSize) {
      const toDelete = this.memoryCache.size - Math.floor(this.maxCacheSize * 0.8);
      const entries = Array.from(this.memoryCache.entries());

      // Delete oldest entries (simple LRU)
      for (let i = 0; i < toDelete; i++) {
        this.memoryCache.delete(entries[i][0]);
        totalCleaned++;
      }
    }

    this.memoryMetrics.lastCleanupTime = Date.now();
    this.updateMetrics();

    logger.info(`🧠 Memory cleanup completed, cleaned ${totalCleaned} entries`);
  }

  optimizeCache() {
    // Calculate cache hit rate
    const totalRequests = this.cacheHits + this.cacheMisses;
    if (totalRequests > 0) {
      this.memoryMetrics.cacheHitRate = this.cacheHits / totalRequests;
    }

    // Reset counters periodically
    if (totalRequests > 10000) {
      this.cacheHits = Math.floor(this.cacheHits / 2);
      this.cacheMisses = Math.floor(this.cacheMisses / 2);
    }
  }

  // Public API methods
  async storeInMemory(key, data, options = {}) {
    if (this.state !== ManagerState.READY) {
      throw new Error('Memory system not ready');
    }

    const memoryEntry = {
      id: key,  // Add id property for test compatibility
      key,
      data,
      timestamp: Date.now(),
      type: options.type || 'general',
      ttl: options.ttl,
      metadata: options.metadata || {}
    };

    this.memoryStore.set(key, memoryEntry);
    this.memoryIndex.set(key, memoryEntry.type);

    // Also store in cache for quick access
    this.memoryCache.set(key, memoryEntry);

    this.updateMetrics();

    this.safeEmit(EventPatterns.OPERATION.COMPLETED, {
      operation: 'memory-store',
      key,
      success: true
    });

    return memoryEntry;
  }

  async retrieveFromMemory(key) {
    if (this.state !== ManagerState.READY) {
      throw new Error('Memory system not ready');
    }

    // Check cache first
    if (this.memoryCache.has(key)) {
      this.cacheHits++;
      const entry = this.memoryCache.get(key);

      // Check TTL
      if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
        this.memoryCache.delete(key);
        this.memoryStore.delete(key);
        this.cacheMisses++;
        return null;
      }

      // Return the data with additional metadata for test compatibility
      return {
        id: entry.id || entry.key,
        ...entry.data,
        timestamp: entry.timestamp,
        type: entry.type
      };
    }

    // Check main store
    if (this.memoryStore.has(key)) {
      const entry = this.memoryStore.get(key);

      // Check TTL
      if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
        this.memoryStore.delete(key);
        this.cacheMisses++;
        return null;
      }

      // Add to cache
      this.memoryCache.set(key, entry);
      this.cacheHits++;

      // Return the data with additional metadata for test compatibility
      return {
        id: entry.id || entry.key,
        ...entry.data,
        timestamp: entry.timestamp,
        type: entry.type
      };
    }

    this.cacheMisses++;
    return null;
  }

  /**
   * Search memories by query string
   * @param {string} query - Search query (agentId, content keyword, etc.)
   * @param {Array} tags - Optional tags to filter by
   * @returns {Object} Search results with matches
   */
  async searchMemory(query, tags = []) {
    if (this.state !== ManagerState.READY) {
      throw new Error('Memory system not ready');
    }

    const results = [];

    // Search through memory store
    for (const [key, entry] of this.memoryStore.entries()) {
      // Check if expired
      if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
        this.memoryStore.delete(key);
        continue;
      }

      // Match against query in key or data
      let matches = false;

      // Check if query matches key
      if (key.includes(query)) {
        matches = true;
      }

      // Check if query matches in data
      if (entry.data) {
        const dataStr = typeof entry.data === 'string'
          ? entry.data
          : JSON.stringify(entry.data);

        if (dataStr.toLowerCase().includes(query.toLowerCase())) {
          matches = true;
        }

        // Check specific fields if data is an object
        if (typeof entry.data === 'object') {
          if (entry.data.agentId === query) matches = true;
          if (entry.data.content?.toLowerCase().includes(query.toLowerCase())) matches = true;
        }
      }

      // Tag filtering (if provided)
      if (tags.length > 0 && entry.metadata?.tags) {
        const hasAllTags = tags.every(tag => entry.metadata.tags.includes(tag));
        if (!hasAllTags) matches = false;
      }

      if (matches) {
        // Flatten data properties to top level for test compatibility
        const result = typeof entry.data === 'object'
          ? { ...entry.data }  // Flatten data properties
          : {};

        results.push({
          ...result,
          id: entry.key,
          timestamp: entry.timestamp,
          type: entry.type,
          metadata: entry.metadata,
          relevanceScore: 1.0
        });
      }
    }

    return {
      results,
      total: results.length,
      query
    };
  }

  async storeContext(contextId, context) {
    if (this.contextMemory) {
      return await this.contextMemory.storeContext(contextId, context);
    }
    throw new Error('Context memory not initialized');
  }

  async retrieveContext(contextId) {
    if (this.contextMemory) {
      return await this.contextMemory.retrieveContext(contextId);
    }
    throw new Error('Context memory not initialized');
  }

  async storeKnowledge(key, knowledge) {
    if (this.knowledgeMemory) {
      const stored = await this.knowledgeMemory.storeKnowledge(key, knowledge);
      this.updateMetrics();
      return stored;
    }
    throw new Error('Knowledge memory not initialized');
  }

  async searchKnowledge(query, tags = []) {
    if (this.knowledgeMemory) {
      return await this.knowledgeMemory.searchKnowledge(query, tags);
    }
    throw new Error('Knowledge memory not initialized');
  }

  async storeConversation(conversationId, messages) {
    if (this.conversationMemory) {
      const stored = await this.conversationMemory.storeConversation(conversationId, messages);
      this.updateMetrics();
      return stored;
    }
    throw new Error('Conversation memory not initialized');
  }

  // Status and metrics
  getCapabilities() {
    const baseCapabilities = [
      'context-memory',
      'agent-memory',
      'knowledge-memory',
      'conversation-memory',
      'performance-memory',
      'memory-caching',
      'memory-optimization',
      'memory-cleanup',
      'ttl-support',
      'search-and-indexing'
    ];

    // Add enhanced memory optimization capabilities (Sprint 52)
    if (this.enhancedOptimizations && this.enhancedOptimizations.isInitialized()) {
      const enhancedCapabilities = this.enhancedOptimizations.getCapabilities();
      return [...baseCapabilities, ...enhancedCapabilities];
    }

    return baseCapabilities;
  }

  getMemoryStatus() {
    return {
      totalEntries: this.memoryStore.size,
      cacheSize: this.memoryCache.size,
      activeContexts: this.contextMemory?.activeContexts.size || 0,
      storedKnowledge: this.knowledgeMemory?.knowledgeBase.size || 0,
      conversations: this.conversationMemory?.conversations.size || 0,
      cacheHitRate: this.memoryMetrics.cacheHitRate,
      metrics: this.memoryMetrics
    };
  }

  updateMetrics() {
    this.memoryMetrics.totalMemoryUsage = this.memoryStore.size;
    this.memoryMetrics.activeContexts = this.contextMemory?.activeContexts.size || 0;
    this.memoryMetrics.storedConversations = this.conversationMemory?.conversations.size || 0;
    this.memoryMetrics.knowledgeEntries = this.knowledgeMemory?.knowledgeBase.size || 0;

    this.safeEmit(EventPatterns.METRICS.UPDATED, {
      metrics: this.memoryMetrics,
      status: this.getMemoryStatus()
    });
  }

  /**
   * Get current memory metrics
   * @returns {Object} Memory metrics and statistics
   */
  getMetrics() {
    this.updateMetrics();
    return {
      memoryUsage: this.currentMemoryUsage,
      totalMemoryUsage: this.memoryMetrics.totalMemoryUsage,
      maxMemorySize: this.maxMemorySize,
      activeContexts: this.memoryMetrics.activeContexts,
      storedConversations: this.memoryMetrics.storedConversations,
      knowledgeEntries: this.memoryMetrics.knowledgeEntries,
      cacheHitRate: this.memoryMetrics.cacheHitRate,
      cacheSize: this.memoryCache.size,
      maxCacheSize: this.maxCacheSize,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      lastCleanupTime: this.memoryMetrics.lastCleanupTime
    };
  }

  async onShutdown() {
    logger.info('🧠 Shutting down Unified Memory System...');

    // Perform final cleanup
    await this.performMemoryCleanup();

    // Clear all memory stores
    this.memoryStore.clear();
    this.memoryCache.clear();
    this.memoryIndex.clear();

    // Clear subsystem memory
    if (this.contextMemory) {
      this.contextMemory.activeContexts.clear();
    }

    logger.info('🧠 Unified Memory System shutdown complete');
  }

  // Integration test compatibility wrappers
  async store(key, value) {
    const valueSize = JSON.stringify(value).length;

    // Check if we need to evict entries to make room
    if (this.currentMemoryUsage + valueSize > this.maxMemorySize) {
      await this.evictOldestEntries(valueSize);
    }

    // Generic store method for integration tests
    this.memoryStore.set(key, value);
    this.memoryIndex.set(key, {
      timestamp: Date.now(),
      type: 'generic',
      size: valueSize
    });

    // Update memory usage
    this.currentMemoryUsage += valueSize;
    this.memoryMetrics.totalMemoryUsage = this.currentMemoryUsage;

    // Also cache it with LRU eviction
    if (this.memoryCache.size >= this.maxCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, value);

    this.updateMetrics();
    return value;
  }

  async evictOldestEntries(requiredSpace) {
    // Get entries sorted by timestamp (oldest first)
    const entries = Array.from(this.memoryIndex.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    let freedSpace = 0;
    for (const [key, meta] of entries) {
      if (freedSpace >= requiredSpace) break;

      // Remove from stores
      this.memoryStore.delete(key);
      this.memoryIndex.delete(key);
      this.memoryCache.delete(key);

      // Update memory usage
      freedSpace += meta.size;
      this.currentMemoryUsage -= meta.size;

      logger.debug(`Evicted memory entry ${key} to free ${meta.size} bytes`);
    }

    this.memoryMetrics.totalMemoryUsage = this.currentMemoryUsage;
  }

  async retrieve(key) {
    // Check cache first
    if (this.memoryCache.has(key)) {
      this.cacheHits++;
      this.memoryMetrics.cacheHitRate = this.cacheHits / (this.cacheHits + this.cacheMisses);

      // Move to end (mark as recently used) for LRU
      const value = this.memoryCache.get(key);
      this.memoryCache.delete(key);
      this.memoryCache.set(key, value);

      return value;
    }

    // Check main store
    this.cacheMisses++;
    this.memoryMetrics.cacheHitRate = this.cacheHits / (this.cacheHits + this.cacheMisses);

    const value = this.memoryStore.get(key);
    if (value) {
      // Add to cache with LRU eviction
      if (this.memoryCache.size >= this.maxCacheSize) {
        const firstKey = this.memoryCache.keys().next().value;
        this.memoryCache.delete(firstKey);
      }
      this.memoryCache.set(key, value);
    }

    return value;
  }

  async cache(key, value) {
    // Direct cache method
    if (this.memoryCache.size >= this.maxCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, value);
    return value;
  }

  async search(query) {
    // Simple search across all memory stores
    const results = [];

    // Search in memory store
    for (const [key, value] of this.memoryStore) {
      if (key.includes(query) || JSON.stringify(value).includes(query)) {
        results.push({ key, value, source: 'memory' });
      }
    }

    // Search in knowledge if available
    if (this.knowledgeMemory) {
      const knowledgeResults = await this.knowledgeMemory.searchKnowledge(query);
      results.push(...knowledgeResults.map(r => ({ ...r, source: 'knowledge' })));
    }

    return results;
  }

  // Convenience aliases for agent storage compatibility
  async set(key, value, options = {}) {
    // Store with optional metadata
    const entry = {
      data: value,
      timestamp: Date.now(),
      type: 'agent-storage',
      metadata: options.metadata || {},
      ttl: options.ttl || null,
      key: key
    };

    const valueSize = JSON.stringify(entry).length;

    // Check if we need to evict entries to make room
    if (this.currentMemoryUsage + valueSize > this.maxMemorySize) {
      await this.evictOldestEntries(valueSize);
    }

    this.memoryStore.set(key, entry);
    this.memoryIndex.set(key, {
      timestamp: Date.now(),
      type: 'agent-storage',
      size: valueSize
    });

    // Update memory usage
    this.currentMemoryUsage += valueSize;
    this.memoryMetrics.totalMemoryUsage = this.currentMemoryUsage;

    // Also cache it
    if (this.memoryCache.size >= this.maxCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, entry);

    this.updateMetrics();
    return true;
  }

  async get(key) {
    // Check cache first
    if (this.memoryCache.has(key)) {
      this.cacheHits++;
      this.memoryMetrics.cacheHitRate = this.cacheHits / (this.cacheHits + this.cacheMisses);

      // Move to end (mark as recently used) for LRU
      const entry = this.memoryCache.get(key);
      this.memoryCache.delete(key);
      this.memoryCache.set(key, entry);

      // Return just the data portion
      return entry.data || entry;
    }

    // Check main store
    this.cacheMisses++;
    this.memoryMetrics.cacheHitRate = this.cacheHits / (this.cacheHits + this.cacheMisses);

    const entry = this.memoryStore.get(key);
    if (entry) {
      // Add to cache
      if (this.memoryCache.size >= this.maxCacheSize) {
        const firstKey = this.memoryCache.keys().next().value;
        this.memoryCache.delete(firstKey);
      }
      this.memoryCache.set(key, entry);

      // Return just the data portion
      return entry.data || entry;
    }

    return undefined;
  }

  async delete(key) {
    // Get size for memory tracking
    const meta = this.memoryIndex.get(key);
    if (meta) {
      this.currentMemoryUsage -= meta.size;
      this.memoryMetrics.totalMemoryUsage = this.currentMemoryUsage;
    }

    // Remove from all stores
    this.memoryStore.delete(key);
    this.memoryIndex.delete(key);
    this.memoryCache.delete(key);

    this.updateMetrics();
    return true;
  }

  async clear() {
    // Clear all memory stores
    this.memoryStore.clear();
    this.memoryCache.clear();
    this.memoryIndex.clear();

    // Reset metrics
    this.currentMemoryUsage = 0;
    this.memoryMetrics.totalMemoryUsage = 0;

    // Clear subsystem memory if available
    if (this.contextMemory && this.contextMemory.activeContexts) {
      this.contextMemory.activeContexts.clear();
    }
    if (this.agentMemory && this.agentMemory.agentProfiles) {
      this.agentMemory.agentProfiles.clear();
    }
    if (this.knowledgeMemory && this.knowledgeMemory.knowledgeBase) {
      this.knowledgeMemory.knowledgeBase.clear();
    }
    if (this.conversationMemory && this.conversationMemory.conversations) {
      this.conversationMemory.conversations.clear();
    }

    this.updateMetrics();
    return true;
  }
}

// Export both the class and a default instance for CLI usage
// Disable auto-start to prevent timers from keeping CLI processes alive
const defaultInstance = new UnifiedMemorySystem({ autoStart: false });

// Note: NOT auto-initializing to avoid dependency issues
// Commands will handle initialization errors gracefully by calling methods directly

module.exports = defaultInstance;
module.exports.UnifiedMemorySystem = UnifiedMemorySystem;