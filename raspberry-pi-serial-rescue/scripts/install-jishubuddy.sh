#!/usr/bin/env bash
set -euo pipefail

readonly REGISTRY="https://registry.npmjs.org/"
readonly PACKAGE="jishubuddy"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

detect_platform() {
  local os
  local arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "${os}:${arch}" in
    Linux:x86_64) printf 'linux-x64\n' ;;
    Linux:aarch64|Linux:arm64) printf 'linux-arm64\n' ;;
    Darwin:arm64) printf 'darwin-arm64\n' ;;
    *)
      fail "Unsupported platform ${os}/${arch}. Native Windows, macOS x64, and 32-bit ARM are not supported."
      ;;
  esac
}

require_toolchain() {
  command -v node >/dev/null 2>&1 || fail "Node.js 22 or newer is required."
  command -v npm >/dev/null 2>&1 || fail "npm is required."

  local node_major
  node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  [[ "${node_major}" =~ ^[0-9]+$ ]] || fail "Could not determine the Node.js version."
  (( node_major >= 22 )) || fail "Node.js 22 or newer is required; found $(node --version)."
}

latest_version() {
  local version
  version="$(npm view "${PACKAGE}" version --registry="${REGISTRY}")"
  [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]] ||
    fail "Registry returned an invalid version: ${version}"
  printf '%s\n' "${version}"
}

installed_version() {
  if command -v jishubuddy >/dev/null 2>&1; then
    jishubuddy --version 2>/dev/null | tr -d '\r' || true
  else
    printf 'not installed\n'
  fi
}

main() {
  local action="${1:-check}"
  local confirmation="${2:-}"
  [[ "${action}" == "check" || "${action}" == "install" ]] ||
    fail "Usage: install-jishubuddy.sh check | install --yes"

  require_toolchain

  local platform
  local current
  local target
  local prefix
  platform="$(detect_platform)"
  current="$(installed_version)"
  target="$(latest_version)"
  prefix="$(npm prefix --global)"

  printf 'Platform: %s\n' "${platform}"
  printf 'Current version: %s\n' "${current}"
  printf 'Target version: %s\n' "${target}"
  printf 'Registry: %s\n' "${REGISTRY}"
  printf 'Global prefix: %s\n' "${prefix}"
  printf 'Install command: npm install --global %s@%s --registry=%s --ignore-scripts --no-audit --no-fund\n' \
    "${PACKAGE}" "${target}" "${REGISTRY}"

  [[ "${action}" == "check" ]] && exit 0
  [[ "${confirmation}" == "--yes" ]] ||
    fail "Installation requires explicit approval and the --yes argument."

  npm install --global "${PACKAGE}@${target}" \
    --registry="${REGISTRY}" \
    --ignore-scripts \
    --no-audit \
    --no-fund

  command -v jishubuddy >/dev/null 2>&1 ||
    fail "npm completed, but jishubuddy is not on PATH. Check the npm global prefix: ${prefix}"

  printf 'Installed version: %s\n' "$(jishubuddy --version)"
  printf 'JishuBuddy was not launched. Run jishubuddy when ready.\n'
}

main "$@"
