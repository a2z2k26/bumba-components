/**
 * SQLite Storage Adapter for Unified Memory System
 * Provides persistent storage with FTS5 full-text search
 * Sprint 1.2: SQLite Persistence Layer
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { logger } = require('@bumba/shared');

class SQLiteStorageAdapter {
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.join(process.cwd(), '.bumba', 'memory.db');
    this.db = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Open database with WAL mode for better concurrency
      this.db = new sqlite3(this.dbPath);

      // Enable WAL mode
      this.db.pragma('journal_mode = WAL');

      // Create schema
      this.createSchema();

      this.initialized = true;
      logger.info(` SQLite storage initialized: ${this.dbPath}`);

      return true;
    } catch (error) {
      logger.error('Failed to initialize SQLite storage:', error);
      throw error;
    }
  }

  createSchema() {
    // Create tables in a transaction
    const transaction = this.db.transaction(() => {
      // ===== CONTEXTS TABLE =====
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS contexts (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          access_count INTEGER DEFAULT 0,
          last_accessed INTEGER NOT NULL,
          metadata TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        )
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_contexts_timestamp
        ON contexts(timestamp DESC)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_contexts_last_accessed
        ON contexts(last_accessed DESC)
      `);

      // ===== KNOWLEDGE TABLE =====
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS knowledge (
          key TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          confidence REAL DEFAULT 0.8,
          source TEXT DEFAULT 'unknown',
          tags TEXT,
          timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          metadata TEXT
        )
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_knowledge_timestamp
        ON knowledge(timestamp DESC)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_knowledge_confidence
        ON knowledge(confidence DESC)
      `);

      // ===== CONVERSATIONS TABLE =====
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          messages TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          message_count INTEGER DEFAULT 0,
          metadata TEXT
        )
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_conversations_updated
        ON conversations(updated_at DESC)
      `);

      // ===== TASKS TABLE (for coordination) =====
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          task_id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          complexity INTEGER,
          title TEXT,
          requirements TEXT,
          constraints TEXT,
          context TEXT,
          progress TEXT,
          results TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          created_by TEXT,
          updated_by TEXT,
          metadata TEXT
        )
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_status
        ON tasks(status)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_type
        ON tasks(type)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_updated
        ON tasks(updated_at DESC)
      `);

      logger.info(' SQLite schema created successfully');
    });

    transaction();
  }

  // ===== CONTEXT OPERATIONS =====

  storeContext(contextId, context) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO contexts (id, data, timestamp, access_count, last_accessed, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        contextId,
        JSON.stringify(context.data || context),
        context.timestamp || Date.now(),
        context.accessCount || 0,
        context.lastAccessed || Date.now(),
        JSON.stringify(context.metadata || {})
      );

      return {
        id: contextId,
        changes: result.changes
      };
    } catch (error) {
      logger.error('Failed to store context:', error);
      throw error;
    }
  }

  retrieveContext(contextId) {
    try {
      // Retrieve and increment access count
      const updateStmt = this.db.prepare(`
        UPDATE contexts
        SET access_count = access_count + 1,
            last_accessed = ?
        WHERE id = ?
      `);

      updateStmt.run(Date.now(), contextId);

      const selectStmt = this.db.prepare(`
        SELECT * FROM contexts WHERE id = ?
      `);

      const row = selectStmt.get(contextId);

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        data: JSON.parse(row.data),
        timestamp: row.timestamp,
        accessCount: row.access_count,
        lastAccessed: row.last_accessed,
        metadata: JSON.parse(row.metadata || '{}')
      };
    } catch (error) {
      logger.error('Failed to retrieve context:', error);
      throw error;
    }
  }

  cleanupExpiredContexts(maxAge = 3600000) {
    try {
      const cutoff = Date.now() - maxAge;

      const stmt = this.db.prepare(`
        DELETE FROM contexts WHERE timestamp < ?
      `);

      const result = stmt.run(cutoff);

      logger.info(` Cleaned up ${result.changes} expired contexts`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup contexts:', error);
      throw error;
    }
  }

  // ===== KNOWLEDGE OPERATIONS =====

  storeKnowledge(key, knowledge) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO knowledge (key, data, confidence, source, tags, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        key,
        JSON.stringify(knowledge.data || knowledge),
        knowledge.confidence || 0.8,
        knowledge.source || 'unknown',
        JSON.stringify(knowledge.tags || []),
        JSON.stringify(knowledge.metadata || {})
      );

      return {
        key,
        changes: result.changes
      };
    } catch (error) {
      logger.error('Failed to store knowledge:', error);
      throw error;
    }
  }

  retrieveKnowledge(key) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM knowledge WHERE key = ?
      `);

      const row = stmt.get(key);

      if (!row) {
        return null;
      }

      return {
        key: row.key,
        data: JSON.parse(row.data),
        confidence: row.confidence,
        source: row.source,
        tags: JSON.parse(row.tags || '[]'),
        timestamp: row.timestamp,
        metadata: JSON.parse(row.metadata || '{}')
      };
    } catch (error) {
      logger.error('Failed to retrieve knowledge:', error);
      throw error;
    }
  }

  searchKnowledge(query, options = {}) {
    try {
      // Simple text search (FTS5 will be added in Sprint 1.3)
      const tags = options.tags || [];
      const minConfidence = options.minConfidence || 0;

      let sql = 'SELECT * FROM knowledge WHERE 1=1';
      const params = [];

      // Text search in key and data
      if (query) {
        sql += ` AND (key LIKE ? OR data LIKE ?)`;
        const queryPattern = `%${query}%`;
        params.push(queryPattern, queryPattern);
      }

      // Tag filtering
      if (tags.length > 0) {
        tags.forEach(tag => {
          sql += ` AND tags LIKE ?`;
          params.push(`%"${tag}"%`);
        });
      }

      // Confidence filtering
      if (minConfidence > 0) {
        sql += ` AND confidence >= ?`;
        params.push(minConfidence);
      }

      sql += ` ORDER BY confidence DESC, timestamp DESC LIMIT ?`;
      params.push(options.limit || 10);

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);

      return rows.map(row => ({
        key: row.key,
        knowledge: {
          data: JSON.parse(row.data),
          confidence: row.confidence,
          source: row.source,
          tags: JSON.parse(row.tags || '[]'),
          timestamp: row.timestamp
        },
        relevanceScore: row.confidence
      }));
    } catch (error) {
      logger.error('Failed to search knowledge:', error);
      throw error;
    }
  }

  // ===== CONVERSATION OPERATIONS =====

  storeConversation(conversationId, messages) {
    try {
      const messagesArray = Array.isArray(messages) ? messages : [messages];

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO conversations (id, messages, message_count, updated_at)
        VALUES (?, ?, ?, ?)
      `);

      const result = stmt.run(
        conversationId,
        JSON.stringify(messagesArray),
        messagesArray.length,
        Date.now()
      );

      return {
        id: conversationId,
        messageCount: messagesArray.length,
        changes: result.changes
      };
    } catch (error) {
      logger.error('Failed to store conversation:', error);
      throw error;
    }
  }

  retrieveConversation(conversationId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM conversations WHERE id = ?
      `);

      const row = stmt.get(conversationId);

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        messages: JSON.parse(row.messages),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        messageCount: row.message_count
      };
    } catch (error) {
      logger.error('Failed to retrieve conversation:', error);
      throw error;
    }
  }

  // ===== TASK OPERATIONS (for Claude ↔ BUMBA coordination) =====

  storeTask(taskId, task) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO tasks (
          task_id, type, status, complexity, title, requirements,
          constraints, context, created_by, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        taskId,
        task.type,
        task.status || 'pending',
        task.complexity,
        task.title,
        JSON.stringify(task.requirements || []),
        JSON.stringify(task.constraints || []),
        JSON.stringify(task.context || {}),
        task.createdBy || 'unknown',
        JSON.stringify(task.metadata || {})
      );

      return {
        taskId,
        changes: result.changes
      };
    } catch (error) {
      logger.error('Failed to store task:', error);
      throw error;
    }
  }

  updateTaskProgress(taskId, updates) {
    try {
      const stmt = this.db.prepare(`
        UPDATE tasks
        SET status = COALESCE(?, status),
            progress = COALESCE(?, progress),
            results = COALESCE(?, results),
            updated_at = ?,
            updated_by = COALESCE(?, updated_by)
        WHERE task_id = ?
      `);

      const result = stmt.run(
        updates.status,
        JSON.stringify(updates.progress),
        JSON.stringify(updates.results),
        Date.now(),
        updates.updatedBy,
        taskId
      );

      return {
        taskId,
        changes: result.changes
      };
    } catch (error) {
      logger.error('Failed to update task progress:', error);
      throw error;
    }
  }

  getTaskStatus(taskId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM tasks WHERE task_id = ?
      `);

      const row = stmt.get(taskId);

      if (!row) {
        return null;
      }

      return {
        taskId: row.task_id,
        type: row.type,
        status: row.status,
        complexity: row.complexity,
        title: row.title,
        requirements: JSON.parse(row.requirements || '[]'),
        constraints: JSON.parse(row.constraints || '[]'),
        context: JSON.parse(row.context || '{}'),
        progress: JSON.parse(row.progress || 'null'),
        results: JSON.parse(row.results || 'null'),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by,
        updatedBy: row.updated_by
      };
    } catch (error) {
      logger.error('Failed to get task status:', error);
      throw error;
    }
  }

  listTasks(options = {}) {
    try {
      let sql = 'SELECT * FROM tasks WHERE 1=1';
      const params = [];

      // Filter by status
      if (options.status && options.status !== 'all') {
        sql += ` AND status = ?`;
        params.push(options.status);
      }

      // Filter by type
      if (options.type && options.type !== 'all') {
        sql += ` AND type = ?`;
        params.push(options.type);
      }

      // Sort
      const sortBy = options.sortBy || 'updated_at';
      const sortOrder = options.sortOrder || 'DESC';
      sql += ` ORDER BY ${sortBy} ${sortOrder}`;

      // Pagination
      const limit = options.limit || 20;
      const offset = options.offset || 0;
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);

      return rows.map(row => ({
        taskId: row.task_id,
        type: row.type,
        status: row.status,
        complexity: row.complexity,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      logger.error('Failed to list tasks:', error);
      throw error;
    }
  }

  // ===== UTILITY METHODS =====

  beginTransaction() {
    return this.db.transaction((callback) => callback());
  }

  vacuum() {
    this.db.exec('VACUUM');
    logger.info(' Database vacuumed');
  }

  getStats() {
    try {
      const stats = {
        contexts: this.db.prepare('SELECT COUNT(*) as count FROM contexts').get().count,
        knowledge: this.db.prepare('SELECT COUNT(*) as count FROM knowledge').get().count,
        conversations: this.db.prepare('SELECT COUNT(*) as count FROM conversations').get().count,
        tasks: this.db.prepare('SELECT COUNT(*) as count FROM tasks').get().count,
        dbSize: fs.statSync(this.dbPath).size
      };

      return stats;
    } catch (error) {
      logger.error('Failed to get stats:', error);
      return {};
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.initialized = false;
      logger.info(' SQLite storage closed');
    }
  }
}

module.exports = { SQLiteStorageAdapter };
