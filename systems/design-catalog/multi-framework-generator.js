/**
 * Multi-Framework Generator
 * Sprint 29: Enable parallel framework generation
 *
 * Generates code for multiple frameworks simultaneously
 */

const EventEmitter = require('events');
const { getOptimizerRegistry } = require('./optimizer-registry');

class MultiFrameworkGenerator extends EventEmitter {
  constructor() {
    super();
    this.optimizerRegistry = getOptimizerRegistry();
    this.generationQueue = new Map();
    this.results = new Map();
  }

  /**
   * Generate code for multiple frameworks in parallel
   */
  async generateForFrameworks(designComponent, frameworks, options = {}) {
    const generationId = `multi_${Date.now()}`;

    this.emit('generation:started', {
      id: generationId,
      frameworks,
      component: designComponent.name
    });

    try {
      // Generate for all frameworks in parallel
      const generationPromises = frameworks.map(framework =>
        this.generateForFramework(designComponent, framework, options)
          .then(result => ({ framework, result, success: true }))
          .catch(error => ({ framework, error, success: false }))
      );

      const results = await Promise.all(generationPromises);

      // Organize results by framework
      const organized = {
        id: generationId,
        component: designComponent.name,
        frameworks: {},
        successful: [],
        failed: [],
        timestamp: new Date().toISOString()
      };

      results.forEach(({ framework, result, error, success }) => {
        if (success) {
          organized.frameworks[framework] = result;
          organized.successful.push(framework);
        } else {
          organized.frameworks[framework] = { error: error.message };
          organized.failed.push(framework);
        }
      });

      // Store results
      this.results.set(generationId, organized);

      this.emit('generation:completed', organized);

      return organized;

    } catch (error) {
      this.emit('generation:failed', { id: generationId, error });
      throw error;
    }
  }

  /**
   * Generate code for a single framework
   */
  async generateForFramework(designComponent, framework, options = {}) {
    const optimizer = this.optimizerRegistry.getOptimizer(framework);

    if (!optimizer) {
      throw new Error(`No optimizer found for framework: ${framework}`);
    }

    // Run the optimizer pipeline
    const result = await this.optimizerRegistry.runPipeline(
      designComponent,
      framework,
      options
    );

    return result;
  }

  /**
   * Generate for all supported frameworks
   */
  async generateForAllFrameworks(designComponent, options = {}) {
    const frameworks = this.optimizerRegistry.getSupportedFrameworks();
    return this.generateForFrameworks(designComponent, frameworks, options);
  }

  /**
   * Generate with framework comparison
   */
  async generateWithComparison(designComponent, frameworks, options = {}) {
    const results = await this.generateForFrameworks(designComponent, frameworks, options);

    // Add comparison metrics
    const comparison = {
      ...results,
      comparison: this.compareFrameworkOutputs(results.frameworks)
    };

    return comparison;
  }

  /**
   * Compare outputs across frameworks
   */
  compareFrameworkOutputs(frameworkResults) {
    const comparison = {
      codeSize: {},
      complexity: {},
      fileCount: {}
    };

    Object.entries(frameworkResults).forEach(([framework, result]) => {
      if (result.result) {
        comparison.codeSize[framework] = result.result.code?.length || 0;
        comparison.fileCount[framework] = Object.keys(result.result.files || {}).length;
      }
    });

    return comparison;
  }

  /**
   * Batch generate for multiple components and frameworks
   */
  async batchGenerate(components, frameworks, options = {}) {
    const batchId = `batch_${Date.now()}`;

    this.emit('batch:started', {
      id: batchId,
      components: components.length,
      frameworks: frameworks.length
    });

    const batchResults = [];

    for (const component of components) {
      const result = await this.generateForFrameworks(component, frameworks, options);
      batchResults.push(result);
    }

    this.emit('batch:completed', {
      id: batchId,
      results: batchResults.length
    });

    return {
      id: batchId,
      results: batchResults,
      summary: {
        totalComponents: components.length,
        totalFrameworks: frameworks.length,
        totalGenerations: components.length * frameworks.length
      }
    };
  }

  /**
   * Get generation results
   */
  getResults(generationId) {
    return this.results.get(generationId);
  }

  /**
   * Get supported frameworks
   */
  getSupportedFrameworks() {
    return this.optimizerRegistry.getSupportedFrameworks();
  }

  /**
   * Check if framework is supported
   */
  isFrameworkSupported(framework) {
    return this.optimizerRegistry.isSupported(framework);
  }

  /**
   * Store generated code by framework
   */
  async storeByFramework(generationId, outputDir) {
    const results = this.results.get(generationId);

    if (!results) {
      throw new Error(`No results found for generation: ${generationId}`);
    }

    const fs = require('fs').promises;
    const path = require('path');

    const stored = {};

    for (const [framework, result] of Object.entries(results.frameworks)) {
      if (result.result) {
        const frameworkDir = path.join(outputDir, framework);
        await fs.mkdir(frameworkDir, { recursive: true });

        // Store main component file
        const componentFile = path.join(frameworkDir, `${results.component}.${this.getFileExtension(framework)}`);
        await fs.writeFile(componentFile, result.result.code || '');

        // Store supporting files
        if (result.result.files) {
          for (const [fileName, content] of Object.entries(result.result.files)) {
            const filePath = path.join(frameworkDir, fileName);
            await fs.writeFile(filePath, content);
          }
        }

        stored[framework] = frameworkDir;
      }
    }

    return stored;
  }

  /**
   * Get file extension for framework
   */
  getFileExtension(framework) {
    const extensions = {
      react: 'tsx',
      vue: 'vue',
      svelte: 'svelte',
      angular: 'component.ts',
      'web-components': 'js'
    };

    return extensions[framework] || 'js';
  }

  /**
   * Generate framework selection UI data
   */
  getFrameworkSelectionData() {
    const frameworks = this.getSupportedFrameworks();

    return frameworks.map(framework => {
      const optimizer = this.optimizerRegistry.getOptimizer(framework);

      return {
        id: framework,
        name: framework.charAt(0).toUpperCase() + framework.slice(1),
        version: optimizer.version || 'unknown',
        supported: true,
        features: this.getFrameworkFeatures(framework)
      };
    });
  }

  /**
   * Get framework-specific features
   */
  getFrameworkFeatures(framework) {
    const optimizer = this.optimizerRegistry.getOptimizer(framework);

    return {
      typescript: optimizer.config?.useTypeScript !== false,
      hooks: optimizer.config?.useHooks || false,
      composition: framework === 'vue' ? true : false,
      stores: framework === 'svelte' ? true : false
    };
  }

  /**
   * Performance benchmark across frameworks
   */
  async benchmarkFrameworks(designComponent, options = {}) {
    const frameworks = this.getSupportedFrameworks();
    const benchmarks = {};

    for (const framework of frameworks) {
      const startTime = Date.now();

      try {
        await this.generateForFramework(designComponent, framework, options);
        const endTime = Date.now();

        benchmarks[framework] = {
          duration: endTime - startTime,
          success: true
        };
      } catch (error) {
        benchmarks[framework] = {
          duration: null,
          success: false,
          error: error.message
        };
      }
    }

    return {
      component: designComponent.name,
      benchmarks,
      fastest: this.findFastest(benchmarks),
      slowest: this.findSlowest(benchmarks)
    };
  }

  /**
   * Find fastest framework
   */
  findFastest(benchmarks) {
    let fastest = null;
    let minDuration = Infinity;

    Object.entries(benchmarks).forEach(([framework, data]) => {
      if (data.success && data.duration < minDuration) {
        minDuration = data.duration;
        fastest = framework;
      }
    });

    return { framework: fastest, duration: minDuration };
  }

  /**
   * Find slowest framework
   */
  findSlowest(benchmarks) {
    let slowest = null;
    let maxDuration = 0;

    Object.entries(benchmarks).forEach(([framework, data]) => {
      if (data.success && data.duration > maxDuration) {
        maxDuration = data.duration;
        slowest = framework;
      }
    });

    return { framework: slowest, duration: maxDuration };
  }
}

module.exports = MultiFrameworkGenerator;
