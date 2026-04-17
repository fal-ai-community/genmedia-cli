#!/bin/sh
# genmedia installer
# Usage:
#   curl -fsSL https://genmedia.sh/install | sh
#   curl -fsSL https://raw.githubusercontent.com/fal-ai-community/genmedia-cli/refs/heads/main/install.sh | sh
#
# Environment variables:
#   GENMEDIA_VERSION   - specific version to install (default: latest)
#   GENMEDIA_DIR       - installation directory (default: ~/.genmedia)

set -eu

GITHUB_REPO="fal-ai-community/cli"
BINARY_NAME="genmedia"

BOLD=""
GREEN=""
YELLOW=""
RED=""
RESET=""

if [ -t 1 ]; then
    BOLD="\033[1m"
    GREEN="\033[32m"
    YELLOW="\033[33m"
    RED="\033[31m"
    RESET="\033[0m"
fi

info() {
    printf "${BOLD}%s${RESET}\n" "$1"
}

success() {
    printf "${GREEN}${BOLD}%s${RESET}\n" "$1"
}

warn() {
    printf "${YELLOW}%s${RESET}\n" "$1"
}

error() {
    printf "${RED}error: %s${RESET}\n" "$1" >&2
    exit 1
}

detect_platform() {
    OS=$(uname -s)
    ARCH=$(uname -m)

    case "$OS" in
        Linux|linux)   PLATFORM="linux" ;;
        Darwin|darwin) PLATFORM="darwin" ;;
        MINGW*|MSYS*|CYGWIN*)
            error "Use install.ps1 for Windows: irm https://genmedia.sh/install.ps1 | iex"
            ;;
        *) error "Unsupported operating system: $OS" ;;
    esac

    case "$ARCH" in
        x86_64|amd64)  ARCH="x64" ;;
        aarch64|arm64) ARCH="arm64" ;;
        *) error "Unsupported architecture: $ARCH" ;;
    esac
}

get_latest_version() {
    url="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
    if command -v curl > /dev/null 2>&1; then
        version=$(curl -fsSL "$url" | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')
    elif command -v wget > /dev/null 2>&1; then
        version=$(wget -qO- "$url" | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')
    else
        error "curl or wget is required to download genmedia"
    fi

    if [ -z "$version" ]; then
        error "Could not determine the latest version. Set GENMEDIA_VERSION to install a specific version."
    fi

    echo "$version"
}

download() {
    url="$1"
    output="$2"

    if command -v curl > /dev/null 2>&1; then
        curl -fsSL --progress-bar -o "$output" "$url"
    elif command -v wget > /dev/null 2>&1; then
        wget -q --show-progress -O "$output" "$url"
    else
        error "curl or wget is required to download genmedia"
    fi
}

verify_checksum() {
    file="$1"
    expected="$2"

    if command -v sha256sum > /dev/null 2>&1; then
        actual=$(sha256sum "$file" | awk '{print $1}')
    elif command -v shasum > /dev/null 2>&1; then
        actual=$(shasum -a 256 "$file" | awk '{print $1}')
    else
        warn "Warning: sha256sum/shasum not found, skipping checksum verification"
        return 0
    fi

    if [ "$actual" != "$expected" ]; then
        rm -f "$file"
        error "Checksum verification failed. Expected: $expected, Got: $actual"
    fi
}

fetch_checksums() {
    url="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/checksums.txt"
    if command -v curl > /dev/null 2>&1; then
        checksums=$(curl -fsSL "$url" 2>/dev/null) || return 1
    elif command -v wget > /dev/null 2>&1; then
        checksums=$(wget -qO- "$url" 2>/dev/null) || return 1
    else
        return 1
    fi

    asset_name="${BINARY_NAME}-${PLATFORM}-${ARCH}"
    checksum=$(echo "$checksums" | grep "$asset_name" | awk '{print $1}')

    if [ -z "$checksum" ]; then
        return 1
    fi

    echo "$checksum"
}

try_symlink_local_bin() {
    src="$1"
    local_bin="$HOME/.local/bin"

    if ! mkdir -p "$local_bin" 2>/dev/null; then
        return 1
    fi

    if [ ! -d "$local_bin" ] || [ ! -w "$local_bin" ]; then
        return 1
    fi

    if ! ln -sf "$src" "${local_bin}/${BINARY_NAME}" 2>/dev/null; then
        return 1
    fi

    if echo "$PATH" | tr ':' '\n' | grep -qx "$local_bin"; then
        return 0
    fi

    return 2
}

update_shell_profile() {
    bin_dir="$1"
    export_line="export PATH=\"${bin_dir}:\$PATH\""

    case "$(basename "${SHELL:-}")" in
        zsh)
            profile="$HOME/.zshrc"
            ;;
        bash)
            if [ -f "$HOME/.bash_profile" ]; then
                profile="$HOME/.bash_profile"
            else
                profile="$HOME/.bashrc"
            fi
            ;;
        fish)
            fish_config="$HOME/.config/fish/conf.d/genmedia.fish"
            if [ ! -f "$fish_config" ] || ! grep -q "$bin_dir" "$fish_config" 2>/dev/null; then
                mkdir -p "$(dirname "$fish_config")"
                echo "fish_add_path $bin_dir" > "$fish_config"
            fi
            return 0
            ;;
        *)
            return 1
            ;;
    esac

    if [ -f "$profile" ] && grep -q "$bin_dir" "$profile" 2>/dev/null; then
        return 0
    fi

    echo "" >> "$profile"
    echo "# genmedia" >> "$profile"
    echo "$export_line" >> "$profile"
    return 0
}

main() {
    detect_platform

    GENMEDIA_DIR="${GENMEDIA_DIR:-$HOME/.genmedia}"
    BIN_DIR="${GENMEDIA_DIR}/bin"
    VERSION="${GENMEDIA_VERSION:-latest}"

    if [ "$VERSION" = "latest" ]; then
        VERSION=$(get_latest_version)
    fi

    ASSET_NAME="${BINARY_NAME}-${PLATFORM}-${ARCH}"
    DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/${ASSET_NAME}"

    info "Installing genmedia v${VERSION} (${PLATFORM}-${ARCH})..."

    mkdir -p "$BIN_DIR"

    TMP_FILE=$(mktemp)
    trap 'rm -f "$TMP_FILE"' EXIT

    download "$DOWNLOAD_URL" "$TMP_FILE"

    # Verify checksum if available
    CHECKSUM=$(fetch_checksums) && verify_checksum "$TMP_FILE" "$CHECKSUM" || true

    mv "$TMP_FILE" "${BIN_DIR}/${BINARY_NAME}"
    chmod +x "${BIN_DIR}/${BINARY_NAME}"

    # Check if already on PATH
    if echo "$PATH" | tr ':' '\n' | grep -qx "$BIN_DIR"; then
        PATH_CONFIGURED=true
    else
        PATH_CONFIGURED=false
    fi

    SYMLINK_ON_PATH=false
    PROFILE_BIN_DIR="$BIN_DIR"
    if [ "$PATH_CONFIGURED" = false ]; then
        try_symlink_local_bin "${BIN_DIR}/${BINARY_NAME}"
        case $? in
            0)
                SYMLINK_ON_PATH=true
                ;;
            2)
                PROFILE_BIN_DIR="$HOME/.local/bin"
                if update_shell_profile "$PROFILE_BIN_DIR"; then
                    PROFILE_UPDATED=true
                else
                    PROFILE_UPDATED=false
                fi
                ;;
            *)
                if update_shell_profile "$BIN_DIR"; then
                    PROFILE_UPDATED=true
                else
                    PROFILE_UPDATED=false
                fi
                ;;
        esac
    fi

    echo ""
    success "genmedia v${VERSION} installed successfully!"
    echo ""

    if [ "$SYMLINK_ON_PATH" = true ]; then
        info "Installed to ${BIN_DIR}, linked into ~/.local/bin."
        info "Run 'genmedia --help' to get started."
    elif [ "$PATH_CONFIGURED" = true ]; then
        info "Run 'genmedia --help' to get started."
    elif [ "${PROFILE_UPDATED:-false}" = true ]; then
        info "Added ${PROFILE_BIN_DIR} to your shell profile."
        info "Open a new shell, or run this once in the current one:"
        echo ""
        echo "  export PATH=\"${PROFILE_BIN_DIR}:\$PATH\""
        echo ""
        info "Then run 'genmedia --help' to get started."
    else
        warn "Add genmedia to your PATH:"
        echo ""
        echo "  export PATH=\"${BIN_DIR}:\$PATH\""
        echo ""
        info "Then run 'genmedia --help' to get started."
    fi
}

main
