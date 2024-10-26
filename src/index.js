#!/usr/bin/env node
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { program } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import boxen from "boxen";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { ConfigManager } from "./config.js";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const configManager = new ConfigManager();

program
  .name("container-secrets")
  .description("Process .env files for Azure Container Apps secrets")
  .version("1.0.0")
  .option("-f, --file <path>", "Path to .env file")
  .option("-n, --name <name>", "Container App name")
  .option("-g, --resource-group <group>", "Resource group name")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--new", "Ignore saved values and prompt for new ones");

program.parse();
const options = program.opts();

async function executeCommand(filePath) {
  try {
    await execAsync(`chmod +x ${filePath}`);
    const { stdout, stderr } = await execAsync(`./${filePath}`);
    return { success: true, stdout, stderr };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function promptForMissingOptions(options) {
  const questions = [];
  const config = configManager.loadConfig();

  if (!options.file) {
    questions.push({
      type: "input",
      name: "file",
      message: "📁 Path to .env file:",
      default: ".env",
    });
  }

  if (!options.name) {
    const appQuestion = {
      type: config.lastUsedApp.length && !options.new ? "list" : "input",
      name: "name",
      message: "🔷 Container App name:",
      validate: (input) => input.length > 0 || "Container App name is required",
    };

    if (config.lastUsedApp.length && !options.new) {
      appQuestion.choices = [
        ...config.lastUsedApp.map((app) => ({
          name: `${app} ${chalk.grey("(previously used)")}`,
          value: app,
        })),
        new inquirer.Separator(),
        { name: "Enter a new app name", value: "_new_" },
      ];
    }

    questions.push(appQuestion);

    if (config.lastUsedApp.length && !options.new) {
      questions.push({
        type: "input",
        name: "newName",
        message: "🔷 Enter new Container App name:",
        validate: (input) =>
          input.length > 0 || "Container App name is required",
        when: (answers) => answers.name === "_new_",
      });
    }
  }

  if (!options.resourceGroup) {
    const rgQuestion = {
      type:
        config.lastUsedResourceGroup.length && !options.new ? "list" : "input",
      name: "resourceGroup",
      message: "📦 Resource group name:",
      validate: (input) => input.length > 0 || "Resource group is required",
    };

    if (config.lastUsedResourceGroup.length && !options.new) {
      rgQuestion.choices = [
        ...config.lastUsedResourceGroup.map((rg) => ({
          name: `${rg} ${chalk.grey("(previously used)")}`,
          value: rg,
        })),
        new inquirer.Separator(),
        { name: "Enter a new resource group", value: "_new_" },
      ];
    }

    questions.push(rgQuestion);

    if (config.lastUsedResourceGroup.length && !options.new) {
      questions.push({
        type: "input",
        name: "newResourceGroup",
        message: "📦 Enter new resource group name:",
        validate: (input) => input.length > 0 || "Resource group is required",
        when: (answers) => answers.resourceGroup === "_new_",
      });
    }
  }

  const answers = await inquirer.prompt(questions);

  if (answers.name === "_new_") {
    answers.name = answers.newName;
  }
  if (answers.resourceGroup === "_new_") {
    answers.resourceGroup = answers.newResourceGroup;
  }

  return {
    ...options,
    ...answers,
    name: answers.name || options.name,
    resourceGroup: answers.resourceGroup || options.resourceGroup,
    file: answers.file || options.file,
  };
}

async function processEnvFile(filePath, appName, resourceGroup) {
  const spinner = ora("Processing environment file").start();

  try {
    if (!fs.existsSync(filePath)) {
      spinner.fail(chalk.red(`File not found: ${filePath}`));
      process.exit(1);
    }

    const fileContent = fs.readFileSync(filePath, "utf8");
    spinner.text = "Processing variables...";

    const secrets = {};
    const skippedKeys = [];

    fileContent.split("\n").forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith("#")) return;

      const firstEqualIndex = line.indexOf("=");
      if (firstEqualIndex === -1) {
        skippedKeys.push(line);
        return;
      }

      const key = line
        .slice(0, firstEqualIndex)
        .trim()
        .toLowerCase()
        .replace(/_/g, "-");

      const value = line.slice(firstEqualIndex + 1).trim();
      const cleanValue = value.replace(/^["'](.*)["']$/, "$1");

      if (cleanValue.length > 0) {
        secrets[key] = cleanValue;
      } else {
        skippedKeys.push(key);
      }
    });

    spinner.succeed("Environment file processed");

    const secretsCommand = `az containerapp secret set \\
  --name ${appName} \\
  --resource-group ${resourceGroup} \\
  --secrets \\
${Object.entries(secrets)
  .map(([key, value]) => `    ${key}="${value}"`)
  .join(" \\\n")}
`;

    fs.writeFileSync("secrets-command.sh", secretsCommand);
    fs.writeFileSync("secrets.json", JSON.stringify(secrets, null, 2));

    configManager.updateLastUsed(appName, resourceGroup);

    console.log(
      "\n" +
        boxen(chalk.green("✨ Files generated successfully"), {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "green",
        })
    );

    console.log(chalk.cyan("\n📊 Processed secrets:"));
    Object.keys(secrets).forEach((key) => {
      console.log(chalk.grey("•"), chalk.yellow(key));
    });

    if (skippedKeys.length > 0) {
      console.log(chalk.yellow("\n⚠️  Skipped keys (empty or invalid):"));
      skippedKeys.forEach((key) => {
        console.log(chalk.grey("•"), chalk.yellow(key));
      });
    }

    console.log(chalk.cyan("\n📂 Generated files:"));
    console.log(
      chalk.grey("•"),
      "secrets-command.sh",
      chalk.grey("(Azure CLI command)")
    );
    console.log(chalk.grey("•"), "secrets.json", chalk.grey("(JSON format)"));

    const shouldExecute = await inquirer.prompt([
      {
        type: "confirm",
        name: "makeExecutable",
        message: "🔑 Make secrets-command.sh executable?",
        default: true,
      },
    ]);

    if (shouldExecute.makeExecutable) {
      spinner.start("Making file executable...");
      await execAsync("chmod +x secrets-command.sh");
      spinner.succeed("File is now executable");

      const runCommand = await inquirer.prompt([
        {
          type: "confirm",
          name: "execute",
          message: "🚀 Run the secrets-command.sh now?",
          default: true,
        },
      ]);

      if (runCommand.execute) {
        spinner.start("Executing secrets command...");
        const result = await executeCommand("secrets-command.sh");

        if (result.success) {
          spinner.succeed(
            "Secrets successfully updated in Azure Container App"
          );
        } else {
          spinner.fail("Failed to update secrets");
          console.error(chalk.red("\n❌ Error:"), result.error);

          if (result.error.includes("not logged in")) {
            console.log(
              chalk.yellow("\n👉 Tip: Run"),
              chalk.blue("az login"),
              chalk.yellow("to authenticate with Azure CLI")
            );
          } else if (result.error.includes("not found")) {
            console.log(
              chalk.yellow(
                "\n👉 Tip: Make sure the Container App and Resource Group names are correct"
              )
            );
          }
        }
      } else {
        console.log(chalk.cyan("\n📝 You can run the command later with:"));
        console.log(chalk.grey("$"), chalk.green("./secrets-command.sh"));
      }
    } else {
      console.log(chalk.cyan("\n📝 To execute later, run:"));
      console.log(
        chalk.grey("$"),
        chalk.green("chmod +x secrets-command.sh && ./secrets-command.sh")
      );
    }
  } catch (error) {
    spinner.fail(chalk.red("Error processing file"));
    console.error(chalk.red("\n❌ Error:"), error.message);
    process.exit(1);
  }
}

async function main() {
  console.log(
    boxen(chalk.blue("Azure Container Apps Secrets Processor"), {
      padding: 1,
      margin: 1,
      borderStyle: "double",
      borderColor: "blue",
    })
  );

  const opts = await promptForMissingOptions(options);
  await processEnvFile(opts.file, opts.name, opts.resourceGroup);
}

main().catch((error) => {
  console.error(chalk.red("\n❌ Error:"), error.message);
  process.exit(1);
});
