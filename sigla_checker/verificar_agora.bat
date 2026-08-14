@echo off
title Verificador SIGLA - Ecdise
cd /d "%~dp0"
echo ================================================
echo   Ecdise - Consulta SIGLA (SEMA-MA)
echo ================================================
echo.
py sigla_checker.py
echo.
echo ================================================
echo   Concluido! Recarregue o Ecdise para ver
echo   os status atualizados.
echo ================================================
echo.
pause
