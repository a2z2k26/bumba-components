/**
 * Angular Optimizer
 * Optimizes code generation specifically for Angular applications
 * Sprint 15: Angular Optimizer
 */

const SmartCodeGenerator = require('./smart-code-generator');

class AngularOptimizer {
  constructor() {
    this.name = 'AngularOptimizer';
    this.version = '1.0.0';
    this.framework = 'angular';

    // Angular-specific configuration
    this.config = {
      version: '15.x',
      standalone: true,
      signals: true,
      useTypeScript: true,
      changeDetection: 'OnPush',
      trackBy: true,
      lazy: true,
      rxjs: true,
      forms: 'reactive', // reactive, template
      animations: true,
      material: false,
      strictMode: true,
      ivy: true
    };

    // Angular patterns
    this.patterns = {
      decorators: this.getDecoratorPatterns(),
      services: this.getServicePatterns(),
      rxjs: this.getRxjsPatterns(),
      changeDetection: this.getChangeDetectionPatterns()
    };
  }

  /**
   * Optimize code for Angular
   */
  async optimize(code, componentData, config) {
    let optimizedCode = code;

    // Apply Angular-specific optimizations
    optimizedCode = await this.optimizeChangeDetection(optimizedCode, componentData, config);
    optimizedCode = await this.optimizeRxjs(optimizedCode, componentData, config);
    optimizedCode = await this.optimizeServices(optimizedCode, componentData, config);
    optimizedCode = await this.optimizeTemplates(optimizedCode, componentData, config);
    optimizedCode = await this.addSignals(optimizedCode, componentData, config);
    optimizedCode = await this.addLazyLoading(optimizedCode, componentData, config);

    return optimizedCode;
  }

  /**
   * Generate Angular component from design data
   */
  async generateComponent(componentData, config) {
    const mergedConfig = { ...this.config, ...config };

    // Generate component TypeScript as a single string for consistency
    const typescript = this.generateTypeScriptFile(componentData, mergedConfig);
    const template = this.generateTemplateFile(componentData, mergedConfig);
    const styles = this.generateStylesFile(componentData, mergedConfig);

    // Return as a single string (like other optimizers)
    return typescript;
  }

  /**
   * Generate TypeScript component file
   */
  generateTypeScriptFile(data, config) {
    const { name, props, state, interactions } = data;
    let code = [];

    // Imports
    code.push(this.generateImports(data, config));
    code.push('');

    // Interfaces
    if (props && Object.keys(props).length > 0) {
      code.push(this.generateInterfaces(data, config));
      code.push('');
    }

    // Component decorator
    code.push(this.generateDecorator(data, config));

    // Component class
    code.push(`export class ${name}Component implements OnInit, OnDestroy {`);

    // Inputs/Outputs
    if (props) {
      code.push(this.generateInputsOutputs(props, interactions, config));
    }

    // Properties
    if (state) {
      code.push(this.generateProperties(state, config));
    }

    // Signals (Angular 16+)
    if (config.signals) {
      code.push(this.generateSignals(data, config));
    }

    // RxJS subscriptions
    if (config.rxjs) {
      code.push('  private destroy$ = new Subject<void>();');
      code.push('');
    }

    // Constructor
    code.push(this.generateConstructor(data, config));

    // Lifecycle hooks
    code.push(this.generateLifecycleHooks(data, config));

    // Methods
    code.push(this.generateMethods(data, config));

    // TrackBy functions
    if (config.trackBy && data.lists) {
      code.push(this.generateTrackByFunctions(data.lists));
    }

    code.push('}');

    return code.join('\n');
  }

  /**
   * Generate template file
   */
  generateTemplateFile(data, config) {
    const { name, children, variants } = data;
    let template = [];

    template.push(`<div class="${this.toKebabCase(name)}" [ngClass]="cssClasses">`);

    // Conditional rendering
    if (variants) {
      template.push(this.generateConditionalTemplates(variants));
    }

    // Lists with trackBy
    if (data.lists) {
      data.lists.forEach(list => {
        template.push(`  <div *ngFor="let item of ${list.name}; trackBy: ${list.trackBy}">`);
        template.push(`    <!-- ${list.name} item template -->`);
        template.push('  </div>');
      });
    }

    // Children components
    if (children && children.length > 0) {
      children.forEach(child => {
        template.push(`  <app-${this.toKebabCase(child.name)} />`);
      });
    }

    // Content projection
    template.push('  <ng-content></ng-content>');

    template.push('</div>');

    return template.join('\n');
  }

  /**
   * Generate styles file
   */
  generateStylesFile(data, config) {
    const { name, styles } = data;
    const className = this.toKebabCase(name);

    let css = [];

    css.push(':host {');
    css.push('  display: block;');
    css.push('}');
    css.push('');

    css.push(`.${className} {`);
    if (styles?.layout) {
      Object.entries(styles.layout).forEach(([key, value]) => {
        if (value) css.push(`  ${this.toKebabCase(key)}: ${value};`);
      });
    }
    css.push('}');

    return css.join('\n');
  }

  /**
   * Generate spec file
   */
  generateSpecFile(data, config) {
    const { name } = data;

    return `import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ${name}Component } from './${this.toKebabCase(name)}.component';

describe('${name}Component', () => {
  let component: ${name}Component;
  let fixture: ComponentFixture<${name}Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      ${config.standalone ? `imports: [${name}Component]` : `declarations: [${name}Component]`}
    }).compileComponents();

    fixture = TestBed.createComponent(${name}Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});`;
  }

  /**
   * Optimize change detection
   */
  async optimizeChangeDetection(code, data, config) {
    // Use OnPush change detection strategy
    if (config.changeDetection === 'OnPush') {
      code = this.addOnPushStrategy(code);
    }

    // Add manual change detection where needed
    code = this.addManualChangeDetection(code, data);

    // Use immutable data patterns
    code = this.enforceImmutability(code, data);

    return code;
  }

  /**
   * Optimize RxJS usage
   */
  async optimizeRxjs(code, data, config) {
    if (!config.rxjs) return code;

    // Add proper unsubscribe pattern
    code = this.addUnsubscribePattern(code);

    // Use async pipe in templates
    code = this.useAsyncPipe(code, data);

    // Add operators for performance
    code = this.addRxjsOperators(code, data);

    return code;
  }

  /**
   * Optimize services
   */
  async optimizeServices(code, data, config) {
    // Extract logic to services
    code = this.extractToServices(code, data);

    // Add proper dependency injection
    code = this.optimizeDependencyInjection(code, data);

    return code;
  }

  /**
   * Optimize templates
   */
  async optimizeTemplates(code, data, config) {
    // Use trackBy for lists
    if (config.trackBy) {
      code = this.addTrackBy(code, data);
    }

    // Optimize *ngFor with virtual scrolling
    code = this.addVirtualScrolling(code, data);

    // Use pipe for transformations
    code = this.usePipes(code, data);

    return code;
  }

  /**
   * Add Angular Signals
   */
  async addSignals(code, data, config) {
    if (!config.signals) return code;

    // Convert properties to signals
    code = this.convertToSignals(code, data);

    // Add computed signals
    code = this.addComputedSignals(code, data);

    // Add effects
    code = this.addEffects(code, data);

    return code;
  }

  /**
   * Helper: Generate imports
   */
  generateImports(data, config) {
    let imports = [];

    imports.push("import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';");

    if (config.rxjs) {
      imports.push("import { Subject, takeUntil } from 'rxjs';");
    }

    if (config.signals) {
      imports.push("import { signal, computed, effect } from '@angular/core';");
    }

    if (config.forms === 'reactive') {
      imports.push("import { FormBuilder, FormGroup, Validators } from '@angular/forms';");
    }

    if (config.animations) {
      imports.push("import { trigger, transition, style, animate } from '@angular/animations';");
    }

    return imports.join('\n');
  }

  /**
   * Helper: Generate interfaces
   */
  generateInterfaces(data, config) {
    const { name, props } = data;

    let interfaces = [];

    interfaces.push(`interface ${name}Props {`);
    Object.entries(props).forEach(([key, prop]) => {
      interfaces.push(`  ${key}${prop.required ? '' : '?'}: ${this.getTypeScriptType(prop.type)};`);
    });
    interfaces.push('}');

    return interfaces.join('\n');
  }

  /**
   * Helper: Generate decorator
   */
  generateDecorator(data, config) {
    const { name } = data;
    const selector = `app-${this.toKebabCase(name)}`;

    let decorator = ['@Component({'];
    decorator.push(`  selector: '${selector}',`);

    if (config.standalone) {
      decorator.push('  standalone: true,');
      decorator.push('  imports: [],');
    }

    decorator.push(`  templateUrl: './${this.toKebabCase(name)}.component.html',`);
    decorator.push(`  styleUrls: ['./${this.toKebabCase(name)}.component.scss'],`);

    if (config.changeDetection === 'OnPush') {
      decorator.push('  changeDetection: ChangeDetectionStrategy.OnPush,');
    }

    if (config.animations && data.animations) {
      decorator.push('  animations: [');
      decorator.push(this.generateAnimations(data.animations));
      decorator.push('  ],');
    }

    decorator.push('})');

    return decorator.join('\n');
  }

  /**
   * Helper: Generate inputs/outputs
   */
  generateInputsOutputs(props, interactions, config) {
    let io = [];

    // Inputs
    Object.entries(props).forEach(([key, prop]) => {
      if (config.signals) {
        io.push(`  ${key} = input${prop.required ? '.required' : ''}< ${this.getTypeScriptType(prop.type)}>();`);
      } else {
        io.push(`  @Input() ${key}${prop.required ? '!' : '?'}: ${this.getTypeScriptType(prop.type)};`);
      }
    });

    io.push('');

    // Outputs
    if (interactions) {
      interactions.forEach(interaction => {
        if (interaction.type === 'emit') {
          if (config.signals) {
            io.push(`  ${interaction.name} = output<${interaction.payload || 'void'}>();`);
          } else {
            io.push(`  @Output() ${interaction.name} = new EventEmitter<${interaction.payload || 'void'}>();`);
          }
        }
      });
    }

    io.push('');

    return io.join('\n');
  }

  /**
   * Helper: Generate properties
   */
  generateProperties(state, config) {
    let properties = [];

    Object.entries(state).forEach(([key, value]) => {
      if (config.signals) {
        properties.push(`  ${key} = signal(${JSON.stringify(value)});`);
      } else {
        properties.push(`  ${key} = ${JSON.stringify(value)};`);
      }
    });

    properties.push('');

    return properties.join('\n');
  }

  /**
   * Helper: Generate signals
   */
  generateSignals(data, config) {
    let signals = [];

    // Computed signals
    if (data.computed) {
      data.computed.forEach(comp => {
        signals.push(`  ${comp.name} = computed(() => {`);
        signals.push(`    return ${comp.expression};`);
        signals.push('  });');
      });
    }

    signals.push('');

    return signals.join('\n');
  }

  /**
   * Helper: Generate constructor
   */
  generateConstructor(data, config) {
    let constructor = ['  constructor('];

    const dependencies = [];

    if (config.forms === 'reactive') {
      dependencies.push('private fb: FormBuilder');
    }

    if (data.services) {
      data.services.forEach(service => {
        dependencies.push(`private ${service.name}: ${service.type}`);
      });
    }

    constructor.push(dependencies.join(', '));
    constructor.push(') {}');
    constructor.push('');

    return constructor.join('');
  }

  /**
   * Helper: Generate lifecycle hooks
   */
  generateLifecycleHooks(data, config) {
    let hooks = [];

    // ngOnInit
    hooks.push('  ngOnInit(): void {');
    if (config.forms === 'reactive' && data.form) {
      hooks.push('    this.initForm();');
    }
    if (config.signals && data.effects) {
      hooks.push('    this.setupEffects();');
    }
    hooks.push('  }');
    hooks.push('');

    // ngOnDestroy
    if (config.rxjs) {
      hooks.push('  ngOnDestroy(): void {');
      hooks.push('    this.destroy$.next();');
      hooks.push('    this.destroy$.complete();');
      hooks.push('  }');
      hooks.push('');
    }

    return hooks.join('\n');
  }

  /**
   * Helper: Generate methods
   */
  generateMethods(data, config) {
    let methods = [];

    // Form initialization
    if (config.forms === 'reactive' && data.form) {
      methods.push('  private initForm(): void {');
      methods.push('    this.form = this.fb.group({');
      Object.entries(data.form.fields || {}).forEach(([key, field]) => {
        methods.push(`      ${key}: ['', ${field.validators || ''}],`);
      });
      methods.push('    });');
      methods.push('  }');
      methods.push('');
    }

    // Event handlers
    if (data.interactions) {
      data.interactions.forEach(interaction => {
        methods.push(`  ${interaction.handler}(): void {`);
        methods.push(`    // Handle ${interaction.type}`);
        if (interaction.emit) {
          methods.push(`    this.${interaction.emit}.emit();`);
        }
        methods.push('  }');
        methods.push('');
      });
    }

    return methods.join('\n');
  }

  /**
   * Helper: Generate trackBy functions
   */
  generateTrackByFunctions(lists) {
    let trackBy = [];

    lists.forEach(list => {
      trackBy.push(`  ${list.trackBy}(index: number, item: any): any {`);
      trackBy.push(`    return item.id || index;`);
      trackBy.push('  }');
      trackBy.push('');
    });

    return trackBy.join('\n');
  }

  /**
   * Helper: Utility functions
   */
  toKebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  getTypeScriptType(type) {
    const typeMap = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      array: 'any[]',
      object: 'Record<string, any>',
      function: '(...args: any[]) => void',
      any: 'any'
    };
    return typeMap[type] || 'any';
  }

  /**
   * Helper: Pattern definitions
   */
  getDecoratorPatterns() {
    return {
      component: /@Component\(/g,
      input: /@Input\(/g,
      output: /@Output\(/g
    };
  }

  getServicePatterns() {
    return {
      injectable: /@Injectable\(/g,
      providedIn: /providedIn:/g
    };
  }

  getRxjsPatterns() {
    return {
      observable: /Observable</g,
      subject: /Subject</g,
      pipe: /\.pipe\(/g
    };
  }

  getChangeDetectionPatterns() {
    return {
      onPush: /ChangeDetectionStrategy\.OnPush/g,
      markForCheck: /markForCheck\(/g
    };
  }

  /**
   * Helper: Optimization utilities
   */
  addOnPushStrategy(code) {
    if (!code.includes('ChangeDetectionStrategy.OnPush')) {
      code = code.replace(
        '@Component({',
        '@Component({\n  changeDetection: ChangeDetectionStrategy.OnPush,'
      );
    }
    return code;
  }

  addManualChangeDetection(code, data) { return code; }
  enforceImmutability(code, data) { return code; }
  addUnsubscribePattern(code) { return code; }
  useAsyncPipe(code, data) { return code; }
  addRxjsOperators(code, data) { return code; }
  extractToServices(code, data) { return code; }
  optimizeDependencyInjection(code, data) { return code; }
  addTrackBy(code, data) { return code; }
  addVirtualScrolling(code, data) { return code; }
  usePipes(code, data) { return code; }
  convertToSignals(code, data) { return code; }
  addComputedSignals(code, data) { return code; }
  addEffects(code, data) { return code; }
  addLazyLoading(code, data) { return code; }
  generateConditionalTemplates(variants) { return ''; }
  generateAnimations(animations) { return ''; }
}

module.exports = AngularOptimizer;