#!/usr/bin/env bash
set -Eeuo pipefail

# Example adapter for CLIs that should receive the prompt through stdin.
# Customize this if your local Codex/agent CLI has different flags.
prompt="$(cat)"
codex exec --full-auto "$prompt"
