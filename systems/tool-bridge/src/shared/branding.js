/**
 * Tool Bridge Branding
 * Part of the BUMBA Platform Suite
 * ASCII art, colors, and branding utilities
 */

const chalk = require('chalk');

// Tool Bridge ASCII Logo variants using BUMBA style
const TOOL_BRIDGE_LOGOS = {
  // Main Tool Bridge logo with box drawing characters (BUMBA style)
  main: [
    '██████╗  █████╗ ██████╗ ██╗   ██╗██╗      ██████╗ ███╗   ██╗',
    '██╔══██╗██╔══██╗██╔══██╗╚██╗ ██╔╝██║     ██╔═══██╗████╗  ██║',
    '██████╔╝███████║██████╔╝ ╚████╔╝ ██║     ██║   ██║██╔██╗ ██║',
    '██╔══██╗██╔══██║██╔══██╗  ╚██╔╝  ██║     ██║   ██║██║╚██╗██║',
    '██████╔╝██║  ██║██████╔╝   ██║   ███████╗╚██████╔╝██║ ╚████║',
    '╚═════╝ ╚═╝  ╚═╝╚═════╝    ╚═╝   ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝'
  ],

  // Compact version for smaller spaces
  compact: [
    '╔═══════════════════════════════════════════════╗',
    '║  ____    _    ______   ___     ___  _   _    ║',
    '║ | __ )  / \\  | __ ) \\ / / |   / _ \\| \\ | |   ║',
    '║ |  _ \\ / _ \\ |  _ \\\\ V /| |  | | | |  \\| |   ║',
    '║ | |_) / ___ \\| |_) || | | |__| |_| | |\\  |   ║',
    '║ |____/_/   \\_\\____/ |_| |_____\\___/|_| \\_|   ║',
    '║                                               ║',
    '║        Universal AI Development Gateway       ║',
    '║           Part of BUMBA Platform Suite        ║',
    '╚═══════════════════════════════════════════════╝'
  ],

  // Simple text version
  simple: 'Tool Bridge - Universal AI Development Gateway',

  // Version display (can add version separately when needed)
  withVersion: [
    '██████╗  █████╗ ██████╗ ██╗   ██╗██╗      ██████╗ ███╗   ██╗',
    '██╔══██╗██╔══██╗██╔══██╗╚██╗ ██╔╝██║     ██╔═══██╗████╗  ██║',
    '██████╔╝███████║██████╔╝ ╚████╔╝ ██║     ██║   ██║██╔██╗ ██║',
    '██╔══██╗██╔══██║██╔══██╗  ╚██╔╝  ██║     ██║   ██║██║╚██╗██║',
    '██████╔╝██║  ██║██████╔╝   ██║   ███████╗╚██████╔╝██║ ╚████║',
    '╚═════╝ ╚═╝  ╚═╝╚═════╝    ╚═╝   ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝'
  ]
};

// BUMBA Platform Color Palette (from brand guidelines)
const TOOL_BRIDGE_COLORS = {
  // Primary gradient (matching BUMBA)
  gradient: {
    green: '#00AA00',
    yellowGreen: '#66BB00',
    yellow: '#FFDD00',
    orangeYellow: '#FFAA00',
    orangeRed: '#FF6600',
    red: '#DD0000'
  },

  // Department colors (BUMBA system)
  departments: {
    strategy: '#FFD700',
    backend: '#00FF00',
    frontend: '#FF0000',
    testing: '#FFA500',
    completion: '#FFFFFF'
  },

  // Semantic colors
  semantic: {
    primary: '#FFFFFF',
    secondary: '#808080',
    success: '#00AA00',
    warning: '#FFAA00',
    error: '#DD0000',
    info: '#66BB00'
  },

  // Brand accent colors
  accent: {
    gold: '#D4AF37',
    wheat: '#F5DEB3',
    border: '#FFDD00'
  }
};

// Official BUMBA Platform Emoji Set
const TOOL_BRIDGE_EMOJIS = {
  strategy: '🟡',
  backend: '🟢',
  frontend: '🔴',
  testing: '🟠',
  completion: '🏁'
};

class ToolBridgeBranding {
  constructor(options = {}) {
    this.config = {
      enableColors: options.enableColors !== false,
      variant: options.variant || 'main',
      ...options
    };

    this.chalk = this.initializeChalkFunctions();
  }

  initializeChalkFunctions() {
    const chalkFuncs = {};

    // Create chalk functions for all color categories
    Object.entries(TOOL_BRIDGE_COLORS).forEach(([category, colors]) => {
      chalkFuncs[category] = {};
      Object.entries(colors).forEach(([name, hex]) => {
        chalkFuncs[category][name] = this.config.enableColors ? chalk.hex(hex) : (text) => text;
      });
    });

    // Add standard chalk functions
    chalkFuncs.white = this.config.enableColors ? chalk.white : (text) => text;
    chalkFuncs.gray = this.config.enableColors ? chalk.gray : (text) => text;
    chalkFuncs.bold = this.config.enableColors ? chalk.bold : (text) => text;

    return chalkFuncs;
  }

  displayLogo(variant = 'main', options = {}) {
    const {
      gradient = true,
      clear = false,
      padding = true,
      centerText = null
    } = options;

    if (clear) {
      console.clear();
    }
    if (padding) {
      console.log();
    }

    const logoLines = TOOL_BRIDGE_LOGOS[variant] || TOOL_BRIDGE_LOGOS.main;

    if (Array.isArray(logoLines)) {
      logoLines.forEach((line, index) => {
        if (gradient && (variant === 'main' || variant === 'withVersion')) {
          // Apply gradient colors (Green → Yellow → Orange → Red)
          const colorIndex = Math.floor((index / logoLines.length) * 6);
          const gradientColors = Object.values(this.chalk.gradient);
          const colorFunc = gradientColors[Math.min(colorIndex, gradientColors.length - 1)];
          console.log(colorFunc.bold(line));
        } else {
          console.log(this.chalk.accent.gold.bold(line));
        }
      });
    } else {
      console.log(this.chalk.accent.gold.bold(logoLines));
    }

    if (centerText) {
      console.log();
      console.log(this.chalk.accent.wheat(centerText));
    }

    if (padding) {
      console.log();
    }
  }

  createBox(content, width = 60, style = 'default') {
    const lines = content.split('\n');
    const maxLineLength = Math.max(...lines.map((line) => this.stripAnsi(line).length));
    const boxWidth = Math.max(width, maxLineLength + 4);

    const borderChars = {
      default: { top: '═', bottom: '═', left: '║', right: '║',
        topLeft: '╔', topRight: '╗', bottomLeft: '╚', bottomRight: '╝' },
      simple: { top: '─', bottom: '─', left: '│', right: '│',
        topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘' }
    };

    const chars = borderChars[style] || borderChars.default;
    const borderColor = this.chalk.accent.border;

    let result = '';

    // Top border
    result += borderColor(chars.topLeft + chars.top.repeat(boxWidth - 2) + chars.topRight) + '\n';

    // Content lines
    lines.forEach((line) => {
      const plainText = this.stripAnsi(line);
      const padding = Math.max(0, boxWidth - plainText.length - 4);
      result += borderColor(chars.left) + ` ${line}${' '.repeat(padding)} ` + borderColor(chars.right) + '\n';
    });

    // Bottom border
    result += borderColor(chars.bottomLeft + chars.bottom.repeat(boxWidth - 2) + chars.bottomRight);

    return result;
  }

  createProgressBar(current, total, width = 30) {
    const percentage = Math.floor((current / total) * 100);
    const filled = Math.floor((current / total) * width);
    const empty = width - filled;

    const bar = this.chalk.gradient.green('█'.repeat(filled)) +
                this.chalk.gray('░'.repeat(empty));

    return `${bar} ${percentage}%`;
  }

  formatStatus(status, message) {
    const icons = {
      success: this.chalk.gradient.green('✓'),
      error: this.chalk.semantic.error('✗'),
      warning: this.chalk.semantic.warning('⚠'),
      info: this.chalk.semantic.info('ℹ'),
      processing: this.chalk.gradient.yellowGreen('⟳')
    };

    const icon = icons[status] || icons.info;
    return `${icon} ${message}`;
  }

  stripAnsi(text) {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\u001b\[[0-9;]*m/g, '');
  }
}

// Convenience functions
function displayToolBridgeLogo(variant = 'main', options = {}) {
  const branding = new ToolBridgeBranding();
  branding.displayLogo(variant, options);
}

function getToolBridgeColors() {
  return TOOL_BRIDGE_COLORS;
}

function getToolBridgeEmojis() {
  return TOOL_BRIDGE_EMOJIS;
}

module.exports = {
  ToolBridgeBranding,
  TOOL_BRIDGE_LOGOS,
  TOOL_BRIDGE_COLORS,
  TOOL_BRIDGE_EMOJIS,
  displayToolBridgeLogo,
  getToolBridgeColors,
  getToolBridgeEmojis
};