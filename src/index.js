#!/usr/bin/env node
import fs from "fs";
import { program } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import boxen from "boxen";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

program
  .name("container-secrets")
  .description("Process .env files for Azure Container Apps secrets")
  .version("1.0.0")
  .option("-f, --file <path>", "Path to .env file")
  .option("-n, --name <name>", "Container App name")
  .option("-g, --resource-group <group>", "Resource group name")
  .option("-y, --yes", "Skip confirmation prompts");

program.parse();
const options = program.opts();

async function promptForMissingOptions(options) {
  const questions = [];

  if (!options.file) {
    questions.push({
      type: "input",
      name: "file",
      message: "📁 Path to .env file:",
      default: ".env",
    });
  }

  if (!options.name) {
    questions.push({
      type: "input",
      name: "name",
      message: "🔷 Container App name:",
      validate: (input) => input.length > 0 || "Container App name is required",
    });
  }

  if (!options.resourceGroup) {
    questions.push({
      type: "input",
      name: "resourceGroup",
      message: "📦 Resource group name:",
      validate: (input) => input.length > 0 || "Resource group is required",
    });
  }

  const answers = await inquirer.prompt(questions);
  return { ...options, ...answers };
}

async function processEnvFile(filePath, appName, resourceGroup) {
  const spinner = ora("Processing environment file").start();

  try {
    const fileContent = fs.readFileSync(filePath, "utf8");

    const secrets = fileContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .reduce((acc, line) => {
        const firstEqualIndex = line.indexOf("=");
        if (firstEqualIndex === -1) return acc;

        const key = line
          .slice(0, firstEqualIndex)
          .trim()
          .toLowerCase()
          .replace(/_/g, "-");

        const value = line.slice(firstEqualIndex + 1).trim();
        const cleanValue = value.replace(/^["'](.*)["']$/, "$1");

        if (cleanValue.length > 0) {
          acc[key] = cleanValue;
        }

        return acc;
      }, {});

    spinner.succeed("Environment file processed");

    // Generate command
    const secretsCommand = `az containerapp secret set \\
  --name ${appName} \\
  --resource-group ${resourceGroup} \\
  --secrets \\
${Object.entries(secrets)
  .map(([key, value]) => `    ${key}="${value}"`)
  .join(" \\\n")}
`;

    // Save files
    fs.writeFileSync("secrets-command.sh", secretsCommand);
    fs.writeFileSync("secrets.json", JSON.stringify(secrets, null, 2));

    console.log(
      "\n" +
        boxen(chalk.green("✨ Files generated successfully"), {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "green",
        })
    );

    // Display results
    console.log(chalk.cyan("\n📊 Processed secrets:"));
    Object.keys(secrets).forEach((key) => {
      console.log(chalk.grey("•"), chalk.yellow(key));
    });

    console.log(chalk.cyan("\n📂 Generated files:"));
    console.log(
      chalk.grey("•"),
      "secrets-command.sh",
      chalk.grey("(Azure CLI command)")
    );
    console.log(chalk.grey("•"), "secrets.json", chalk.grey("(JSON format)"));

    console.log(chalk.cyan("\n🚀 Next steps:"));
    console.log(chalk.grey("1."), "Review the generated files");
    console.log(chalk.grey("2."), "Make sure you are logged into Azure CLI");
    console.log(
      chalk.grey("3."),
      "Run the generated command in secrets-command.sh"
    );
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
