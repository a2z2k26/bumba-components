/**
 * Smart Code Generator
 * Base class for intelligent, framework-specific code generation
 * Sprint 13: Framework Optimizer Base
 * Sprint 28: Generator-Optimizer Pipeline Integration
 */

const EventEmitter = require('events');
const path = require('path');
const { getOptimizerRegistry } = require('./optimizer-registry');
const TokenSystemIntegrator = require('./token-system-integrator');
const ComponentSchemaValidator = require('./component-schema-validator');

class SmartCodeGenerator extends EventEmitter {
  constructor() {
    super();
    this.name = 'SmartCodeGenerator';
    this.version = '1.0.0';

    // Code generation configuration
    this.config = {
      framework: 'react', // Default framework
      typescript: true,
      styleFormat: 'css-modules', // css, scss, styled-components, emotion
      componentFormat: 'functional', // functional, class
      stateManagement: 'hooks', // hooks, redux, mobx, context
      testingFramework: 'jest', // jest, vitest, mocha
      accessibility: 'wcag-aa', // wcag-a, wcag-aa, wcag-aaa
      optimization: {
        treeshaking: true,
        lazyLoading: true,
        codeSplitting: true,
        minification: true
      }
    };

    // Sprint 28: Get optimizer registry
    this.optimizerRegistry = getOptimizerRegistry();

    // Sprint 30: Initialize Token System Integrator
    this.tokenSystem = new TokenSystemIntegrator({
      autoSync: true,
      validateOnExtract: true,
      cacheTokens: true,
      validationPreset: this.config.accessibility
    });

    // Sprint 31: Initialize Component Schema Validator
    this.schemaValidator = new ComponentSchemaValidator({
      strictMode: true,
      allowAdditionalProps: true
    });

    // Framework optimizers registry (legacy - now using OptimizerRegistry)
    this.optimizers = new Map();

    // Code generation templates
    this.templates = new Map();

    // Generated components registry
    this.generatedComponents = new Map();

    // Initialize default optimizers
    this.initializeOptimizers();
  }

  /**
   * Initialize framework optimizers
   * Sprint 28: Updated to use OptimizerRegistry
   */
  initializeOptimizers() {
    // Base optimizers will be registered by specific framework classes
    this.optimizers.set('base', {
      name: 'BaseOptimizer',
      optimize: this.baseOptimization.bind(this)
    });

    // Sprint 28: Load all framework optimizers from registry
    const frameworks = this.optimizerRegistry.getSupportedFrameworks();
    frameworks.forEach(framework => {
      const optimizer = this.optimizerRegistry.getOptimizer(framework);
      this.optimizers.set(framework, optimizer);
    });

    console.log(` SmartCodeGenerator initialized with ${this.optimizers.size} optimizers`);
  }

  /**
   * Generate optimized code from design components
   */
  async generateCode(designComponent, options = {}) {
    const config = { ...this.config, ...options };

    try {
      // Prepare component data
      const componentData = await this.prepareComponentData(designComponent, config);

      // Sprint 31: Validate component schema
      if (config.validateSchema !== false) {
        const schemaValidation = this.schemaValidator.autoValidate(componentData);
        componentData.schemaValidation = schemaValidation;

        if (!schemaValidation.valid && this.schemaValidator.options.strictMode) {
          const error = new Error(`Schema validation failed for component: ${componentData.name}`);
          error.validation = schemaValidation;
          throw error;
        }
      }

      // Sprint 30: Inject design tokens into component data
      if (options.figmaData && !componentData.designTokens) {
        const tokenResult = await this.tokenSystem.processTokens(options.figmaData);
        componentData.designTokens = tokenResult.tokens;
        componentData.tokenValidation = tokenResult.validation;
      } else if (!componentData.designTokens) {
        // Use cached tokens if available
        componentData.designTokens = this.tokenSystem.getAllTokens();
      }

      // Select appropriate optimizer
      const optimizer = this.selectOptimizer(config.framework);

      // Generate base code structure
      const baseCode = await this.generateBaseCode(componentData, config);

      // Apply framework-specific optimizations
      const optimizedCode = await optimizer.optimize(baseCode, componentData, config);

      // Apply post-processing
      const finalCode = await this.postProcess(optimizedCode, config);

      // Generate supporting files
      const supportingFiles = await this.generateSupportingFiles(componentData, config);

      // Create component package
      const componentPackage = {
        id: componentData.id,
        name: componentData.name,
        framework: config.framework,
        code: finalCode,
        files: supportingFiles,
        metadata: this.generateMetadata(componentData, config),
        imports: this.extractImports(finalCode),
        exports: this.extractExports(finalCode),
        dependencies: this.analyzeDependencies(finalCode, config)
      };

      // Register generated component
      this.generatedComponents.set(componentData.id, componentPackage);

      // Emit generation event
      this.emit('code:generated', componentPackage);

      return componentPackage;
    } catch (error) {
      this.emit('generation:error', { designComponent, error });
      throw error;
    }
  }

  /**
   * Prepare component data for code generation
   */
  async prepareComponentData(designComponent, config) {
    return {
      id: designComponent.id || this.generateComponentId(designComponent),
      name: this.sanitizeComponentName(designComponent.name),
      type: this.detectComponentType(designComponent),
      props: await this.extractProps(designComponent),
      state: await this.extractState(designComponent),
      styles: await this.extractStyles(designComponent),
      variants: await this.extractVariants(designComponent),
      interactions: await this.extractInteractions(designComponent),
      accessibility: await this.extractAccessibility(designComponent),
      responsive: await this.extractResponsive(designComponent),
      children: await this.extractChildren(designComponent)
    };
  }

  /**
   * Generate base code structure
   */
  async generateBaseCode(componentData, config) {
    const template = this.selectTemplate(config);

    const baseStructure = {
      imports: this.generateImports(componentData, config),
      component: this.generateComponentStructure(componentData, config),
      styles: this.generateStyles(componentData, config),
      exports: this.generateExports(componentData, config)
    };

    return this.assembleCode(baseStructure, template);
  }

  /**
   * Select appropriate optimizer
   */
  selectOptimizer(framework) {
    if (this.optimizers.has(framework)) {
      return this.optimizers.get(framework);
    }

    // Fall back to base optimizer
    return this.optimizers.get('base');
  }

  /**
   * Base optimization logic
   */
  async baseOptimization(code, componentData, config) {
    let optimizedCode = code;

    // Apply general optimizations
    if (config.optimization.treeshaking) {
      optimizedCode = this.applyTreeshaking(optimizedCode);
    }

    if (config.optimization.lazyLoading) {
      optimizedCode = this.applyLazyLoading(optimizedCode, componentData);
    }

    if (config.optimization.codeSplitting) {
      optimizedCode = this.applyCodeSplitting(optimizedCode, componentData);
    }

    if (config.optimization.minification) {
      optimizedCode = this.applyMinification(optimizedCode);
    }

    return optimizedCode;
  }

  /**
   * Post-process generated code
   */
  async postProcess(code, config) {
    let processedCode = code;

    // Format code
    processedCode = this.formatCode(processedCode, config);

    // Add comments and documentation
    processedCode = this.addDocumentation(processedCode, config);

    // Validate syntax
    await this.validateSyntax(processedCode, config);

    return processedCode;
  }

  /**
   * Generate supporting files
   */
  async generateSupportingFiles(componentData, config) {
    const files = {};

    // Generate test file
    if (config.testingFramework) {
      files.test = await this.generateTestFile(componentData, config);
    }

    // Generate story file (for Storybook)
    files.story = await this.generateStoryFile(componentData, config);

    // Generate documentation
    files.documentation = await this.generateDocumentation(componentData, config);

    // Generate type definitions (if TypeScript)
    if (config.typescript) {
      files.types = await this.generateTypeDefinitions(componentData, config);
    }

    // Generate style file (if separate)
    if (this.requiresSeparateStyleFile(config)) {
      files.styles = await this.generateStyleFile(componentData, config);
    }

    return files;
  }

  /**
   * Register a framework optimizer
   */
  registerOptimizer(framework, optimizer) {
    this.optimizers.set(framework, optimizer);
    this.emit('optimizer:registered', { framework, optimizer });
  }

  /**
   * Register a code template
   */
  registerTemplate(name, template) {
    this.templates.set(name, template);
    this.emit('template:registered', { name, template });
  }

  /**
   * Helper: Generate component ID
   */
  generateComponentId(component) {
    const name = component.name || 'component';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${name}-${timestamp}-${random}`.replace(/\s+/g, '-').toLowerCase();
  }

  /**
   * Helper: Sanitize component name
   */
  sanitizeComponentName(name) {
    if (!name) return 'Component';

    // Remove special characters and convert to PascalCase
    return name
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Helper: Detect component type
   */
  detectComponentType(component) {
    const name = (component.name || '').toLowerCase();

    if (name.includes('button')) return 'button';
    if (name.includes('input') || name.includes('field')) return 'input';
    if (name.includes('card')) return 'card';
    if (name.includes('modal') || name.includes('dialog')) return 'modal';
    if (name.includes('nav') || name.includes('menu')) return 'navigation';
    if (name.includes('list') || name.includes('table')) return 'list';
    if (name.includes('form')) return 'form';

    return 'container';
  }

  /**
   * Helper: Extract props
   */
  async extractProps(component) {
    const props = {};

    // Extract from component properties
    if (component.componentProperties) {
      Object.entries(component.componentProperties).forEach(([key, value]) => {
        props[key] = {
          type: this.inferPropType(value),
          default: value,
          required: false
        };
      });
    }

    // Add common props based on type
    const type = this.detectComponentType(component);
    const commonProps = this.getCommonPropsForType(type);

    return { ...commonProps, ...props };
  }

  /**
   * Helper: Extract state
   */
  async extractState(component) {
    const state = {};

    // Extract interactive states
    if (component.interactions) {
      component.interactions.forEach(interaction => {
        if (interaction.trigger && interaction.action) {
          state[interaction.trigger] = interaction.action;
        }
      });
    }

    return state;
  }

  /**
   * Helper: Extract styles
   */
  async extractStyles(component) {
    return {
      layout: this.extractLayoutStyles(component),
      typography: this.extractTypographyStyles(component),
      colors: this.extractColorStyles(component),
      effects: this.extractEffectStyles(component),
      responsive: this.extractResponsiveStyles(component)
    };
  }

  /**
   * Helper: Extract variants
   */
  async extractVariants(component) {
    return component.variants || [];
  }

  /**
   * Helper: Extract interactions
   */
  async extractInteractions(component) {
    return component.interactions || [];
  }

  /**
   * Helper: Extract accessibility
   */
  async extractAccessibility(component) {
    return {
      role: component.role || this.inferRole(component),
      ariaLabel: component.ariaLabel || component.name,
      tabIndex: component.tabIndex || 0,
      keyboardSupport: true
    };
  }

  /**
   * Helper: Extract responsive
   */
  async extractResponsive(component) {
    return {
      mobile: component.mobile || {},
      tablet: component.tablet || {},
      desktop: component.desktop || {}
    };
  }

  /**
   * Helper: Extract children
   */
  async extractChildren(component) {
    if (!component.children) return [];

    return component.children.map(child => ({
      id: child.id,
      name: child.name,
      type: child.type
    }));
  }

  /**
   * Helper: Generate imports
   */
  generateImports(componentData, config) {
    const imports = [];

    // Framework imports
    if (config.framework === 'react') {
      imports.push("import React from 'react';");
      if (config.componentFormat === 'functional' && componentData.state) {
        imports.push("import { useState, useEffect } from 'react';");
      }
    }

    // Style imports
    if (config.styleFormat === 'styled-components') {
      imports.push("import styled from 'styled-components';");
    }

    return imports.join('\n');
  }

  /**
   * Helper: Generate component structure
   */
  generateComponentStructure(componentData, config) {
    const { name, props, state } = componentData;

    if (config.framework === 'react' && config.componentFormat === 'functional') {
      return this.generateReactFunctionalComponent(name, props, state, config);
    }

    return `// Component structure for ${name}`;
  }

  /**
   * Helper: Generate React functional component
   */
  generateReactFunctionalComponent(name, props, state, config) {
    const propsString = Object.keys(props).length > 0
      ? `{ ${Object.keys(props).join(', ')} }`
      : '';

    let component = config.typescript
      ? `const ${name}: React.FC<${name}Props> = (${propsString}) => {\n`
      : `const ${name} = (${propsString}) => {\n`;

    // Add state hooks
    if (state && Object.keys(state).length > 0) {
      Object.entries(state).forEach(([key, value]) => {
        component += `  const [${key}, set${this.capitalize(key)}] = useState(${JSON.stringify(value)});\n`;
      });
      component += '\n';
    }

    component += `  return (\n    <div className="${this.toKebabCase(name)}">\n`;
    component += `      {/* Component content */}\n`;
    component += `    </div>\n  );\n`;
    component += `};\n`;

    return component;
  }

  /**
   * Helper: Generate styles
   */
  generateStyles(componentData, config) {
    const { name, styles } = componentData;
    const className = this.toKebabCase(name);

    if (config.styleFormat === 'css-modules') {
      return this.generateCSSModules(className, styles);
    }

    return '';
  }

  /**
   * Helper: Generate CSS modules
   */
  generateCSSModules(className, styles) {
    let css = `.${className} {\n`;

    // Layout styles
    if (styles.layout) {
      Object.entries(styles.layout).forEach(([key, value]) => {
        if (value) css += `  ${this.toKebabCase(key)}: ${value};\n`;
      });
    }

    css += `}\n`;
    return css;
  }

  /**
   * Helper: Generate exports
   */
  generateExports(componentData, config) {
    return `export default ${componentData.name};`;
  }

  /**
   * Helper: Select template
   */
  selectTemplate(config) {
    const templateKey = `${config.framework}-${config.componentFormat}`;
    return this.templates.get(templateKey) || this.templates.get('base');
  }

  /**
   * Helper: Assemble code
   */
  assembleCode(structure, template) {
    return [
      structure.imports,
      '',
      structure.component,
      '',
      structure.exports
    ].filter(Boolean).join('\n');
  }

  /**
   * Helper: Utility functions
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  toKebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  inferPropType(value) {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'any';
  }

  getCommonPropsForType(type) {
    const commonProps = {
      button: {
        onClick: { type: 'function', required: false },
        disabled: { type: 'boolean', required: false },
        variant: { type: 'string', required: false }
      },
      input: {
        value: { type: 'string', required: true },
        onChange: { type: 'function', required: true },
        placeholder: { type: 'string', required: false }
      }
    };

    return commonProps[type] || {};
  }

  inferRole(component) {
    const type = this.detectComponentType(component);
    const roles = {
      button: 'button',
      input: 'textbox',
      navigation: 'navigation',
      list: 'list',
      modal: 'dialog'
    };
    return roles[type] || 'region';
  }

  /**
   * Optimization helpers (placeholders for now)
   */
  applyTreeshaking(code) { return code; }
  applyLazyLoading(code, data) { return code; }
  applyCodeSplitting(code, data) { return code; }
  applyMinification(code) { return code; }
  formatCode(code, config) { return code; }
  addDocumentation(code, config) { return code; }
  async validateSyntax(code, config) { return true; }

  async generateTestFile(data, config) { return '// Test file'; }
  async generateStoryFile(data, config) { return '// Story file'; }
  async generateDocumentation(data, config) { return '// Documentation'; }
  async generateTypeDefinitions(data, config) { return '// Type definitions'; }
  async generateStyleFile(data, config) { return '/* Styles */'; }

  requiresSeparateStyleFile(config) {
    return config.styleFormat === 'css' || config.styleFormat === 'scss';
  }

  extractLayoutStyles(component) { return {}; }
  extractTypographyStyles(component) { return {}; }
  extractColorStyles(component) { return {}; }
  extractEffectStyles(component) { return {}; }
  extractResponsiveStyles(component) { return {}; }

  generateMetadata(data, config) {
    return {
      generated: new Date().toISOString(),
      framework: config.framework,
      version: this.version
    };
  }

  extractImports(code) { return []; }
  extractExports(code) { return []; }
  analyzeDependencies(code, config) { return []; }
}

module.exports = SmartCodeGenerator;