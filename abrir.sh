#!/usr/bin/env bash
# Quad Browser (Git Bash / WSL): ./abrir.sh  ou  ./abrir.sh 2  (abre direto na janela 2)
set -e
cd "$(dirname "$0")"
command -v npm >/dev/null || { echo "[quad-browser] Node.js nao encontrado: https://nodejs.org"; exit 1; }
if ! cmp -s package.json node_modules/.qb-pkg; then npm install --no-audit --no-fund && cp package.json node_modules/.qb-pkg; fi
ARG=""; [ -n "$1" ] && ARG="--janela=$1"
nohup npx electron . $ARG >/dev/null 2>&1 &
