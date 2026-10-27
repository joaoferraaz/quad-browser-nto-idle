@echo off
setlocal
rem Quad Browser: duplo clique abre em grade. Uso opcional: abrir.bat 2  (abre direto na janela 2)
cd /d "%~dp0"

where npm >nul 2>nul || (
  echo [quad-browser] Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
  pause & exit /b 1
)

rem instala/atualiza dependencias na primeira vez e sempre que o package.json mudar
set "NEED="
if not exist "node_modules\electron\dist\electron.exe" set "NEED=1"
if not exist "node_modules\.qb-pkg" set "NEED=1"
if not defined NEED fc /b package.json "node_modules\.qb-pkg" >nul 2>nul || set "NEED=1"
if defined NEED (
  echo [quad-browser] Instalando/atualizando dependencias...
  call npm install --no-audit --no-fund || (pause & exit /b 1)
  copy /y package.json "node_modules\.qb-pkg" >nul
)

set "ARG="
if not "%~1"=="" set "ARG=--janela=%~1"

start "" "node_modules\electron\dist\electron.exe" . %ARG%
exit /b 0
