/**
 * Database Connector for BUMBA
 * Sprint 30: Unified interface for PostgreSQL, MySQL, MongoDB
 */

const EventEmitter = require('events');

class DatabaseConnector extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      type: options.type || 'postgresql',
      host: options.host || 'localhost',
      port: options.port,
      database: options.database,
      username: options.username || process.env.DB_USER,
      password: options.password || process.env.DB_PASSWORD,
      connectionString: options.connectionString || process.env.DATABASE_URL,
      ...options
    };
    
    this.connection = null;
    this.client = null;
  }

  async connect() {
    switch (this.options.type) {
      case 'postgresql':
      case 'postgres':
        return this.connectPostgreSQL();
      case 'mysql':
        return this.connectMySQL();
      case 'mongodb':
        return this.connectMongoDB();
      case 'sqlite':
        return this.connectSQLite();
      default:
        throw new Error(`Unsupported database type: ${this.options.type}`);
    }
  }

  async connectPostgreSQL() {
    const { Client } = require('pg');
    
    this.client = new Client({
      connectionString: this.options.connectionString,
      host: this.options.host,
      port: this.options.port || 5432,
      database: this.options.database,
      user: this.options.username,
      password: this.options.password
    });
    
    await this.client.connect();
    this.emit('connected', { type: 'postgresql' });
    return this.client;
  }

  async connectMySQL() {
    const mysql = require('mysql2/promise');
    
    this.connection = await mysql.createConnection({
      host: this.options.host,
      port: this.options.port || 3306,
      database: this.options.database,
      user: this.options.username,
      password: this.options.password
    });
    
    this.emit('connected', { type: 'mysql' });
    return this.connection;
  }

  async connectMongoDB() {
    const { MongoClient } = require('mongodb');
    
    const url = this.options.connectionString || 
                `mongodb://${this.options.username}:${this.options.password}@${this.options.host}:${this.options.port || 27017}/${this.options.database}`;
    
    this.client = new MongoClient(url);
    await this.client.connect();
    this.connection = this.client.db(this.options.database);
    
    this.emit('connected', { type: 'mongodb' });
    return this.connection;
  }

  async connectSQLite() {
    const sqlite3 = require('sqlite3').verbose();
    const { open } = require('sqlite');
    
    this.connection = await open({
      filename: this.options.filename || ':memory:',
      driver: sqlite3.Database
    });
    
    this.emit('connected', { type: 'sqlite' });
    return this.connection;
  }

  async query(sql, params = []) {
    if (!this.connection && !this.client) {
      await this.connect();
    }
    
    switch (this.options.type) {
      case 'postgresql':
      case 'postgres':
        const pgResult = await this.client.query(sql, params);
        return pgResult.rows;
        
      case 'mysql':
        const [rows] = await this.connection.execute(sql, params);
        return rows;
        
      case 'sqlite':
        return await this.connection.all(sql, params);
        
      case 'mongodb':
        throw new Error('Use MongoDB-specific methods for MongoDB queries');
        
      default:
        throw new Error('Database not connected');
    }
  }

  // MongoDB specific methods
  async find(collection, filter = {}, options = {}) {
    if (this.options.type !== 'mongodb') {
      throw new Error('find() is only available for MongoDB');
    }
    
    const coll = this.connection.collection(collection);
    return await coll.find(filter, options).toArray();
  }

  async insertOne(collection, document) {
    if (this.options.type !== 'mongodb') {
      throw new Error('insertOne() is only available for MongoDB');
    }
    
    const coll = this.connection.collection(collection);
    return await coll.insertOne(document);
  }

  async updateOne(collection, filter, update) {
    if (this.options.type !== 'mongodb') {
      throw new Error('updateOne() is only available for MongoDB');
    }
    
    const coll = this.connection.collection(collection);
    return await coll.updateOne(filter, { $set: update });
  }

  async deleteOne(collection, filter) {
    if (this.options.type !== 'mongodb') {
      throw new Error('deleteOne() is only available for MongoDB');
    }
    
    const coll = this.connection.collection(collection);
    return await coll.deleteOne(filter);
  }

  // Generic CRUD operations for SQL databases
  async insert(table, data) {
    if (this.options.type === 'mongodb') {
      return this.insertOne(table, data);
    }
    
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => 
      this.options.type === 'postgresql' ? `$${i + 1}` : '?'
    );
    
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    return await this.query(sql, values);
  }

  async select(table, conditions = {}, options = {}) {
    if (this.options.type === 'mongodb') {
      return this.find(table, conditions, options);
    }
    
    let sql = `SELECT ${options.columns || '*'} FROM ${table}`;
    const params = [];
    
    if (Object.keys(conditions).length > 0) {
      const whereClause = Object.keys(conditions).map((key, i) => {
        params.push(conditions[key]);
        return `${key} = ${this.options.type === 'postgresql' ? `$${i + 1}` : '?'}`;
      }).join(' AND ');
      sql += ` WHERE ${whereClause}`;
    }
    
    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }
    
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    
    return await this.query(sql, params);
  }

  async update(table, data, conditions) {
    if (this.options.type === 'mongodb') {
      return this.updateOne(table, conditions, data);
    }
    
    const setClause = Object.keys(data).map((key, i) => 
      `${key} = ${this.options.type === 'postgresql' ? `$${i + 1}` : '?'}`
    ).join(', ');
    
    const whereClause = Object.keys(conditions).map((key, i) => {
      const index = Object.keys(data).length + i + 1;
      return `${key} = ${this.options.type === 'postgresql' ? `$${index}` : '?'}`;
    }).join(' AND ');
    
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    const params = [...Object.values(data), ...Object.values(conditions)];
    
    return await this.query(sql, params);
  }

  async delete(table, conditions) {
    if (this.options.type === 'mongodb') {
      return this.deleteOne(table, conditions);
    }
    
    const whereClause = Object.keys(conditions).map((key, i) => 
      `${key} = ${this.options.type === 'postgresql' ? `$${i + 1}` : '?'}`
    ).join(' AND ');
    
    const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
    const params = Object.values(conditions);
    
    return await this.query(sql, params);
  }

  async disconnect() {
    if (this.client) {
      if (this.options.type === 'mongodb') {
        await this.client.close();
      } else if (this.options.type === 'postgresql') {
        await this.client.end();
      }
    }
    
    if (this.connection) {
      if (this.options.type === 'mysql') {
        await this.connection.end();
      } else if (this.options.type === 'sqlite') {
        await this.connection.close();
      }
    }
    
    this.client = null;
    this.connection = null;
    this.emit('disconnected');
  }

  async transaction(callback) {
    if (this.options.type === 'mongodb') {
      const session = this.client.startSession();
      try {
        await session.withTransaction(callback);
      } finally {
        await session.endSession();
      }
    } else {
      await this.query('BEGIN');
      try {
        await callback();
        await this.query('COMMIT');
      } catch (error) {
        await this.query('ROLLBACK');
        throw error;
      }
    }
  }
}

module.exports = DatabaseConnector;