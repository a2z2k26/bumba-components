/**
 * Flutter/Dart Optimizer
 * Sprint 48: Flutter/Dart Optimizer Setup
 *
 * Optimizes code generation for Flutter applications
 * Handles Dart syntax, Widget trees, and Material Design
 */

const EventEmitter = require('events');

class FlutterOptimizer extends EventEmitter {
  constructor() {
    super();

    this.name = 'FlutterOptimizer';
    this.version = '1.0.0';
    this.framework = 'flutter';

    // Flutter-specific configuration
    this.config = {
      dartVersion: '3.2.x',
      flutterVersion: '3.16.x',
      materialDesign: true,
      cupertinoDesign: false,
      nullSafety: true,
      useMaterial3: true,
      stateManagement: 'provider', // or 'bloc', 'riverpod', 'getx'
      responsive: true,
      darkMode: true
    };

    // Widget patterns
    this.patterns = {
      widgets: this.getWidgetPatterns(),
      layouts: this.getLayoutPatterns(),
      styling: this.getStylingPatterns(),
      state: this.getStatePatterns(),
      navigation: this.getNavigationPatterns()
    };

    // HTML to Flutter widget mappings
    this.widgetMappings = {
      'div': 'Container',
      'span': 'Text',
      'p': 'Text',
      'h1': 'Text',
      'h2': 'Text',
      'h3': 'Text',
      'button': 'ElevatedButton',
      'img': 'Image',
      'input': 'TextField',
      'a': 'InkWell',
      'ul': 'ListView',
      'ol': 'ListView',
      'li': 'ListTile'
    };

    // Statistics
    this.stats = {
      widgetsGenerated: 0,
      statefulWidgets: 0,
      statelessWidgets: 0,
      optimizationsApplied: 0
    };
  }

  /**
   * Generate Flutter widget from design data
   */
  async generateWidget(componentData, config = {}) {
    const mergedConfig = { ...this.config, ...config };

    this.emit('generation:started', {
      widget: componentData.name,
      timestamp: new Date().toISOString()
    });

    try {
      const widget = componentData.state && Object.keys(componentData.state).length > 0
        ? this.generateStatefulWidget(componentData, mergedConfig)
        : this.generateStatelessWidget(componentData, mergedConfig);

      this.stats.widgetsGenerated++;
      if (componentData.state && Object.keys(componentData.state).length > 0) {
        this.stats.statefulWidgets++;
      } else {
        this.stats.statelessWidgets++;
      }

      this.emit('generation:completed', {
        widget: componentData.name,
        linesOfCode: widget.split('\n').length,
        timestamp: new Date().toISOString()
      });

      return widget;
    } catch (error) {
      this.emit('generation:failed', {
        widget: componentData.name,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Generate StatelessWidget
   */
  generateStatelessWidget(data, config) {
    const { name, props = {}, styles = {}, children = [] } = data;

    let code = [];

    // Imports
    code.push("import 'package:flutter/material.dart';");

    if (config.responsive) {
      code.push("import 'package:flutter/widgets.dart';");
    }

    code.push('');

    // Widget class
    code.push(`class ${name} extends StatelessWidget {`);

    // Properties
    if (Object.keys(props).length > 0) {
      Object.entries(props).forEach(([key, prop]) => {
        const dartType = this.convertToDartType(prop.type || 'dynamic');
        const nullable = prop.required ? '' : '?';
        code.push(`  final ${dartType}${nullable} ${key};`);
      });
      code.push('');
    }

    // Constructor
    code.push(`  const ${name}({`);
    code.push('    Key? key,');

    if (Object.keys(props).length > 0) {
      Object.entries(props).forEach(([key, prop]) => {
        const required = prop.required ? 'required ' : '';
        code.push(`    ${required}this.${key},`);
      });
    }

    code.push('  }) : super(key: key);');
    code.push('');

    // Build method
    code.push('  @override');
    code.push('  Widget build(BuildContext context) {');

    if (config.responsive) {
      code.push('    final screenWidth = MediaQuery.of(context).size.width;');
      code.push('    final screenHeight = MediaQuery.of(context).size.height;');
      code.push('');
    }

    code.push('    return ' + this.generateWidgetTree(data, config, 3) + ';');
    code.push('  }');
    code.push('}');

    return code.join('\n');
  }

  /**
   * Generate StatefulWidget
   */
  generateStatefulWidget(data, config) {
    const { name, props = {}, state = {}, styles = {} } = data;

    let code = [];

    // Imports
    code.push("import 'package:flutter/material.dart';");
    code.push('');

    // Widget class
    code.push(`class ${name} extends StatefulWidget {`);

    // Properties
    if (Object.keys(props).length > 0) {
      Object.entries(props).forEach(([key, prop]) => {
        const dartType = this.convertToDartType(prop.type || 'dynamic');
        const nullable = prop.required ? '' : '?';
        code.push(`  final ${dartType}${nullable} ${key};`);
      });
      code.push('');
    }

    // Constructor
    code.push(`  const ${name}({`);
    code.push('    Key? key,');

    if (Object.keys(props).length > 0) {
      Object.entries(props).forEach(([key, prop]) => {
        const required = prop.required ? 'required ' : '';
        code.push(`    ${required}this.${key},`);
      });
    }

    code.push('  }) : super(key: key);');
    code.push('');

    code.push('  @override');
    code.push(`  State<${name}> createState() => _${name}State();`);
    code.push('}');
    code.push('');

    // State class
    code.push(`class _${name}State extends State<${name}> {`);

    // State variables
    if (Object.keys(state).length > 0) {
      code.push('  // State variables');
      Object.entries(state).forEach(([key, stateData]) => {
        const dartType = this.convertToDartType(stateData.type || 'dynamic');
        const defaultValue = stateData.default !== undefined
          ? this.formatDartValue(stateData.default)
          : 'null';
        code.push(`  ${dartType} ${key} = ${defaultValue};`);
      });
      code.push('');
    }

    // Build method
    code.push('  @override');
    code.push('  Widget build(BuildContext context) {');

    if (config.responsive) {
      code.push('    final screenWidth = MediaQuery.of(context).size.width;');
      code.push('    final screenHeight = MediaQuery.of(context).size.height;');
      code.push('');
    }

    code.push('    return ' + this.generateWidgetTree(data, config, 3) + ';');
    code.push('  }');
    code.push('}');

    return code.join('\n');
  }

  /**
   * Generate widget tree from design data
   */
  generateWidgetTree(data, config, indent = 0) {
    const { type = 'Container', text, children = [], styles = {} } = data;
    const spaces = ' '.repeat(indent * 2);

    const FlutterWidget = this.widgetMappings[type] || 'Container';

    let code = [];

    // Handle text widgets
    if (text && !children.length) {
      if (FlutterWidget === 'Text') {
        code.push(`Text(`);
        code.push(`  ${JSON.stringify(text)},`);
        code.push(`  style: ${this.generateTextStyle(styles)},`);
        code.push(`)`);
      } else if (FlutterWidget === 'ElevatedButton') {
        code.push(`ElevatedButton(`);
        code.push(`  onPressed: () {},`);
        code.push(`  child: Text(${JSON.stringify(text)}),`);
        code.push(`  style: ${this.generateButtonStyle(styles)},`);
        code.push(`)`);
      } else {
        code.push(`Container(`);
        code.push(`  ${this.generateContainerProperties(styles)}`);
        code.push(`  child: Text(${JSON.stringify(text)}),`);
        code.push(`)`);
      }
    }
    // Handle container widgets with children
    else if (children.length > 0) {
      if (FlutterWidget === 'ListView') {
        code.push(`ListView(`);
        code.push(`  children: [`);
        children.forEach(child => {
          code.push(`    ${this.generateWidgetTree(child, config, indent + 2)},`);
        });
        code.push(`  ],`);
        code.push(`)`);
      } else {
        code.push(`Container(`);
        code.push(`  ${this.generateContainerProperties(styles)}`);
        code.push(`  child: Column(`);
        code.push(`    children: [`);
        children.forEach(child => {
          code.push(`      ${this.generateWidgetTree(child, config, indent + 3)},`);
        });
        code.push(`    ],`);
        code.push(`  ),`);
        code.push(`)`);
      }
    }
    // Empty container
    else {
      code.push(`Container(`);
      code.push(`  ${this.generateContainerProperties(styles)}`);
      code.push(`)`);
    }

    return code.join('\n' + spaces);
  }

  /**
   * Generate container properties from styles
   */
  generateContainerProperties(styles) {
    const props = [];

    if (styles.width) {
      props.push(`width: ${this.convertToDouble(styles.width)},`);
    }

    if (styles.height) {
      props.push(`height: ${this.convertToDouble(styles.height)},`);
    }

    if (styles.padding) {
      const padding = this.convertToDouble(styles.padding);
      props.push(`padding: EdgeInsets.all(${padding}),`);
    }

    if (styles.margin) {
      const margin = this.convertToDouble(styles.margin);
      props.push(`margin: EdgeInsets.all(${margin}),`);
    }

    const decoration = this.generateBoxDecoration(styles);
    if (decoration) {
      props.push(`decoration: ${decoration},`);
    }

    return props.join('\n  ');
  }

  /**
   * Generate BoxDecoration from styles
   */
  generateBoxDecoration(styles) {
    const props = [];

    if (styles['background-color'] || styles.backgroundColor) {
      const color = styles['background-color'] || styles.backgroundColor;
      props.push(`color: ${this.convertToColor(color)}`);
    }

    if (styles['border-radius'] || styles.borderRadius) {
      const radius = this.convertToDouble(styles['border-radius'] || styles.borderRadius);
      props.push(`borderRadius: BorderRadius.circular(${radius})`);
    }

    if (styles['box-shadow'] || styles.boxShadow) {
      props.push(`boxShadow: [
      BoxShadow(
        color: Colors.grey.withOpacity(0.5),
        spreadRadius: 2,
        blurRadius: 5,
        offset: Offset(0, 3),
      ),
    ]`);
    }

    if (props.length === 0) return null;

    return `BoxDecoration(\n    ${props.join(',\n    ')}\n  )`;
  }

  /**
   * Generate TextStyle from styles
   */
  generateTextStyle(styles) {
    const props = [];

    if (styles.color || styles['font-color']) {
      const color = styles.color || styles['font-color'];
      props.push(`color: ${this.convertToColor(color)}`);
    }

    if (styles['font-size'] || styles.fontSize) {
      const size = this.convertToDouble(styles['font-size'] || styles.fontSize);
      props.push(`fontSize: ${size}`);
    }

    if (styles['font-weight'] || styles.fontWeight) {
      const weight = styles['font-weight'] || styles.fontWeight;
      props.push(`fontWeight: ${this.convertToFontWeight(weight)}`);
    }

    if (props.length === 0) return 'TextStyle()';

    return `TextStyle(\n    ${props.join(',\n    ')}\n  )`;
  }

  /**
   * Generate ButtonStyle
   */
  generateButtonStyle(styles) {
    const props = [];

    if (styles['background-color'] || styles.backgroundColor) {
      const color = styles['background-color'] || styles.backgroundColor;
      props.push(`backgroundColor: MaterialStateProperty.all(${this.convertToColor(color)})`);
    }

    if (props.length === 0) return 'null';

    return `ElevatedButton.styleFrom(\n    ${props.join(',\n    ')}\n  )`;
  }

  /**
   * Convert CSS type to Dart type
   */
  convertToDartType(type) {
    const typeMap = {
      'string': 'String',
      'number': 'double',
      'boolean': 'bool',
      'array': 'List',
      'object': 'Map',
      'function': 'Function',
      '() => void': 'VoidCallback',
      'any': 'dynamic'
    };

    return typeMap[type] || type;
  }

  /**
   * Convert CSS color to Flutter Color
   */
  convertToColor(color) {
    if (color.startsWith('#')) {
      // Remove # and convert to 0xFF format
      const hex = color.substring(1);
      return `Color(0xFF${hex})`;
    }

    // Named colors
    const namedColors = {
      'white': 'Colors.white',
      'black': 'Colors.black',
      'red': 'Colors.red',
      'blue': 'Colors.blue',
      'green': 'Colors.green',
      'yellow': 'Colors.yellow',
      'grey': 'Colors.grey',
      'gray': 'Colors.grey'
    };

    return namedColors[color.toLowerCase()] || 'Colors.black';
  }

  /**
   * Convert CSS value to double
   */
  convertToDouble(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const num = parseFloat(value.replace('px', ''));
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }

  /**
   * Convert CSS font-weight to Flutter FontWeight
   */
  convertToFontWeight(weight) {
    const weights = {
      'normal': 'FontWeight.normal',
      'bold': 'FontWeight.bold',
      '100': 'FontWeight.w100',
      '200': 'FontWeight.w200',
      '300': 'FontWeight.w300',
      '400': 'FontWeight.w400',
      '500': 'FontWeight.w500',
      '600': 'FontWeight.w600',
      '700': 'FontWeight.w700',
      '800': 'FontWeight.w800',
      '900': 'FontWeight.w900'
    };

    return weights[String(weight)] || 'FontWeight.normal';
  }

  /**
   * Format Dart value
   */
  formatDartValue(value) {
    if (typeof value === 'string') return `'${value}'`;
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (value === null) return 'null';
    return JSON.stringify(value);
  }

  /**
   * Get widget patterns
   */
  getWidgetPatterns() {
    return {
      container: 'Container',
      text: 'Text',
      button: 'ElevatedButton',
      image: 'Image',
      input: 'TextField',
      column: 'Column',
      row: 'Row',
      stack: 'Stack',
      listView: 'ListView',
      gridView: 'GridView'
    };
  }

  /**
   * Get layout patterns
   */
  getLayoutPatterns() {
    return {
      flexColumn: 'Column with mainAxisAlignment',
      flexRow: 'Row with mainAxisAlignment',
      centered: 'Center widget',
      expanded: 'Expanded widget',
      flexible: 'Flexible widget'
    };
  }

  /**
   * Get styling patterns
   */
  getStylingPatterns() {
    return {
      boxDecoration: 'BoxDecoration',
      textStyle: 'TextStyle',
      buttonStyle: 'ButtonStyle',
      theme: 'ThemeData'
    };
  }

  /**
   * Get state patterns
   */
  getStatePatterns() {
    return {
      stateful: 'StatefulWidget + State',
      stateless: 'StatelessWidget',
      provider: 'ChangeNotifier + Provider',
      bloc: 'Bloc pattern'
    };
  }

  /**
   * Get navigation patterns
   */
  getNavigationPatterns() {
    return {
      push: 'Navigator.push',
      pop: 'Navigator.pop',
      named: 'Navigator.pushNamed'
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
   * Test Flutter widget generation
   */
  async testGeneration() {
    console.log('🧪 Testing Flutter widget generation...\n');

    const sampleWidget = {
      name: 'MyButton',
      type: 'button',
      props: {
        title: { type: 'string', required: true },
        onPressed: { type: '() => void', required: true }
      },
      state: {},
      styles: {
        'background-color': '#2196F3',
        'padding': '16px',
        'border-radius': '8px',
        'color': '#FFFFFF',
        'font-size': '16px',
        'font-weight': 'bold'
      },
      text: 'Click Me'
    };

    try {
      console.log('1️⃣ Generating StatelessWidget...');
      const stateless = await this.generateWidget(sampleWidget);
      console.log(`   ✓ Generated ${stateless.split('\n').length} lines of Dart\n`);

      console.log('2️⃣ Generating StatefulWidget...');
      const stateful = await this.generateWidget({
        ...sampleWidget,
        state: { counter: { type: 'number', default: 0 } }
      });
      console.log(`   ✓ Generated ${stateful.split('\n').length} lines of Dart\n`);

      console.log('3️⃣ Checking statistics...');
      const stats = this.getStats();
      console.log(`   ✓ Widgets generated: ${stats.widgetsGenerated}`);
      console.log(`   ✓ Stateless widgets: ${stats.statelessWidgets}`);
      console.log(`   ✓ Stateful widgets: ${stats.statefulWidgets}\n`);

      console.log('✅ Flutter generation test complete!\n');

      return {
        success: true,
        stateless,
        stateful,
        stats
      };

    } catch (error) {
      console.error('❌ Flutter test failed:', error.message);
      throw error;
    }
  }
}

module.exports = FlutterOptimizer;
