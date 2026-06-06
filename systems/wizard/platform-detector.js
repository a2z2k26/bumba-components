/**
 * Platform Detector for BUMBA Setup Wizard
 * Detects OS platform and provides platform-specific paths and commands
 */

const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;

class PlatformDetector {
  constructor() {
    // Basic platform info
    this.platform = process.platform;
    this.arch = process.arch;
    this.release = os.release();
    this.type = os.type();

    // Platform-specific details
    this.details = this.detectPlatformDetails();

    // Path configurations
    this.paths = this.getPlatformPaths();

    // Command configurations
    this.commands = this.getPlatformCommands();

    // Software detection results
    this.software = {};
  }

  /**
   * Detect detailed platform information
   */
  detectPlatformDetails() {
    const platform = this.platform;

    switch (platform) {
      case 'darwin':
        return {
          name: 'macOS',
          family: 'unix',
          shell: process.env.SHELL || '/bin/bash',
          packageManager: 'brew',
          osVersion: this.getMacOSVersion(),
          isM1: this.arch === 'arm64'
        };

      case 'win32':
        return {
          name: 'Windows',
          family: 'windows',
          shell: process.env.COMSPEC || 'cmd.exe',
          packageManager: 'choco',
          osVersion: this.getWindowsVersion(),
          isWSL: this.detectWSL()
        };

      case 'linux':
        return {
          name: 'Linux',
          family: 'unix',
          shell: process.env.SHELL || '/bin/bash',
          packageManager: this.detectLinuxPackageManager(),
          distribution: this.detectLinuxDistribution(),
          isWSL: this.detectWSL()
        };

      default:
        return {
          name: platform,
          family: 'unknown',
          shell: process.env.SHELL || '/bin/sh'
        };
    }
  }

  /**
   * Get macOS version
   */
  getMacOSVersion() {
    try {
      const release = os.release();
      const major = parseInt(release.split('.')[0]);

      // Map Darwin version to macOS version
      const versionMap = {
        23: 'Sonoma 14',
        22: 'Ventura 13',
        21: 'Monterey 12',
        20: 'Big Sur 11',
        19: 'Catalina 10.15'
      };

      return versionMap[major] || `Darwin ${major}`;
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Get Windows version
   */
  getWindowsVersion() {
    const release = os.release();
    const version = release.split('.').map(Number);

    if (version[0] === 10 && version[2] >= 22000) {
      return 'Windows 11';
    } else if (version[0] === 10) {
      return 'Windows 10';
    } else if (version[0] === 6 && version[1] === 3) {
      return 'Windows 8.1';
    } else if (version[0] === 6 && version[1] === 2) {
      return 'Windows 8';
    } else if (version[0] === 6 && version[1] === 1) {
      return 'Windows 7';
    }

    return `Windows ${release}`;
  }

  /**
   * Detect Linux distribution
   */
  detectLinuxDistribution() {
    try {
      const osRelease = require('fs').readFileSync('/etc/os-release', 'utf8');
      const lines = osRelease.split('\n');
      const info = {};

      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key && value) {
          info[key] = value.replace(/"/g, '');
        }
      }

      return {
        name: info.NAME || 'Unknown',
        version: info.VERSION || 'Unknown',
        id: info.ID || 'unknown'
      };
    } catch {
      return {
        name: 'Unknown Linux',
        version: 'Unknown',
        id: 'unknown'
      };
    }
  }

  /**
   * Detect Linux package manager
   */
  detectLinuxPackageManager() {
    const managers = [
      { cmd: 'apt', name: 'apt' },
      { cmd: 'yum', name: 'yum' },
      { cmd: 'dnf', name: 'dnf' },
      { cmd: 'pacman', name: 'pacman' },
      { cmd: 'zypper', name: 'zypper' },
      { cmd: 'apk', name: 'apk' }
    ];

    for (const manager of managers) {
      try {
        require('child_process').execSync(`which ${manager.cmd}`, { stdio: 'ignore' });
        return manager.name;
      } catch {
        // Continue checking
      }
    }

    return 'unknown';
  }

  /**
   * Detect WSL (Windows Subsystem for Linux)
   */
  detectWSL() {
    try {
      const procVersion = require('fs').readFileSync('/proc/version', 'utf8');
      return procVersion.toLowerCase().includes('microsoft');
    } catch {
      return false;
    }
  }

  /**
   * Get platform-specific paths
   */
  getPlatformPaths() {
    const homeDir = os.homedir();
    const platform = this.platform;

    const paths = {
      home: homeDir,
      temp: os.tmpdir(),
      desktop: path.join(homeDir, 'Desktop'),
      documents: path.join(homeDir, 'Documents'),
      downloads: path.join(homeDir, 'Downloads')
    };

    // Platform-specific application paths
    switch (platform) {
      case 'darwin':
        paths.applications = '/Applications';
        paths.appSupport = path.join(homeDir, 'Library', 'Application Support');
        paths.preferences = path.join(homeDir, 'Library', 'Preferences');
        paths.logs = path.join(homeDir, 'Library', 'Logs');
        paths.claudeConfig = path.join(paths.appSupport, 'Claude', 'claude_desktop_config.json');
        paths.npmGlobal = '/usr/local/lib/node_modules';
        break;

      case 'win32':
        paths.applications = 'C:\\Program Files';
        paths.appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
        paths.localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
        paths.programData = process.env.PROGRAMDATA || 'C:\\ProgramData';
        paths.claudeConfig = path.join(paths.appData, 'Claude', 'claude_desktop_config.json');
        paths.npmGlobal = path.join(paths.appData, 'npm', 'node_modules');
        break;

      case 'linux':
        paths.applications = '/usr/share/applications';
        paths.config = path.join(homeDir, '.config');
        paths.local = path.join(homeDir, '.local');
        paths.cache = path.join(homeDir, '.cache');
        paths.claudeConfig = path.join(paths.config, 'Claude', 'claude_desktop_config.json');
        paths.npmGlobal = '/usr/local/lib/node_modules';
        break;
    }

    // BUMBA-specific paths
    paths.bumba = path.join(process.cwd(), '.bumba');
    paths.bumbaConfig = path.join(paths.bumba, 'config.json');
    paths.bumbaBackups = path.join(paths.bumba, 'backups');
    paths.bumbaLogs = path.join(paths.bumba, 'logs');

    return paths;
  }

  /**
   * Get platform-specific commands
   */
  getPlatformCommands() {
    const platform = this.platform;

    const commands = {
      open: '',
      clear: '',
      copy: '',
      paste: '',
      processList: '',
      killProcess: '',
      findPort: '',
      npmGlobal: ''
    };

    switch (platform) {
      case 'darwin':
        commands.open = 'open';
        commands.clear = 'clear';
        commands.copy = 'pbcopy';
        commands.paste = 'pbpaste';
        commands.processList = 'ps aux';
        commands.killProcess = 'kill';
        commands.findPort = 'lsof -i :';
        commands.npmGlobal = 'npm list -g --depth=0';
        break;

      case 'win32':
        commands.open = 'start';
        commands.clear = 'cls';
        commands.copy = 'clip';
        commands.paste = 'powershell Get-Clipboard';
        commands.processList = 'tasklist';
        commands.killProcess = 'taskkill /F /PID';
        commands.findPort = 'netstat -ano | findstr :';
        commands.npmGlobal = 'npm list -g --depth=0';
        break;

      case 'linux':
        commands.open = 'xdg-open';
        commands.clear = 'clear';
        commands.copy = 'xclip -selection clipboard';
        commands.paste = 'xclip -selection clipboard -o';
        commands.processList = 'ps aux';
        commands.killProcess = 'kill';
        commands.findPort = 'lsof -i :';
        commands.npmGlobal = 'npm list -g --depth=0';
        break;
    }

    return commands;
  }

  /**
   * Detect installed software
   */
  async detectSoftware() {
    const software = {};

    // Node.js and npm
    software.node = {
      installed: true, // We're running in Node
      version: process.version,
      npm: await this.getNpmVersion()
    };

    // Git
    software.git = await this.checkCommand('git --version', /git version ([\d.]+)/);

    // Python
    software.python = await this.checkCommand('python3 --version', /Python ([\d.]+)/) ||
                      await this.checkCommand('python --version', /Python ([\d.]+)/);

    // Docker
    software.docker = await this.checkCommand('docker --version', /Docker version ([\d.]+)/);

    // Claude
    software.claude = await this.detectClaude();

    // VS Code
    software.vscode = await this.checkCommand('code --version', /([\d.]+)/);

    // Package managers
    if (this.platform === 'darwin') {
      software.brew = await this.checkCommand('brew --version', /Homebrew ([\d.]+)/);
    } else if (this.platform === 'win32') {
      software.choco = await this.checkCommand('choco --version', /([\d.]+)/);
    }

    this.software = software;
    return software;
  }

  /**
   * Check if a command exists and get version
   */
  async checkCommand(command, versionPattern) {
    try {
      const { stdout } = await execAsync(command);

      if (versionPattern && stdout) {
        const match = stdout.match(versionPattern);
        if (match) {
          return {
            installed: true,
            version: match[1]
          };
        }
      }

      return {
        installed: true,
        version: 'Unknown'
      };
    } catch {
      return {
        installed: false,
        version: null
      };
    }
  }

  /**
   * Get npm version
   */
  async getNpmVersion() {
    try {
      const { stdout } = await execAsync('npm --version');
      return stdout.trim();
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Detect Claude installation
   */
  async detectClaude() {
    const platform = this.platform;

    try {
      if (platform === 'darwin') {
        // Check macOS Applications
        const apps = await fs.readdir('/Applications').catch(() => []);
        const claudeApp = apps.find(app => app.toLowerCase().includes('claude'));

        if (claudeApp) {
          return {
            installed: true,
            path: path.join('/Applications', claudeApp),
            configExists: await this.fileExists(this.paths.claudeConfig)
          };
        }
      } else if (platform === 'win32') {
        // Check Windows Program Files
        const programFiles = [
          process.env['ProgramFiles'],
          process.env['ProgramFiles(x86)'],
          path.join(process.env.LOCALAPPDATA || '', 'Programs')
        ];

        for (const dir of programFiles) {
          if (!dir) continue;

          try {
            const files = await fs.readdir(dir);
            const claudeDir = files.find(f => f.toLowerCase().includes('claude'));

            if (claudeDir) {
              return {
                installed: true,
                path: path.join(dir, claudeDir),
                configExists: await this.fileExists(this.paths.claudeConfig)
              };
            }
          } catch {
            // Continue checking
          }
        }
      } else if (platform === 'linux') {
        // Check common Linux locations
        const locations = [
          '/opt/Claude',
          '/usr/local/bin/claude',
          path.join(os.homedir(), '.local/share/applications')
        ];

        for (const location of locations) {
          if (await this.fileExists(location)) {
            return {
              installed: true,
              path: location,
              configExists: await this.fileExists(this.paths.claudeConfig)
            };
          }
        }
      }
    } catch (error) {
      // Detection failed
    }

    return {
      installed: false,
      path: null,
      configExists: false
    };
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get platform adapter for specific operations
   */
  getAdapter() {
    const platform = this.platform;

    return {
      openURL: async (url) => {
        const command = `${this.commands.open} "${url}"`;
        await execAsync(command);
      },

      openFile: async (filePath) => {
        const command = `${this.commands.open} "${filePath}"`;
        await execAsync(command);
      },

      copyToClipboard: async (text) => {
        const { spawn } = require('child_process');
        const child = spawn(this.commands.copy, [], { shell: true });
        child.stdin.write(text);
        child.stdin.end();

        return new Promise((resolve, reject) => {
          child.on('close', resolve);
          child.on('error', reject);
        });
      },

      isPortInUse: async (port) => {
        try {
          const command = `${this.commands.findPort}${port}`;
          const { stdout } = await execAsync(command);
          return stdout.trim().length > 0;
        } catch {
          return false;
        }
      },

      killPort: async (port) => {
        if (platform === 'darwin' || platform === 'linux') {
          try {
            const { stdout } = await execAsync(`lsof -t -i:${port}`);
            const pid = stdout.trim();
            if (pid) {
              await execAsync(`kill -9 ${pid}`);
              return true;
            }
          } catch {
            return false;
          }
        } else if (platform === 'win32') {
          try {
            const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
              const parts = line.trim().split(/\s+/);
              const pid = parts[parts.length - 1];
              if (pid && pid !== '0') {
                await execAsync(`taskkill /F /PID ${pid}`);
                return true;
              }
            }
          } catch {
            return false;
          }
        }
        return false;
      }
    };
  }

  /**
   * Get system information summary
   */
  getSystemInfo() {
    return {
      platform: this.details.name,
      version: this.details.osVersion || this.release,
      arch: this.arch,
      node: process.version,
      npm: this.software.npm,
      memory: {
        total: Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
        free: Math.round(os.freemem() / 1024 / 1024 / 1024) + ' GB'
      },
      cpu: {
        model: os.cpus()[0]?.model || 'Unknown',
        cores: os.cpus().length,
        speed: os.cpus()[0]?.speed || 'Unknown'
      },
      user: os.userInfo().username,
      hostname: os.hostname()
    };
  }

  /**
   * Get platform-specific installation instructions
   */
  getInstallInstructions(software) {
    const platform = this.platform;
    const instructions = {};

    if (!this.software.git?.installed) {
      if (platform === 'darwin') {
        instructions.git = 'brew install git';
      } else if (platform === 'win32') {
        instructions.git = 'Download from https://git-scm.com/download/win';
      } else {
        instructions.git = `sudo ${this.details.packageManager} install git`;
      }
    }

    if (!this.software.claude?.installed) {
      instructions.claude = 'Download from https://claude.ai/download';
    }

    if (!this.software.docker?.installed) {
      if (platform === 'darwin') {
        instructions.docker = 'Download Docker Desktop from https://www.docker.com/products/docker-desktop';
      } else if (platform === 'win32') {
        instructions.docker = 'Download Docker Desktop from https://www.docker.com/products/docker-desktop';
      } else {
        instructions.docker = 'curl -fsSL https://get.docker.com | sh';
      }
    }

    return instructions;
  }
}

module.exports = PlatformDetector;