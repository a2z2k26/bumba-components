/**
 * Streaming Manager for BUMBA
 * Sprint 2.6: Unified streaming interface for all AI providers
 *
 * Provides:
 * - Unified chunk format across providers
 * - Real-time token counting
 * - Stream aggregation
 * - Multi-provider multiplexing
 * - Progress tracking
 * - Error handling
 * - Stream controls (pause, resume, cancel)
 */

const EventEmitter = require('events');

/**
 * Unified stream chunk format
 */
class UnifiedStreamChunk {
  constructor(data) {
    this.provider = data.provider || 'unknown';
    this.model = data.model || '';
    this.content = data.content || '';
    this.contentDelta = data.contentDelta || '';
    this.role = data.role || 'assistant';
    this.finishReason = data.finishReason || null;
    this.tokenCount = data.tokenCount || 0;
    this.timestamp = data.timestamp || new Date().toISOString();

    // Tool calls (if present)
    this.toolCalls = data.toolCalls || [];
    this.toolCallDeltas = data.toolCallDeltas || [];

    // Usage metadata (if present)
    this.usage = data.usage || null;

    // Raw chunk from provider
    this.raw = data.raw || null;
  }

  /**
   * Check if this is the final chunk
   */
  isFinal() {
    return this.finishReason !== null && this.finishReason !== '';
  }

  /**
   * Check if this chunk has content
   */
  hasContent() {
    return this.contentDelta.length > 0 || this.content.length > 0;
  }

  /**
   * Check if this chunk has tool calls
   */
  hasToolCalls() {
    return this.toolCalls.length > 0 || this.toolCallDeltas.length > 0;
  }
}

/**
 * Stream aggregator - collects and combines chunks
 */
class StreamAggregator {
  constructor() {
    this.fullContent = '';
    this.chunks = [];
    this.toolCalls = [];
    this.totalTokens = 0;
    this.startTime = Date.now();
    this.endTime = null;
    this.finishReason = null;
  }

  /**
   * Add a chunk to the aggregation
   */
  addChunk(chunk) {
    this.chunks.push(chunk);

    // Accumulate content
    if (chunk.contentDelta) {
      this.fullContent += chunk.contentDelta;
    } else if (chunk.content) {
      this.fullContent = chunk.content;
    }

    // Accumulate tool calls
    if (chunk.toolCalls && chunk.toolCalls.length > 0) {
      this.toolCalls.push(...chunk.toolCalls);
    }

    // Track tokens
    if (chunk.tokenCount) {
      this.totalTokens += chunk.tokenCount;
    }

    // Check for completion
    if (chunk.isFinal()) {
      this.finishReason = chunk.finishReason;
      this.endTime = Date.now();
    }
  }

  /**
   * Get aggregated response
   */
  getResponse() {
    return {
      content: this.fullContent,
      toolCalls: this.toolCalls,
      finishReason: this.finishReason,
      usage: {
        totalTokens: this.totalTokens,
        estimatedTokens: this.estimateTokens(this.fullContent)
      },
      chunks: this.chunks.length,
      latency: this.endTime ? this.endTime - this.startTime : Date.now() - this.startTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Estimate token count for text (rough estimation: ~4 chars per token)
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if stream is complete
   */
  isComplete() {
    return this.finishReason !== null;
  }
}

/**
 * Token counter for real-time streaming
 */
class StreamTokenCounter {
  constructor() {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.totalTokens = 0;
  }

  /**
   * Count tokens in a chunk
   */
  countChunk(chunk) {
    if (chunk.usage) {
      // Use actual usage if provided
      this.inputTokens = chunk.usage.inputTokens || this.inputTokens;
      this.outputTokens = chunk.usage.outputTokens || this.outputTokens;
      this.totalTokens = chunk.usage.totalTokens || this.totalTokens;
    } else if (chunk.contentDelta) {
      // Estimate from delta
      const deltaTokens = this.estimateTokens(chunk.contentDelta);
      this.outputTokens += deltaTokens;
      this.totalTokens += deltaTokens;
    }

    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      totalTokens: this.totalTokens
    };
  }

  /**
   * Estimate token count (rough: ~4 chars per token)
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get current counts
   */
  getCounts() {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      totalTokens: this.totalTokens
    };
  }
}

/**
 * Main Streaming Manager
 */
class StreamingManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enableAggregation: options.enableAggregation !== false,
      enableTokenCounting: options.enableTokenCounting !== false,
      enableProgressTracking: options.enableProgressTracking !== false,
      progressInterval: options.progressInterval || 100, // ms between progress events
      maxConcurrentStreams: options.maxConcurrentStreams || 10
    };

    // Track active streams
    this.activeStreams = new Map();
    this.streamCounter = 0;
  }

  /**
   * Create a unified stream from a provider stream
   * @param {AsyncIterator} providerStream - Raw stream from provider
   * @param {Object} config - Stream configuration
   * @returns {AsyncIterator} Unified stream with enhanced features
   */
  async createUnifiedStream(providerStream, config = {}) {
    const streamId = `stream-${++this.streamCounter}`;
    const provider = config.provider || 'unknown';
    const model = config.model || '';

    // Create aggregator and token counter
    const aggregator = this.options.enableAggregation ? new StreamAggregator() : null;
    const tokenCounter = this.options.enableTokenCounting ? new StreamTokenCounter() : null;

    // Track this stream
    this.activeStreams.set(streamId, {
      id: streamId,
      provider,
      model,
      startTime: Date.now(),
      aggregator,
      tokenCounter,
      cancelled: false
    });

    const streamData = this.activeStreams.get(streamId);

    // Emit stream start event
    this.emit('stream:start', {
      streamId,
      provider,
      model,
      timestamp: new Date().toISOString()
    });

    // Set up progress tracking
    let lastProgressTime = Date.now();
    let chunkCount = 0;

    // Store reference to manager for use in iterator
    const manager = this;

    // Return unified async iterator
    return {
      streamId,
      aggregator,
      tokenCounter,

      async *[Symbol.asyncIterator]() {
        try {
          for await (const rawChunk of providerStream) {
            // Check if stream was cancelled
            if (streamData.cancelled) {
              manager.emit('stream:cancelled', { streamId });
              return;
            }

            // Convert raw chunk to unified format
            const unifiedChunk = manager.convertToUnifiedChunk(rawChunk, provider, model);

            // Add to aggregator
            if (aggregator) {
              aggregator.addChunk(unifiedChunk);
            }

            // Count tokens
            if (tokenCounter) {
              const counts = tokenCounter.countChunk(unifiedChunk);
              unifiedChunk.tokenCount = counts.totalTokens;
            }

            // Track progress
            chunkCount++;
            const now = Date.now();

            if (manager.options.enableProgressTracking &&
                now - lastProgressTime >= manager.options.progressInterval) {
              manager.emit('stream:progress', {
                streamId,
                provider,
                model,
                chunkCount,
                tokenCount: tokenCounter ? tokenCounter.getCounts() : null,
                content: aggregator ? aggregator.fullContent : null,
                elapsed: now - streamData.startTime
              });

              lastProgressTime = now;
            }

            // Emit chunk event
            manager.emit('stream:chunk', {
              streamId,
              chunk: unifiedChunk,
              chunkNumber: chunkCount
            });

            yield unifiedChunk;

            // Check if stream is complete
            if (unifiedChunk.isFinal()) {
              break;
            }
          }

          // Stream completed successfully
          const finalData = {
            streamId,
            provider,
            model,
            chunkCount,
            response: aggregator ? aggregator.getResponse() : null,
            tokenCounts: tokenCounter ? tokenCounter.getCounts() : null,
            elapsed: Date.now() - streamData.startTime
          };

          manager.emit('stream:complete', finalData);

        } catch (error) {
          // Stream error
          manager.emit('stream:error', {
            streamId,
            provider,
            model,
            error: error.message,
            chunkCount
          });

          throw error;

        } finally {
          // Clean up
          manager.activeStreams.delete(streamId);
        }
      },

      // Stream control methods
      cancel: () => {
        streamData.cancelled = true;
      },

      getAggregatedResponse: () => {
        return aggregator ? aggregator.getResponse() : null;
      },

      getTokenCounts: () => {
        return tokenCounter ? tokenCounter.getCounts() : null;
      }
    };
  }

  /**
   * Convert provider-specific chunk to unified format
   */
  convertToUnifiedChunk(rawChunk, provider, model) {
    let unifiedData = {
      provider,
      model: model || rawChunk.model,
      raw: rawChunk
    };

    // OpenRouter & OpenAI format (OpenAI-compatible)
    if (provider === 'openrouter' || provider === 'openai') {
      const choice = rawChunk.choices?.[0];

      if (choice) {
        unifiedData.contentDelta = choice.delta?.content || '';
        unifiedData.content = choice.message?.content || '';
        unifiedData.role = choice.delta?.role || choice.message?.role || 'assistant';
        unifiedData.finishReason = choice.finish_reason || null;

        // Tool calls
        if (choice.delta?.tool_calls) {
          unifiedData.toolCallDeltas = choice.delta.tool_calls;
        }

        if (choice.message?.tool_calls) {
          unifiedData.toolCalls = choice.message.tool_calls;
        }
      }

      // Usage
      if (rawChunk.usage) {
        unifiedData.usage = {
          inputTokens: rawChunk.usage.prompt_tokens || 0,
          outputTokens: rawChunk.usage.completion_tokens || 0,
          totalTokens: rawChunk.usage.total_tokens || 0
        };
      }
    }

    // Anthropic format
    else if (provider === 'anthropic') {
      if (rawChunk.type === 'content_block_delta') {
        unifiedData.contentDelta = rawChunk.delta?.text || '';
      } else if (rawChunk.type === 'message_start') {
        unifiedData.role = rawChunk.message?.role || 'assistant';
      } else if (rawChunk.type === 'message_delta') {
        unifiedData.finishReason = rawChunk.delta?.stop_reason || null;

        if (rawChunk.usage) {
          unifiedData.usage = {
            outputTokens: rawChunk.usage.output_tokens || 0
          };
        }
      }
    }

    // Google AI format
    else if (provider === 'google') {
      const candidate = rawChunk.candidates?.[0];

      if (candidate) {
        const part = candidate.content?.parts?.[0];

        if (part?.text) {
          unifiedData.contentDelta = part.text;
          unifiedData.content = part.text;
        }

        unifiedData.finishReason = candidate.finishReason || null;
      }

      // Usage
      if (rawChunk.usageMetadata) {
        unifiedData.usage = {
          inputTokens: rawChunk.usageMetadata.promptTokenCount || 0,
          outputTokens: rawChunk.usageMetadata.candidatesTokenCount || 0,
          totalTokens: rawChunk.usageMetadata.totalTokenCount || 0
        };
      }
    }

    return new UnifiedStreamChunk(unifiedData);
  }

  /**
   * Stream multiplexing - handle multiple provider streams simultaneously
   * @param {Array} streamConfigs - Array of {provider, messages, options}
   * @returns {AsyncIterator} Multiplexed stream
   */
  async createMultiplexedStream(streamConfigs) {
    const multiplexId = `multiplex-${++this.streamCounter}`;

    if (streamConfigs.length > this.options.maxConcurrentStreams) {
      throw new Error(`Cannot multiplex more than ${this.options.maxConcurrentStreams} streams`);
    }

    this.emit('multiplex:start', {
      multiplexId,
      streamCount: streamConfigs.length,
      providers: streamConfigs.map(c => c.provider)
    });

    return {
      multiplexId,

      async *[Symbol.asyncIterator]() {
        // Create all streams
        const streams = streamConfigs.map(async (config, index) => {
          const chunks = [];
          const streamId = `${multiplexId}-${index}`;

          try {
            for await (const chunk of config.stream) {
              chunks.push({
                streamIndex: index,
                provider: config.provider,
                chunk,
                timestamp: Date.now()
              });
            }

            return {
              streamIndex: index,
              provider: config.provider,
              success: true,
              chunks
            };

          } catch (error) {
            return {
              streamIndex: index,
              provider: config.provider,
              success: false,
              error: error.message
            };
          }
        });

        // Wait for all streams to complete
        const results = await Promise.all(streams);

        // Emit results
        for (const result of results) {
          yield {
            type: 'result',
            provider: result.provider,
            success: result.success,
            chunks: result.chunks || [],
            error: result.error || null
          };
        }

        this.emit('multiplex:complete', {
          multiplexId,
          results: results.map(r => ({
            provider: r.provider,
            success: r.success,
            chunkCount: r.chunks?.length || 0
          }))
        });
      }
    };
  }

  /**
   * Get active streams
   */
  getActiveStreams() {
    return Array.from(this.activeStreams.values()).map(s => ({
      id: s.id,
      provider: s.provider,
      model: s.model,
      elapsed: Date.now() - s.startTime,
      tokenCount: s.tokenCounter ? s.tokenCounter.getCounts().totalTokens : 0
    }));
  }

  /**
   * Cancel a specific stream
   */
  cancelStream(streamId) {
    const stream = this.activeStreams.get(streamId);

    if (stream) {
      stream.cancelled = true;
      this.emit('stream:cancelled', { streamId });
      return true;
    }

    return false;
  }

  /**
   * Cancel all active streams
   */
  cancelAllStreams() {
    const cancelled = [];

    for (const [streamId, stream] of this.activeStreams.entries()) {
      stream.cancelled = true;
      cancelled.push(streamId);
    }

    this.emit('streams:cancelled', { count: cancelled.length, streamIds: cancelled });

    return cancelled;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeStreams: this.activeStreams.size,
      totalStreamsCreated: this.streamCounter,
      maxConcurrentStreams: this.options.maxConcurrentStreams
    };
  }
}

module.exports = {
  StreamingManager,
  UnifiedStreamChunk,
  StreamAggregator,
  StreamTokenCounter
};
