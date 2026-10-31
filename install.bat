@echo off
rem ==============================================================================
rem BlockcheckW & LuCI Universal Windows Installer for OpenWrt
rem Repository: https://github.com/prostoy23rus/blockcheckw
rem ==============================================================================
chcp 65001 >nul
title BlockcheckW — Установщик для OpenWrt (Windows)

setlocal enabledelayedexpansion

rem Обработка аргументов командной строки (тихий запуск)
if "%~1"=="--uninstall" (
    set "ROUTER_IP=%~2"
    if "!ROUTER_IP!"=="" set "ROUTER_IP=192.168.1.1"
    set "SSH_PORT=22"
    set "SSH_USER=root"
    goto EXEC_UNINSTALL
)
if "%~1"=="-u" (
    set "ROUTER_IP=%~2"
    if "!ROUTER_IP!"=="" set "ROUTER_IP=192.168.1.1"
    set "SSH_PORT=22"
    set "SSH_USER=root"
    goto EXEC_UNINSTALL
)
if "%~1"=="--update" (
    set "ROUTER_IP=%~2"
    if "!ROUTER_IP!"=="" set "ROUTER_IP=192.168.1.1"
    set "SSH_PORT=22"
    set "SSH_USER=root"
    goto EXEC_UPDATE
)
if not "%~1"=="" (
    set "ROUTER_IP=%~1"
    set "SSH_PORT=22"
    set "SSH_USER=root"
    goto EXEC_INSTALL
)

:MAIN_MENU
cls
echo ==============================================================================
echo   ____  _            _        _               _    __        __
echo  ^| __ )^| ^| ___   ___^| ^| _____^| ^|__   ___  ___^| ^| __\ \      / /
echo  ^|  _ \^| ^|/ _ \ / __^| ^|/ / __^| '_ \ / _ \/ __^| ^|/ / \ \ /\ / / 
echo  ^| ^|_) ^| ^| (_) ^| (__^|   ^< (__^| ^| ^| ^|  __/ (__^|   ^<   \ V  V /  
echo  ^|____/^|_^|\___/ \___^|_^|\_\___^|_^| ^|_^|\___^|\___^|_^|\_\   \_/\_/   
echo ==============================================================================
echo        Установщик службы BlockcheckW и LuCI для роутеров OpenWrt
echo        Репозиторий: https://github.com/prostoy23rus/blockcheckw
echo ==============================================================================
echo.
echo Выберите действие:
echo.
echo   [1] 🚀 Установить BlockcheckW и веб-интерфейс LuCI на роутер
echo   [2] 🔄 Обновить службу до последней версии из GitHub
echo   [3] ⚡ Запустить турбо-поиск стратегий для YouTube (в 1 клик)
echo   [4] 🌐 Проверить сетевое подключение к роутеру (Ping и SSH)
echo   [5] 🗑  Полностью удалить BlockcheckW с роутера
echo   [0] ❌ Выход
echo.
set "CHOICE="
set /p "CHOICE=Ваш выбор [1-5, 0]: "

if not defined CHOICE (
    echo Неверный выбор. Пожалуйста, введите цифру от 0 до 5.
    timeout /t 2 >nul
    goto MAIN_MENU
)

if "%CHOICE%"=="1" goto OP_INSTALL
if "%CHOICE%"=="2" goto OP_UPDATE
if "%CHOICE%"=="3" goto OP_SCAN
if "%CHOICE%"=="4" goto OP_CHECK
if "%CHOICE%"=="5" goto OP_UNINSTALL
if "%CHOICE%"=="0" goto OP_EXIT

echo Неверный выбор.
timeout /t 2 >nul
goto MAIN_MENU

:GET_PARAMS
echo.
echo ------------------------------------------------------------------------------
echo Параметры подключения к роутеру:
echo ------------------------------------------------------------------------------
set "ROUTER_IP="
set /p "ROUTER_IP=IP-адрес роутера [по умолчанию 192.168.1.1]: "
if "%ROUTER_IP%"=="" set "ROUTER_IP=192.168.1.1"

set "SSH_PORT="
set /p "SSH_PORT=SSH-порт [по умолчанию 22]: "
if "%SSH_PORT%"=="" set "SSH_PORT=22"

set "SSH_USER="
set /p "SSH_USER=Пользователь [по умолчанию root]: "
if "%SSH_USER%"=="" set "SSH_USER=root"

rem Проверка наличия SSH-клиента
where ssh.exe >nul 2>&1
if %errorlevel% neq 0 (
    where plink.exe >nul 2>&1
    if !errorlevel! neq 0 (
        echo.
        echo [ОШИБКА] В вашей системе не найден клиент SSH (ssh.exe или plink.exe)!
        echo В Windows 10/11 встроенный OpenSSH клиент можно включить командой:
        echo   dism /Online /Add-Capability /CapabilityName:OpenSSH.Client~~~~0.0.1.0
        echo Либо установите PuTTY с официального сайта: https://www.putty.org
        echo.
        pause
        goto MAIN_MENU
    )
)
exit /b 0

:OP_INSTALL
call :GET_PARAMS

:EXEC_INSTALL
echo.
echo ------------------------------------------------------------------------------
echo Подключение к %SSH_USER%@%ROUTER_IP%:%SSH_PORT% и запуск установки...
echo (Если потребуется, введите пароль от роутера)
echo ------------------------------------------------------------------------------
echo.

set "CMD_INSTALL=(curl -sSL -k --connect-timeout 6 https://raw.githubusercontent.com/prostoy23rus/blockcheckw/main/install.sh -o /tmp/inst.sh || curl -sSL -k --connect-timeout 6 https://cdn.jsdelivr.net/gh/prostoy23rus/blockcheckw@main/install.sh -o /tmp/inst.sh) && sh /tmp/inst.sh && rm -f /tmp/inst.sh"

where ssh.exe >nul 2>&1
if %errorlevel% equ 0 (
    ssh.exe -p %SSH_PORT% -o StrictHostKeyChecking=accept-new %SSH_USER%@%ROUTER_IP% "%CMD_INSTALL%"
) else (
    plink.exe -P %SSH_PORT% -ssh %SSH_USER%@%ROUTER_IP% "%CMD_INSTALL%"
)

if !errorlevel! equ 0 (
    echo.
    echo ==============================================================================
    echo [УСПЕХ] Установка BlockcheckW успешно завершена!
    echo Веб-интерфейс доступен в меню роутера:
    echo   Службы ➔ BlockcheckW (Поиск стратегий)
    echo   Ссылка: http://%ROUTER_IP%/cgi-bin/luci/admin/services/blockcheckw
    echo ==============================================================================
    echo.
    set "OPEN_LUCI="
    set /p "OPEN_LUCI=Открыть веб-интерфейс в браузере прямо сейчас? [Y/n]: "
    if /i "!OPEN_LUCI!"=="" set "OPEN_LUCI=y"
    if /i "!OPEN_LUCI!"=="y" (
        start http://%ROUTER_IP%/cgi-bin/luci/admin/services/blockcheckw
    )
) else (
    echo.
    echo [ВНИМАНИЕ] Команда завершилась с ошибкой. Проверьте правильность пароля и IP.
)
echo.
pause
goto MAIN_MENU

:OP_UPDATE
call :GET_PARAMS

:EXEC_UPDATE
echo.
echo ------------------------------------------------------------------------------
echo Запуск обновления BlockcheckW на роутере %ROUTER_IP%...
echo ------------------------------------------------------------------------------
echo.

where ssh.exe >nul 2>&1
if %errorlevel% equ 0 (
    ssh.exe -p %SSH_PORT% -o StrictHostKeyChecking=accept-new %SSH_USER%@%ROUTER_IP% "/usr/bin/blockcheckw-helper update"
) else (
    plink.exe -P %SSH_PORT% -ssh %SSH_USER%@%ROUTER_IP% "/usr/bin/blockcheckw-helper update"
)

echo.
pause
goto MAIN_MENU

:OP_SCAN
call :GET_PARAMS
echo.
echo ------------------------------------------------------------------------------
echo Запуск турбо-поиска связки для YouTube на роутере %ROUTER_IP%...
echo ------------------------------------------------------------------------------
echo.

where ssh.exe >nul 2>&1
if %errorlevel% equ 0 (
    ssh.exe -p %SSH_PORT% -o StrictHostKeyChecking=accept-new %SSH_USER%@%ROUTER_IP% "/usr/bin/blockcheckw-helper start --target youtube --mode turbo --circular 1 --auto-apply 1 && sleep 2 && /usr/bin/blockcheckw-helper status"
) else (
    plink.exe -P %SSH_PORT% -ssh %SSH_USER%@%ROUTER_IP% "/usr/bin/blockcheckw-helper start --target youtube --mode turbo --circular 1 --auto-apply 1 && sleep 2 && /usr/bin/blockcheckw-helper status"
)

echo.
pause
goto MAIN_MENU

:OP_CHECK
call :GET_PARAMS
echo.
echo ------------------------------------------------------------------------------
echo Проверка связи с роутером %ROUTER_IP%...
echo ------------------------------------------------------------------------------
echo 1. Отправка ICMP Ping:
ping -n 3 %ROUTER_IP%
echo.
echo 2. Проверка SSH порта %SSH_PORT%:
where ssh.exe >nul 2>&1
if %errorlevel% equ 0 (
    ssh.exe -p %SSH_PORT% -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new %SSH_USER%@%ROUTER_IP% "echo '[SSH OK] Успешное подключение к OpenWrt:' && cat /etc/openwrt_release | grep DISTRIB_DESCRIPTION"
) else (
    plink.exe -P %SSH_PORT% -ssh %SSH_USER%@%ROUTER_IP% "echo '[SSH OK] Успешное подключение к OpenWrt:' && cat /etc/openwrt_release | grep DISTRIB_DESCRIPTION"
)
echo.
pause
goto MAIN_MENU

:OP_UNINSTALL
call :GET_PARAMS
echo.
echo ==============================================================================
echo [ВНИМАНИЕ] Вы собираетесь полностью удалить BlockcheckW с роутера %ROUTER_IP%.
echo Все компоненты сканера и меню LuCI будут удалены.
echo Настройки Zapret2 (/etc/config/zapret2) сохранятся.
echo ==============================================================================
echo.
set "SURE="
set /p "SURE=Вы подтверждаете удаление? [y/N]: "
if /i not "!SURE!"=="y" (
    echo Удаление отменено.
    pause
    goto MAIN_MENU
)

:EXEC_UNINSTALL
set "CMD_UNINSTALL=curl -sSL -k https://raw.githubusercontent.com/prostoy23rus/blockcheckw/main/uninstall.sh -o /tmp/uninst.sh && sh /tmp/uninst.sh -y && rm -f /tmp/uninst.sh"

where ssh.exe >nul 2>&1
if %errorlevel% equ 0 (
    ssh.exe -p %SSH_PORT% -o StrictHostKeyChecking=accept-new %SSH_USER%@%ROUTER_IP% "%CMD_UNINSTALL%"
) else (
    plink.exe -P %SSH_PORT% -ssh %SSH_USER%@%ROUTER_IP% "%CMD_UNINSTALL%"
)

echo.
pause
goto MAIN_MENU

:OP_EXIT
echo.
echo Выход из установщика. До свидания!
timeout /t 1 >nul 2>&1
exit /b 0
