@echo off
REM Executa a consulta automática do SIGLA
REM Coloque este arquivo no Agendador de Tarefas do Windows para rodar diariamente

cd /d "%~dp0"
python sigla_checker.py >> sigla_checker.log 2>&1
