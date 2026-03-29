/**
 * Workflow Templates
 * Sprint 5.13: Pre-defined workflow templates for common patterns
 *
 * Provides templates for:
 * - Feature development
 * - Bug fixing
 * - Refactoring
 * - Documentation
 * - Deployment
 */

const fs = require('fs');
const path = require('path');

/**
 * Template categories
 */
const TemplateCategory = {
  DEVELOPMENT: 'development',
  MAINTENANCE: 'maintenance',
  DEPLOYMENT: 'deployment',
  TESTING: 'testing',
  DOCUMENTATION: 'documentation'
};

/**
 * Built-in workflow templates
 */
const BUILTIN_TEMPLATES = {
  'feature-development': {
    id: 'feature-development',
    name: 'Feature Development',
    category: TemplateCategory.DEVELOPMENT,
    description: 'Complete feature development workflow from spec to deployment',
    stages: [
      {
        name: 'specify',
        title: 'Specification',
        tasks: [
          { name: 'gather-requirements', description: 'Gather and document requirements' },
          { name: 'create-spec', description: 'Create technical specification' },
          { name: 'review-spec', description: 'Review specification with team' }
        ]
      },
      {
        name: 'plan',
        title: 'Planning',
        tasks: [
          { name: 'break-down-tasks', description: 'Break down into implementation tasks' },
          { name: 'estimate-effort', description: 'Estimate effort and timeline' },
          { name: 'identify-dependencies', description: 'Identify dependencies and blockers' }
        ]
      },
      {
        name: 'execute',
        title: 'Execution',
        tasks: [
          { name: 'implement-feature', description: 'Implement feature code' },
          { name: 'write-tests', description: 'Write unit and integration tests' },
          { name: 'code-review', description: 'Conduct code review' },
          { name: 'fix-issues', description: 'Address review feedback' }
        ]
      },
      {
        name: 'deploy',
        title: 'Deployment',
        tasks: [
          { name: 'create-pr', description: 'Create pull request' },
          { name: 'run-ci', description: 'Run CI/CD pipeline' },
          { name: 'merge-deploy', description: 'Merge and deploy' },
          { name: 'verify-production', description: 'Verify in production' }
        ]
      }
    ],
    estimatedDuration: '3-5 days',
    requiredRoles: ['developer', 'reviewer', 'tester']
  },

  'bug-fix': {
    id: 'bug-fix',
    name: 'Bug Fix',
    category: TemplateCategory.MAINTENANCE,
    description: 'Standard bug fix workflow',
    stages: [
      {
        name: 'investigate',
        title: 'Investigation',
        tasks: [
          { name: 'reproduce-bug', description: 'Reproduce the bug' },
          { name: 'identify-root-cause', description: 'Identify root cause' },
          { name: 'assess-impact', description: 'Assess impact and severity' }
        ]
      },
      {
        name: 'fix',
        title: 'Fix',
        tasks: [
          { name: 'implement-fix', description: 'Implement bug fix' },
          { name: 'add-tests', description: 'Add regression tests' },
          { name: 'verify-fix', description: 'Verify fix resolves issue' }
        ]
      },
      {
        name: 'deploy',
        title: 'Deployment',
        tasks: [
          { name: 'code-review', description: 'Code review' },
          { name: 'deploy-fix', description: 'Deploy fix' },
          { name: 'close-issue', description: 'Close bug report' }
        ]
      }
    ],
    estimatedDuration: '1-2 days',
    requiredRoles: ['developer', 'tester']
  },

  'refactoring': {
    id: 'refactoring',
    name: 'Code Refactoring',
    category: TemplateCategory.MAINTENANCE,
    description: 'Safe code refactoring workflow',
    stages: [
      {
        name: 'analyze',
        title: 'Analysis',
        tasks: [
          { name: 'identify-code-smells', description: 'Identify code smells' },
          { name: 'plan-refactoring', description: 'Plan refactoring approach' },
          { name: 'ensure-test-coverage', description: 'Ensure adequate test coverage' }
        ]
      },
      {
        name: 'refactor',
        title: 'Refactoring',
        tasks: [
          { name: 'refactor-code', description: 'Refactor code incrementally' },
          { name: 'run-tests', description: 'Run tests after each change' },
          { name: 'update-documentation', description: 'Update documentation' }
        ]
      },
      {
        name: 'verify',
        title: 'Verification',
        tasks: [
          { name: 'code-review', description: 'Code review' },
          { name: 'performance-test', description: 'Performance testing' },
          { name: 'merge-changes', description: 'Merge changes' }
        ]
      }
    ],
    estimatedDuration: '2-4 days',
    requiredRoles: ['developer', 'architect']
  },

  'documentation': {
    id: 'documentation',
    name: 'Documentation Update',
    category: TemplateCategory.DOCUMENTATION,
    description: 'Documentation creation/update workflow',
    stages: [
      {
        name: 'plan',
        title: 'Planning',
        tasks: [
          { name: 'identify-gaps', description: 'Identify documentation gaps' },
          { name: 'outline-content', description: 'Create content outline' },
          { name: 'gather-info', description: 'Gather required information' }
        ]
      },
      {
        name: 'write',
        title: 'Writing',
        tasks: [
          { name: 'write-docs', description: 'Write documentation' },
          { name: 'add-examples', description: 'Add code examples' },
          { name: 'create-diagrams', description: 'Create diagrams/visuals' }
        ]
      },
      {
        name: 'review',
        title: 'Review',
        tasks: [
          { name: 'technical-review', description: 'Technical review' },
          { name: 'editorial-review', description: 'Editorial review' },
          { name: 'publish-docs', description: 'Publish documentation' }
        ]
      }
    ],
    estimatedDuration: '1-3 days',
    requiredRoles: ['documenter', 'developer']
  },

  'deployment': {
    id: 'deployment',
    name: 'Production Deployment',
    category: TemplateCategory.DEPLOYMENT,
    description: 'Safe production deployment workflow',
    stages: [
      {
        name: 'prepare',
        title: 'Preparation',
        tasks: [
          { name: 'create-release-notes', description: 'Create release notes' },
          { name: 'backup-data', description: 'Backup production data' },
          { name: 'prepare-rollback', description: 'Prepare rollback plan' }
        ]
      },
      {
        name: 'deploy',
        title: 'Deployment',
        tasks: [
          { name: 'deploy-staging', description: 'Deploy to staging' },
          { name: 'smoke-test-staging', description: 'Smoke test staging' },
          { name: 'deploy-production', description: 'Deploy to production' }
        ]
      },
      {
        name: 'verify',
        title: 'Verification',
        tasks: [
          { name: 'smoke-test-prod', description: 'Smoke test production' },
          { name: 'monitor-metrics', description: 'Monitor system metrics' },
          { name: 'notify-team', description: 'Notify team of deployment' }
        ]
      }
    ],
    estimatedDuration: '2-4 hours',
    requiredRoles: ['developer', 'devops']
  }
};

class WorkflowTemplates {
  constructor(options = {}) {
    this.config = {
      templatesPath: options.templatesPath || path.join(process.cwd(), '.bumba', 'templates'),
      ...options
    };

    // Template registry
    this.templates = new Map();

    // Load built-in templates
    this.loadBuiltinTemplates();

    // Load custom templates
    this.loadCustomTemplates();
  }

  /**
   * Load built-in templates
   */
  loadBuiltinTemplates() {
    Object.values(BUILTIN_TEMPLATES).forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  /**
   * Load custom templates from filesystem
   */
  loadCustomTemplates() {
    try {
      if (!fs.existsSync(this.config.templatesPath)) {
        return;
      }

      const files = fs.readdirSync(this.config.templatesPath);

      files.forEach(file => {
        if (file.endsWith('.json')) {
          const templatePath = path.join(this.config.templatesPath, file);
          const data = fs.readFileSync(templatePath, 'utf8');
          const template = JSON.parse(data);

          // Validate template
          if (this.validateTemplate(template)) {
            template.custom = true;
            this.templates.set(template.id, template);
          }
        }
      });
    } catch (error) {
      console.error('Error loading custom templates:', error.message);
    }
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId) {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    return template;
  }

  /**
   * List all templates
   */
  listTemplates(category = null) {
    let templates = Array.from(this.templates.values());

    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    return templates;
  }

  /**
   * Instantiate workflow from template
   */
  instantiateWorkflow(templateId, customization = {}) {
    const template = this.getTemplate(templateId);

    // Create workflow instance
    const workflow = {
      id: this.generateWorkflowId(template.id),
      templateId: template.id,
      name: customization.name || template.name,
      description: customization.description || template.description,
      category: template.category,
      stages: JSON.parse(JSON.stringify(template.stages)), // Deep copy
      estimatedDuration: template.estimatedDuration,
      requiredRoles: template.requiredRoles,
      createdAt: new Date().toISOString(),
      metadata: customization.metadata || {}
    };

    // Apply customizations
    if (customization.stages) {
      this.applyStageCustomizations(workflow, customization.stages);
    }

    if (customization.variables) {
      this.applyVariables(workflow, customization.variables);
    }

    return workflow;
  }

  /**
   * Apply stage customizations
   */
  applyStageCustomizations(workflow, customizations) {
    Object.keys(customizations).forEach(stageName => {
      const stage = workflow.stages.find(s => s.name === stageName);

      if (stage) {
        const custom = customizations[stageName];

        // Add tasks
        if (custom.addTasks) {
          stage.tasks.push(...custom.addTasks);
        }

        // Remove tasks
        if (custom.removeTasks) {
          stage.tasks = stage.tasks.filter(t =>
            !custom.removeTasks.includes(t.name)
          );
        }

        // Modify tasks
        if (custom.modifyTasks) {
          Object.keys(custom.modifyTasks).forEach(taskName => {
            const task = stage.tasks.find(t => t.name === taskName);
            if (task) {
              Object.assign(task, custom.modifyTasks[taskName]);
            }
          });
        }
      }
    });
  }

  /**
   * Apply variables to workflow
   */
  applyVariables(workflow, variables) {
    const applyToString = (str) => {
      return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return variables[key] || match;
      });
    };

    // Apply to workflow fields
    workflow.name = applyToString(workflow.name);
    workflow.description = applyToString(workflow.description);

    // Apply to stages and tasks
    workflow.stages.forEach(stage => {
      stage.title = applyToString(stage.title);

      stage.tasks.forEach(task => {
        task.description = applyToString(task.description);
      });
    });
  }

  /**
   * Create custom template
   */
  createTemplate(template) {
    // Validate
    if (!this.validateTemplate(template)) {
      throw new Error('Invalid template structure');
    }

    // Add to registry
    template.custom = true;
    this.templates.set(template.id, template);

    // Save to filesystem
    this.saveTemplate(template);

    return template;
  }

  /**
   * Save template to filesystem
   */
  saveTemplate(template) {
    try {
      // Ensure directory exists
      if (!fs.existsSync(this.config.templatesPath)) {
        fs.mkdirSync(this.config.templatesPath, { recursive: true });
      }

      const templatePath = path.join(
        this.config.templatesPath,
        `${template.id}.json`
      );

      fs.writeFileSync(
        templatePath,
        JSON.stringify(template, null, 2),
        'utf8'
      );

      return true;
    } catch (error) {
      console.error('Error saving template:', error.message);
      return false;
    }
  }

  /**
   * Delete template
   */
  deleteTemplate(templateId) {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Cannot delete built-in templates
    if (!template.custom) {
      throw new Error('Cannot delete built-in template');
    }

    // Remove from registry
    this.templates.delete(templateId);

    // Delete file
    try {
      const templatePath = path.join(
        this.config.templatesPath,
        `${templateId}.json`
      );

      if (fs.existsSync(templatePath)) {
        fs.unlinkSync(templatePath);
      }

      return true;
    } catch (error) {
      console.error('Error deleting template:', error.message);
      return false;
    }
  }

  /**
   * Validate template structure
   */
  validateTemplate(template) {
    if (!template.id || !template.name) {
      return false;
    }

    if (!template.stages || !Array.isArray(template.stages)) {
      return false;
    }

    // Validate stages
    for (const stage of template.stages) {
      if (!stage.name || !stage.title) {
        return false;
      }

      if (!stage.tasks || !Array.isArray(stage.tasks)) {
        return false;
      }

      // Validate tasks
      for (const task of stage.tasks) {
        if (!task.name || !task.description) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Generate workflow ID
   */
  generateWorkflowId(templateId) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${templateId}-${timestamp}-${random}`;
  }

  /**
   * Get template statistics
   */
  getStatistics() {
    const all = Array.from(this.templates.values());

    const byCategory = {};
    all.forEach(template => {
      const cat = template.category || 'other';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    return {
      totalTemplates: all.length,
      builtinTemplates: all.filter(t => !t.custom).length,
      customTemplates: all.filter(t => t.custom).length,
      byCategory
    };
  }
}

module.exports = WorkflowTemplates;
module.exports.TemplateCategory = TemplateCategory;
module.exports.BUILTIN_TEMPLATES = BUILTIN_TEMPLATES;
