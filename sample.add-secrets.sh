#!/bin/bash

# Process .env file and generate secrets command
node dist/index.js -f .env -n my-container-app -g my-resource-group

# OR use interactive mode
# node dist/index.js

# After reviewing the generated files, you can run:
# chmod +x secrets-command.sh
# ./secrets-command.sh
