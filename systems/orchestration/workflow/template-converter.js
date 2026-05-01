/**
 * BUMBA Template Converter
 * Sprint 13: Convert templates between formats (JSON, YAML, XML, etc.)
 */

const yaml = require('js-yaml');

class TemplateConverter {
  constructor() {
    this.converters = this.initializeConverters();
  }

  /**
   * Initialize format converters
   */
  initializeConverters() {
    return {
      'json-to-yaml': this.jsonToYaml.bind(this),
      'yaml-to-json': this.yamlToJson.bind(this),
      'json-to-xml': this.jsonToXml.bind(this),
      'xml-to-json': this.xmlToJson.bind(this),
      'yaml-to-xml': this.yamlToXml.bind(this),
      'xml-to-yaml': this.xmlToYaml.bind(this),
      'json-to-bumba': this.jsonToBumba.bind(this),
      'bumba-to-json': this.bumbaToJson.bind(this)
    };
  }

  /**
   * Convert between formats
   */
  async convert(template, fromFormat, toFormat) {
    try {
      const converterKey = `${fromFormat.toLowerCase()}-to-${toFormat.toLowerCase()}`;
      const converter = this.converters[converterKey];

      if (!converter) {
        // Try indirect conversion through JSON
        if (fromFormat !== 'json' && toFormat !== 'json') {
          const jsonIntermediate = await this.convert(template, fromFormat, 'json');
          return await this.convert(jsonIntermediate, 'json', toFormat);
        }
        throw new Error(`Conversion from ${fromFormat} to ${toFormat} not supported`);
      }

      return await converter(template);
    } catch (error) {
      logger.error(`Conversion failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * JSON to YAML conversion
   */
  jsonToYaml(jsonData) {
    const obj = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    return yaml.dump(obj, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false
    });
  }

  /**
   * YAML to JSON conversion
   */
  yamlToJson(yamlData) {
    const obj = yaml.load(yamlData);
    return JSON.stringify(obj, null, 2);
  }

  /**
   * JSON to XML conversion
   */
  jsonToXml(jsonData) {
    const obj = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    return this.objectToXml(obj, 'workflow');
  }

  /**
   * XML to JSON conversion
   */
  xmlToJson(xmlData) {
    // Simple XML parsing (for production, use xml2js or similar)
    const obj = this.parseXml(xmlData);
    return JSON.stringify(obj, null, 2);
  }

  /**
   * YAML to XML conversion
   */
  yamlToXml(yamlData) {
    const obj = yaml.load(yamlData);
    return this.objectToXml(obj, 'workflow');
  }

  /**
   * XML to YAML conversion
   */
  xmlToYaml(xmlData) {
    const obj = this.parseXml(xmlData);
    return yaml.dump(obj, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false
    });
  }

  /**
   * JSON to BUMBA format conversion
   */
  jsonToBumba(jsonData) {
    const obj = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    return this.generateBumbaFormat(obj);
  }

  /**
   * BUMBA format to JSON conversion
   */
  bumbaToJson(bumbaData) {
    const obj = this.parseBumbaFormat(bumbaData);
    return JSON.stringify(obj, null, 2);
  }

  /**
   * Convert object to XML
   */
  objectToXml(obj, rootName = 'root') {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n`;

    const processNode = (node, key, indent = '  ') => {
      if (node === null || node === undefined) {
        return `${indent}<${key}/>\n`;
      }

      if (Array.isArray(node)) {
        let result = '';
        node.forEach(item => {
          result += processNode(item, key, indent);
        });
        return result;
      }

      if (typeof node === 'object') {
        let result = `${indent}<${key}>\n`;
        Object.entries(node).forEach(([k, v]) => {
          result += processNode(v, k, indent + '  ');
        });
        result += `${indent}</${key}>\n`;
        return result;
      }

      // Scalar value
      const value = String(node).replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
      
      return `${indent}<${key}>${value}</${key}>\n`;
    };

    Object.entries(obj).forEach(([key, value]) => {
      xml += processNode(value, key);
    });

    xml += `</${rootName}>`;
    return xml;
  }

  /**
   * Parse XML to object (simplified)
   */
  parseXml(xmlData) {
    // This is a simplified parser - for production use xml2js
    const obj = {};
    
    // Remove XML declaration
    const content = xmlData.replace(/<\?xml[^>]*\?>/, '').trim();
    
    // Extract root element
    const rootMatch = content.match(/<(\w+)>([\s\S]*)<\/\1>/);
    if (!rootMatch) {
      throw new Error('Invalid XML format');
    }
    
    const rootContent = rootMatch[2];
    
    // Parse elements
    const elementRegex = /<(\w+)>([^<]*)<\/\1>|<(\w+)>([\s\S]*?)<\/\3>/g;
    let match;
    
    while ((match = elementRegex.exec(rootContent)) !== null) {
      const key = match[1] || match[3];
      const value = match[2] || match[4];
      
      if (value && !value.includes('<')) {
        // Simple value
        obj[key] = this.parseValue(value.trim());
      } else {
        // Nested object
        obj[key] = this.parseXml(`<${key}>${value}</${key}>`);
      }
    }
    
    return obj;
  }

  /**
   * Parse value to appropriate type
   */
  parseValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (!isNaN(value) && value !== '') return Number(value);
    return value;
  }

  /**
   * Generate BUMBA format (custom DSL)
   */
  generateBumbaFormat(obj) {
    let bumba = '# BUMBA Workflow Definition\n\n';

    // Workflow header
    bumba += `WORKFLOW "${obj.name}"\n`;
    if (obj.description) {
      bumba += `  DESCRIPTION "${obj.description}"\n`;
    }
    bumba += '\n';

    // Agents
    if (obj.agents && obj.agents.length > 0) {
      bumba += 'AGENTS:\n';
      obj.agents.forEach(agent => {
        bumba += `  - ${agent}\n`;
      });
      bumba += '\n';
    }

    // Steps
    if (obj.steps && obj.steps.length > 0) {
      bumba += 'STEPS:\n';
      obj.steps.forEach(step => {
        bumba += `  ${step.type.toUpperCase()} "${step.name}"\n`;
        if (step.agent) {
          bumba += `    AGENT ${step.agent}\n`;
        }
        if (step.maxIterations) {
          bumba += `    MAX_ITERATIONS ${step.maxIterations}\n`;
        }
        if (step.qualityThreshold !== undefined) {
          bumba += `    QUALITY_THRESHOLD ${step.qualityThreshold}\n`;
        }
        if (step.dependsOn) {
          const deps = Array.isArray(step.dependsOn) ? step.dependsOn : [step.dependsOn];
          bumba += `    DEPENDS_ON ${deps.join(', ')}\n`;
        }
        bumba += '\n';
      });
    }

    // Config
    if (obj.config) {
      bumba += 'CONFIG:\n';
      Object.entries(obj.config).forEach(([key, value]) => {
        bumba += `  ${key}: ${value}\n`;
      });
    }

    return bumba;
  }

  /**
   * Parse BUMBA format
   */
  parseBumbaFormat(bumbaData) {
    const obj = {
      steps: [],
      agents: []
    };

    const lines = bumbaData.split('\n');
    let currentSection = null;
    let currentStep = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      // Workflow declaration
      if (trimmed.startsWith('WORKFLOW')) {
        const match = trimmed.match(/WORKFLOW "([^"]+)"/);
        if (match) obj.name = match[1];
      }
      // Description
      else if (trimmed.startsWith('DESCRIPTION')) {
        const match = trimmed.match(/DESCRIPTION "([^"]+)"/);
        if (match) obj.description = match[1];
      }
      // Section headers
      else if (trimmed === 'AGENTS:') {
        currentSection = 'agents';
      }
      else if (trimmed === 'STEPS:') {
        currentSection = 'steps';
      }
      else if (trimmed === 'CONFIG:') {
        currentSection = 'config';
        obj.config = {};
      }
      // Section content
      else if (currentSection === 'agents' && trimmed.startsWith('-')) {
        obj.agents.push(trimmed.substring(1).trim());
      }
      else if (currentSection === 'steps') {
        const stepTypes = ['TASK', 'ITERATIVE', 'LOOP', 'PARALLEL', 'CONDITION'];
        const stepType = stepTypes.find(t => trimmed.startsWith(t));
        
        if (stepType) {
          const match = trimmed.match(new RegExp(`${stepType} "([^"]+)"`));
          if (match) {
            currentStep = {
              name: match[1],
              type: stepType.toLowerCase()
            };
            obj.steps.push(currentStep);
          }
        } else if (currentStep && trimmed.startsWith('AGENT')) {
          currentStep.agent = trimmed.split(' ')[1];
        } else if (currentStep && trimmed.startsWith('MAX_ITERATIONS')) {
          currentStep.maxIterations = parseInt(trimmed.split(' ')[1]);
        } else if (currentStep && trimmed.startsWith('QUALITY_THRESHOLD')) {
          currentStep.qualityThreshold = parseFloat(trimmed.split(' ')[1]);
        } else if (currentStep && trimmed.startsWith('DEPENDS_ON')) {
          const deps = trimmed.substring('DEPENDS_ON'.length).trim().split(',').map(d => d.trim());
          currentStep.dependsOn = deps.length === 1 ? deps[0] : deps;
        }
      }
      else if (currentSection === 'config' && trimmed.includes(':')) {
        const [key, value] = trimmed.split(':').map(s => s.trim());
        obj.config[key] = this.parseValue(value);
      }
    });

    return obj;
  }

  /**
   * Detect format from content
   */
  detectFormat(content) {
    const trimmed = content.trim();

    // Check for JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {}
    }

    // Check for XML
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
      return 'xml';
    }

    // Check for BUMBA format
    if (trimmed.includes('WORKFLOW') && trimmed.includes('STEPS:')) {
      return 'bumba';
    }

    // Default to YAML
    return 'yaml';
  }

  /**
   * Auto-convert with format detection
   */
  async autoConvert(content, toFormat) {
    const fromFormat = this.detectFormat(content);
    logger.info(`Auto-detected format: ${fromFormat}`);
    return this.convert(content, fromFormat, toFormat);
  }
}

module.exports = TemplateConverter;