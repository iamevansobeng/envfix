import fs from "fs";
import os from "os";
import path from "path";
import chalk from "chalk";

export interface SavedConfig {
  lastUsedApp: string[];
  lastUsedResourceGroup: string[];
}

export class ConfigManager {
  private readonly configDir: string;
  private readonly configPath: string;

  constructor() {
    this.configDir = path.join(os.homedir(), ".azure-container-secrets");
    this.configPath = path.join(this.configDir, "config.json");
    this.ensureConfigDir();
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  loadConfig(): SavedConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
        return {
          lastUsedApp: config.lastUsedApp || [],
          lastUsedResourceGroup: config.lastUsedResourceGroup || [],
        };
      }
    } catch {
      console.log(
        chalk.yellow("⚠️  Warning: Could not load previous configuration")
      );
    }
    return {
      lastUsedApp: [],
      lastUsedResourceGroup: [],
    };
  }

  private saveConfig(config: SavedConfig): void {
    try {
      const uniqueApps = [...new Set(config.lastUsedApp)].slice(0, 5);
      const uniqueGroups = [...new Set(config.lastUsedResourceGroup)].slice(
        0,
        5
      );

      fs.writeFileSync(
        this.configPath,
        JSON.stringify(
          {
            lastUsedApp: uniqueApps,
            lastUsedResourceGroup: uniqueGroups,
          },
          null,
          2
        )
      );
    } catch {
      console.log(chalk.yellow("⚠️  Warning: Could not save configuration"));
    }
  }

  updateLastUsed(appName: string, resourceGroup: string): void {
    const config = this.loadConfig();
    config.lastUsedApp.unshift(appName);
    config.lastUsedResourceGroup.unshift(resourceGroup);
    this.saveConfig(config);
  }
}
