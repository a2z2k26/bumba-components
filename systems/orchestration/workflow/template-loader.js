/**
 * BUMBA Workflow Template Loader
 * Loads and manages workflow templates from YAML files
 */

const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const WorkflowYamlParser = require('./workflow-yaml-parser');

class TemplateLoader {
  constructor(config = {}) {
    this.parser = new WorkflowYamlParser();
    this.templatesDir = config.templatesDir || path.join(__dirname, 'templates');
    this.cache = new Map();
    this.categories = ['strategic', 'engineering', 'design', 'qa', 'cross-department'];
  }

  /**
   * Load a template by name or path
   */
  async loadTemplate(templatePath) {
    try {
      // Check cache first
      if (this.cache.has(templatePath)) {
        logger.info(`Loading template from cache: ${templatePath}`);
        return this.cache.get(templatePath);
      }

      // Resolve template path
      const resolvedPath = await this.resolveTemplatePath(templatePath);

      if (!resolvedPath) {
        throw new Error(`Template not found: ${templatePath}`);
      }

      // Parse the template
      const template = await this.parser.parseFile(resolvedPath);

      // Validate template
      const validation = this.parser.validate(template);
      if (!validation.valid) {
        throw new Error(`Invalid template: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        logger.warn(`Template warnings: ${validation.warnings.join(', ')}`);
      }

      // Cache the template
      this.cache.set(templatePath, template);
      this.cache.set(resolvedPath, template);

      logger.info(`Template loaded: ${template.name}`);
      return template;

    } catch (error) {
      logger.error(`Failed to load template ${templatePath}:`, error);
      throw error;
    }
  }

  /**
   * Resolve template path
   */
  async resolveTemplatePath(templatePath) {
    // If it's an absolute path, use it directly
    if (path.isAbsolute(templatePath)) {
      const exists = await this.fileExists(templatePath);
      return exists ? templatePath : null;
    }

    // Try as relative to templates directory
    let resolvedPath = path.join(this.templatesDir, templatePath);
    if (await this.fileExists(resolvedPath)) {
      return resolvedPath;
    }

    // Add .yaml extension if not present
    if (!templatePath.endsWith('.yaml') && !templatePath.endsWith('.yml')) {
      resolvedPath = path.join(this.templatesDir, `${templatePath}.yaml`);
      if (await this.fileExists(resolvedPath)) {
        return resolvedPath;
      }

      resolvedPath = path.join(this.templatesDir, `${templatePath}.yml`);
      if (await this.fileExists(resolvedPath)) {
        return resolvedPath;
      }
    }

    // Try in category subdirectories
    for (const category of this.categories) {
      resolvedPath = path.join(this.templatesDir, category, templatePath);
      if (await this.fileExists(resolvedPath)) {
        return resolvedPath;
      }

      if (!templatePath.endsWith('.yaml') && !templatePath.endsWith('.yml')) {
        resolvedPath = path.join(this.templatesDir, category, `${templatePath}.yaml`);
        if (await this.fileExists(resolvedPath)) {
          return resolvedPath;
        }
      }
    }

    return null;
  }

  /**
   * Load all templates from a directory
   */
  async loadTemplatesFromDirectory(directory) {
    try {
      const templates = [];
      const files = await this.findYamlFiles(directory);

      for (const file of files) {
        try {
          const template = await this.loadTemplate(file);
          templates.push(template);
        } catch (error) {
          logger.error(`Failed to load template ${file}:`, error);
        }
      }

      logger.info(`Loaded ${templates.length} templates from ${directory}`);
      return templates;

    } catch (error) {
      logger.error(`Failed to load templates from directory ${directory}:`, error);
      throw error;
    }
  }

  /**
   * Recursively find YAML files in directory
   */
  async findYamlFiles(dir, files = []) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await this.findYamlFiles(fullPath, files);
        } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
          files.push(fullPath);
        }
      }

      return files;
    } catch (error) {
      return files;
    }
  }

  /**
   * Load templates by category
   */
  async loadTemplatesByCategory(category) {
    if (!this.categories.includes(category)) {
      throw new Error(`Invalid category: ${category}`);
    }

    const categoryDir = path.join(this.templatesDir, category);
    return this.loadTemplatesFromDirectory(categoryDir);
  }

  /**
   * Discover all available templates
   */
  async discoverTemplates() {
    try {
      const templates = {};

      // Discover templates in each category
      for (const category of this.categories) {
        const categoryDir = path.join(this.templatesDir, category);

        if (await this.directoryExists(categoryDir)) {
          const categoryTemplates = await this.loadTemplatesByCategory(category);
          templates[category] = categoryTemplates.map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            path: t.metadata?.sourceFile,
            category
          }));
        } else {
          templates[category] = [];
        }
      }

      // Also check root templates directory
      const rootFiles = await this.findYamlFiles(this.templatesDir);
      templates.root = [];

      for (const file of rootFiles) {
        try {
          const template = await this.loadTemplate(file);
          templates.root.push({
            id: template.id,
            name: template.name,
            description: template.description,
            path: file,
            category: 'root'
          });
        } catch (error) {
          logger.error(`Failed to discover template ${file}:`, error);
        }
      }

      return templates;

    } catch (error) {
      logger.error('Failed to discover templates:', error);
      throw error;
    }
  }

  /**
   * Get template by ID
   */
  async getTemplateById(templateId) {
    // Check cache first
    for (const [key, template] of this.cache) {
      if (template.id === templateId) {
        return template;
      }
    }

    // Search for template file
    const templates = await this.discoverTemplates();

    for (const category of Object.values(templates)) {
      const found = category.find(t => t.id === templateId);
      if (found) {
        return this.loadTemplate(found.path);
      }
    }

    throw new Error(`Template not found: ${templateId}`);
  }

  /**
   * Reload template (bypass cache)
   */
  async reloadTemplate(templatePath) {
    // Remove from cache
    this.cache.delete(templatePath);

    const resolvedPath = await this.resolveTemplatePath(templatePath);
    if (resolvedPath) {
      this.cache.delete(resolvedPath);
    }

    // Load fresh
    return this.loadTemplate(templatePath);
  }

  /**
   * Clear template cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('Template cache cleared');
  }

  /**
   * Save template to file
   */
  async saveTemplate(template, filePath) {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Save using parser
      await this.parser.saveToFile(template, filePath);

      // Clear cache for this file
      this.cache.delete(filePath);

      return filePath;
    } catch (error) {
      logger.error(`Failed to save template to ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Helper: Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper: Check if directory exists
   */
  async directoryExists(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

module.exports = TemplateLoader;