/**
 * Anthropic Translator
 * Handles Anthropic Claude API interactions and protocol translation
 */

const axios = require('axios');

class AnthropicTranslator {
  constructor(config = {}) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://api.anthropic.com';
    this.models = config.models || ['claude-3-opus-20240229', 'claude-3-sonnet-20240229'];
    this.defaultModel = config.defaultModel || 'claude-3-sonnet-20240229';
  }

  isEnabled() {
    return this.config.enabled && !!this.apiKey;
  }

  getModels() {
    return this.models;
  }

  async handle(request) {
    if (!this.isEnabled()) {
      throw new Error('Anthropic API is not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/v1/messages`,
        request,
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async chat(messages, options = {}) {
    const request = {
      model: options.model || this.defaultModel,
      messages: this.formatMessages(messages),
      max_tokens: options.maxTokens || 4096,
      ...this.extractOptions(options)
    };

    // Handle system message
    const systemMessage = messages.find((m) => m.role === 'system');
    if (systemMessage) {
      request.system = systemMessage.content;
      request.messages = request.messages.filter((m) => m.role !== 'system');
    }

    return await this.handle(request);
  }

  async stream(messages, options = {}) {
    const request = {
      model: options.model || this.defaultModel,
      messages: this.formatMessages(messages),
      max_tokens: options.maxTokens || 4096,
      stream: true,
      ...this.extractOptions(options)
    };

    // Handle system message
    const systemMessage = messages.find((m) => m.role === 'system');
    if (systemMessage) {
      request.system = systemMessage.content;
      request.messages = request.messages.filter((m) => m.role !== 'system');
    }

    const response = await axios.post(
      `${this.baseURL}/v1/messages`,
      request,
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        responseType: 'stream'
      }
    );

    return this.parseStream(response.data);
  }

  formatMessages(messages) {
    return messages.map((msg) => {
      if (typeof msg === 'string') {
        return { role: 'user', content: msg };
      }

      // Convert role names
      let role = msg.role;
      if (role === 'system') {
        // System messages handled separately
        return null;
      } else if (role === 'user' || role === 'human') {
        role = 'user';
      } else if (role === 'assistant' || role === 'claude') {
        role = 'assistant';
      }

      return {
        role,
        content: msg.content
      };
    }).filter(Boolean);
  }

  extractOptions(options) {
    const extracted = {};

    if (options.temperature !== undefined) {
      extracted.temperature = options.temperature;
    }
    if (options.topP !== undefined) {
      extracted.top_p = options.topP;
    }
    if (options.topK !== undefined) {
      extracted.top_k = options.topK;
    }
    if (options.stopSequences !== undefined) {
      extracted.stop_sequences = options.stopSequences;
    }
    if (options.metadata !== undefined) {
      extracted.metadata = options.metadata;
    }

    if (options.tools) {
      extracted.tools = options.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters
      }));
    }

    if (options.toolChoice !== undefined) {
      extracted.tool_choice = options.toolChoice;
    }

    return extracted;
  }

  async *parseStream(stream) {
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            yield this.formatStreamChunk(parsed);
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  }

  formatStreamChunk(chunk) {
    // Convert Anthropic stream format to OpenAI-like format
    if (chunk.type === 'content_block_delta') {
      return {
        choices: [{
          delta: {
            content: chunk.delta?.text || ''
          },
          index: 0
        }]
      };
    } else if (chunk.type === 'message_stop') {
      return {
        choices: [{
          delta: {},
          finish_reason: 'stop',
          index: 0
        }]
      };
    }
    return chunk;
  }

  handleError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 401) {
        throw new Error('Invalid Anthropic API key');
      } else if (status === 429) {
        throw new Error('Anthropic rate limit exceeded');
      } else if (status === 400) {
        throw new Error(`Anthropic API error: ${data.error?.message || 'Bad request'}`);
      } else {
        throw new Error(`Anthropic API error: ${data.error?.message || error.message}`);
      }
    } else {
      throw new Error(`Network error: ${error.message}`);
    }
  }

  // Translate from OpenAI format to Anthropic format
  translateFromOpenAI(request) {
    const translated = {
      model: this.mapModel(request.model),
      messages: this.translateOpenAIMessages(request.messages),
      max_tokens: request.max_tokens || 4096
    };

    // Extract system message
    const systemMessage = request.messages?.find((m) => m.role === 'system');
    if (systemMessage) {
      translated.system = systemMessage.content;
      translated.messages = translated.messages.filter((m) => m.role !== 'system');
    }

    if (request.temperature) {
      translated.temperature = request.temperature;
    }
    if (request.top_p) {
      translated.top_p = request.top_p;
    }
    if (request.stop) {
      translated.stop_sequences = Array.isArray(request.stop) ? request.stop : [request.stop];
    }
    if (request.stream) {
      translated.stream = request.stream;
    }

    return translated;
  }

  translateOpenAIMessages(messages) {
    return messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
  }

  mapModel(model) {
    const modelMap = {
      'gpt-4': 'claude-3-opus-20240229',
      'gpt-4-turbo': 'claude-3-opus-20240229',
      'gpt-4-turbo-preview': 'claude-3-opus-20240229',
      'gpt-3.5-turbo': 'claude-3-sonnet-20240229',
      'gpt-3.5-turbo-16k': 'claude-3-sonnet-20240229'
    };

    return modelMap[model] || this.defaultModel;
  }
}

module.exports = AnthropicTranslator;