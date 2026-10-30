#!/bin/sh
# ==============================================================================
# BlockcheckW & LuCI Universal Installer for OpenWrt
# Repository: https://github.com/prostoy23rus/blockcheckw
# Supported OpenWrt: 21.02, 22.03, 23.05, 24.10, snapshot
# ==============================================================================

set -e

# Terminal colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

REPO_RAW="https://raw.githubusercontent.com/prostoy23rus/blockcheckw/main"
REPO_OWNER="prostoy23rus"
REPO_NAME="blockcheckw"
UPSTREAM_OWNER="rcd27"

echo -e "${CYAN}${BOLD}"
echo "  ____  _            _        _               _    __        __"
echo " | __ )| | ___   ___| | _____| |__   ___  ___| | __\ \      / /"
echo " |  _ \| |/ _ \ / __| |/ / __| '_ \ / _ \/ __| |/ / \ \ /\ / / "
echo " | |_) | | (_) | (__|   < (__| | | |  __/ (__|   <   \ V  V /  "
echo " |____/|_|\___/ \___|_|\_\___|_| |_|\___|\___|_|\_\   \_/\_/   "
echo -e "${NC}"
echo -e "${BOLD}Универсальный установщик BlockcheckW и LuCI интерфейса для OpenWrt${NC}"
echo -e "Репозиторий: ${BLUE}https://github.com/${REPO_OWNER}/${REPO_NAME}${NC}\n"

# 1. Проверка прав суперпользователя (root)
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}[ERROR] Скрипт установки должен быть запущен от имени root!${NC}"
    exit 1
fi

# 2. Определение окружения OpenWrt
if [ ! -f /etc/openwrt_release ] && [ ! -f /etc/os-release ]; then
    echo -e "${YELLOW}[WARN] Файл /etc/openwrt_release не найден. Возможно, это не OpenWrt.${NC}"
fi

OWRT_VER="unknown"
if [ -f /etc/openwrt_release ]; then
    . /etc/openwrt_release
    OWRT_VER="${DISTRIB_DESCRIPTION:-${DISTRIB_RELEASE}}"
    echo -e "${GREEN}✓${NC} Обнаружена система: ${BOLD}${OWRT_VER}${NC}"
fi

# 3. Определение архитектуры процессора
echo -e "${BLUE}ℹ${NC} Определение архитектуры устройства..."
detect_arch() {
    local u_arch=$(uname -m 2>/dev/null || echo "")
    local opkg_arch=""
    if command -v opkg >/dev/null 2>&1; then
        opkg_arch=$(opkg print-architecture 2>/dev/null | awk '{print $2}' | grep -v 'all\|noarch' | head -n1 || echo "")
    fi

    case "$u_arch" in
        x86_64|amd64) echo "x86_64"; return ;;
        i*86|x86) echo "x86"; return ;;
        aarch64*|arm64*) echo "arm64"; return ;;
        armv7*|armv6*|arm*) echo "arm"; return ;;
        mips64*) echo "mips64"; return ;;
        mips*)
            if echo -n I | hexdump -o 2>/dev/null | grep -q '0000002 000001'; then
                echo "mipsel"
            elif lscpu 2>/dev/null | grep -qi "little endian"; then
                echo "mipsel"
            elif [ -n "$opkg_arch" ] && echo "$opkg_arch" | grep -q "mipsel"; then
                echo "mipsel"
            else
                echo "mips"
            fi
            return
            ;;
        riscv64*) echo "riscv64"; return ;;
        powerpc*|ppc*) echo "ppc"; return ;;
    esac

    if [ -n "$opkg_arch" ]; then
        case "$opkg_arch" in
            *aarch64*) echo "arm64"; return ;;
            *x86_64*) echo "x86_64"; return ;;
            *i386*|*x86*) echo "x86"; return ;;
            *arm*) echo "arm"; return ;;
            *mipsel*) echo "mipsel"; return ;;
            *mips*) echo "mips"; return ;;
        esac
    fi

    echo "unknown"
}

ARCH=$(detect_arch)
if [ "$ARCH" = "unknown" ]; then
    echo -e "${RED}[ERROR] Не удалось автоматически определить архитектуру устройства (uname: $(uname -m)).${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Архитектура: ${BOLD}${ARCH}${NC} ($(uname -m))"

# 4. Проверка и установка зависимостей
echo -e "${BLUE}ℹ${NC} Проверка системных зависимостей (curl, luci-compat, ca-bundle)..."
NEED_UPDATE=0
MISSING_PKGS=""

for pkg in curl luci-compat ca-bundle; do
    if command -v opkg >/dev/null 2>&1; then
        if ! opkg list-installed | grep -q "^${pkg} "; then
            MISSING_PKGS="$MISSING_PKGS $pkg"
            NEED_UPDATE=1
        fi
    fi
done

if [ "$NEED_UPDATE" -eq 1 ] && [ -n "$MISSING_PKGS" ]; then
    echo -e "${YELLOW}ℹ${NC} Установка недостающих пакетов:${MISSING_PKGS}..."
    opkg update || true
    for p in $MISSING_PKGS; do
        opkg install "$p" || {
            if [ "$p" = "ca-bundle" ]; then
                opkg install ca-certificates || true
            fi
        }
    done
else
    echo -e "${GREEN}✓${NC} Все необходимые системные пакеты уже установлены."
fi

# 5. Скачивание скомпилированного бинарника blockcheckw
TMP_DIR="/tmp/bcw_install_$$"
mkdir -p "$TMP_DIR"
cd "$TMP_DIR"

BIN_NAME="blockcheckw-linux-${ARCH}.tar.gz"
echo -e "${BLUE}ℹ${NC} Скачивание ядра BlockcheckW для архитектуры ${BOLD}${ARCH}${NC}..."

DOWNLOAD_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/${BIN_NAME}"
UPSTREAM_URL="https://github.com/${UPSTREAM_OWNER}/blockcheckw/releases/latest/download/${BIN_NAME}"

if ! curl -sSL -k -f --connect-timeout 8 "$DOWNLOAD_URL" -o "$BIN_NAME" 2>/dev/null; then
    echo -e "${YELLOW}ℹ${NC} Скачивание из репозитория ${REPO_OWNER} не удалось (релиз еще не создан), используем официальный бинарник ${UPSTREAM_OWNER}..."
    if ! curl -sSL -k -f --connect-timeout 10 "$UPSTREAM_URL" -o "$BIN_NAME"; then
        echo -e "${RED}[ERROR] Не удалось скачать бинарник blockcheckw для архитектуры ${ARCH}!${NC}"
        rm -rf "$TMP_DIR"
        exit 1
    fi
fi

tar -xzf "$BIN_NAME"
if [ ! -f "$TMP_DIR/blockcheckw" ]; then
    echo -e "${RED}[ERROR] Архив не содержит исполняемого файла blockcheckw!${NC}"
    rm -rf "$TMP_DIR"
    exit 1
fi

cp -f "$TMP_DIR/blockcheckw" /usr/bin/blockcheckw
chmod +x /usr/bin/blockcheckw
echo -e "${GREEN}✓${NC} Бинарник установлен: ${BOLD}/usr/bin/blockcheckw${NC}"

# 6. Скачивание и установка LuCI приложения и вспомогательных скриптов
echo -e "${BLUE}ℹ${NC} Скачивание модулей LuCI приложения BlockcheckW..."

mkdir -p /usr/bin /usr/share/blockcheckw /usr/share/luci/menu.d /usr/share/rpcd/acl.d /www/luci-static/resources/view/blockcheckw

curl -sSL -k --connect-timeout 8 "$REPO_RAW/openwrt/luci-app-blockcheckw/root/usr/bin/blockcheckw-helper" -o /usr/bin/blockcheckw-helper
curl -sSL -k --connect-timeout 8 "$REPO_RAW/openwrt/luci-app-blockcheckw/root/usr/bin/circular-builder.lua" -o /usr/bin/circular-builder.lua
curl -sSL -k --connect-timeout 8 "$REPO_RAW/strategies/zapret2_presets.json" -o /usr/share/blockcheckw/zapret2_presets.json
curl -sSL -k --connect-timeout 8 "$REPO_RAW/openwrt/version.json" -o /usr/share/blockcheckw/version.json
curl -sSL -k --connect-timeout 8 "$REPO_RAW/openwrt/luci-app-blockcheckw/root/usr/share/luci/menu.d/luci-app-blockcheckw.json" -o /usr/share/luci/menu.d/luci-app-blockcheckw.json
curl -sSL -k --connect-timeout 8 "$REPO_RAW/openwrt/luci-app-blockcheckw/root/usr/share/rpcd/acl.d/luci-app-blockcheckw.json" -o /usr/share/rpcd/acl.d/luci-app-blockcheckw.json
curl -sSL -k --connect-timeout 8 "$REPO_RAW/openwrt/luci-app-blockcheckw/root/www/luci-static/resources/view/blockcheckw/main.js" -o /www/luci-static/resources/view/blockcheckw/main.js

chmod +x /usr/bin/blockcheckw-helper /usr/bin/circular-builder.lua

echo -e "${GREEN}✓${NC} Файлы LuCI интерфейса успешно скопированы."

# 7. Очистка кэша LuCI и перезапуск служб
echo -e "${BLUE}ℹ${NC} Очистка кэша LuCI и перезапуск rpcd..."
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache*
/etc/init.d/rpcd restart >/dev/null 2>&1 || true

# Очистка временных файлов
rm -rf "$TMP_DIR"

# Определение локального IP-адреса роутера
ROUTER_IP=$(uci get network.lan.ipaddr 2>/dev/null || echo "192.168.1.1")

echo -e "\n${GREEN}${BOLD}==============================================================================${NC}"
echo -e "${GREEN}${BOLD}        BlockcheckW и LuCI интерфейс успешно установлены!                     ${NC}"
echo -e "${GREEN}${BOLD}==============================================================================${NC}\n"
echo -e "Теперь веб-интерфейс доступен в меню роутера:"
echo -e "  🌐 ${BOLD}Службы${NC} ➔ ${BOLD}BlockcheckW (Поиск стратегий)${NC}"
echo -e "  🔗 Ссылка: ${CYAN}http://${ROUTER_IP}/cgi-bin/luci/admin/services/blockcheckw${NC}\n"
echo -e "В будущем вы сможете обновлять службу в 1 клик прямо из веб-интерфейса LuCI"
echo -e "с помощью кнопки ${BOLD}[ 🔄 Проверить обновление ]${NC}."
echo ""
