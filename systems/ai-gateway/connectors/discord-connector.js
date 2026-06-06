/**
 * Discord API Connector for BUMBA
 * Sprint 27: Handles Discord bot and webhook interactions
 */

const EventEmitter = require('events');

class DiscordConnector extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      token: options.token || process.env.DISCORD_TOKEN,
      baseURL: options.baseURL || 'https://discord.com/api/v10',
      webhookURL: options.webhookURL,
      timeout: options.timeout || 30000,
      ...options
    };
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.options.baseURL}${endpoint}`;
    const headers = {
      'Authorization': `Bot ${this.options.token}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(this.options.timeout)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Discord API error: ${response.status}`);
    }

    return response.json();
  }

  async sendMessage(channelId, content, options = {}) {
    return this.makeRequest(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: {
        content,
        ...options
      }
    });
  }

  async sendWebhookMessage(content, options = {}) {
    if (!this.options.webhookURL) {
      throw new Error('Webhook URL not configured');
    }

    const response = await fetch(this.options.webhookURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        ...options
      })
    });

    if (!response.ok) {
      throw new Error('Webhook request failed');
    }

    return response.status === 204 ? { success: true } : response.json();
  }

  async getGuild(guildId) {
    return this.makeRequest(`/guilds/${guildId}`);
  }

  async getChannel(channelId) {
    return this.makeRequest(`/channels/${channelId}`);
  }

  async createInvite(channelId, options = {}) {
    return this.makeRequest(`/channels/${channelId}/invites`, {
      method: 'POST',
      body: options
    });
  }
}

module.exports = DiscordConnector;