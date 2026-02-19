# Azure Container Apps Env+Secrets Processor

CLI to process `.env` files and set both secrets and environment variables for Azure Container Apps. It can generate Azure CLI commands and JSON outputs, and it supports interactive prompts or direct CLI flags.

## Why this tool

Azure Container Apps expects secrets and env vars to be set via separate operations, and secret values should not be committed into IaC or config files. This tool lets you:

- Parse `.env` files safely
- Convert values into secrets and reference them from env vars
- Generate ready-to-run Azure CLI commands
- Save JSON outputs for automation or manual review

## Features

- Processes `.env` files with sensible defaults
- Excludes empty values and optional prefix patterns
- Converts secret names to a consistent style
- Generates CLI commands and JSON files
- Interactive mode with saved recent app/resource group

## Requirements

- Node.js 18+
- Azure CLI (only required if you execute the generated commands)

## Install

Local repo install:

```bash
npm install
```

Optional: `npm link` to make `container-secrets` available globally while working locally.

## Build

```bash
npm run build
```

## Roadmap

- Publish as a package (npm) or alternative distribution channel for easier installs

## Quick start

```bash
node dist/index.js -f .env -n my-container-app -g my-resource-group
```

Interactive mode:

```bash
node dist/index.js
```

If you installed globally or linked:

```bash
container-secrets -f .env -n my-container-app -g my-resource-group
```

## Options

- `-f, --file <path>`: Path to `.env` file
- `-n, --name <name>`: Container App name
- `-g, --resource-group <group>`: Resource group name
- `-y, --yes`: Skip confirmation prompts and execute
- `--new`: Ignore saved values and prompt for new ones
- `--include-prefix <prefix>`: Only include keys with this prefix (repeatable)
- `--exclude-prefix <prefix>`: Exclude keys with this prefix (repeatable). Default: `TF_VAR_`
- `--secret-name-style <style>`: `kebab-lower` | `lower` | `preserve`
- `--secret-prefix <prefix>`: Prefix all generated secret names
- `--secrets-only`: Only set secrets (skip env vars)
- `--env-only`: Only set env vars (skip secrets)
- `--env-mode <mode>`: `secretref` | `plain`
- `-h, --help`: Display help
- `-V, --version`: Display version

Notes:
- `--env-only` with `--env-mode secretref` is coerced to `plain` (secretref requires secrets to exist).
- When `--env-mode plain` is used, the CLI asks for confirmation unless `--yes` is provided.

## Environment file format

See `sample.env` for an example. Defaults:

- Omits empty values
- Excludes `TF_VAR_` keys
- Converts secret names to `kebab-lower`
- Preserves env var names (env vars reference `secretref:<secret-name>` by default)

## Config persistence

The CLI stores the last 5 app names and resource groups at:

```
~/.azure-container-secrets/config.json
```

Use `--new` to ignore saved values and enter fresh ones.

## Output files

1. `secrets-command.sh`: Azure CLI command to set secrets
2. `secrets.json`: JSON format of processed secrets
3. `envvars-command.sh`: Azure CLI command to set env vars
4. `envvars.json`: JSON format of processed env vars

If multiline values are detected, the CLI warns that shell commands may fail. In that case, prefer using the JSON outputs or set values manually.

## Tips

- Use `--secret-prefix` if you need to avoid secret name collisions.
- Use `--secret-name-style preserve` to keep original key casing.
- Use `--include-prefix` to only set a subset of `.env` keys.

## Contributing

Pull requests are welcome. Please keep changes focused and include tests or usage notes when behavior changes.

## License

MIT
