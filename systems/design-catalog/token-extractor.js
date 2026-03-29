/**
 * BUMBA Token Extractor
 * Extracts design tokens from Figma designs
 */

// [OPTIONAL] const { logger } = require('../logging/bumba-logger'); // May need @bumba/* package

class TokenExtractor {
  constructor(config = {}) {
    this.config = {
      precision: config.precision || 2,
      units: config.units || 'px',
      colorFormat: config.colorFormat || 'hex',
      ...config
    };

    this.tokens = {
      colors: {},
      typography: {},
      spacing: {},
      shadows: {},
      borders: {},
      radii: {},
      breakpoints: {},
      animations: {}
    };
  }

  /**
   * Extract all tokens from Figma data
   */
  extract(figmaData) {
    try {
      this.reset();

      // Extract from different sources
      if (figmaData.styles) {
        this.extractFromStyles(figmaData.styles);
      }

      if (figmaData.document) {
        this.extractFromDocument(figmaData.document);
      }

      if (figmaData.components) {
        this.extractFromComponents(figmaData.components);
      }

      return this.formatTokens();

    } catch (error) {
      logger.error('Failed to extract tokens:', error);
      throw error;
    }
  }

  /**
   * Extract tokens from Figma styles
   */
  extractFromStyles(styles) {
    // Extract color styles
    if (styles.colors) {
      Object.entries(styles.colors).forEach(([name, style]) => {
        this.tokens.colors[this.formatTokenName(name)] = this.extractColorValue(style);
      });
    }

    // Extract text styles
    if (styles.text) {
      Object.entries(styles.text).forEach(([name, style]) => {
        this.tokens.typography[this.formatTokenName(name)] = this.extractTextStyle(style);
      });
    }

    // Extract effect styles (shadows, blurs)
    if (styles.effects) {
      Object.entries(styles.effects).forEach(([name, style]) => {
        const effect = this.extractEffect(style);
        if (effect.type === 'shadow') {
          this.tokens.shadows[this.formatTokenName(name)] = effect.value;
        }
      });
    }

    // Extract grid styles
    if (styles.grids) {
      Object.entries(styles.grids).forEach(([name, style]) => {
        this.tokens.spacing[this.formatTokenName(name)] = this.extractGridStyle(style);
      });
    }
  }

  /**
   * Extract tokens from document
   */
  extractFromDocument(document) {
    this.traverseNode(document, (node) => {
      // Extract colors from fills
      if (node.fills && Array.isArray(node.fills)) {
        node.fills.forEach(fill => {
          if (fill.type === 'SOLID') {
            const colorKey = this.generateColorKey(fill.color);
            this.tokens.colors[colorKey] = this.extractColorValue(fill.color);
          }
        });
      }

      // Extract typography from text nodes
      if (node.type === 'TEXT') {
        this.extractTextNode(node);
      }

      // Extract spacing from auto-layout
      if (node.layoutMode) {
        this.extractLayoutSpacing(node);
      }

      // Extract border radius
      if (node.cornerRadius !== undefined) {
        const radiusKey = `radius-${Math.round(node.cornerRadius)}`;
        this.tokens.radii[radiusKey] = `${node.cornerRadius}${this.config.units}`;
      }

      // Extract borders from strokes
      if (node.strokes && node.strokeWeight) {
        this.extractBorder(node);
      }
    });
  }

  /**
   * Extract tokens from components
   */
  extractFromComponents(components) {
    components.forEach(component => {
      // Extract component-specific tokens
      if (component.name && component.properties) {
        this.extractComponentTokens(component);
      }
    });
  }

  /**
   * Extract color value
   */
  extractColorValue(color) {
    if (!color) return null;

    const r = Math.round((color.r || 0) * 255);
    const g = Math.round((color.g || 0) * 255);
    const b = Math.round((color.b || 0) * 255);
    const a = color.a !== undefined ? color.a : 1;

    switch (this.config.colorFormat) {
      case 'hex':
        return a === 1
          ? `#${this.toHex(r)}${this.toHex(g)}${this.toHex(b)}`
          : `#${this.toHex(r)}${this.toHex(g)}${this.toHex(b)}${this.toHex(Math.round(a * 255))}`;

      case 'rgb':
        return a === 1
          ? `rgb(${r}, ${g}, ${b})`
          : `rgba(${r}, ${g}, ${b}, ${a})`;

      case 'hsl':
        const hsl = this.rgbToHsl(r, g, b);
        return a === 1
          ? `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
          : `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${a})`;

      default:
        return `#${this.toHex(r)}${this.toHex(g)}${this.toHex(b)}`;
    }
  }

  /**
   * Extract text style
   */
  extractTextStyle(style) {
    return {
      fontFamily: style.fontName?.family || 'sans-serif',
      fontWeight: this.normalizeFontWeight(style.fontName?.style),
      fontSize: `${style.fontSize || 16}${this.config.units}`,
      lineHeight: style.lineHeight ? `${style.lineHeight.value}${style.lineHeight.unit === 'PERCENT' ? '%' : this.config.units}` : 'normal',
      letterSpacing: style.letterSpacing ? `${style.letterSpacing.value}${style.letterSpacing.unit === 'PERCENT' ? '%' : this.config.units}` : 'normal',
      textTransform: style.textCase || 'none',
      textDecoration: style.textDecoration || 'none'
    };
  }

  /**
   * Extract effect (shadow/blur)
   */
  extractEffect(effect) {
    if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
      return {
        type: 'shadow',
        value: `${effect.offset?.x || 0}${this.config.units} ${effect.offset?.y || 0}${this.config.units} ${effect.radius || 0}${this.config.units} ${this.extractColorValue(effect.color)}`
      };
    }

    if (effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR') {
      return {
        type: 'blur',
        value: `${effect.radius || 0}${this.config.units}`
      };
    }

    return { type: 'unknown', value: null };
  }

  /**
   * Extract grid style
   */
  extractGridStyle(grid) {
    if (grid.pattern === 'COLUMNS' || grid.pattern === 'ROWS') {
      return {
        count: grid.count,
        spacing: `${grid.gutterSize || 0}${this.config.units}`,
        margin: `${grid.offset || 0}${this.config.units}`
      };
    }

    if (grid.pattern === 'GRID') {
      return {
        size: `${grid.sectionSize || 0}${this.config.units}`
      };
    }

    return null;
  }

  /**
   * Extract text node tokens
   */
  extractTextNode(node) {
    if (node.fontSize) {
      const sizeKey = `font-size-${Math.round(node.fontSize)}`;
      this.tokens.typography[sizeKey] = `${node.fontSize}${this.config.units}`;
    }

    if (node.fontName) {
      const familyKey = this.formatTokenName(node.fontName.family);
      if (!this.tokens.typography[`font-${familyKey}`]) {
        this.tokens.typography[`font-${familyKey}`] = node.fontName.family;
      }
    }
  }

  /**
   * Extract layout spacing
   */
  extractLayoutSpacing(node) {
    if (node.paddingTop !== undefined) {
      const paddingKey = `padding-${Math.round(node.paddingTop)}`;
      this.tokens.spacing[paddingKey] = `${node.paddingTop}${this.config.units}`;
    }

    if (node.itemSpacing !== undefined) {
      const spacingKey = `gap-${Math.round(node.itemSpacing)}`;
      this.tokens.spacing[spacingKey] = `${node.itemSpacing}${this.config.units}`;
    }
  }

  /**
   * Extract border tokens
   */
  extractBorder(node) {
    const borderKey = `border-${Math.round(node.strokeWeight)}`;
    const borderColor = node.strokes[0] && node.strokes[0].type === 'SOLID'
      ? this.extractColorValue(node.strokes[0].color)
      : 'transparent';

    this.tokens.borders[borderKey] = {
      width: `${node.strokeWeight}${this.config.units}`,
      style: node.strokeDashes ? 'dashed' : 'solid',
      color: borderColor
    };
  }

  /**
   * Extract component-specific tokens
   */
  extractComponentTokens(component) {
    // Extract breakpoints from responsive components
    if (component.name.includes('mobile') || component.name.includes('tablet') || component.name.includes('desktop')) {
      const device = component.name.match(/(mobile|tablet|desktop)/i)?.[1]?.toLowerCase();
      if (device && component.absoluteBoundingBox) {
        this.tokens.breakpoints[device] = `${component.absoluteBoundingBox.width}${this.config.units}`;
      }
    }

    // Extract animation tokens from interactive components
    if (component.interactions && component.interactions.length > 0) {
      component.interactions.forEach(interaction => {
        if (interaction.transition) {
          const animKey = this.formatTokenName(interaction.trigger || 'default');
          this.tokens.animations[animKey] = {
            duration: `${interaction.transition.duration || 0.3}s`,
            easing: interaction.transition.easing || 'ease'
          };
        }
      });
    }
  }

  /**
   * Traverse node tree
   */
  traverseNode(node, callback) {
    callback(node);

    if (node.children) {
      node.children.forEach(child => {
        this.traverseNode(child, callback);
      });
    }
  }

  /**
   * Format token name
   */
  formatTokenName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Generate color key
   */
  generateColorKey(color) {
    const hex = this.extractColorValue(color);
    const name = this.getColorName(hex);
    return name || `color-${hex.replace('#', '')}`;
  }

  /**
   * Get semantic color name
   */
  getColorName(hex) {
    const colorMap = {
      '#000000': 'black',
      '#ffffff': 'white',
      '#ff0000': 'red',
      '#00ff00': 'green',
      '#0000ff': 'blue',
      '#ffff00': 'yellow',
      '#ff00ff': 'magenta',
      '#00ffff': 'cyan'
    };

    return colorMap[hex.toLowerCase()];
  }

  /**
   * Convert to hex
   */
  toHex(value) {
    return value.toString(16).padStart(2, '0');
  }

  /**
   * Convert RGB to HSL
   */
  rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  /**
   * Normalize font weight
   */
  normalizeFontWeight(style) {
    const weightMap = {
      'thin': '100',
      'extralight': '200',
      'light': '300',
      'regular': '400',
      'medium': '500',
      'semibold': '600',
      'bold': '700',
      'extrabold': '800',
      'black': '900'
    };

    const normalized = style?.toLowerCase().replace(/[^a-z]/g, '') || 'regular';
    return weightMap[normalized] || '400';
  }

  /**
   * Format tokens for output
   */
  formatTokens() {
    return {
      colors: this.deduplicateTokens(this.tokens.colors),
      typography: this.deduplicateTokens(this.tokens.typography),
      spacing: this.deduplicateTokens(this.tokens.spacing),
      shadows: this.deduplicateTokens(this.tokens.shadows),
      borders: this.deduplicateTokens(this.tokens.borders),
      radii: this.deduplicateTokens(this.tokens.radii),
      breakpoints: this.tokens.breakpoints,
      animations: this.tokens.animations
    };
  }

  /**
   * Deduplicate tokens
   */
  deduplicateTokens(tokens) {
    const unique = {};
    const valueMap = new Map();

    Object.entries(tokens).forEach(([key, value]) => {
      const valueStr = JSON.stringify(value);
      if (!valueMap.has(valueStr)) {
        valueMap.set(valueStr, key);
        unique[key] = value;
      }
    });

    return unique;
  }

  /**
   * Reset tokens
   */
  reset() {
    this.tokens = {
      colors: {},
      typography: {},
      spacing: {},
      shadows: {},
      borders: {},
      radii: {},
      breakpoints: {},
      animations: {}
    };
  }

  /**
   * Export tokens to various formats
   */
  export(format = 'json') {
    const tokens = this.formatTokens();

    switch (format) {
      case 'css':
        return this.exportToCSS(tokens);
      case 'scss':
        return this.exportToSCSS(tokens);
      case 'js':
        return this.exportToJS(tokens);
      case 'json':
      default:
        return JSON.stringify(tokens, null, 2);
    }
  }

  /**
   * Export to CSS variables
   */
  exportToCSS(tokens) {
    let css = ':root {\n';

    // Colors
    Object.entries(tokens.colors).forEach(([key, value]) => {
      css += `  --color-${key}: ${value};\n`;
    });

    // Typography
    Object.entries(tokens.typography).forEach(([key, value]) => {
      if (typeof value === 'string') {
        css += `  --typography-${key}: ${value};\n`;
      }
    });

    // Spacing
    Object.entries(tokens.spacing).forEach(([key, value]) => {
      css += `  --spacing-${key}: ${value};\n`;
    });

    // Shadows
    Object.entries(tokens.shadows).forEach(([key, value]) => {
      css += `  --shadow-${key}: ${value};\n`;
    });

    // Border radius
    Object.entries(tokens.radii).forEach(([key, value]) => {
      css += `  --${key}: ${value};\n`;
    });

    css += '}';
    return css;
  }

  /**
   * Export to SCSS variables
   */
  exportToSCSS(tokens) {
    let scss = '';

    // Colors
    Object.entries(tokens.colors).forEach(([key, value]) => {
      scss += `$color-${key}: ${value};\n`;
    });

    // Typography
    Object.entries(tokens.typography).forEach(([key, value]) => {
      if (typeof value === 'string') {
        scss += `$typography-${key}: ${value};\n`;
      }
    });

    // Spacing
    Object.entries(tokens.spacing).forEach(([key, value]) => {
      scss += `$spacing-${key}: ${value};\n`;
    });

    return scss;
  }

  /**
   * Export to JavaScript
   */
  exportToJS(tokens) {
    return `export const tokens = ${JSON.stringify(tokens, null, 2)};`;
  }
}

module.exports = { TokenExtractor };