#!/usr/bin/env node
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { program } from "commander";
import inquirer , {QuestionCollection}  from "inquirer";
import chalk from "chalk";
import ora from "ora";
import boxen from "boxen";
import { ConfigManager } from "./config.js";
import dotenv from "dotenv";

const execAsync = promisify(exec);
const configManager = new ConfigManager();

type SecretNameStyle = "kebab-lower" | "lower" | "preserve";
type EnvMode = "secretref" | "plain";

type CliOptions = {
  file?: string;
  name?: string;
  resourceGroup?: string;
  yes?: boolean;
  new?: boolean;
  includePrefix: string[];
  excludePrefix: string[];
  secretNameStyle: SecretNameStyle;
  secretPrefix?: string;
  secretsOnly?: boolean;
  envOnly?: boolean;
  envMode: EnvMode;
};

program
  .name("container-secrets")
  .description("Process .env files for Azure Container Apps secrets/env vars")
  .version("1.1.0")
  .option("-f, --file <path>", "Path to .env file")
  .option("-n, --name <name>", "Container App name")
  .option("-g, --resource-group <group>", "Resource group name")
  .option("-y, --yes", "Skip confirmation prompts and execute")
  .option("--new", "Ignore saved values and prompt for new ones")
  .option(
    "--include-prefix <prefix>",
    "Only include keys with this prefix (repeatable)",
    collectRepeatable,
    []
  )
  .option(
    "--exclude-prefix <prefix>",
    "Exclude keys with this prefix (repeatable)",
    collectRepeatable,
    ["TF_VAR_"]
  )
  .option(
    "--secret-name-style <style>",
    "Secret name style: kebab-lower | lower | preserve",
    "kebab-lower"
  )
  .option("--secret-prefix <prefix>", "Prefix all generated secret names")
  .option("--secrets-only", "Only set secrets (skip env vars)")
  .option("--env-only", "Only set env vars (skip secrets)")
  .option(
    "--env-mode <mode>",
    "Env var values: secretref | plain",
    "secretref"
  );

program.parse();
const options = program.opts<CliOptions>();

function collectRepeatable(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function bashSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeSecretName(
  key: string,
  style: SecretNameStyle,
  prefix?: string
): string {
  let name = key;
  if (style === "kebab-lower") {
    name = key.toLowerCase().replace(/_/g, "-");
  } else if (style === "lower") {
    name = key.toLowerCase();
  }

  if (prefix) {
    name = `${prefix}${name}`;
  }
  return name;
}

function findNameCollisions(mapping: Map<string, string[]>): string[] {
  const collisions: string[] = [];
  for (const [secretName, keys] of mapping.entries()) {
    if (keys.length > 1) {
      collisions.push(`${secretName}: ${keys.join(", ")}`);
    }
  }
  return collisions;
}

async function executeCommand(filePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(`chmod +x ${filePath}`);
    await execAsync(`./${filePath}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function promptForMissingOptions(
  opts: CliOptions
): Promise<Required<Pick<CliOptions, "file" | "name" | "resourceGroup">> & CliOptions> {
  const questions: QuestionCollection[] = [];
  const config = configManager.loadConfig();

  if (!opts.file) {
    questions.push({
      type: "input",
      name: "file",
      message: "📁 Path to .env file:",
      default: ".env",
    });
  }

  if (!opts.name) {
    const appQuestion: any = {
      type: config.lastUsedApp.length && !opts.new ? "list" : "input",
      name: "name",
      message: "🔷 Container App name:",
      validate: (input: string) => input.length > 0 || "Container App name is required",
    };

    if (config.lastUsedApp.length && !opts.new) {
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

    if (config.lastUsedApp.length && !opts.new) {
      questions.push({
        type: "input",
        name: "newName",
        message: "🔷 Enter new Container App name:",
        validate: (input: string) => input.length > 0 || "Container App name is required",
        when: (answers: any) => answers.name === "_new_",
      });
    }
  }

  if (!opts.resourceGroup) {
    const rgQuestion: any = {
      type: config.lastUsedResourceGroup.length && !opts.new ? "list" : "input",
      name: "resourceGroup",
      message: "📦 Resource group name:",
      validate: (input: string) => input.length > 0 || "Resource group is required",
    };

    if (config.lastUsedResourceGroup.length && !opts.new) {
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

    if (config.lastUsedResourceGroup.length && !opts.new) {
      questions.push({
        type: "input",
        name: "newResourceGroup",
        message: "📦 Enter new resource group name:",
        validate: (input: string) => input.length > 0 || "Resource group is required",
        when: (answers: any) => answers.resourceGroup === "_new_",
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
    ...opts,
    ...answers,
    name: answers.name || opts.name,
    resourceGroup: answers.resourceGroup || opts.resourceGroup,
    file: answers.file || opts.file,
  };
}

function shouldIncludeKey(
  key: string,
  includePrefixes: string[],
  excludePrefixes: string[]
): { include: boolean; reason?: string } {
  if (excludePrefixes.some((prefix) => key.startsWith(prefix))) {
    return { include: false, reason: "excluded-prefix" };
  }
  if (includePrefixes.length > 0 && !includePrefixes.some((p) => key.startsWith(p))) {
    return { include: false, reason: "not-included-prefix" };
  }
  return { include: true };
}

async function processEnvFile(
  filePath: string,
  appName: string,
  resourceGroup: string,
  opts: CliOptions
): Promise<void> {
  const spinner = ora("Processing environment file").start();

  try {
    if (!fs.existsSync(filePath)) {
      spinner.fail(chalk.red(`File not found: ${filePath}`));
      process.exit(1);
    }

    if (opts.envMode === "secretref" && opts.envOnly) {
      console.log(
        chalk.yellow(
          "\n⚠️  --env-only with --env-mode secretref will not work without secrets. Switching env-mode to plain."
        )
      );
      opts.envMode = "plain";
    }

    const fileContent = fs.readFileSync(filePath, "utf8");
    spinner.text = "Parsing variables...";

    const parsed = dotenv.parse(fileContent);
    const secrets: Record<string, string> = {};
    const envVars: Record<string, string> = {};
    const processedKeys: string[] = [];
    const skippedKeys: string[] = [];
    let hasMultilineValues = false;
    const skippedReasons: Record<string, number> = {
      empty: 0,
      "excluded-prefix": 0,
      "not-included-prefix": 0,
    };

    const nameToKeys = new Map<string, string[]>();

    for (const [key, value] of Object.entries(parsed)) {
      if (!value || value.length === 0) {
        skippedKeys.push(key);
        skippedReasons.empty += 1;
        continue;
      }

      const includeCheck = shouldIncludeKey(
        key,
        opts.includePrefix,
        opts.excludePrefix
      );
      if (!includeCheck.include) {
        skippedKeys.push(key);
        if (includeCheck.reason) {
          skippedReasons[includeCheck.reason] += 1;
        }
        continue;
      }

      const secretName = normalizeSecretName(
        key,
        opts.secretNameStyle,
        opts.secretPrefix
      );
      const existing = nameToKeys.get(secretName) || [];
      existing.push(key);
      nameToKeys.set(secretName, existing);

      if (!opts.envOnly) {
        secrets[secretName] = value;
      }

      if (!opts.secretsOnly) {
        if (opts.envMode === "secretref") {
          envVars[key] = `secretref:${secretName}`;
        } else {
          envVars[key] = value;
        }
      }
      processedKeys.push(key);
      if (value.includes("\n") || value.includes("\r")) {
        hasMultilineValues = true;
      }
    }

    const collisions = findNameCollisions(nameToKeys);
    if (collisions.length > 0) {
      spinner.fail(chalk.red("Secret name collisions detected"));
      collisions.forEach((c) => console.error(chalk.red(`  ${c}`)));
      console.error(
        chalk.yellow(
          "\n👉 Tip: Use --secret-prefix or --secret-name-style preserve to resolve collisions."
        )
      );
      process.exit(1);
    }

    spinner.succeed("Environment file processed");

    if (opts.secretsOnly && opts.envOnly) {
      console.error(chalk.red("Cannot use --secrets-only and --env-only together"));
      process.exit(1);
    }

    if (!opts.envOnly && opts.envMode === "plain" && !opts.yes) {
      const confirmPlain = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message:
            "⚠️  Env vars will be set as plaintext values. Proceed?",
          default: false,
        },
      ]);
      if (!confirmPlain.confirm) {
        console.log(chalk.cyan("Cancelled."));
        process.exit(0);
      }
    }

    const totalProcessed = processedKeys.length;

    console.log(
      "\n" +
        boxen(chalk.green("✨ Files generated successfully"), {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "green",
        })
    );

    if (!opts.envOnly) {
      const secretsCommand = `az containerapp secret set \\\n  --name ${appName} \\\n  --resource-group ${resourceGroup} \\\n  --secrets \\\n${Object.entries(secrets)
        .map(([key, value]) => `    ${key}=${bashSingleQuote(value)}`)
        .join(" \\\n")}\n`;
      fs.writeFileSync("secrets-command.sh", secretsCommand);
      fs.writeFileSync("secrets.json", JSON.stringify(secrets, null, 2));
    }

    if (!opts.secretsOnly) {
      const envVarsCommand = `az containerapp update \\\n  --name ${appName} \\\n  --resource-group ${resourceGroup} \\\n  --set-env-vars \\\n${Object.entries(envVars)
        .map(([key, value]) => `    ${key}=${bashSingleQuote(value)}`)
        .join(" \\\n")}\n`;
      fs.writeFileSync("envvars-command.sh", envVarsCommand);
      fs.writeFileSync("envvars.json", JSON.stringify(envVars, null, 2));
    }

    configManager.updateLastUsed(appName, resourceGroup);

    console.log(chalk.cyan("\n📊 Processed keys:"));
    processedKeys.forEach((key) => {
      console.log(chalk.grey("•"), chalk.yellow(key));
    });

    if (skippedKeys.length > 0) {
      console.log(chalk.yellow("\n⚠️  Skipped keys:"));
      skippedKeys.forEach((key) => {
        console.log(chalk.grey("•"), chalk.yellow(key));
      });
      console.log(
        chalk.grey(
          `\nSkipped counts -> empty: ${skippedReasons.empty}, excluded: ${skippedReasons["excluded-prefix"]}, not-included: ${skippedReasons["not-included-prefix"]}`
        )
      );
    }

    console.log(chalk.cyan("\n📂 Generated files:"));
    if (!opts.envOnly) {
      console.log(chalk.grey("•"), "secrets-command.sh", chalk.grey("(Azure CLI command)"));
      console.log(chalk.grey("•"), "secrets.json", chalk.grey("(JSON format)"));
    }
    if (!opts.secretsOnly) {
      console.log(chalk.grey("•"), "envvars-command.sh", chalk.grey("(Azure CLI command)"));
      console.log(chalk.grey("•"), "envvars.json", chalk.grey("(JSON format)"));
    }

    if (hasMultilineValues) {
      console.log(
        chalk.yellow(
          "\n⚠️  Detected multiline values. If the shell command fails, use the JSON files as input to Azure CLI (if supported) or set those secrets manually."
        )
      );
    }

    if (totalProcessed === 0) {
      console.log(chalk.yellow("\nNo keys processed. Nothing to do."));
      return;
    }

    const shouldExecute = opts.yes
      ? { execute: true }
      : await inquirer.prompt([
          {
            type: "confirm",
            name: "execute",
            message: "🚀 Execute the generated commands now?",
            default: false,
          },
        ]);

    if (shouldExecute.execute) {
      if (!opts.envOnly) {
        const secretResult = await executeCommand("secrets-command.sh");
        if (!secretResult.success) {
          console.error(chalk.red("\n❌ Failed to update secrets:"), secretResult.error);
          process.exit(1);
        }
      }

      if (!opts.secretsOnly) {
        const envResult = await executeCommand("envvars-command.sh");
        if (!envResult.success) {
          console.error(chalk.red("\n❌ Failed to update env vars:"), envResult.error);
          process.exit(1);
        }
      }

      console.log(chalk.green("\n✅ Azure Container App updated successfully"));
    } else {
      console.log(chalk.cyan("\n📝 You can run the commands later:"));
      if (!opts.envOnly) {
        console.log(chalk.grey("$"), chalk.green("chmod +x secrets-command.sh && ./secrets-command.sh"));
      }
      if (!opts.secretsOnly) {
        console.log(chalk.grey("$"), chalk.green("chmod +x envvars-command.sh && ./envvars-command.sh"));
      }
    }
  } catch (error) {
    spinner.fail(chalk.red("Error processing file"));
    console.error(chalk.red("\n❌ Error:"), (error as Error).message);
    process.exit(1);
  }
}

async function main() {
  console.log(
    boxen(chalk.blue("Azure Container Apps Env+Secrets Processor"), {
      padding: 1,
      margin: 1,
      borderStyle: "double",
      borderColor: "blue",
    })
  );

  const allowedStyles: SecretNameStyle[] = ["kebab-lower", "lower", "preserve"];
  if (!allowedStyles.includes(options.secretNameStyle)) {
    console.error(
      chalk.red(
        `Invalid --secret-name-style '${options.secretNameStyle}'. Use: ${allowedStyles.join(
          ", "
        )}`
      )
    );
    process.exit(1);
  }

  const allowedEnvModes: EnvMode[] = ["secretref", "plain"];
  if (!allowedEnvModes.includes(options.envMode)) {
    console.error(
      chalk.red(
        `Invalid --env-mode '${options.envMode}'. Use: ${allowedEnvModes.join(
          ", "
        )}`
      )
    );
    process.exit(1);
  }

  if (options.secretsOnly && options.envOnly) {
    console.error(chalk.red("Cannot use --secrets-only and --env-only together"));
    process.exit(1);
  }

  const opts = await promptForMissingOptions(options);
  await processEnvFile(opts.file!, opts.name!, opts.resourceGroup!, opts);
}

main().catch((error) => {
  console.error(chalk.red("\n❌ Error:"), (error as Error).message);
  process.exit(1);
});
