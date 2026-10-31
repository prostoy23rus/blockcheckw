#!/bin/sh
# ==============================================================================
# BlockcheckW & LuCI Universal Installer for OpenWrt
# Repository: https://github.com/prostoy23rus/blockcheckw
# Supported OpenWrt: 21.02, 22.03, 23.05, 24.10, 25.x, snapshot (opkg & apk)
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

# Multi-mirror downloader function (GitHub Raw + jsDelivr Global CDN + Fastly + GHProxy)
fetch_file() {
    local rel_path="$1"
    local dest="$2"
    local timeout="${3:-8}"
    local tmp_file="${dest}.dl.$$"

    rm -f "$tmp_file"

    _save_download() {
        if [ -s "$tmp_file" ]; then
            # Verify file does not contain HTML error page
            if head -n 3 "$tmp_file" | grep -qiE 'not found|404|bad gateway|502|<html>|<head>|access denied'; then
                rm -f "$tmp_file"
                return 1
            fi
            mv -f "$tmp_file" "$dest"
            return 0
        fi
        rm -f "$tmp_file"
        return 1
    }

    # 1. Direct GitHub Raw
    curl -fsSL -k --connect-timeout "$timeout" "https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/$rel_path" -o "$tmp_file" 2>/dev/null
    _save_download && return 0

    # 2. jsDelivr Global CDN (Fast, unblocked in RU)
    curl -fsSL -k --connect-timeout "$timeout" "https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@main/$rel_path" -o "$tmp_file" 2>/dev/null
    _save_download && return 0

    # 3. Fastly jsDelivr CDN
    curl -fsSL -k --connect-timeout "$timeout" "https://fastly.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@main/$rel_path" -o "$tmp_file" 2>/dev/null
    _save_download && return 0

    # 4. GHProxy Mirror
    curl -fsSL -k --connect-timeout "$timeout" "https://ghproxy.net/https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/$rel_path" -o "$tmp_file" 2>/dev/null
    _save_download && return 0

    rm -f "$tmp_file"
    return 1
}

echo -e "${CYAN}${BOLD}"
echo "  ____  _            _        _               _    __        __"
echo " | __ )| | ___   ___| | _____| |__   ___  ___| | __\ \      / /"
echo " |  _ \| |/ _ \ / __| |/ / __| '_ \ / _ \/ __| |/ / \ \ /\ / / "
echo " | |_) | | (_) | (__|   < (__| | | |  __/ (__|   <   \ V  V /  "
echo " |____/|_|\___/ \___|_|\_\___|_| |_|\___|\___|_|\_\   \_/\_/   "
echo -e "${NC}"
echo -e "${BOLD}Универсальный установщик BlockcheckW и LuCI интерфейса для OpenWrt${NC}"
echo -e "Репозиторий: ${BLUE}https://github.com/${REPO_OWNER}/${REPO_NAME}${NC}\n"

# Проверка режима деинсталляции
if [ "$1" = "--uninstall" ] || [ "$1" = "-u" ] || [ "$1" = "uninstall" ]; then
    shift
    echo -e "${YELLOW}ℹ${NC} Запуск деинсталлятора BlockcheckW..."
    if [ -f "$(dirname "$0")/uninstall.sh" ]; then
        exec sh "$(dirname "$0")/uninstall.sh" "$@"
    else
        exec sh -c "$(curl -sSL -k "$REPO_RAW/uninstall.sh")" -- "$@"
    fi
    exit 0
fi

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
    local pkg_arch=""
    if command -v opkg >/dev/null 2>&1; then
        pkg_arch=$(opkg print-architecture 2>/dev/null | awk '{print $2}' | grep -v 'all\|noarch' | head -n1 || echo "")
    elif command -v apk >/dev/null 2>&1; then
        pkg_arch=$(apk --print-arch 2>/dev/null || echo "")
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
            elif [ -n "$pkg_arch" ] && echo "$pkg_arch" | grep -q "mipsel"; then
                echo "mipsel"
            else
                echo "mips"
            fi
            return
            ;;
        riscv64*) echo "riscv64"; return ;;
        powerpc*|ppc*) echo "ppc"; return ;;
    esac

    if [ -n "$pkg_arch" ]; then
        case "$pkg_arch" in
            *aarch64*|*arm64*) echo "arm64"; return ;;
            *x86_64*|*amd64*) echo "x86_64"; return ;;
            *i386*|*x86*) echo "x86"; return ;;
            *arm*) echo "arm"; return ;;
            *mipsel*) echo "mipsel"; return ;;
            *mips*) echo "mips"; return ;;
            *riscv64*) echo "riscv64"; return ;;
            *ppc*|*powerpc*) echo "ppc"; return ;;
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
echo -e "${BLUE}ℹ${NC} Проверка системных зависимостей (curl, ca-certificates/ca-bundle, tar)..."

if command -v apk >/dev/null 2>&1; then
    # OpenWrt 25.x / Next-Gen с apk-tools
    echo -e "${GREEN}✓${NC} Пакетный менеджер: ${BOLD}apk${NC} (OpenWrt 25.x / Next-Gen)"
    apk update || true
    for pkg in curl ca-certificates tar; do
        if ! apk info -e "$pkg" >/dev/null 2>&1; then
            echo -e "${YELLOW}ℹ${NC} Установка $pkg через apk..."
            apk add "$pkg" || true
        fi
    done
    # luci-compat не обязателен для современных JS-видов, но если доступен — устанавливаем
    if ! apk info -e "luci-compat" >/dev/null 2>&1; then
        apk add luci-compat >/dev/null 2>&1 || true
    fi
elif command -v opkg >/dev/null 2>&1; then
    # OpenWrt 21.02 - 24.10 с opkg
    echo -e "${GREEN}✓${NC} Пакетный менеджер: ${BOLD}opkg${NC}"
    NEED_UPDATE=0
    MISSING_PKGS=""
    for pkg in curl ca-bundle tar; do
        if ! opkg list-installed | grep -q "^${pkg} "; then
            MISSING_PKGS="$MISSING_PKGS $pkg"
            NEED_UPDATE=1
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

    # Пробуем установить luci-compat, если есть в репозитории (не ломая установку, если отсутствует)
    if ! opkg list-installed | grep -q "^luci-compat "; then
        opkg install luci-compat >/dev/null 2>&1 || true
    fi
else
    echo -e "${YELLOW}[WARN] Ни opkg, ни apk не обнаружены. Пропускаем автоматическую установку пакетов.${NC}"
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
    echo -e "${YELLOW}ℹ${NC} Скачивание из репозитория ${REPO_OWNER} не удалось, пробуем зеркала и апстрим..."
    if ! curl -sSL -k -f --connect-timeout 10 "$UPSTREAM_URL" -o "$BIN_NAME" 2>/dev/null; then
        if ! curl -sSL -k -f --connect-timeout 10 "https://ghproxy.net/$UPSTREAM_URL" -o "$BIN_NAME"; then
            echo -e "${RED}[ERROR] Не удалось скачать бинарник blockcheckw для архитектуры ${ARCH}!${NC}"
            rm -rf "$TMP_DIR"
            exit 1
        fi
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

fetch_file "openwrt/luci-app-blockcheckw/root/usr/bin/blockcheckw-helper" /usr/bin/blockcheckw-helper 8
fetch_file "openwrt/luci-app-blockcheckw/root/usr/bin/circular-builder.lua" /usr/bin/circular-builder.lua 8
fetch_file "strategies/zapret2_presets.json" /usr/share/blockcheckw/zapret2_presets.json 8
fetch_file "openwrt/version.json" /usr/share/blockcheckw/version.json 8
fetch_file "openwrt/luci-app-blockcheckw/root/usr/share/luci/menu.d/luci-app-blockcheckw.json" /usr/share/luci/menu.d/luci-app-blockcheckw.json 8 || true
fetch_file "openwrt/luci-app-blockcheckw/root/usr/share/rpcd/acl.d/luci-app-blockcheckw.json" /usr/share/rpcd/acl.d/luci-app-blockcheckw.json 8 || true
fetch_file "openwrt/luci-app-blockcheckw/root/www/luci-static/resources/view/blockcheckw/main.js" /www/luci-static/resources/view/blockcheckw/main.js 8

chmod +x /usr/bin/blockcheckw-helper /usr/bin/circular-builder.lua
chmod 644 /www/luci-static/resources/view/blockcheckw/main.js
chmod 644 /usr/share/blockcheckw/* /usr/share/luci/menu.d/luci-app-blockcheckw.json /usr/share/rpcd/acl.d/luci-app-blockcheckw.json 2>/dev/null || true

echo -e "${GREEN}✓${NC} Файлы LuCI интерфейса успешно скопированы."

# 7. Настройка Firewall: блокировка QUIC (UDP 443)
echo -e "${BLUE}ℹ${NC} Проверка настройки блокировки QUIC (UDP 443)..."
if command -v uci >/dev/null 2>&1 && [ -f /etc/config/firewall ]; then
    if ! uci get firewall.reject_quic >/dev/null 2>&1; then
        echo -e "${YELLOW}ℹ${NC} Добавление правила Reject-QUIC в межсетевой экран..."
        uci set firewall.reject_quic=rule
        uci set firewall.reject_quic.name='Reject-QUIC'
        uci set firewall.reject_quic.src='lan'
        uci set firewall.reject_quic.dest='wan'
        uci set firewall.reject_quic.proto='udp'
        uci set firewall.reject_quic.dest_port='443'
        uci set firewall.reject_quic.target='REJECT'
        uci commit firewall
        /etc/init.d/firewall reload >/dev/null 2>&1 || true
        echo -e "${GREEN}✓${NC} Правило Reject-QUIC успешно добавлено."
    else
        echo -e "${GREEN}✓${NC} Правило Reject-QUIC уже активно."
    fi
fi

# 8. Очистка кэша LuCI и перезапуск служб
echo -e "${BLUE}ℹ${NC} Очистка кэша LuCI и перезапуск служб веб-интерфейса..."
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache*
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/uhttpd restart >/dev/null 2>&1 || true
/etc/init.d/nginx restart >/dev/null 2>&1 || true
/etc/init.d/lighttpd restart >/dev/null 2>&1 || true
ubus call luci reload >/dev/null 2>&1 || true

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
