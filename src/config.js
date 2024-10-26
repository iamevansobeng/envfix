import fs from "fs";
import os from "os";
import path from "path";
import chalk from "chalk";

export class ConfigManager {
  constructor() {
    this.configDir = path.join(os.homedir(), ".azure-container-secrets");
    this.configPath = path.join(this.configDir, "config.json");
    this.ensureConfigDir();
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
        return {
          lastUsedApp: config.lastUsedApp || [],
          lastUsedResourceGroup: config.lastUsedResourceGroup || [],
        };
      }
    } catch (error) {
      console.log(
        chalk.yellow("⚠️  Warning: Could not load previous configuration")
      );
    }
    return {
      lastUsedApp: [],
      lastUsedResourceGroup: [],
    };
  }

  saveConfig(config) {
    try {
      // Keep only last 5 unique values
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
    } catch (error) {
      console.log(chalk.yellow("⚠️  Warning: Could not save configuration"));
    }
  }

  updateLastUsed(appName, resourceGroup) {
    const config = this.loadConfig();

    // Add new values to the beginning
    config.lastUsedApp.unshift(appName);
    config.lastUsedResourceGroup.unshift(resourceGroup);

    this.saveConfig(config);
  }
}
