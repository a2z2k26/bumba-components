/**
 * Tool Bridge Basic Usage Examples
 *
 * These examples show how to use Tool Bridge with different AI providers
 * and various client libraries.
 */

// ============================================
// Example 1: Using with OpenAI SDK
// ============================================

const OpenAI = require('openai');

async function useWithOpenAI() {
  // Point OpenAI SDK to Tool Bridge instead of OpenAI directly
  const openai = new OpenAI({
    baseURL: 'http://localhost:3456/v1',
    apiKey: 'your-tool-bridge-key' // Or use actual OpenAI key
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Explain quantum computing in simple terms.' }
    ]
  });

  console.log(completion.choices[0].message.content);
}

// ============================================
// Example 2: Using with Anthropic SDK
// ============================================

const Anthropic = require('@anthropic-ai/sdk');

async function useWithAnthropic() {
  // Point Anthropic SDK to Tool Bridge
  const anthropic = new Anthropic({
    baseURL: 'http://localhost:3456/v1',
    apiKey: 'your-tool-bridge-key'
  });

  const message = await anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 1000,
    messages: [
      { role: 'user', content: 'What are the benefits of meditation?' }
    ]
  });

  console.log(message.content);
}

// ============================================
// Example 3: Using Unified API with Axios
// ============================================

const axios = require('axios');

async function useUnifiedAPI() {
  const toolBridgeAPI = axios.create({
    baseURL: 'http://localhost:3456',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-tool-bridge-key'
    }
  });

  // Use any provider through the same endpoint
  const providers = ['openai', 'anthropic', 'google'];

  for (const provider of providers) {
    try {
      const response = await toolBridgeAPI.post('/api/chat', {
        provider,
        model: provider === 'openai' ? 'gpt-3.5-turbo' :
               provider === 'anthropic' ? 'claude-3-sonnet-20240229' :
               'gemini-pro',
        messages: [
          { role: 'user', content: 'Write a haiku about coding' }
        ]
      });

      console.log(`${provider} response:`, response.data.response);
    } catch (error) {
      console.log(`${provider} not configured or errored`);
    }
  }
}

// ============================================
// Example 4: Streaming Responses
// ============================================

const EventSource = require('eventsource');

async function useStreaming() {
  const eventSource = new EventSource('http://localhost:3456/api/stream/chat', {
    headers: {
      'Authorization': 'Bearer your-tool-bridge-key'
    }
  });

  eventSource.onmessage = (event) => {
    if (event.data === '[DONE]') {
      eventSource.close();
      return;
    }

    const chunk = JSON.parse(event.data);
    process.stdout.write(chunk.content);
  };

  eventSource.onerror = (error) => {
    console.error('Stream error:', error);
    eventSource.close();
  };
}

// ============================================
// Example 5: List Available Models
// ============================================

async function listModels() {
  const response = await axios.get('http://localhost:3456/api/models');

  console.log('Available Models:');
  Object.entries(response.data.models).forEach(([provider, models]) => {
    console.log(`\n${provider}:`);
    models.forEach(model => console.log(`  - ${model}`));
  });
}

// ============================================
// Example 6: Error Handling
// ============================================

async function robustAPICall() {
  try {
    const response = await axios.post('http://localhost:3456/api/chat', {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello!' }],
      temperature: 0.7,
      max_tokens: 150
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error
      console.error('API Error:', error.response.data);

      if (error.response.status === 401) {
        console.log('Authentication failed. Check your API key.');
      } else if (error.response.status === 429) {
        console.log('Rate limit exceeded. Try again later.');
      } else if (error.response.status === 503) {
        console.log('Provider unavailable. Try another provider.');
      }
    } else if (error.request) {
      // No response received
      console.error('No response from Tool Bridge. Is it running?');
    } else {
      // Request setup error
      console.error('Request error:', error.message);
    }
  }
}

// ============================================
// Run Examples (uncomment to test)
// ============================================

// useWithOpenAI().catch(console.error);
// useWithAnthropic().catch(console.error);
// useUnifiedAPI().catch(console.error);
// useStreaming().catch(console.error);
// listModels().catch(console.error);
// robustAPICall().catch(console.error);

module.exports = {
  useWithOpenAI,
  useWithAnthropic,
  useUnifiedAPI,
  useStreaming,
  listModels,
  robustAPICall
};
