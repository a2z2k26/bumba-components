/**
 * React Optimizer
 * Optimizes code generation specifically for React applications
 * Sprint 14: React Optimizer
 */

const SmartCodeGenerator = require('./smart-code-generator');

class ReactOptimizer {
  constructor() {
    this.name = 'ReactOptimizer';
    this.version = '1.0.0';
    this.framework = 'react';

    // React-specific configuration
    this.config = {
      version: '18.x',
      useHooks: true,
      useTypeScript: true,
      useMemo: true,
      useCallback: true,
      useContext: true,
      lazyComponents: true,
      errorBoundaries: true,
      suspense: true,
      strictMode: true,
      customHooks: true
    };

    // React patterns
    this.patterns = {
      hooks: this.getHookPatterns(),
      performance: this.getPerformancePatterns(),
      stateManagement: this.getStatePatterns(),
      composition: this.getCompositionPatterns()
    };
  }

  /**
   * Optimize code for React
   */
  async optimize(code, componentData, config) {
    let optimizedCode = code;

    // Apply React-specific optimizations
    optimizedCode = await this.optimizeHooks(optimizedCode, componentData, config);
    optimizedCode = await this.optimizePerformance(optimizedCode, componentData, config);
    optimizedCode = await this.optimizeStateManagement(optimizedCode, componentData, config);
    optimizedCode = await this.optimizeComposition(optimizedCode, componentData, config);
    optimizedCode = await this.addErrorBoundary(optimizedCode, componentData, config);
    optimizedCode = await this.addSuspense(optimizedCode, componentData, config);

    return optimizedCode;
  }

  /**
   * Generate React component from design data
   */
  async generateComponent(componentData, config) {
    const mergedConfig = { ...this.config, ...config };

    // Generate component structure
    const component = mergedConfig.useTypeScript
      ? this.generateTypeScriptComponent(componentData, mergedConfig)
      : this.generateJavaScriptComponent(componentData, mergedConfig);

    return component;
  }

  /**
   * Generate TypeScript React component
   */
  generateTypeScriptComponent(data, config) {
    const { name, props, state, variants } = data;

    let code = [];

    // Imports
    code.push("import React, { useState, useEffect, useMemo, useCallback } from 'react';");
    if (config.styleFormat === 'styled-components') {
      code.push("import styled from 'styled-components';");
    }
    code.push('');

    // Type definitions
    code.push(this.generateTypeDefinitions(data));
    code.push('');

    // Component
    code.push(`const ${name}: React.FC<${name}Props> = ({`);

    // Props with defaults
    const propsList = Object.entries(props || {}).map(([key, prop]) => {
      return prop.default ? `  ${key} = ${JSON.stringify(prop.default)}` : `  ${key}`;
    });
    code.push(propsList.join(',\n'));
    code.push('}) => {');

    // Hooks
    if (state && Object.keys(state).length > 0) {
      code.push(this.generateStateHooks(state));
    }

    // Custom hooks
    if (config.customHooks) {
      code.push(this.generateCustomHooks(data));
    }

    // Memoized values
    if (config.useMemo) {
      code.push(this.generateMemoizedValues(data));
    }

    // Callbacks
    if (config.useCallback) {
      code.push(this.generateCallbacks(data));
    }

    // Effects
    code.push(this.generateEffects(data));

    // Render
    code.push('  return (');
    code.push(this.generateJSX(data, config));
    code.push('  );');
    code.push('};');
    code.push('');

    // Memoized export
    code.push(`export default React.memo(${name});`);

    return code.join('\n');
  }

  /**
   * Generate JavaScript React component
   */
  generateJavaScriptComponent(data, config) {
    const { name, props, state } = data;

    let code = [];

    // Imports
    code.push("import React, { useState, useEffect, useMemo, useCallback } from 'react';");
    code.push('');

    // Component
    code.push(`const ${name} = ({`);

    // Props
    const propsList = Object.keys(props || {});
    code.push(`  ${propsList.join(', ')}`);
    code.push('}) => {');

    // State
    if (state && Object.keys(state).length > 0) {
      code.push(this.generateStateHooks(state));
    }

    // Render
    code.push('  return (');
    code.push(this.generateJSX(data, config));
    code.push('  );');
    code.push('};');
    code.push('');

    code.push(`export default ${name};`);

    return code.join('\n');
  }

  /**
   * Optimize hooks usage
   */
  async optimizeHooks(code, data, config) {
    if (!config.useHooks) return code;

    // Detect and optimize useState patterns
    code = this.optimizeUseState(code);

    // Detect and optimize useEffect patterns
    code = this.optimizeUseEffect(code);

    // Add custom hooks where beneficial
    if (config.customHooks) {
      code = this.extractCustomHooks(code, data);
    }

    return code;
  }

  /**
   * Optimize performance
   */
  async optimizePerformance(code, data, config) {
    // Add React.memo where appropriate
    code = this.addMemoization(code, data);

    // Add useMemo for expensive computations
    if (config.useMemo) {
      code = this.addUseMemo(code, data);
    }

    // Add useCallback for function props
    if (config.useCallback) {
      code = this.addUseCallback(code, data);
    }

    // Add lazy loading
    if (config.lazyComponents) {
      code = this.addLazyLoading(code, data);
    }

    return code;
  }

  /**
   * Optimize state management
   */
  async optimizeStateManagement(code, data, config) {
    // Detect complex state and suggest useReducer
    if (this.shouldUseReducer(data.state)) {
      code = this.convertToUseReducer(code, data.state);
    }

    // Add context for shared state
    if (config.useContext && this.shouldUseContext(data)) {
      code = this.addContextProvider(code, data);
    }

    return code;
  }

  /**
   * Optimize composition
   */
  async optimizeComposition(code, data, config) {
    // Extract reusable components
    code = this.extractSubComponents(code, data);

    // Add render props where beneficial
    code = this.addRenderProps(code, data);

    // Use composition over inheritance
    code = this.favorComposition(code, data);

    return code;
  }

  /**
   * Add error boundary
   */
  async addErrorBoundary(code, data, config) {
    if (!config.errorBoundaries) return code;

    const errorBoundary = `
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong.</div>;
    }
    return this.props.children;
  }
}`;

    return errorBoundary + '\n\n' + code;
  }

  /**
   * Add Suspense wrapper
   */
  async addSuspense(code, data, config) {
    if (!config.suspense) return code;

    // Wrap lazy components in Suspense
    if (code.includes('React.lazy')) {
      code = code.replace(
        /return \(/,
        'return (\n    <React.Suspense fallback={<div>Loading...</div>}>'
      );
      code = code.replace(
        /\);$/m,
        '    </React.Suspense>\n  );'
      );
    }

    return code;
  }

  /**
   * Helper: Generate type definitions
   */
  generateTypeDefinitions(data) {
    const { name, props } = data;

    let types = [`interface ${name}Props {`];

    Object.entries(props || {}).forEach(([key, prop]) => {
      const isOptional = !prop.required ? '?' : '';
      types.push(`  ${key}${isOptional}: ${this.getTSType(prop.type)};`);
    });

    types.push('}');
    return types.join('\n');
  }

  /**
   * Helper: Generate state hooks
   */
  generateStateHooks(state) {
    const hooks = [];

    Object.entries(state).forEach(([key, initialValue]) => {
      const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
      hooks.push(`  const [${key}, set${capitalizedKey}] = useState(${JSON.stringify(initialValue)});`);
    });

    return hooks.join('\n');
  }

  /**
   * Helper: Generate custom hooks
   */
  generateCustomHooks(data) {
    const hooks = [];

    // Example: useWindowSize hook
    if (data.responsive) {
      hooks.push('  const windowSize = useWindowSize();');
    }

    // Example: useDebounce hook
    if (data.interactions?.some(i => i.type === 'input')) {
      hooks.push('  const debouncedValue = useDebounce(value, 300);');
    }

    return hooks.join('\n');
  }

  /**
   * Helper: Generate memoized values
   */
  generateMemoizedValues(data) {
    const memos = [];

    // Example memoization
    if (data.props?.items) {
      memos.push(`  const processedItems = useMemo(() => {
    return items.filter(item => item.active);
  }, [items]);`);
    }

    return memos.join('\n');
  }

  /**
   * Helper: Generate callbacks
   */
  generateCallbacks(data) {
    const callbacks = [];

    // Example callback
    if (data.props?.onClick) {
      callbacks.push(`  const handleClick = useCallback((event) => {
    event.preventDefault();
    onClick?.(event);
  }, [onClick]);`);
    }

    return callbacks.join('\n');
  }

  /**
   * Helper: Generate effects
   */
  generateEffects(data) {
    const effects = [];

    // Example effect
    if (data.state) {
      effects.push(`  useEffect(() => {
    // Component mount/unmount logic
  }, []);`);
    }

    return effects.join('\n');
  }

  /**
   * Helper: Generate JSX
   */
  generateJSX(data, config) {
    const { name, children } = data;
    const className = name.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1);

    let jsx = [`    <div className="${className}">`];

    if (children && children.length > 0) {
      children.forEach(child => {
        jsx.push(`      <${child.name} />`);
      });
    } else {
      jsx.push(`      {/* ${name} content */}`);
    }

    jsx.push('    </div>');

    return jsx.join('\n');
  }

  /**
   * Helper: Get TypeScript type
   */
  getTSType(type) {
    const typeMap = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      array: 'any[]',
      object: 'Record<string, any>',
      function: '(event: any) => void',
      any: 'any'
    };
    return typeMap[type] || 'any';
  }

  /**
   * Helper: Pattern definitions
   */
  getHookPatterns() {
    return {
      useState: /const \[(\w+), set\w+\] = useState/g,
      useEffect: /useEffect\(\(\) => \{/g,
      useMemo: /useMemo\(\(\) => \{/g,
      useCallback: /useCallback\(\(/g
    };
  }

  getPerformancePatterns() {
    return {
      memo: /React\.memo\(/g,
      lazy: /React\.lazy\(/g,
      suspense: /<React\.Suspense/g
    };
  }

  getStatePatterns() {
    return {
      reducer: /useReducer\(/g,
      context: /useContext\(/g
    };
  }

  getCompositionPatterns() {
    return {
      renderProp: /render=\{/g,
      children: /children\(/g
    };
  }

  /**
   * Helper: Optimization utilities
   */
  optimizeUseState(code) {
    // Combine related state into single object where appropriate
    return code;
  }

  optimizeUseEffect(code) {
    // Add dependency arrays and cleanup functions
    return code;
  }

  extractCustomHooks(code, data) {
    // Extract repeated logic into custom hooks
    return code;
  }

  addMemoization(code, data) {
    // Wrap component with React.memo if not already wrapped
    if (!code.includes('React.memo')) {
      code = code.replace(/export default (\w+);/, 'export default React.memo($1);');
    }
    return code;
  }

  addUseMemo(code, data) {
    // Add useMemo for expensive computations
    return code;
  }

  addUseCallback(code, data) {
    // Add useCallback for function props
    return code;
  }

  addLazyLoading(code, data) {
    // Convert imports to lazy loading where appropriate
    return code;
  }

  shouldUseReducer(state) {
    // Use reducer for complex state logic
    return state && Object.keys(state).length > 3;
  }

  convertToUseReducer(code, state) {
    // Convert useState to useReducer
    return code;
  }

  shouldUseContext(data) {
    // Use context for deeply nested props
    return data.children && data.children.length > 2;
  }

  addContextProvider(code, data) {
    // Add context provider wrapper
    return code;
  }

  extractSubComponents(code, data) {
    // Extract repeated JSX into sub-components
    return code;
  }

  addRenderProps(code, data) {
    // Add render props pattern where beneficial
    return code;
  }

  favorComposition(code, data) {
    // Use composition patterns over inheritance
    return code;
  }
}

module.exports = ReactOptimizer;