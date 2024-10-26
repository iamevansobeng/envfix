const fs = require("fs");

function processEnvFile(filePath) {
  try {
    // Read the .env file
    const fileContent = fs.readFileSync(filePath, "utf8");

    // Split by lines and process each line
    const secrets = fileContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")) // Remove empty lines and comments
      .reduce((acc, line) => {
        // Find the first '=' to split key and value
        const firstEqualIndex = line.indexOf("=");
        if (firstEqualIndex === -1) return acc;

        const key = line
          .slice(0, firstEqualIndex)
          .trim()
          .toLowerCase()
          .replace(/_/g, "-");

        const value = line.slice(firstEqualIndex + 1).trim();
        // Remove quotes if they exist
        const cleanValue = value.replace(/^["'](.*)["']$/, "$1");

        // Only add if value exists and is not empty
        if (cleanValue.length > 0) {
          acc[key] = cleanValue;
        }

        return acc;
      }, {});

    // Generate Azure CLI command
    const secretsCommand = `az containerapp secret set \\
  --name server \\
  --resource-group tuagye-alpha \\
  --secrets \\
${Object.entries(secrets)
  .map(([key, value]) => `    ${key}="${value}"`)
  .join(" \\\n")}
`;

    // Generate JSON format
    const secretsJson = JSON.stringify(secrets, null, 2);

    // Write outputs to files
    fs.writeFileSync("secrets-command.sh", secretsCommand);
    fs.writeFileSync("secrets.json", secretsJson);

    console.log("Processed keys (omitting empty values):");
    fileContent
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"))
      .forEach((line) => {
        const firstEqualIndex = line.indexOf("=");
        if (firstEqualIndex !== -1) {
          const originalKey = line.slice(0, firstEqualIndex).trim();
          const value = line.slice(firstEqualIndex + 1).trim();
          const cleanValue = value.replace(/^["'](.*)["']$/, "$1");

          if (cleanValue.length > 0) {
            const transformedKey = originalKey.toLowerCase().replace(/_/g, "-");
            console.log(`${originalKey} -> ${transformedKey}`);
          } else {
            console.log(`${originalKey} -> OMITTED (empty value)`);
          }
        }
      });

    console.log("\nFiles generated:");
    console.log("1. secrets-command.sh - Azure CLI command to set secrets");
    console.log("2. secrets.json - JSON format of secrets");
  } catch (error) {
    console.error("Error processing .env file:", error.message);
  }
}

// Check if file path is provided
const filePath = process.argv[2];
if (!filePath) {
  console.error("Please provide path to .env file");
  console.log("Usage: node script.js /path/to/.env");
  process.exit(1);
}

processEnvFile(filePath);
