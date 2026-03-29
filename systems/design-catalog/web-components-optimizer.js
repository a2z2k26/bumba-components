/**
 * Web Components & Accessibility Optimizer
 * Generates accessible, standards-compliant Web Components
 * Sprint 16: Web Components & Accessibility
 */

const SmartCodeGenerator = require('./smart-code-generator');

class WebComponentsOptimizer {
  constructor() {
    this.name = 'WebComponentsOptimizer';
    this.version = '1.0.0';
    this.framework = 'web-components';

    // Web Components configuration
    this.config = {
      shadowDOM: true,
      customElements: true,
      htmlTemplates: true,
      cssVariables: true,
      slots: true,
      lifecycle: true,
      accessibility: {
        wcag: 'AA', // A, AA, AAA
        ariaSupport: true,
        keyboardNavigation: true,
        screenReaderOptimized: true,
        focusManagement: true,
        contrastRatio: 'AA',
        semanticHTML: true,
        announcements: true,
        skipLinks: false,
        reducedMotion: true
      },
      polyfills: false,
      typescript: true,
      litElement: false // Option to use Lit instead of vanilla
    };

    // WCAG compliance patterns
    this.wcagPatterns = {
      'A': this.getWCAG_A_Requirements(),
      'AA': this.getWCAG_AA_Requirements(),
      'AAA': this.getWCAG_AAA_Requirements()
    };

    // ARIA patterns
    this.ariaPatterns = this.getARIAPatterns();
  }

  /**
   * Optimize code for Web Components with accessibility
   */
  async optimize(code, componentData, config) {
    let optimizedCode = code;

    // Apply Web Components optimizations
    optimizedCode = await this.optimizeShadowDOM(optimizedCode, componentData, config);
    optimizedCode = await this.optimizeCustomElements(optimizedCode, componentData, config);
    optimizedCode = await this.optimizeSlots(optimizedCode, componentData, config);

    // Apply accessibility optimizations
    optimizedCode = await this.optimizeAccessibility(optimizedCode, componentData, config);
    optimizedCode = await this.addARIASupport(optimizedCode, componentData, config);
    optimizedCode = await this.addKeyboardSupport(optimizedCode, componentData, config);
    optimizedCode = await this.addFocusManagement(optimizedCode, componentData, config);
    optimizedCode = await this.addScreenReaderSupport(optimizedCode, componentData, config);

    return optimizedCode;
  }

  /**
   * Generate Web Component from design data
   */
  async generateComponent(componentData, config) {
    const mergedConfig = { ...this.config, ...config };

    // Generate Web Component
    const component = mergedConfig.litElement
      ? this.generateLitElement(componentData, mergedConfig)
      : this.generateVanillaWebComponent(componentData, mergedConfig);

    return component;
  }

  /**
   * Generate Vanilla Web Component
   */
  generateVanillaWebComponent(data, config) {
    const { name, props, state, styles } = data;
    const tagName = this.toKebabCase(name);

    let code = [];

    // Class definition
    code.push(`class ${name} extends HTMLElement {`);

    // Constructor
    code.push('  constructor() {');
    code.push('    super();');

    if (config.shadowDOM) {
      code.push("    this.attachShadow({ mode: 'open' });");
    }

    // Initialize state
    if (state) {
      code.push(this.generateStateInitialization(state));
    }

    // Bind methods
    code.push(this.generateMethodBindings(data));

    code.push('  }');
    code.push('');

    // Observed attributes
    if (props && Object.keys(props).length > 0) {
      code.push('  static get observedAttributes() {');
      code.push(`    return [${Object.keys(props).map(p => `'${this.toKebabCase(p)}'`).join(', ')}];`);
      code.push('  }');
      code.push('');
    }

    // Properties getters/setters
    if (props) {
      code.push(this.generateProperties(props));
    }

    // Connected callback
    code.push('  connectedCallback() {');
    code.push('    this.render();');
    code.push('    this.setupEventListeners();');
    code.push('    this.setupAccessibility();');
    if (config.accessibility.keyboardNavigation) {
      code.push('    this.setupKeyboardNavigation();');
    }
    if (config.accessibility.focusManagement) {
      code.push('    this.setupFocusManagement();');
    }
    code.push('  }');
    code.push('');

    // Disconnected callback
    code.push('  disconnectedCallback() {');
    code.push('    this.removeEventListeners();');
    code.push('  }');
    code.push('');

    // Attribute changed callback
    code.push('  attributeChangedCallback(name, oldValue, newValue) {');
    code.push('    if (oldValue !== newValue) {');
    code.push('      this.render();');
    code.push('    }');
    code.push('  }');
    code.push('');

    // Render method
    code.push('  render() {');
    code.push('    const template = this.getTemplate();');
    code.push('    const styles = this.getStyles();');

    if (config.shadowDOM) {
      code.push('    this.shadowRoot.innerHTML = `');
      code.push('      <style>${styles}</style>');
      code.push('      ${template}');
      code.push('    `;');
    } else {
      code.push('    this.innerHTML = template;');
    }

    code.push('  }');
    code.push('');

    // Template method
    code.push('  getTemplate() {');
    code.push(this.generateTemplate(data, config));
    code.push('  }');
    code.push('');

    // Styles method
    code.push('  getStyles() {');
    code.push(this.generateComponentStyles(data, config));
    code.push('  }');
    code.push('');

    // Event listeners setup
    code.push('  setupEventListeners() {');
    code.push(this.generateEventListeners(data));
    code.push('  }');
    code.push('');

    // Event listeners cleanup
    code.push('  removeEventListeners() {');
    code.push('    // Remove event listeners');
    code.push('  }');
    code.push('');

    // Accessibility setup
    code.push('  setupAccessibility() {');
    code.push(this.generateAccessibilitySetup(data, config));
    code.push('  }');
    code.push('');

    // Keyboard navigation
    if (config.accessibility.keyboardNavigation) {
      code.push('  setupKeyboardNavigation() {');
      code.push(this.generateKeyboardNavigation(data));
      code.push('  }');
      code.push('');
    }

    // Focus management
    if (config.accessibility.focusManagement) {
      code.push('  setupFocusManagement() {');
      code.push(this.generateFocusManagement(data));
      code.push('  }');
      code.push('');
    }

    // Custom methods
    if (data.methods) {
      Object.entries(data.methods).forEach(([name, method]) => {
        code.push(`  ${name}(${method.params || ''}) {`);
        code.push(`    ${method.body}`);
        code.push('  }');
        code.push('');
      });
    }

    code.push('}');
    code.push('');

    // Register custom element
    code.push(`customElements.define('${tagName}', ${name});`);
    code.push('');

    // Export
    code.push(`export default ${name};`);

    return code.join('\n');
  }

  /**
   * Generate Lit Element (alternative)
   */
  generateLitElement(data, config) {
    const { name, props, state } = data;
    const tagName = this.toKebabCase(name);

    let code = [];

    // Imports
    code.push("import { LitElement, html, css } from 'lit';");
    code.push("import { customElement, property, state } from 'lit/decorators.js';");
    code.push('');

    // Component class
    code.push(`@customElement('${tagName}')`);
    code.push(`class ${name} extends LitElement {`);

    // Static styles
    code.push('  static styles = css`');
    code.push(this.generateLitStyles(data, config));
    code.push('  `;');
    code.push('');

    // Properties
    if (props) {
      Object.entries(props).forEach(([key, prop]) => {
        code.push(`  @property({ type: ${this.getLitType(prop.type)} })`);
        code.push(`  ${key} = ${JSON.stringify(prop.default || '')};`);
        code.push('');
      });
    }

    // State
    if (state) {
      Object.entries(state).forEach(([key, value]) => {
        code.push('  @state()');
        code.push(`  ${key} = ${JSON.stringify(value)};`);
        code.push('');
      });
    }

    // Render method
    code.push('  render() {');
    code.push('    return html`');
    code.push(this.generateLitTemplate(data, config));
    code.push('    `;');
    code.push('  }');

    code.push('}');
    code.push('');

    code.push(`export default ${name};`);

    return code.join('\n');
  }

  /**
   * Generate template
   */
  generateTemplate(data, config) {
    const { name } = data;
    const className = this.toKebabCase(name);

    let template = [];

    template.push('    return `');
    template.push(`      <div class="${className}" role="${this.getRole(data)}">`);

    // Skip link for keyboard navigation
    if (config.accessibility.skipLinks) {
      template.push('        <a href="#main-content" class="skip-link">Skip to main content</a>');
    }

    // Header with proper heading hierarchy
    if (data.header) {
      template.push(`        <header role="banner">`);
      template.push(`          <h1>${data.header}</h1>`);
      template.push('        </header>');
    }

    // Main content with landmark
    template.push('        <main id="main-content" role="main">');

    // Slots for content projection
    if (data.slots) {
      data.slots.forEach(slot => {
        const slotName = slot.name ? ` name="${slot.name}"` : '';
        template.push(`          <slot${slotName}>${slot.fallback || ''}</slot>`);
      });
    } else {
      template.push('          <slot></slot>');
    }

    template.push('        </main>');

    // Footer with proper role
    if (data.footer) {
      template.push('        <footer role="contentinfo">');
      template.push(`          ${data.footer}`);
      template.push('        </footer>');
    }

    template.push('      </div>');
    template.push('    `;');

    return template.join('\n');
  }

  /**
   * Generate component styles
   */
  generateComponentStyles(data, config) {
    const { name } = data;
    const className = this.toKebabCase(name);

    let styles = [];

    styles.push('    return `');

    // CSS custom properties for theming
    styles.push('      :host {');
    styles.push('        --primary-color: #007bff;');
    styles.push('        --text-color: #333;');
    styles.push('        --background-color: #fff;');
    styles.push('        --focus-color: #0056b3;');
    styles.push('        --focus-outline: 2px solid var(--focus-color);');
    styles.push('        display: block;');
    styles.push('      }');
    styles.push('');

    // Skip link styles
    if (config.accessibility.skipLinks) {
      styles.push('      .skip-link {');
      styles.push('        position: absolute;');
      styles.push('        top: -40px;');
      styles.push('        left: 0;');
      styles.push('        background: var(--primary-color);');
      styles.push('        color: white;');
      styles.push('        padding: 8px;');
      styles.push('        text-decoration: none;');
      styles.push('        z-index: 100;');
      styles.push('      }');
      styles.push('');
      styles.push('      .skip-link:focus {');
      styles.push('        top: 0;');
      styles.push('      }');
      styles.push('');
    }

    // Focus styles for accessibility
    styles.push('      :focus {');
    styles.push('        outline: var(--focus-outline);');
    styles.push('        outline-offset: 2px;');
    styles.push('      }');
    styles.push('');

    // Reduced motion support
    if (config.accessibility.reducedMotion) {
      styles.push('      @media (prefers-reduced-motion: reduce) {');
      styles.push('        * {');
      styles.push('          animation-duration: 0.01ms !important;');
      styles.push('          animation-iteration-count: 1 !important;');
      styles.push('          transition-duration: 0.01ms !important;');
      styles.push('        }');
      styles.push('      }');
      styles.push('');
    }

    // High contrast mode support
    styles.push('      @media (prefers-contrast: high) {');
    styles.push('        :host {');
    styles.push('          --primary-color: #000;');
    styles.push('          --background-color: #fff;');
    styles.push('        }');
    styles.push('      }');
    styles.push('');

    // Dark mode support
    styles.push('      @media (prefers-color-scheme: dark) {');
    styles.push('        :host {');
    styles.push('          --text-color: #f0f0f0;');
    styles.push('          --background-color: #1a1a1a;');
    styles.push('        }');
    styles.push('      }');

    styles.push('    `;');

    return styles.join('\n');
  }

  /**
   * Generate accessibility setup
   */
  generateAccessibilitySetup(data, config) {
    const setup = [];
    const root = config.shadowDOM ? 'this.shadowRoot' : 'this';

    // Set ARIA attributes
    setup.push(`    // Set ARIA attributes`);
    setup.push(`    this.setAttribute('role', '${this.getRole(data)}');`);

    if (data.ariaLabel) {
      setup.push(`    this.setAttribute('aria-label', '${data.ariaLabel}');`);
    }

    // Live regions for announcements
    if (config.accessibility.announcements) {
      setup.push(`    // Setup live region for announcements`);
      setup.push(`    const liveRegion = document.createElement('div');`);
      setup.push(`    liveRegion.setAttribute('role', 'status');`);
      setup.push(`    liveRegion.setAttribute('aria-live', 'polite');`);
      setup.push(`    liveRegion.setAttribute('aria-atomic', 'true');`);
      setup.push(`    liveRegion.className = 'sr-only';`);
      setup.push(`    ${root}.appendChild(liveRegion);`);
    }

    // Form field associations
    if (data.type === 'input' || data.type === 'form') {
      setup.push(`    // Associate labels with form fields`);
      setup.push(`    const inputs = ${root}.querySelectorAll('input, select, textarea');`);
      setup.push(`    inputs.forEach((input, index) => {`);
      setup.push(`      if (!input.id) input.id = \`input-\${index}\`;`);
      setup.push(`      const label = input.previousElementSibling;`);
      setup.push(`      if (label && label.tagName === 'LABEL') {`);
      setup.push(`        label.setAttribute('for', input.id);`);
      setup.push(`      }`);
      setup.push(`    });`);
    }

    return setup.join('\n');
  }

  /**
   * Generate keyboard navigation
   */
  generateKeyboardNavigation(data) {
    const nav = [];

    nav.push(`    // Keyboard navigation`);
    nav.push(`    this.addEventListener('keydown', (e) => {`);
    nav.push(`      switch(e.key) {`);
    nav.push(`        case 'Enter':`);
    nav.push(`        case ' ':`);
    nav.push(`          if (e.target.matches('button, a, [role="button"]')) {`);
    nav.push(`            e.preventDefault();`);
    nav.push(`            e.target.click();`);
    nav.push(`          }`);
    nav.push(`          break;`);
    nav.push(`        case 'Escape':`);
    nav.push(`          if (this.hasAttribute('closable')) {`);
    nav.push(`            this.close();`);
    nav.push(`          }`);
    nav.push(`          break;`);
    nav.push(`        case 'Tab':`);
    nav.push(`          // Handle tab navigation`);
    nav.push(`          this.handleTabNavigation(e);`);
    nav.push(`          break;`);
    nav.push(`        case 'ArrowUp':`);
    nav.push(`        case 'ArrowDown':`);
    nav.push(`          // Handle arrow navigation for menus/lists`);
    nav.push(`          this.handleArrowNavigation(e);`);
    nav.push(`          break;`);
    nav.push(`      }`);
    nav.push(`    });`);

    return nav.join('\n');
  }

  /**
   * Generate focus management
   */
  generateFocusManagement(data) {
    const focus = [];

    focus.push(`    // Focus management`);
    focus.push(`    const focusableElements = this.querySelectorAll(`);
    focus.push(`      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'`);
    focus.push(`    );`);
    focus.push(``);
    focus.push(`    if (focusableElements.length > 0) {`);
    focus.push(`      this.firstFocusableElement = focusableElements[0];`);
    focus.push(`      this.lastFocusableElement = focusableElements[focusableElements.length - 1];`);
    focus.push(`    }`);
    focus.push(``);
    focus.push(`    // Trap focus for modal-like components`);
    focus.push(`    if (this.hasAttribute('trap-focus')) {`);
    focus.push(`      this.addEventListener('keydown', (e) => {`);
    focus.push(`        if (e.key === 'Tab') {`);
    focus.push(`          if (e.shiftKey && document.activeElement === this.firstFocusableElement) {`);
    focus.push(`            e.preventDefault();`);
    focus.push(`            this.lastFocusableElement.focus();`);
    focus.push(`          } else if (!e.shiftKey && document.activeElement === this.lastFocusableElement) {`);
    focus.push(`            e.preventDefault();`);
    focus.push(`            this.firstFocusableElement.focus();`);
    focus.push(`          }`);
    focus.push(`        }`);
    focus.push(`      });`);
    focus.push(`    }`);

    return focus.join('\n');
  }

  /**
   * Helper: Get WCAG requirements
   */
  getWCAG_A_Requirements() {
    return {
      altText: true,
      headingHierarchy: true,
      keyboardAccess: true,
      formLabels: true,
      errorIdentification: true
    };
  }

  getWCAG_AA_Requirements() {
    return {
      ...this.getWCAG_A_Requirements(),
      colorContrast: 4.5,
      focusVisible: true,
      consistentNavigation: true,
      multipleWays: true,
      headingsAndLabels: true
    };
  }

  getWCAG_AAA_Requirements() {
    return {
      ...this.getWCAG_AA_Requirements(),
      colorContrast: 7,
      contextChanges: true,
      unusualWords: true,
      abbreviations: true,
      readingLevel: true
    };
  }

  /**
   * Helper: Get ARIA patterns
   */
  getARIAPatterns() {
    return {
      landmarks: ['banner', 'main', 'navigation', 'contentinfo', 'complementary'],
      roles: ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox'],
      properties: ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-required'],
      states: ['aria-expanded', 'aria-selected', 'aria-checked', 'aria-disabled']
    };
  }

  /**
   * Helper: Get role for component
   */
  getRole(data) {
    const typeRoles = {
      button: 'button',
      input: 'textbox',
      navigation: 'navigation',
      modal: 'dialog',
      alert: 'alert',
      list: 'list',
      form: 'form'
    };
    return typeRoles[data.type] || 'region';
  }

  /**
   * Helper: Utility functions
   */
  toKebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  getLitType(type) {
    const typeMap = {
      string: 'String',
      number: 'Number',
      boolean: 'Boolean',
      array: 'Array',
      object: 'Object'
    };
    return typeMap[type] || 'String';
  }

  /**
   * Helper: Other methods (stubs for now)
   */
  generateStateInitialization(state) {
    return Object.entries(state)
      .map(([key, value]) => `    this.${key} = ${JSON.stringify(value)};`)
      .join('\n');
  }

  generateMethodBindings(data) {
    return '    // Bind methods';
  }

  generateProperties(props) {
    return Object.entries(props)
      .map(([key]) => `  get ${key}() { return this.getAttribute('${this.toKebabCase(key)}'); }
  set ${key}(value) { this.setAttribute('${this.toKebabCase(key)}', value); }`)
      .join('\n\n');
  }

  generateEventListeners(data) {
    return '    // Setup event listeners';
  }

  generateLitStyles(data, config) {
    return '    /* Component styles */';
  }

  generateLitTemplate(data, config) {
    return '      <div>${this.content}</div>';
  }

  /**
   * Optimization implementations
   */
  async optimizeShadowDOM(code, data, config) {
    return code;
  }

  async optimizeCustomElements(code, data, config) {
    return code;
  }

  async optimizeSlots(code, data, config) {
    return code;
  }

  async optimizeAccessibility(code, data, config) {
    return code;
  }

  async addARIASupport(code, data, config) {
    return code;
  }

  async addKeyboardSupport(code, data, config) {
    return code;
  }

  async addFocusManagement(code, data, config) {
    return code;
  }

  async addScreenReaderSupport(code, data, config) {
    return code;
  }
}

module.exports = WebComponentsOptimizer;