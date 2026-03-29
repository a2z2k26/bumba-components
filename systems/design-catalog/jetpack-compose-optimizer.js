/**
 * Jetpack Compose Optimizer
 * Sprint 52: Jetpack Compose Optimizer
 *
 * Optimizes code generation for Jetpack Compose (Android) applications
 * Handles Kotlin syntax, @Composable functions, and Material Design 3
 */

const EventEmitter = require('events');

class JetpackComposeOptimizer extends EventEmitter {
  constructor() {
    super();

    this.name = 'JetpackComposeOptimizer';
    this.version = '1.0.0';
    this.framework = 'jetpack-compose';

    // Jetpack Compose configuration
    this.config = {
      kotlinVersion: '1.9.x',
      composeVersion: '1.6.x',
      material3: true,
      stateManagement: 'remember', // or 'viewmodel', 'flow'
      preview: true,
      darkTheme: true
    };

    // Composable patterns
    this.patterns = {
      composables: this.getComposablePatterns(),
      modifiers: this.getModifierPatterns(),
      layouts: this.getLayoutPatterns(),
      state: this.getStatePatterns()
    };

    // HTML to Compose component mappings
    this.composableMappings = {
      'div': 'Column',
      'span': 'Text',
      'p': 'Text',
      'h1': 'Text',
      'h2': 'Text',
      'h3': 'Text',
      'button': 'Button',
      'img': 'Image',
      'input': 'TextField',
      'a': 'TextButton',
      'ul': 'LazyColumn',
      'ol': 'LazyColumn'
    };

    // Statistics
    this.stats = {
      composablesGenerated: 0,
      stateVariables: 0,
      modifiers: 0,
      optimizationsApplied: 0
    };
  }

  /**
   * Generate Jetpack Compose component from design data
   */
  async generateComposable(componentData, config = {}) {
    const mergedConfig = { ...this.config, ...config };

    this.emit('generation:started', {
      composable: componentData.name,
      timestamp: new Date().toISOString()
    });

    try {
      const composable = this.generateComposeFunction(componentData, mergedConfig);

      this.stats.composablesGenerated++;

      this.emit('generation:completed', {
        composable: componentData.name,
        linesOfCode: composable.split('\n').length,
        timestamp: new Date().toISOString()
      });

      return composable;
    } catch (error) {
      this.emit('generation:failed', {
        composable: componentData.name,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Generate @Composable function
   */
  generateComposeFunction(data, config) {
    const { name, props = {}, state = {}, styles = {}, children = [] } = data;

    let code = [];

    // Imports
    code.push('import androidx.compose.foundation.layout.*');
    code.push('import androidx.compose.material3.*');
    code.push('import androidx.compose.runtime.*');
    code.push('import androidx.compose.ui.Modifier');
    code.push('import androidx.compose.ui.unit.dp');
    code.push('import androidx.compose.ui.unit.sp');

    if (config.preview) {
      code.push('import androidx.compose.ui.tooling.preview.Preview');
    }

    code.push('');

    // Composable function
    code.push('@Composable');
    code.push(`fun ${name}(`);

    // Parameters
    const params = [];
    Object.entries(props).forEach(([key, prop]) => {
      const kotlinType = this.convertToKotlinType(prop.type || 'String');
      const nullable = prop.required ? '' : '?';
      const defaultValue = prop.default !== undefined
        ? ` = ${this.formatKotlinValue(prop.default, kotlinType)}`
        : (nullable ? ' = null' : '');
      params.push(`    ${key}: ${kotlinType}${nullable}${defaultValue}`);
    });

    if (params.length > 0) {
      code.push(params.join(',\n'));
      code.push(') {');
    } else {
      code[code.length - 1] += ') {';
    }

    // State variables
    if (Object.keys(state).length > 0) {
      Object.entries(state).forEach(([key, stateData]) => {
        const kotlinType = this.convertToKotlinType(stateData.type || 'String');
        const defaultValue = stateData.default !== undefined
          ? this.formatKotlinValue(stateData.default, kotlinType)
          : this.getDefaultKotlinValue(kotlinType);
        code.push(`    var ${key} by remember { mutableStateOf(${defaultValue}) }`);
        this.stats.stateVariables++;
      });
      code.push('');
    }

    // Composable body
    code.push(this.generateComposableBody(data, config, 1));

    code.push('}');
    code.push('');

    // Preview
    if (config.preview) {
      code.push('@Preview(showBackground = true)');
      code.push('@Composable');
      code.push(`fun ${name}Preview() {`);
      code.push(`    ${name}()`);
      code.push('}');
    }

    return code.join('\n');
  }

  /**
   * Generate composable body
   */
  generateComposableBody(data, config, indent = 0) {
    const { text, children = [], styles = {}, type = 'Column' } = data;
    const spaces = ' '.repeat(indent * 4);

    let code = [];

    const ComposeComponent = this.composableMappings[type] || 'Column';

    // Handle Button with text
    if (ComposeComponent === 'Button' && text) {
      code.push(`${spaces}Button(`);
      code.push(`${spaces}    onClick = { },`);
      code.push(`${spaces}${this.generateModifier(styles, 1)}`);
      code.push(`${spaces}) {`);
      code.push(`${spaces}    Text("${text}")`);
      code.push(`${spaces}}`);
    }
    // Handle Text
    else if (ComposeComponent === 'Text' && text) {
      code.push(`${spaces}Text(`);
      code.push(`${spaces}    text = "${text}",`);
      code.push(`${spaces}${this.generateTextStyle(styles, 1)}`);
      code.push(`${spaces}${this.generateModifier(styles, 1)}`);
      code.push(`${spaces})`);
    }
    // Handle Column/Row with children
    else if (children.length > 0) {
      code.push(`${spaces}${ComposeComponent}(`);
      code.push(`${spaces}${this.generateModifier(styles, 1)}`);
      code.push(`${spaces}) {`);

      children.forEach(child => {
        code.push(this.generateComposableBody(child, config, indent + 1));
      });

      code.push(`${spaces}}`);
    }
    // Empty container
    else {
      code.push(`${spaces}${ComposeComponent}(`);
      code.push(`${spaces}${this.generateModifier(styles, 1)}`);
      code.push(`${spaces}) {}`);
    }

    return code.join('\n');
  }

  /**
   * Generate modifier from styles
   */
  generateModifier(styles, indent = 0) {
    const spaces = ' '.repeat(indent * 4);
    let modifiers = ['Modifier'];

    if (styles.padding) {
      const padding = this.convertToDp(styles.padding);
      modifiers.push(`.padding(${padding}.dp)`);
      this.stats.modifiers++;
    }

    if (styles.width) {
      const width = this.convertToDp(styles.width);
      modifiers.push(`.width(${width}.dp)`);
      this.stats.modifiers++;
    }

    if (styles.height) {
      const height = this.convertToDp(styles.height);
      modifiers.push(`.height(${height}.dp)`);
      this.stats.modifiers++;
    }

    if (styles['background-color'] || styles.backgroundColor) {
      const color = this.convertToComposeColor(styles['background-color'] || styles.backgroundColor);
      modifiers.push(`.background(${color})`);
      this.stats.modifiers++;
    }

    if (styles['border-radius'] || styles.borderRadius) {
      const radius = this.convertToDp(styles['border-radius'] || styles.borderRadius);
      modifiers.push(`.clip(RoundedCornerShape(${radius}.dp))`);
      this.stats.modifiers++;
    }

    return `modifier = ${modifiers.join('\n' + spaces + '    ')}`;
  }

  /**
   * Generate text style
   */
  generateTextStyle(styles, indent = 0) {
    const spaces = ' '.repeat(indent * 4);
    let styleProps = [];

    if (styles['font-size'] || styles.fontSize) {
      const size = this.convertToSp(styles['font-size'] || styles.fontSize);
      styleProps.push(`${spaces}fontSize = ${size}.sp`);
    }

    if (styles.color || styles['font-color']) {
      const color = this.convertToComposeColor(styles.color || styles['font-color']);
      styleProps.push(`${spaces}color = ${color}`);
    }

    if (styles['font-weight'] || styles.fontWeight) {
      const weight = this.convertToFontWeight(styles['font-weight'] || styles.fontWeight);
      styleProps.push(`${spaces}fontWeight = ${weight}`);
    }

    if (styleProps.length === 0) return '';

    return `style = TextStyle(\n${styleProps.join(',\n')}\n${spaces}),`;
  }

  /**
   * Convert JavaScript type to Kotlin type
   */
  convertToKotlinType(type) {
    const typeMap = {
      'string': 'String',
      'number': 'Double',
      'boolean': 'Boolean',
      'array': 'List',
      'object': 'Map',
      '() => void': '() -> Unit',
      'any': 'Any'
    };

    return typeMap[type] || type;
  }

  /**
   * Convert CSS color to Compose Color
   */
  convertToComposeColor(color) {
    if (color.startsWith('#')) {
      const hex = color.substring(1);
      return `Color(0xFF${hex})`;
    }

    // Named colors
    const namedColors = {
      'white': 'Color.White',
      'black': 'Color.Black',
      'red': 'Color.Red',
      'blue': 'Color.Blue',
      'green': 'Color.Green',
      'yellow': 'Color.Yellow',
      'gray': 'Color.Gray',
      'grey': 'Color.Gray',
      'transparent': 'Color.Transparent'
    };

    return namedColors[color.toLowerCase()] || 'Color.Black';
  }

  /**
   * Convert CSS font-weight to Compose FontWeight
   */
  convertToFontWeight(weight) {
    const weights = {
      'normal': 'FontWeight.Normal',
      'bold': 'FontWeight.Bold',
      '100': 'FontWeight.W100',
      '200': 'FontWeight.W200',
      '300': 'FontWeight.W300',
      '400': 'FontWeight.W400',
      '500': 'FontWeight.W500',
      '600': 'FontWeight.W600',
      '700': 'FontWeight.W700',
      '800': 'FontWeight.W800',
      '900': 'FontWeight.W900'
    };

    return weights[String(weight)] || 'FontWeight.Normal';
  }

  /**
   * Convert CSS value to dp (density-independent pixels)
   */
  convertToDp(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const num = parseFloat(value.replace('px', ''));
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }

  /**
   * Convert CSS value to sp (scalable pixels for text)
   */
  convertToSp(value) {
    return this.convertToDp(value);
  }

  /**
   * Format Kotlin value
   */
  formatKotlinValue(value, type) {
    if (type === 'String') return `"${value}"`;
    if (type === 'Boolean') return value.toString();
    if (type === 'Double' || type === 'Int') return value.toString();
    return String(value);
  }

  /**
   * Get default Kotlin value
   */
  getDefaultKotlinValue(type) {
    const defaults = {
      'String': '""',
      'Int': '0',
      'Double': '0.0',
      'Boolean': 'false',
      'List': 'emptyList()',
      'Map': 'emptyMap()'
    };

    return defaults[type] || 'null';
  }

  /**
   * Get composable patterns
   */
  getComposablePatterns() {
    return {
      text: 'Text',
      button: 'Button',
      image: 'Image',
      column: 'Column',
      row: 'Row',
      box: 'Box',
      lazyColumn: 'LazyColumn',
      lazyRow: 'LazyRow'
    };
  }

  /**
   * Get modifier patterns
   */
  getModifierPatterns() {
    return {
      padding: '.padding',
      size: '.size',
      fillMaxWidth: '.fillMaxWidth',
      fillMaxHeight: '.fillMaxHeight',
      background: '.background',
      clip: '.clip',
      clickable: '.clickable'
    };
  }

  /**
   * Get layout patterns
   */
  getLayoutPatterns() {
    return {
      column: 'Column with verticalArrangement',
      row: 'Row with horizontalArrangement',
      box: 'Box with contentAlignment',
      scaffold: 'Scaffold for app structure'
    };
  }

  /**
   * Get state patterns
   */
  getStatePatterns() {
    return {
      remember: 'remember { mutableStateOf() }',
      rememberSaveable: 'rememberSaveable { mutableStateOf() }',
      viewModel: 'viewModel<T>()',
      flow: 'collectAsState()'
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      framework: this.framework,
      version: this.version
    };
  }

  /**
   * Test Jetpack Compose generation
   */
  async testGeneration() {
    console.log('🧪 Testing Jetpack Compose generation...\n');

    const sampleComposable = {
      name: 'MyButton',
      type: 'button',
      props: {
        text: { type: 'string', required: true },
        onClick: { type: '() => void', required: true }
      },
      state: {
        isPressed: { type: 'boolean', default: false }
      },
      styles: {
        'background-color': '#6200EE',
        'padding': '16px',
        'border-radius': '8px',
        'color': '#FFFFFF',
        'font-size': '16px',
        'font-weight': 'bold'
      },
      text: 'Click Me'
    };

    try {
      console.log('1️⃣ Generating Composable function...');
      const composable = await this.generateComposable(sampleComposable);
      console.log(`   ✓ Generated ${composable.split('\n').length} lines of Kotlin\n`);

      console.log('2️⃣ Checking statistics...');
      const stats = this.getStats();
      console.log(`   ✓ Composables generated: ${stats.composablesGenerated}`);
      console.log(`   ✓ State variables: ${stats.stateVariables}`);
      console.log(`   ✓ Modifiers applied: ${stats.modifiers}\n`);

      console.log('✅ Jetpack Compose generation test complete!\n');

      return {
        success: true,
        composable,
        stats
      };

    } catch (error) {
      console.error('❌ Jetpack Compose test failed:', error.message);
      throw error;
    }
  }
}

module.exports = JetpackComposeOptimizer;
