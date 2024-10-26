#!/bin/bash

# Process .env file and generate secrets command
node src/index.js -f .env -n my-container-app -g my-resource-group

# OR use interactive mode
# node src/index.js

# After reviewing the generated files, you can run:
# chmod +x secrets-command.sh
# ./secrets-command.sh