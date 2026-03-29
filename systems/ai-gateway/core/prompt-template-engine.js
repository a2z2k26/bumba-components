const { EventEmitter } = require('events');
const crypto = require('crypto');

class PromptTemplateEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.templates = new Map();
    this.compiledTemplates = new Map();
    this.variables = new Map();
    this.functions = new Map();
    this.patterns = new Map();
    this.cacheEnabled = options.cacheEnabled !== false;
    this.maxCacheSize = options.maxCacheSize || 1000;
    this.templateValidation = options.templateValidation !== false;

    this.initializeBuiltinFunctions();
    this.initializePatterns();
  }

  initializeBuiltinFunctions() {
    // String manipulation functions
    this.functions.set('upper', (value) => String(value).toUpperCase());
    this.functions.set('lower', (value) => String(value).toLowerCase());
    this.functions.set('capitalize', (value) =>
      String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase()
    );
    this.functions.set('trim', (value) => String(value).trim());
    this.functions.set('length', (value) => String(value).length);
    this.functions.set('substring', (value, start, end) => String(value).substring(start, end));
    this.functions.set('replace', (value, search, replace) => String(value).replace(search, replace));

    // Array functions
    this.functions.set('join', (array, separator = ', ') => Array.isArray(array) ? array.join(separator) : String(array));
    this.functions.set('first', (array) => Array.isArray(array) ? array[0] : array);
    this.functions.set('last', (array) => Array.isArray(array) ? array[array.length - 1] : array);
    this.functions.set('count', (array) => Array.isArray(array) ? array.length : 1);

    // Formatting functions
    this.functions.set('json', (value) => JSON.stringify(value, null, 2));
    this.functions.set('escape', (value) => String(value).replace(/[<>&"']/g, (char) => {
      const escapes = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;' };
      return escapes[char];
    }));

    // Date functions
    this.functions.set('now', () => new Date().toISOString());
    this.functions.set('date', (value) => new Date(value).toISOString().split('T')[0]);
    this.functions.set('time', (value) => new Date(value).toISOString().split('T')[1].split('.')[0]);

    // Logical functions
    this.functions.set('default', (value, defaultValue) => value || defaultValue);
    this.functions.set('not', (value) => !value);
    this.functions.set('eq', (a, b) => a === b);
    this.functions.set('ne', (a, b) => a !== b);
    this.functions.set('gt', (a, b) => a > b);
    this.functions.set('lt', (a, b) => a < b);

    // AI-specific functions
    this.functions.set('role_prompt', (role, content) => `You are a ${role}. ${content}`);
    this.functions.set('system_prompt', (content) => ({ role: 'system', content }));
    this.functions.set('user_prompt', (content) => ({ role: 'user', content }));
    this.functions.set('assistant_prompt', (content) => ({ role: 'assistant', content }));

    // Chain-of-thought functions
    this.functions.set('think_step_by_step', (problem) =>
      `Let's think step by step about this problem:\n\nProblem: ${problem}\n\nStep 1:`
    );
    this.functions.set('reasoning_chain', (steps) =>
      Array.isArray(steps) ? steps.map((step, i) => `Step ${i + 1}: ${step}`).join('\n') : steps
    );

    // Code generation functions
    this.functions.set('code_block', (code, language = '') => `\`\`\`${language}\n${code}\n\`\`\``);
    this.functions.set('inline_code', (code) => `\`${code}\``);
  }

  initializePatterns() {
    // Common prompt patterns
    this.patterns.set('task-completion', {
      name: 'Task Completion',
      description: 'Standard task completion prompt',
      template: `Task: {{task}}

{{#if context}}
Context: {{context}}
{{/if}}

{{#if constraints}}
Constraints:
{{#each constraints}}
- {{this}}
{{/each}}
{{/if}}

{{#if examples}}
Examples:
{{#each examples}}
{{@index}}. {{this}}
{{/each}}
{{/if}}

Please complete this task step by step.`,
      variables: ['task', 'context', 'constraints', 'examples']
    });

    this.patterns.set('code-generation', {
      name: 'Code Generation',
      description: 'Code generation with specifications',
      template: `Generate {{language}} code for the following specification:

Specification: {{specification}}

{{#if input_format}}
Input Format: {{input_format}}
{{/if}}

{{#if output_format}}
Output Format: {{output_format}}
{{/if}}

{{#if requirements}}
Requirements:
{{#each requirements}}
- {{this}}
{{/each}}
{{/if}}

{{#if style_guide}}
Style Guide: {{style_guide}}
{{/if}}

Please provide clean, well-documented code with comments.`,
      variables: ['language', 'specification', 'input_format', 'output_format', 'requirements', 'style_guide']
    });

    this.patterns.set('analysis', {
      name: 'Analysis Task',
      description: 'Structured analysis prompt',
      template: `Analyze the following {{subject_type}}:

{{subject}}

{{#if analysis_dimensions}}
Please analyze from these perspectives:
{{#each analysis_dimensions}}
- {{this}}
{{/each}}
{{/if}}

{{#if questions}}
Specific questions to address:
{{#each questions}}
{{@index}}. {{this}}
{{/each}}
{{/if}}

Provide a structured analysis with clear conclusions.`,
      variables: ['subject_type', 'subject', 'analysis_dimensions', 'questions']
    });

    this.patterns.set('creative-writing', {
      name: 'Creative Writing',
      description: 'Creative writing prompt with style guidance',
      template: `Write a {{format}} about {{topic}}.

{{#if style}}
Style: {{style}}
{{/if}}

{{#if tone}}
Tone: {{tone}}
{{/if}}

{{#if length}}
Length: {{length}}
{{/if}}

{{#if constraints}}
Constraints:
{{#each constraints}}
- {{this}}
{{/each}}
{{/if}}

{{#if inspiration}}
Draw inspiration from: {{inspiration}}
{{/if}}

Be creative and engaging.`,
      variables: ['format', 'topic', 'style', 'tone', 'length', 'constraints', 'inspiration']
    });

    this.patterns.set('chain-of-thought', {
      name: 'Chain of Thought',
      description: 'Step-by-step reasoning prompt',
      template: `{{problem}}

Let's solve this step by step:

{{#if background}}
Background: {{background}}
{{/if}}

{{#if approach}}
Approach: {{approach}}
{{/if}}

Think through this carefully and show your reasoning at each step.

Step 1:`,
      variables: ['problem', 'background', 'approach']
    });

    this.patterns.set('few-shot', {
      name: 'Few-Shot Learning',
      description: 'Few-shot learning with examples',
      template: `{{task_description}}

Here are some examples:

{{#each examples}}
Example {{@index}}:
Input: {{this.input}}
Output: {{this.output}}
{{#if this.explanation}}
Explanation: {{this.explanation}}
{{/if}}

{{/each}}

Now, please handle this new case:
Input: {{input}}
Output:`,
      variables: ['task_description', 'examples', 'input']
    });
  }

  createTemplate(name, templateString, options = {}) {
    if (this.templates.has(name)) {
      throw new Error(`Template '${name}' already exists`);
    }

    const template = {
      name,
      template: templateString,
      variables: this.extractVariables(templateString),
      metadata: {
        created: Date.now(),
        description: options.description || '',
        category: options.category || 'custom',
        tags: options.tags || [],
        author: options.author || 'system',
        version: options.version || '1.0.0'
      },
      validation: {
        required: options.required || [],
        optional: options.optional || [],
        types: options.types || {}
      },
      usage: {
        compilations: 0,
        lastUsed: null,
        errors: 0
      }
    };

    if (this.templateValidation) {
      this.validateTemplate(template);
    }

    this.templates.set(name, template);

    this.emit('template-created', { name, template });

    return template;
  }

  updateTemplate(name, templateString, options = {}) {
    const existing = this.templates.get(name);

    if (!existing) {
      throw new Error(`Template '${name}' not found`);
    }

    const updated = {
      ...existing,
      template: templateString,
      variables: this.extractVariables(templateString),
      metadata: {
        ...existing.metadata,
        ...options,
        modified: Date.now(),
        version: this.incrementVersion(existing.metadata.version)
      }
    };

    if (this.templateValidation) {
      this.validateTemplate(updated);
    }

    this.templates.set(name, updated);

    // Clear compiled cache
    this.compiledTemplates.delete(name);

    this.emit('template-updated', { name, template: updated });

    return updated;
  }

  deleteTemplate(name) {
    const existed = this.templates.delete(name);

    if (existed) {
      this.compiledTemplates.delete(name);
      this.emit('template-deleted', { name });
    }

    return existed;
  }

  getTemplate(name) {
    return this.templates.get(name);
  }

  listTemplates(options = {}) {
    let templates = Array.from(this.templates.values());

    // Apply filters
    if (options.category) {
      templates = templates.filter(t => t.metadata.category === options.category);
    }

    if (options.tags) {
      const filterTags = Array.isArray(options.tags) ? options.tags : [options.tags];
      templates = templates.filter(t =>
        filterTags.some(tag => t.metadata.tags.includes(tag))
      );
    }

    if (options.author) {
      templates = templates.filter(t => t.metadata.author === options.author);
    }

    // Sort
    if (options.sortBy) {
      templates.sort((a, b) => {
        switch (options.sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'created':
            return b.metadata.created - a.metadata.created;
          case 'lastUsed':
            return (b.usage.lastUsed || 0) - (a.usage.lastUsed || 0);
          case 'usage':
            return b.usage.compilations - a.usage.compilations;
          default:
            return 0;
        }
      });
    }

    return templates;
  }

  compile(templateName, variables = {}, options = {}) {
    const template = this.templates.get(templateName);

    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Generate cache key
    const cacheKey = this.generateCacheKey(templateName, variables);

    // Check cache
    if (this.cacheEnabled && this.compiledTemplates.has(cacheKey)) {
      const cached = this.compiledTemplates.get(cacheKey);
      this.emit('template-cache-hit', { templateName, cacheKey });
      return cached.result;
    }

    try {
      // Validate variables
      if (this.templateValidation) {
        this.validateVariables(template, variables);
      }

      // Merge with global variables
      const mergedVariables = {
        ...this.variables.get('global') || {},
        ...variables
      };

      // Compile template
      const result = this.compileTemplate(template.template, mergedVariables, options);

      // Update usage stats
      template.usage.compilations++;
      template.usage.lastUsed = Date.now();

      // Cache result
      if (this.cacheEnabled) {
        this.cacheResult(cacheKey, result);
      }

      this.emit('template-compiled', { templateName, variables: mergedVariables, result });

      return result;
    } catch (error) {
      template.usage.errors++;
      this.emit('template-error', { templateName, error: error.message });
      throw error;
    }
  }

  compileTemplate(templateString, variables, options = {}) {
    let result = templateString;

    // Handle conditionals ({{#if condition}})
    result = this.processConditionals(result, variables);

    // Handle loops ({{#each array}})
    result = this.processLoops(result, variables);

    // Handle variable substitution ({{variable}})
    result = this.processVariables(result, variables);

    // Handle function calls ({{function arg1 arg2}})
    result = this.processFunctions(result, variables);

    // Post-processing
    if (options.trim) {
      result = result.trim();
    }

    if (options.removeEmptyLines) {
      result = result.replace(/^\s*\n/gm, '');
    }

    if (options.normalizeWhitespace) {
      result = result.replace(/\s+/g, ' ').trim();
    }

    return result;
  }

  processConditionals(template, variables) {
    const conditionalRegex = /\{\{#if\s+([^}]+)\}\}(.*?)\{\{\/if\}\}/gs;

    return template.replace(conditionalRegex, (match, condition, content) => {
      const conditionValue = this.evaluateCondition(condition, variables);
      return conditionValue ? content : '';
    });
  }

  processLoops(template, variables) {
    const loopRegex = /\{\{#each\s+([^}]+)\}\}(.*?)\{\{\/each\}\}/gs;

    return template.replace(loopRegex, (match, arrayName, content) => {
      const array = this.getVariableValue(arrayName, variables);

      if (!Array.isArray(array)) {
        return '';
      }

      return array.map((item, index) => {
        const loopVariables = {
          ...variables,
          'this': item,
          '@index': index,
          '@first': index === 0,
          '@last': index === array.length - 1,
          '@length': array.length
        };

        return this.processVariables(content, loopVariables);
      }).join('');
    });
  }

  processVariables(template, variables) {
    const variableRegex = /\{\{([^}#\/]+)\}\}/g;

    return template.replace(variableRegex, (match, variable) => {
      const trimmedVariable = variable.trim();
      const value = this.getVariableValue(trimmedVariable, variables);

      return value !== undefined ? String(value) : match;
    });
  }

  processFunctions(template, variables) {
    const functionRegex = /\{\{(\w+)\s+([^}]+)\}\}/g;

    return template.replace(functionRegex, (match, functionName, args) => {
      const func = this.functions.get(functionName);

      if (!func) {
        return match;
      }

      try {
        const parsedArgs = this.parseArguments(args, variables);
        const result = func(...parsedArgs);
        return result !== undefined ? String(result) : '';
      } catch (error) {
        console.error(`Function '${functionName}' error:`, error.message);
        return match;
      }
    });
  }

  evaluateCondition(condition, variables) {
    const trimmed = condition.trim();

    // Simple boolean check
    const value = this.getVariableValue(trimmed, variables);

    if (typeof value === 'boolean') {
      return value;
    }

    // Truthiness check
    return !!value && value !== '' && value !== 0;
  }

  getVariableValue(path, variables) {
    const keys = path.split('.');
    let current = variables;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  parseArguments(argsString, variables) {
    const args = [];
    const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match;

    while ((match = regex.exec(argsString)) !== null) {
      if (match[1] !== undefined) {
        // Double-quoted string
        args.push(match[1]);
      } else if (match[2] !== undefined) {
        // Single-quoted string
        args.push(match[2]);
      } else {
        // Variable or literal
        const value = this.getVariableValue(match[3], variables);
        args.push(value !== undefined ? value : match[3]);
      }
    }

    return args;
  }

  extractVariables(template) {
    const variables = new Set();
    const patterns = [
      /\{\{([^}#\/\s]+)(?:\s|$)/g,  // {{variable}}
      /\{\{#if\s+([^}]+)\}\}/g,     // {{#if condition}}
      /\{\{#each\s+([^}]+)\}\}/g    // {{#each array}}
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(template)) !== null) {
        const variable = match[1].trim().split('.')[0]; // Get root variable
        if (!variable.startsWith('@') && !this.functions.has(variable)) {
          variables.add(variable);
        }
      }
    }

    return Array.from(variables);
  }

  validateTemplate(template) {
    const errors = [];

    // Check for balanced tags
    const ifTags = (template.template.match(/\{\{#if/g) || []).length;
    const endIfTags = (template.template.match(/\{\{\/if\}\}/g) || []).length;

    if (ifTags !== endIfTags) {
      errors.push('Unbalanced {{#if}} and {{/if}} tags');
    }

    const eachTags = (template.template.match(/\{\{#each/g) || []).length;
    const endEachTags = (template.template.match(/\{\{\/each\}\}/g) || []).length;

    if (eachTags !== endEachTags) {
      errors.push('Unbalanced {{#each}} and {{/each}} tags');
    }

    // Check for valid syntax
    const invalidTags = template.template.match(/\{\{[^}]*$/g);
    if (invalidTags) {
      errors.push('Unclosed template tags found');
    }

    if (errors.length > 0) {
      throw new Error(`Template validation failed: ${errors.join(', ')}`);
    }
  }

  validateVariables(template, variables) {
    const missing = [];

    for (const required of template.validation.required) {
      if (!(required in variables)) {
        missing.push(required);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required variables: ${missing.join(', ')}`);
    }

    // Type validation
    for (const [variable, expectedType] of Object.entries(template.validation.types)) {
      if (variable in variables) {
        const actualType = typeof variables[variable];
        if (actualType !== expectedType) {
          throw new Error(`Variable '${variable}' should be ${expectedType}, got ${actualType}`);
        }
      }
    }
  }

  setGlobalVariable(name, value) {
    if (!this.variables.has('global')) {
      this.variables.set('global', {});
    }

    this.variables.get('global')[name] = value;

    this.emit('global-variable-set', { name, value });
  }

  getGlobalVariable(name) {
    const globals = this.variables.get('global');
    return globals ? globals[name] : undefined;
  }

  registerFunction(name, func, description = '') {
    if (typeof func !== 'function') {
      throw new Error('Function must be callable');
    }

    this.functions.set(name, func);

    this.emit('function-registered', { name, description });
  }

  unregisterFunction(name) {
    const existed = this.functions.delete(name);

    if (existed) {
      this.emit('function-unregistered', { name });
    }

    return existed;
  }

  listFunctions() {
    return Array.from(this.functions.keys());
  }

  createFromPattern(patternName, variables, templateName = null) {
    const pattern = this.patterns.get(patternName);

    if (!pattern) {
      throw new Error(`Pattern '${patternName}' not found`);
    }

    const name = templateName || `${patternName}_${Date.now()}`;

    return this.createTemplate(name, pattern.template, {
      description: pattern.description,
      category: 'pattern',
      tags: ['pattern', patternName],
      required: pattern.variables
    });
  }

  generateCacheKey(templateName, variables) {
    const hash = crypto.createHash('md5');
    hash.update(templateName);
    hash.update(JSON.stringify(variables));
    return hash.digest('hex');
  }

  cacheResult(key, result) {
    if (this.compiledTemplates.size >= this.maxCacheSize) {
      // Remove oldest entries
      const entries = Array.from(this.compiledTemplates.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      for (let i = 0; i < Math.floor(this.maxCacheSize * 0.1); i++) {
        this.compiledTemplates.delete(entries[i][0]);
      }
    }

    this.compiledTemplates.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.compiledTemplates.clear();
    this.emit('cache-cleared');
  }

  incrementVersion(version) {
    const parts = version.split('.').map(Number);
    parts[2]++; // Increment patch version
    return parts.join('.');
  }

  exportTemplates(format = 'json') {
    const data = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      templates: {}
    };

    for (const [name, template] of this.templates) {
      data.templates[name] = template;
    }

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);

      case 'yaml':
        // Simple YAML export (would need yaml library for full support)
        let yaml = `version: ${data.version}\ntimestamp: ${data.timestamp}\ntemplates:\n`;
        for (const [name, template] of Object.entries(data.templates)) {
          yaml += `  ${name}:\n`;
          yaml += `    template: |\n`;
          yaml += template.template.split('\n').map(line => `      ${line}`).join('\n') + '\n';
          yaml += `    description: "${template.metadata.description}"\n`;
        }
        return yaml;

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  importTemplates(data, format = 'json') {
    let templateData;

    switch (format) {
      case 'json':
        templateData = typeof data === 'string' ? JSON.parse(data) : data;
        break;

      default:
        throw new Error(`Unsupported import format: ${format}`);
    }

    const imported = [];
    const failed = [];

    for (const [name, template] of Object.entries(templateData.templates)) {
      try {
        this.createTemplate(name, template.template, {
          description: template.metadata?.description,
          category: template.metadata?.category,
          tags: template.metadata?.tags,
          required: template.validation?.required,
          types: template.validation?.types
        });
        imported.push(name);
      } catch (error) {
        failed.push({ name, error: error.message });
      }
    }

    this.emit('templates-imported', { imported, failed });

    return { imported, failed };
  }

  getStatistics() {
    const templates = Array.from(this.templates.values());

    return {
      totalTemplates: templates.length,
      totalCompilations: templates.reduce((sum, t) => sum + t.usage.compilations, 0),
      totalErrors: templates.reduce((sum, t) => sum + t.usage.errors, 0),
      cacheSize: this.compiledTemplates.size,
      mostUsed: templates
        .sort((a, b) => b.usage.compilations - a.usage.compilations)
        .slice(0, 5)
        .map(t => ({ name: t.name, compilations: t.usage.compilations })),
      categories: [...new Set(templates.map(t => t.metadata.category))],
      functions: this.functions.size,
      patterns: this.patterns.size
    };
  }
}

module.exports = { PromptTemplateEngine };