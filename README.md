# Azure Container Apps Secrets Processor

A CLI tool to process environment variables and create secrets for Azure Container Apps.

## Features

- 🔒 Securely process .env files for Azure Container Apps
- 🔄 Convert environment variables to proper secret format
- 📝 Generate both CLI commands and JSON output
- 🎨 Interactive CLI with color-coded output
- ⚡ Support for both command-line arguments and interactive mode

## Installation

```bash
# Clone the repository
git clone https://github.com/iamevansobeng/azure-container-secrets.git
cd azure-container-secrets

# Install dependencies
npm install

# Optional: Install globally
npm install -g .
```

## Usage

### Command Line Mode

```bash
container-secrets -f .env -n my-container-app -g my-resource-group
```

### Interactive Mode

```bash
container-secrets
```

### Options

- `-f, --file`: Path to .env file
- `-n, --name`: Container App name
- `-g, --resource-group`: Resource group name
- `-y, --yes`: Skip confirmation prompts
- `-h, --help`: Display help
- `-V, --version`: Display version

## Environment File Format

See `sample.env` for an example of the environment file format. The tool will:

- Convert keys to lowercase
- Replace underscores with hyphens
- Omit empty values
- Strip quotes from values

## Generated Files

1. `secrets-command.sh`: Azure CLI command to set secrets
2. `secrets.json`: JSON format of processed secrets

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
