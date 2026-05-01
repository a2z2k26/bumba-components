/**
 * OpenAI Translator
 * Handles OpenAI API interactions and protocol translation
 */

const axios = require('axios');

class OpenAITranslator {
  constructor(config = {}) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.models = config.models || ['gpt-4', 'gpt-3.5-turbo'];
    this.defaultModel = config.defaultModel || 'gpt-3.5-turbo';
  }

  isEnabled() {
    return this.config.enabled && !!this.apiKey;
  }

  getModels() {
    return this.models;
  }

  async handle(request) {
    // Direct passthrough for OpenAI-compatible requests
    if (!this.isEnabled()) {
      throw new Error('OpenAI API is not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        request,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
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
      ...this.extractOptions(options)
    };

    return await this.handle(request);
  }

  async stream(messages, options = {}) {
    const request = {
      model: options.model || this.defaultModel,
      messages: this.formatMessages(messages),
      stream: true,
      ...this.extractOptions(options)
    };

    const response = await axios.post(
      `${this.baseURL}/chat/completions`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
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
      return {
        role: msg.role || 'user',
        content: msg.content,
        ...(msg.name && { name: msg.name }),
        ...(msg.function_call && { function_call: msg.function_call }),
        ...(msg.tool_calls && { tool_calls: msg.tool_calls })
      };
    });
  }

  extractOptions(options) {
    const extracted = {};

    if (options.temperature !== undefined) {
      extracted.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      extracted.max_tokens = options.maxTokens;
    }
    if (options.topP !== undefined) {
      extracted.top_p = options.topP;
    }
    if (options.frequencyPenalty !== undefined) {
      extracted.frequency_penalty = options.frequencyPenalty;
    }
    if (options.presencePenalty !== undefined) {
      extracted.presence_penalty = options.presencePenalty;
    }
    if (options.stop !== undefined) {
      extracted.stop = options.stop;
    }
    if (options.n !== undefined) {
      extracted.n = options.n;
    }

    if (options.tools) {
      extracted.tools = options.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
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
          if (data === '[DONE]') {
            return;
          }
          try {
            yield JSON.parse(data);
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  }

  handleError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 401) {
        throw new Error('Invalid OpenAI API key');
      } else if (status === 429) {
        throw new Error('OpenAI rate limit exceeded');
      } else if (status === 400) {
        throw new Error(`OpenAI API error: ${data.error?.message || 'Bad request'}`);
      } else {
        throw new Error(`OpenAI API error: ${data.error?.message || error.message}`);
      }
    } else {
      throw new Error(`Network error: ${error.message}`);
    }
  }

  // Translate from other formats to OpenAI format
  translateFromAnthropic(request) {
    const translated = {
      model: this.mapModel(request.model),
      messages: this.translateAnthropicMessages(request.messages)
    };

    if (request.system) {
      translated.messages.unshift({
        role: 'system',
        content: request.system
      });
    }

    if (request.max_tokens) {
      translated.max_tokens = request.max_tokens;
    }
    if (request.temperature) {
      translated.temperature = request.temperature;
    }
    if (request.top_p) {
      translated.top_p = request.top_p;
    }
    if (request.stream) {
      translated.stream = request.stream;
    }

    return translated;
  }

  translateAnthropicMessages(messages) {
    return messages.map((msg) => ({
      role: msg.role === 'human' ? 'user' : msg.role,
      content: msg.content
    }));
  }

  mapModel(model) {
    const modelMap = {
      'claude-3-opus-20240229': 'gpt-4',
      'claude-3-sonnet-20240229': 'gpt-4',
      'claude-3-haiku-20240307': 'gpt-3.5-turbo',
      'claude-2.1': 'gpt-3.5-turbo'
    };

    return modelMap[model] || this.defaultModel;
  }
}

module.exports = OpenAITranslator;