const { EventEmitter } = require('events');
const crypto = require('crypto');

class ContextManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.contexts = new Map();
    this.maxContexts = options.maxContexts || 100;
    this.defaultMaxTokens = options.defaultMaxTokens || 4096;
    this.compressionRatio = options.compressionRatio || 0.7;
    this.compressionThreshold = options.compressionThreshold || 0.8;
    this.gcInterval = options.gcInterval || 300000; // 5 minutes
    this.maxIdleTime = options.maxIdleTime || 1800000; // 30 minutes
    this.garbageCollectionEnabled = options.garbageCollectionEnabled !== false;

    // Compression strategies
    this.compressionStrategies = new Map();
    this.initializeCompressionStrategies();

    // Start garbage collection only if enabled
    if (this.garbageCollectionEnabled) {
      this.startGarbageCollection();
    }
  }

  initializeCompressionStrategies() {
    // Summarization-based compression
    this.compressionStrategies.set('summarize', {
      name: 'Summarization',
      description: 'Compress by summarizing older messages',
      ratio: 0.3,
      preserveRecent: 3,
      async compress(messages, targetRatio) {
        if (messages.length <= this.preserveRecent) {
          return messages;
        }

        const recentMessages = messages.slice(-this.preserveRecent);
        const oldMessages = messages.slice(0, -this.preserveRecent);

        // Group old messages by conversation turns
        const conversationTurns = this.groupMessagesByTurns(oldMessages);

        // Summarize each turn
        const summaries = conversationTurns.map(turn => {
          const summary = this.summarizeTurn(turn);
          return {
            role: 'assistant',
            content: `[Summary: ${summary}]`,
            metadata: { compressed: true, originalLength: turn.length }
          };
        });

        return [...summaries, ...recentMessages];
      },

      groupMessagesByTurns(messages) {
        const turns = [];
        let currentTurn = [];

        for (const message of messages) {
          currentTurn.push(message);

          if (message.role === 'assistant') {
            turns.push([...currentTurn]);
            currentTurn = [];
          }
        }

        if (currentTurn.length > 0) {
          turns.push(currentTurn);
        }

        return turns;
      },

      summarizeTurn(turn) {
        const userMessages = turn.filter(m => m.role === 'user').map(m => m.content).join(' ');
        const assistantMessages = turn.filter(m => m.role === 'assistant').map(m => m.content).join(' ');

        if (userMessages && assistantMessages) {
          return `User asked about ${this.extractKeyTopics(userMessages)}, assistant responded with ${this.extractKeyPoints(assistantMessages)}`;
        } else if (userMessages) {
          return `User discussed ${this.extractKeyTopics(userMessages)}`;
        } else {
          return `Assistant provided ${this.extractKeyPoints(assistantMessages)}`;
        }
      },

      extractKeyTopics(text) {
        // Simple keyword extraction
        const words = text.toLowerCase().split(/\s+/);
        const keywords = words.filter(word =>
          word.length > 3 &&
          !['the', 'and', 'but', 'or', 'for', 'nor', 'so', 'yet', 'a', 'an', 'as', 'at', 'be', 'by', 'if', 'in', 'is', 'it', 'of', 'on', 'to', 'up', 'us', 'we'].includes(word)
        );
        return keywords.slice(0, 3).join(', ');
      },

      extractKeyPoints(text) {
        // Extract key information from assistant responses
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
        return sentences.slice(0, 2).join('. ').substring(0, 100) + '...';
      }
    });

    // Token-based compression
    this.compressionStrategies.set('token-trim', {
      name: 'Token Trimming',
      description: 'Remove tokens from the middle of messages',
      ratio: 0.6,
      async compress(messages, targetRatio) {
        const targetTokens = Math.floor(this.getTotalTokens(messages) * targetRatio);
        let currentTokens = 0;
        const compressed = [];

        // Always preserve system message and recent messages
        const systemMessages = messages.filter(m => m.role === 'system');
        const recentMessages = messages.slice(-3);
        const middleMessages = messages.slice(systemMessages.length, -3);

        // Add system messages
        for (const msg of systemMessages) {
          compressed.push(msg);
          currentTokens += this.estimateTokens(msg.content);
        }

        // Calculate remaining token budget
        const recentTokens = recentMessages.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);
        const remainingTokens = targetTokens - currentTokens - recentTokens;

        // Compress middle messages to fit remaining budget
        if (remainingTokens > 0 && middleMessages.length > 0) {
          const tokensPerMessage = remainingTokens / middleMessages.length;

          for (const msg of middleMessages) {
            const originalTokens = this.estimateTokens(msg.content);

            if (originalTokens <= tokensPerMessage) {
              compressed.push(msg);
            } else {
              // Trim message content
              const trimRatio = tokensPerMessage / originalTokens;
              const trimmedContent = this.trimContent(msg.content, trimRatio);
              compressed.push({
                ...msg,
                content: trimmedContent,
                metadata: { ...msg.metadata, compressed: true, originalLength: originalTokens }
              });
            }
          }
        }

        // Add recent messages
        compressed.push(...recentMessages);

        return compressed;
      },

      trimContent(content, ratio) {
        const targetLength = Math.floor(content.length * ratio);
        if (targetLength >= content.length) return content;

        // Try to preserve complete sentences
        const sentences = content.split(/[.!?]+/);
        let result = '';

        for (const sentence of sentences) {
          if ((result + sentence).length <= targetLength) {
            result += sentence + '.';
          } else {
            break;
          }
        }

        if (result.length < targetLength * 0.5) {
          // If sentence preservation doesn't work, just truncate
          result = content.substring(0, targetLength) + '...';
        }

        return result;
      },

      getTotalTokens(messages) {
        return messages.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);
      },

      estimateTokens(text) {
        return Math.ceil(text.length / 4); // Rough estimate: 4 chars per token
      }
    });

    // Sliding window compression
    this.compressionStrategies.set('sliding-window', {
      name: 'Sliding Window',
      description: 'Keep only recent messages within token limit',
      ratio: 0.8,
      async compress(messages, targetRatio) {
        const targetTokens = Math.floor(this.getTotalTokens(messages) * targetRatio);
        let currentTokens = 0;
        const result = [];

        // Always preserve system messages
        const systemMessages = messages.filter(m => m.role === 'system');
        const otherMessages = messages.filter(m => m.role !== 'system');

        for (const msg of systemMessages) {
          result.push(msg);
          currentTokens += this.estimateTokens(msg.content);
        }

        // Add messages from the end until we reach the limit
        for (let i = otherMessages.length - 1; i >= 0; i--) {
          const msg = otherMessages[i];
          const msgTokens = this.estimateTokens(msg.content);

          if (currentTokens + msgTokens <= targetTokens) {
            result.splice(systemMessages.length, 0, msg);
            currentTokens += msgTokens;
          } else {
            break;
          }
        }

        return result;
      },

      getTotalTokens(messages) {
        return messages.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);
      },

      estimateTokens(text) {
        return Math.ceil(text.length / 4);
      }
    });
  }

  async createContext(options = {}) {
    const contextId = options.id || this.generateContextId();

    if (this.contexts.has(contextId)) {
      throw new Error(`Context ${contextId} already exists`);
    }

    // Check context limit
    if (this.contexts.size >= this.maxContexts) {
      await this.garbageCollect();

      if (this.contexts.size >= this.maxContexts) {
        throw new Error('Maximum number of contexts reached');
      }
    }

    const context = {
      id: contextId,
      messages: [],
      metadata: {
        created: Date.now(),
        lastAccessed: Date.now(),
        totalTokens: 0,
        compressionCount: 0,
        maxTokens: options.maxTokens || this.defaultMaxTokens,
        compressionStrategy: options.compressionStrategy || 'summarize',
        systemPrompt: options.systemPrompt,
        tags: options.tags || [],
        priority: options.priority || 'normal'
      },
      statistics: {
        messageCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        compressions: 0,
        averageResponseTime: 0
      }
    };

    // Add system prompt as first message if provided
    if (options.systemPrompt) {
      context.messages.push({
        role: 'system',
        content: options.systemPrompt,
        timestamp: Date.now(),
        metadata: { system: true }
      });
    }

    this.contexts.set(contextId, context);

    this.emit('context-created', { contextId, options });

    return contextId;
  }

  async addMessage(contextId, message, options = {}) {
    const context = this.contexts.get(contextId);

    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    // Update access time
    context.metadata.lastAccessed = Date.now();

    // Prepare message
    const formattedMessage = {
      role: message.role,
      content: message.content,
      timestamp: Date.now(),
      metadata: {
        ...message.metadata,
        tokenCount: this.estimateTokens(message.content)
      }
    };

    // Add message
    context.messages.push(formattedMessage);
    context.metadata.totalTokens += formattedMessage.metadata.tokenCount;
    context.statistics.messageCount++;

    // Update statistics
    if (message.role === 'user') {
      context.statistics.totalInputTokens += formattedMessage.metadata.tokenCount;
    } else if (message.role === 'assistant') {
      context.statistics.totalOutputTokens += formattedMessage.metadata.tokenCount;
    }

    // Check if compression is needed
    const compressionThreshold = context.metadata.maxTokens * this.compressionThreshold;

    if (context.metadata.totalTokens > compressionThreshold) {
      await this.compressContext(contextId, options.compressionStrategy);
    }

    this.emit('message-added', { contextId, message: formattedMessage });

    return formattedMessage;
  }

  async compressContext(contextId, strategy = null) {
    const context = this.contexts.get(contextId);

    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    const compressionStrategy = strategy || context.metadata.compressionStrategy;
    const compressor = this.compressionStrategies.get(compressionStrategy);

    if (!compressor) {
      throw new Error(`Unknown compression strategy: ${compressionStrategy}`);
    }

    this.emit('compression-started', { contextId, strategy: compressionStrategy });

    const originalTokens = context.metadata.totalTokens;
    const originalMessageCount = context.messages.length;

    try {
      // Perform compression
      const compressedMessages = await compressor.compress(
        context.messages,
        compressor.ratio
      );

      // Update context
      context.messages = compressedMessages;
      context.metadata.totalTokens = this.calculateTotalTokens(compressedMessages);
      context.metadata.compressionCount++;
      context.statistics.compressions++;

      const compressionRatio = context.metadata.totalTokens / originalTokens;

      this.emit('compression-completed', {
        contextId,
        strategy: compressionStrategy,
        originalTokens,
        compressedTokens: context.metadata.totalTokens,
        originalMessages: originalMessageCount,
        compressedMessages: compressedMessages.length,
        ratio: compressionRatio
      });

      return {
        originalTokens,
        compressedTokens: context.metadata.totalTokens,
        ratio: compressionRatio
      };
    } catch (error) {
      this.emit('compression-failed', { contextId, strategy: compressionStrategy, error });
      throw error;
    }
  }

  getContext(contextId) {
    const context = this.contexts.get(contextId);

    if (!context) {
      return null;
    }

    // Update access time
    context.metadata.lastAccessed = Date.now();

    return {
      id: contextId,
      messages: [...context.messages],
      metadata: { ...context.metadata },
      statistics: { ...context.statistics }
    };
  }

  getMessages(contextId, options = {}) {
    const context = this.contexts.get(contextId);

    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    context.metadata.lastAccessed = Date.now();

    let messages = [...context.messages];

    // Apply filters
    if (options.role) {
      messages = messages.filter(msg => msg.role === options.role);
    }

    if (options.since) {
      messages = messages.filter(msg => msg.timestamp >= options.since);
    }

    if (options.limit) {
      messages = messages.slice(-options.limit);
    }

    if (options.excludeSystem) {
      messages = messages.filter(msg => msg.role !== 'system');
    }

    return messages;
  }

  updateContextMetadata(contextId, metadata) {
    const context = this.contexts.get(contextId);

    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    // Merge metadata
    context.metadata = {
      ...context.metadata,
      ...metadata,
      lastAccessed: Date.now()
    };

    this.emit('context-updated', { contextId, metadata });

    return context.metadata;
  }

  deleteContext(contextId) {
    const existed = this.contexts.delete(contextId);

    if (existed) {
      this.emit('context-deleted', { contextId });
    }

    return existed;
  }

  listContexts(options = {}) {
    const contexts = Array.from(this.contexts.values());

    let filtered = contexts;

    // Apply filters
    if (options.tags) {
      const tagsArray = Array.isArray(options.tags) ? options.tags : [options.tags];
      filtered = filtered.filter(ctx =>
        tagsArray.some(tag => ctx.metadata.tags.includes(tag))
      );
    }

    if (options.priority) {
      filtered = filtered.filter(ctx => ctx.metadata.priority === options.priority);
    }

    if (options.since) {
      filtered = filtered.filter(ctx => ctx.metadata.created >= options.since);
    }

    // Sort
    if (options.sortBy) {
      filtered.sort((a, b) => {
        switch (options.sortBy) {
          case 'created':
            return b.metadata.created - a.metadata.created;
          case 'lastAccessed':
            return b.metadata.lastAccessed - a.metadata.lastAccessed;
          case 'messageCount':
            return b.statistics.messageCount - a.statistics.messageCount;
          case 'tokens':
            return b.metadata.totalTokens - a.metadata.totalTokens;
          default:
            return 0;
        }
      });
    }

    // Limit results
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered.map(ctx => ({
      id: ctx.id,
      messageCount: ctx.statistics.messageCount,
      totalTokens: ctx.metadata.totalTokens,
      created: ctx.metadata.created,
      lastAccessed: ctx.metadata.lastAccessed,
      tags: ctx.metadata.tags,
      priority: ctx.metadata.priority,
      compressionCount: ctx.metadata.compressionCount
    }));
  }

  async garbageCollect() {
    const now = Date.now();
    const contextsToDelete = [];

    for (const [contextId, context] of this.contexts) {
      const idleTime = now - context.metadata.lastAccessed;

      if (idleTime > this.maxIdleTime && context.metadata.priority !== 'high') {
        contextsToDelete.push(contextId);
      }
    }

    // Delete idle contexts
    for (const contextId of contextsToDelete) {
      this.deleteContext(contextId);
    }

    this.emit('garbage-collected', {
      deleted: contextsToDelete.length,
      remaining: this.contexts.size
    });

    return contextsToDelete.length;
  }

  startGarbageCollection() {
    this.gcTimer = setInterval(() => {
      this.garbageCollect();
    }, this.gcInterval);
  }

  stopGarbageCollection() {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }

  generateContextId() {
    return 'ctx_' + crypto.randomBytes(16).toString('hex');
  }

  estimateTokens(text) {
    if (!text) return 0;
    // More accurate token estimation
    return Math.ceil(text.length / 3.5);
  }

  calculateTotalTokens(messages) {
    return messages.reduce((sum, msg) => {
      return sum + (msg.metadata?.tokenCount || this.estimateTokens(msg.content));
    }, 0);
  }

  getStatistics() {
    const contexts = Array.from(this.contexts.values());

    return {
      totalContexts: contexts.length,
      totalMessages: contexts.reduce((sum, ctx) => sum + ctx.statistics.messageCount, 0),
      totalTokens: contexts.reduce((sum, ctx) => sum + ctx.metadata.totalTokens, 0),
      totalCompressions: contexts.reduce((sum, ctx) => sum + ctx.statistics.compressions, 0),
      averageMessagesPerContext: contexts.length > 0
        ? contexts.reduce((sum, ctx) => sum + ctx.statistics.messageCount, 0) / contexts.length
        : 0,
      memoryUsage: {
        contexts: this.contexts.size,
        maxContexts: this.maxContexts,
        utilizationPercent: (this.contexts.size / this.maxContexts) * 100
      },
      compressionStats: {
        strategies: Array.from(this.compressionStrategies.keys()),
        totalCompressions: contexts.reduce((sum, ctx) => sum + ctx.metadata.compressionCount, 0)
      }
    };
  }

  exportContext(contextId, format = 'json') {
    const context = this.getContext(contextId);

    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    switch (format) {
      case 'json':
        return JSON.stringify(context, null, 2);

      case 'markdown':
        let markdown = `# Context: ${contextId}\n\n`;
        markdown += `**Created:** ${new Date(context.metadata.created).toISOString()}\n`;
        markdown += `**Messages:** ${context.statistics.messageCount}\n`;
        markdown += `**Tokens:** ${context.metadata.totalTokens}\n\n`;

        for (const msg of context.messages) {
          markdown += `## ${msg.role.toUpperCase()}\n`;
          markdown += `${msg.content}\n\n`;
        }

        return markdown;

      case 'chat':
        return context.messages.map(msg => `${msg.role}: ${msg.content}`).join('\n\n');

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async importContext(data, format = 'json') {
    let contextData;

    switch (format) {
      case 'json':
        contextData = typeof data === 'string' ? JSON.parse(data) : data;
        break;

      default:
        throw new Error(`Unsupported import format: ${format}`);
    }

    // Create new context
    const contextId = await this.createContext({
      maxTokens: contextData.metadata?.maxTokens,
      compressionStrategy: contextData.metadata?.compressionStrategy,
      tags: contextData.metadata?.tags,
      priority: contextData.metadata?.priority
    });

    // Add messages
    for (const message of contextData.messages) {
      if (message.role !== 'system') { // System messages are added during creation
        await this.addMessage(contextId, message);
      }
    }

    return contextId;
  }

  cleanup() {
    this.stopGarbageCollection();
    this.contexts.clear();
    this.emit('cleanup');
  }
}

module.exports = { ContextManager };