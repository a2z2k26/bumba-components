/**
 * Notion API Connector for BUMBA
 * Handles all interactions with Notion's API for workspace management
 */

const EventEmitter = require('events');

class NotionConnector extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      apiKey: options.apiKey || process.env.NOTION_API_KEY,
      baseURL: options.baseURL || 'https://api.notion.com/v1',
      version: options.version || '2022-06-28',
      timeout: options.timeout || 30000,
      maxRetries: options.maxRetries || 3,
      ...options
    };

    // Validate API key
    if (!this.options.apiKey) {
      throw new Error('Notion API key is required');
    }

    // Rate limiting (Notion has 3 requests per second limit)
    this.rateLimits = {
      requestsPerSecond: 3,
      lastRequestTime: 0,
      minInterval: 334 // milliseconds between requests
    };

    // Cache for frequently accessed data
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute

    // Current workspace info
    this.currentUser = null;
    this.workspaces = [];
  }

  /**
   * Make authenticated request to Notion API
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.options.baseURL}${endpoint}`;

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.rateLimits.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimits.minInterval) {
      await this.delay(this.rateLimits.minInterval - timeSinceLastRequest);
    }
    this.rateLimits.lastRequestTime = Date.now();

    const headers = {
      'Authorization': `Bearer ${this.options.apiKey}`,
      'Notion-Version': this.options.version,
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Check cache for GET requests
    const cacheKey = `${options.method || 'GET'}:${url}:${JSON.stringify(options.body)}`;
    if ((options.method || 'GET') === 'GET' && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    let lastError;
    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: options.method || 'GET',
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(this.options.timeout)
        });

        if (response.status === 429) {
          // Rate limited
          const retryAfter = response.headers.get('retry-after') || 10;
          await this.delay(retryAfter * 1000);
          continue;
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || `API error: ${response.status}`);
        }

        const data = await response.json();

        // Cache successful GET requests
        if ((options.method || 'GET') === 'GET') {
          this.cache.set(cacheKey, { data, timestamp: Date.now() });
        }

        return data;

      } catch (error) {
        lastError = error;

        if (attempt < this.options.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError;
  }

  /**
   * Get current user
   */
  async getUser() {
    if (this.currentUser) {
      return this.currentUser;
    }

    this.currentUser = await this.makeRequest('/users/me');
    this.emit('user', this.currentUser);
    return this.currentUser;
  }

  /**
   * List all users
   */
  async listUsers(options = {}) {
    const params = new URLSearchParams();
    if (options.startCursor) params.append('start_cursor', options.startCursor);
    if (options.pageSize) params.append('page_size', Math.min(options.pageSize, 100));

    const endpoint = `/users${params.toString() ? '?' + params : ''}`;
    return this.makeRequest(endpoint);
  }

  /**
   * Database operations
   */
  async createDatabase(pageId, properties, options = {}) {
    const body = {
      parent: { page_id: pageId },
      title: options.title ? [{ text: { content: options.title } }] : undefined,
      properties,
      icon: options.icon,
      cover: options.cover
    };

    return this.makeRequest('/databases', {
      method: 'POST',
      body
    });
  }

  async getDatabase(databaseId) {
    return this.makeRequest(`/databases/${databaseId}`);
  }

  async updateDatabase(databaseId, updates) {
    return this.makeRequest(`/databases/${databaseId}`, {
      method: 'PATCH',
      body: updates
    });
  }

  async queryDatabase(databaseId, options = {}) {
    const body = {
      filter: options.filter,
      sorts: options.sorts,
      start_cursor: options.startCursor,
      page_size: Math.min(options.pageSize || 100, 100)
    };

    return this.makeRequest(`/databases/${databaseId}/query`, {
      method: 'POST',
      body
    });
  }

  /**
   * Page operations
   */
  async createPage(parent, properties, children = []) {
    const body = {
      parent,
      properties,
      children,
      icon: properties.icon,
      cover: properties.cover
    };

    return this.makeRequest('/pages', {
      method: 'POST',
      body
    });
  }

  async getPage(pageId) {
    return this.makeRequest(`/pages/${pageId}`);
  }

  async updatePage(pageId, properties) {
    return this.makeRequest(`/pages/${pageId}`, {
      method: 'PATCH',
      body: { properties }
    });
  }

  async archivePage(pageId, archived = true) {
    return this.makeRequest(`/pages/${pageId}`, {
      method: 'PATCH',
      body: { archived }
    });
  }

  /**
   * Block operations
   */
  async getBlock(blockId) {
    return this.makeRequest(`/blocks/${blockId}`);
  }

  async getBlockChildren(blockId, options = {}) {
    const params = new URLSearchParams();
    if (options.startCursor) params.append('start_cursor', options.startCursor);
    if (options.pageSize) params.append('page_size', Math.min(options.pageSize || 100, 100));

    const endpoint = `/blocks/${blockId}/children${params.toString() ? '?' + params : ''}`;
    return this.makeRequest(endpoint);
  }

  async appendBlockChildren(blockId, children) {
    return this.makeRequest(`/blocks/${blockId}/children`, {
      method: 'PATCH',
      body: { children }
    });
  }

  async updateBlock(blockId, updates) {
    return this.makeRequest(`/blocks/${blockId}`, {
      method: 'PATCH',
      body: updates
    });
  }

  async deleteBlock(blockId) {
    return this.makeRequest(`/blocks/${blockId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Search across workspace
   */
  async search(query, options = {}) {
    const body = {
      query,
      filter: options.filter,
      sort: options.sort,
      start_cursor: options.startCursor,
      page_size: Math.min(options.pageSize || 100, 100)
    };

    return this.makeRequest('/search', {
      method: 'POST',
      body
    });
  }

  /**
   * Comment operations
   */
  async createComment(parentId, richText) {
    const body = {
      parent: { page_id: parentId },
      rich_text: richText
    };

    return this.makeRequest('/comments', {
      method: 'POST',
      body
    });
  }

  async getComments(blockId, options = {}) {
    const params = new URLSearchParams({
      block_id: blockId
    });

    if (options.startCursor) params.append('start_cursor', options.startCursor);
    if (options.pageSize) params.append('page_size', Math.min(options.pageSize || 100, 100));

    return this.makeRequest(`/comments?${params}`);
  }

  /**
   * Helper: Create different block types
   */
  createTextBlock(text, type = 'paragraph') {
    return {
      type,
      [type]: {
        rich_text: this.formatRichText(text)
      }
    };
  }

  createHeadingBlock(text, level = 1) {
    const type = `heading_${level}`;
    return {
      type,
      [type]: {
        rich_text: this.formatRichText(text),
        is_toggleable: false
      }
    };
  }

  createBulletedListBlock(text) {
    return {
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: this.formatRichText(text)
      }
    };
  }

  createNumberedListBlock(text) {
    return {
      type: 'numbered_list_item',
      numbered_list_item: {
        rich_text: this.formatRichText(text)
      }
    };
  }

  createToDoBlock(text, checked = false) {
    return {
      type: 'to_do',
      to_do: {
        rich_text: this.formatRichText(text),
        checked
      }
    };
  }

  createToggleBlock(text, children = []) {
    return {
      type: 'toggle',
      toggle: {
        rich_text: this.formatRichText(text),
        children
      }
    };
  }

  createCodeBlock(code, language = 'javascript') {
    return {
      type: 'code',
      code: {
        rich_text: this.formatRichText(code),
        language
      }
    };
  }

  createQuoteBlock(text) {
    return {
      type: 'quote',
      quote: {
        rich_text: this.formatRichText(text)
      }
    };
  }

  createCalloutBlock(text, emoji = '') {
    return {
      type: 'callout',
      callout: {
        rich_text: this.formatRichText(text),
        icon: {
          type: 'emoji',
          emoji
        }
      }
    };
  }

  createDividerBlock() {
    return {
      type: 'divider',
      divider: {}
    };
  }

  createTableOfContentsBlock() {
    return {
      type: 'table_of_contents',
      table_of_contents: {}
    };
  }

  createEmbedBlock(url) {
    return {
      type: 'embed',
      embed: { url }
    };
  }

  createBookmarkBlock(url, caption = null) {
    return {
      type: 'bookmark',
      bookmark: {
        url,
        caption: caption ? this.formatRichText(caption) : undefined
      }
    };
  }

  createImageBlock(url, caption = null) {
    return {
      type: 'image',
      image: {
        type: 'external',
        external: { url },
        caption: caption ? this.formatRichText(caption) : undefined
      }
    };
  }

  createVideoBlock(url, caption = null) {
    return {
      type: 'video',
      video: {
        type: 'external',
        external: { url },
        caption: caption ? this.formatRichText(caption) : undefined
      }
    };
  }

  createFileBlock(url, caption = null) {
    return {
      type: 'file',
      file: {
        type: 'external',
        external: { url },
        caption: caption ? this.formatRichText(caption) : undefined
      }
    };
  }

  createTableBlock(width, children = []) {
    return {
      type: 'table',
      table: {
        table_width: width,
        has_column_header: false,
        has_row_header: false,
        children
      }
    };
  }

  createTableRowBlock(cells) {
    return {
      type: 'table_row',
      table_row: {
        cells: cells.map(cell => this.formatRichText(cell))
      }
    };
  }

  /**
   * Helper: Format rich text
   */
  formatRichText(text, options = {}) {
    if (typeof text === 'string') {
      return [{
        type: 'text',
        text: { content: text },
        annotations: {
          bold: options.bold || false,
          italic: options.italic || false,
          strikethrough: options.strikethrough || false,
          underline: options.underline || false,
          code: options.code || false,
          color: options.color || 'default'
        }
      }];
    }

    if (Array.isArray(text)) {
      return text;
    }

    return [text];
  }

  /**
   * Helper: Create database properties
   */
  createTitleProperty(name = 'Name') {
    return {
      [name]: { title: {} }
    };
  }

  createTextProperty(name) {
    return {
      [name]: { rich_text: {} }
    };
  }

  createNumberProperty(name, format = 'number') {
    return {
      [name]: {
        number: { format }
      }
    };
  }

  createSelectProperty(name, options) {
    return {
      [name]: {
        select: {
          options: options.map(opt => ({
            name: opt.name || opt,
            color: opt.color || 'default'
          }))
        }
      }
    };
  }

  createMultiSelectProperty(name, options) {
    return {
      [name]: {
        multi_select: {
          options: options.map(opt => ({
            name: opt.name || opt,
            color: opt.color || 'default'
          }))
        }
      }
    };
  }

  createDateProperty(name) {
    return {
      [name]: { date: {} }
    };
  }

  createPersonProperty(name) {
    return {
      [name]: { people: {} }
    };
  }

  createFilesProperty(name) {
    return {
      [name]: { files: {} }
    };
  }

  createCheckboxProperty(name) {
    return {
      [name]: { checkbox: {} }
    };
  }

  createURLProperty(name) {
    return {
      [name]: { url: {} }
    };
  }

  createEmailProperty(name) {
    return {
      [name]: { email: {} }
    };
  }

  createPhoneProperty(name) {
    return {
      [name]: { phone_number: {} }
    };
  }

  createFormulaProperty(name, expression) {
    return {
      [name]: {
        formula: { expression }
      }
    };
  }

  createRelationProperty(name, databaseId, options = {}) {
    return {
      [name]: {
        relation: {
          database_id: databaseId,
          type: options.type || 'single_property',
          single_property: options.singleProperty,
          dual_property: options.dualProperty
        }
      }
    };
  }

  createRollupProperty(name, relationProperty, targetProperty, function_) {
    return {
      [name]: {
        rollup: {
          relation_property_name: relationProperty,
          relation_property_id: undefined,
          rollup_property_name: targetProperty,
          rollup_property_id: undefined,
          function: function_
        }
      }
    };
  }

  createStatusProperty(name, options) {
    return {
      [name]: {
        status: {
          options: options.map(opt => ({
            name: opt.name || opt,
            color: opt.color || 'default'
          })),
          groups: options.groups || []
        }
      }
    };
  }

  /**
   * Pagination helper
   */
  async *paginate(method, ...args) {
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
      const lastArg = args[args.length - 1] || {};
      const options = { ...lastArg, startCursor };
      args[args.length - 1] = options;

      const response = await method.call(this, ...args);

      yield response;

      hasMore = response.has_more;
      startCursor = response.next_cursor;
    }
  }

  /**
   * Batch operations helper
   */
  async batchOperation(items, operation, batchSize = 10) {
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(item => operation(item).catch(error => ({ error, item })))
      );
      results.push(...batchResults);

      // Rate limiting between batches
      if (i + batchSize < items.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * Export database to CSV
   */
  async exportDatabaseToCSV(databaseId) {
    const database = await this.getDatabase(databaseId);
    const properties = Object.keys(database.properties);

    const rows = [];
    const pages = this.paginate(this.queryDatabase, databaseId);

    for await (const response of pages) {
      for (const page of response.results) {
        const row = {};
        for (const prop of properties) {
          row[prop] = this.extractPropertyValue(page.properties[prop]);
        }
        rows.push(row);
      }
    }

    // Convert to CSV
    const headers = properties.join(',');
    const csvRows = rows.map(row =>
      properties.map(prop => `"${(row[prop] || '').toString().replace(/"/g, '""')}"`).join(',')
    );

    return [headers, ...csvRows].join('\n');
  }

  /**
   * Extract property value
   */
  extractPropertyValue(property) {
    if (!property) return null;

    switch (property.type) {
      case 'title':
        return property.title.map(t => t.plain_text).join('');
      case 'rich_text':
        return property.rich_text.map(t => t.plain_text).join('');
      case 'number':
        return property.number;
      case 'select':
        return property.select?.name;
      case 'multi_select':
        return property.multi_select.map(s => s.name).join(', ');
      case 'date':
        return property.date?.start;
      case 'people':
        return property.people.map(p => p.name || p.id).join(', ');
      case 'files':
        return property.files.map(f => f.name).join(', ');
      case 'checkbox':
        return property.checkbox;
      case 'url':
        return property.url;
      case 'email':
        return property.email;
      case 'phone_number':
        return property.phone_number;
      case 'formula':
        return property.formula.string || property.formula.number || property.formula.boolean;
      case 'relation':
        return property.relation.map(r => r.id).join(', ');
      case 'rollup':
        return property.rollup.array?.map(v => this.extractPropertyValue(v)).join(', ');
      case 'created_time':
        return property.created_time;
      case 'created_by':
        return property.created_by.name || property.created_by.id;
      case 'last_edited_time':
        return property.last_edited_time;
      case 'last_edited_by':
        return property.last_edited_by.name || property.last_edited_by.id;
      case 'status':
        return property.status?.name;
      default:
        return JSON.stringify(property);
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate API key
   */
  async validateApiKey() {
    try {
      const user = await this.getUser();
      return {
        valid: true,
        user: user.name || user.id,
        type: user.type
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = NotionConnector;