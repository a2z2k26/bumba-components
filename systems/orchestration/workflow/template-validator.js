/**
 * BUMBA Template Validator
 * Sprint 12: Deep validation of workflow templates
 * Ensures templates are valid, complete, and executable
 */

const path = require('path');

class TemplateValidator {
  constructor(config = {}) {
    this.strictMode = config.strictMode !== false;
    this.allowUnknownProperties = config.allowUnknownProperties || false;
    this.customValidators = new Map();
    this.validationRules = this.initializeRules();
  }

  /**
   * Initialize validation rules
   */
  initializeRules() {
    return {
      workflow: {
        required: ['name', 'steps'],
        optional: ['id', 'description', 'version', 'agents', 'config', 'metadata', 'triggers', 'conditions', 'qualityGates', 'loopControl'],
        validators: {
          name: (value) => typeof value === 'string' && value.length > 0,
          steps: (value) => Array.isArray(value) && value.length > 0,
          version: (value) => this.validateVersion(value),
          agents: (value) => Array.isArray(value)
        }
      },
      step: {
        required: ['name', 'type'],
        optional: ['id', 'description', 'agent', 'task', 'inputs', 'outputs', 'condition', 'maxIterations', 'qualityThreshold', 'handler'],
        validators: {
          type: (value) => ['task', 'iterative', 'loop', 'parallel', 'condition', 'wait', 'transform', 'api'].includes(value),
          maxIterations: (value) => Number.isInteger(value) && value > 0 && value <= 1000,
          qualityThreshold: (value) => typeof value === 'number' && value >= 0 && value <= 1
        }
      },
      config: {
        optional: ['executionMode', 'parallel', 'timeout', 'retries', 'errorHandling', 'continuous', 'scheduled'],
        validators: {
          executionMode: (value) => ['sequential', 'parallel', 'adaptive'].includes(value),
          parallel: (value) => typeof value === 'boolean',
          timeout: (value) => Number.isInteger(value) && value > 0,
          retries: (value) => Number.isInteger(value) && value >= 0,
          errorHandling: (value) => ['stop', 'continue', 'retry', 'fallback'].includes(value)
        }
      }
    };
  }

  /**
   * Validate a complete template
   */
  validate(template) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    try {
      // Validate workflow structure
      this.validateWorkflow(template, errors, warnings);

      // Validate each step
      if (template.steps) {
        template.steps.forEach((step, index) => {
          this.validateStep(step, index, template, errors, warnings);
        });
      }

      // Validate step dependencies
      this.validateDependencies(template, errors, warnings);

      // Validate agent assignments
      this.validateAgentAssignments(template, errors, warnings);

      // Validate loop configurations
      this.validateLoopConfigurations(template, errors, warnings);

      // Validate quality gates
      this.validateQualityGates(template, errors, warnings);

      // Generate suggestions
      this.generateSuggestions(template, suggestions);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        suggestions,
        score: this.calculateValidationScore(errors, warnings)
      };

    } catch (error) {
      logger.error('Validation failed:', error);
      return {
        valid: false,
        errors: [`Validation error: ${error.message}`],
        warnings,
        suggestions,
        score: 0
      };
    }
  }

  /**
   * Validate workflow structure
   */
  validateWorkflow(workflow, errors, warnings) {
    const rules = this.validationRules.workflow;

    // Check required fields
    rules.required.forEach(field => {
      if (!workflow[field]) {
        errors.push(`Missing required field: ${field}`);
      } else if (rules.validators[field]) {
        if (!rules.validators[field](workflow[field])) {
          errors.push(`Invalid ${field}: validation failed`);
        }
      }
    });

    // Check for unknown properties if strict mode
    if (this.strictMode && !this.allowUnknownProperties) {
      const allowedFields = [...rules.required, ...rules.optional];
      Object.keys(workflow).forEach(field => {
        if (!allowedFields.includes(field)) {
          warnings.push(`Unknown property: ${field}`);
        }
      });
    }

    // Validate config if present
    if (workflow.config) {
      this.validateConfig(workflow.config, errors, warnings);
    }
  }

  /**
   * Validate individual step
   */
  validateStep(step, index, workflow, errors, warnings) {
    const rules = this.validationRules.step;
    const stepId = step.name || `Step ${index + 1}`;

    // Check required fields
    rules.required.forEach(field => {
      if (!step[field]) {
        errors.push(`Step '${stepId}': Missing required field '${field}'`);
      }
    });

    // Validate step type specific requirements
    switch (step.type) {
      case 'iterative':
      case 'loop':
        if (!step.maxIterations) {
          warnings.push(`Step '${stepId}': No maxIterations specified, using default`);
        }
        if (!step.qualityThreshold && step.qualityThreshold !== 0) {
          warnings.push(`Step '${stepId}': No qualityThreshold specified`);
        }
        break;

      case 'parallel':
        if (!step.tasks && !step.tracks) {
          errors.push(`Step '${stepId}': Parallel step requires tasks or tracks`);
        }
        break;

      case 'condition':
        if (!step.condition) {
          errors.push(`Step '${stepId}': Condition step requires condition`);
        }
        break;
    }

    // Apply validators
    Object.entries(rules.validators).forEach(([field, validator]) => {
      if (step[field] !== undefined && !validator(step[field])) {
        errors.push(`Step '${stepId}': Invalid ${field}`);
      }
    });
  }

  /**
   * Validate configuration
   */
  validateConfig(config, errors, warnings) {
    const rules = this.validationRules.config;

    Object.entries(config).forEach(([key, value]) => {
      if (rules.validators[key] && !rules.validators[key](value)) {
        errors.push(`Invalid config.${key}: ${value}`);
      }
    });
  }

  /**
   * Validate step dependencies
   */
  validateDependencies(workflow, errors, warnings) {
    const stepNames = new Set(workflow.steps?.map(s => s.name || s.id) || []);

    workflow.steps?.forEach(step => {
      if (step.dependsOn) {
        const deps = Array.isArray(step.dependsOn) ? step.dependsOn : [step.dependsOn];
        deps.forEach(dep => {
          if (!stepNames.has(dep)) {
            errors.push(`Step '${step.name}' depends on unknown step: ${dep}`);
          }
        });
      }
    });

    // Check for circular dependencies
    if (this.hasCircularDependencies(workflow)) {
      errors.push('Circular dependencies detected in workflow');
    }
  }

  /**
   * Validate agent assignments
   */
  validateAgentAssignments(workflow, errors, warnings) {
    if (!workflow.agents || workflow.agents.length === 0) {
      return;
    }

    const definedAgents = new Set(workflow.agents);

    workflow.steps?.forEach(step => {
      if (step.agent && !definedAgents.has(step.agent)) {
        warnings.push(`Step '${step.name}' uses undefined agent: ${step.agent}`);
      }
    });
  }

  /**
   * Validate loop configurations
   */
  validateLoopConfigurations(workflow, errors, warnings) {
    workflow.steps?.forEach(step => {
      if (step.type === 'iterative' || step.type === 'loop') {
        // Check for infinite loop risks
        if (!step.maxIterations && !step.terminationConditions) {
          errors.push(`Step '${step.name}': Loop without termination conditions`);
        }

        if (step.maxIterations && step.maxIterations > 100) {
          warnings.push(`Step '${step.name}': High iteration count (${step.maxIterations})`);
        }

        // Check quality thresholds
        if (step.qualityThreshold && (step.qualityThreshold < 0.5 || step.qualityThreshold > 0.99)) {
          warnings.push(`Step '${step.name}': Unusual quality threshold (${step.qualityThreshold})`);
        }
      }
    });
  }

  /**
   * Validate quality gates
   */
  validateQualityGates(workflow, errors, warnings) {
    if (!workflow.qualityGates || workflow.qualityGates.length === 0) {
      return;
    }

    workflow.qualityGates.forEach(gate => {
      if (!gate.name) {
        errors.push('Quality gate missing name');
      }
      if (!gate.threshold && gate.threshold !== 0) {
        errors.push(`Quality gate '${gate.name}': Missing threshold`);
      }
      if (gate.threshold && (gate.threshold < 0 || gate.threshold > 1)) {
        errors.push(`Quality gate '${gate.name}': Invalid threshold (must be 0-1)`);
      }
    });
  }

  /**
   * Check for circular dependencies
   */
  hasCircularDependencies(workflow) {
    const graph = new Map();

    workflow.steps?.forEach(step => {
      const stepId = step.name || step.id;
      const deps = step.dependsOn ?
        (Array.isArray(step.dependsOn) ? step.dependsOn : [step.dependsOn]) : [];
      graph.set(stepId, deps);
    });

    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = (node) => {
      visited.add(node);
      recursionStack.add(node);

      const deps = graph.get(node) || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          if (hasCycle(dep)) return true;
        } else if (recursionStack.has(dep)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const [node] of graph) {
      if (!visited.has(node)) {
        if (hasCycle(node)) return true;
      }
    }

    return false;
  }

  /**
   * Generate suggestions for improvement
   */
  generateSuggestions(workflow, suggestions) {
    // Suggest adding descriptions
    if (!workflow.description) {
      suggestions.push('Add a description to document workflow purpose');
    }

    workflow.steps?.forEach(step => {
      if (!step.description) {
        suggestions.push(`Add description to step '${step.name}'`);
      }

      // Suggest quality gates for loops
      if ((step.type === 'iterative' || step.type === 'loop') && !step.qualityThreshold) {
        suggestions.push(`Consider adding quality threshold to loop '${step.name}'`);
      }

      // Suggest timeouts for long-running steps
      if (!step.timeout && (step.type === 'api' || step.type === 'task')) {
        suggestions.push(`Consider adding timeout to step '${step.name}'`);
      }
    });

    // Suggest error handling
    if (!workflow.config?.errorHandling) {
      suggestions.push('Define error handling strategy in config');
    }

    // Suggest retries for external calls
    const hasExternalCalls = workflow.steps?.some(s => s.type === 'api');
    if (hasExternalCalls && !workflow.config?.retries) {
      suggestions.push('Consider adding retry configuration for API calls');
    }
  }

  /**
   * Calculate validation score
   */
  calculateValidationScore(errors, warnings) {
    const baseScore = 100;
    const errorPenalty = 20;
    const warningPenalty = 5;

    const score = Math.max(0, baseScore - (errors.length * errorPenalty) - (warnings.length * warningPenalty));
    return Math.round(score);
  }

  /**
   * Validate version string
   */
  validateVersion(version) {
    if (typeof version !== 'string') return false;
    const versionPattern = /^\d+\.\d+(\.\d+)?$/;
    return versionPattern.test(version);
  }

  /**
   * Register custom validator
   */
  registerValidator(type, name, validator) {
    if (!this.customValidators.has(type)) {
      this.customValidators.set(type, new Map());
    }
    this.customValidators.get(type).set(name, validator);
    logger.info(`Registered custom validator: ${type}.${name}`);
  }

  /**
   * Validate against schema
   */
  validateAgainstSchema(template, schema) {
    const errors = [];

    const validateObject = (obj, schemaObj, path = '') => {
      Object.entries(schemaObj).forEach(([key, rules]) => {
        const fullPath = path ? `${path}.${key}` : key;
        const value = obj[key];

        if (rules.required && value === undefined) {
          errors.push(`Required field missing: ${fullPath}`);
        }

        if (value !== undefined) {
          if (rules.type && typeof value !== rules.type) {
            errors.push(`Type mismatch at ${fullPath}: expected ${rules.type}, got ${typeof value}`);
          }

          if (rules.enum && !rules.enum.includes(value)) {
            errors.push(`Invalid value at ${fullPath}: must be one of ${rules.enum.join(', ')}`);
          }

          if (rules.min !== undefined && value < rules.min) {
            errors.push(`Value at ${fullPath} below minimum: ${value} < ${rules.min}`);
          }

          if (rules.max !== undefined && value > rules.max) {
            errors.push(`Value at ${fullPath} above maximum: ${value} > ${rules.max}`);
          }

          if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
            errors.push(`Value at ${fullPath} doesn't match pattern: ${rules.pattern}`);
          }

          if (rules.custom && !rules.custom(value, obj)) {
            errors.push(`Custom validation failed at ${fullPath}`);
          }
        }
      });
    };

    validateObject(template, schema);
    return errors;
  }
}

module.exports = TemplateValidator;