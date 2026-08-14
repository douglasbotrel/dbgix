#!/usr/bin/env python3
"""
sigla_checker.py
================
Consulta automática de processos ambientais no SIGLA (SEMA-MA).
Roda diariamente via Agendador de Tarefas do Windows.

Fluxo:
  1. Busca na API Ecdise os projetos em acompanhamento com credenciais SIGLA
  2. Para cada projeto: faz login no SIGLA com o CPF do cliente,
     navega até a lista de requerimentos, encontra a linha pelo Nº do processo
     e lê o status + ícone (Em exigência ⚠️ ou Sem pendências ✅)
  3. Envia o resultado de volta para a API Ecdise
  4. Se o status mudou, a API gera notificação automática no sistema

Seletores validados em 2026-07 via playwright codegen (SIGLA — Módulo do Empreendedor).
"""

import os
import sys
import logging
import argparse
import requests
from datetime import datetime
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# ──────────────────────────────────────────────
# Configuração
# ──────────────────────────────────────────────
load_dotenv()

ECDISE_API_URL  = os.getenv('ECDISE_API_URL', 'https://ecdise.vercel.app')
SIGLA_BOT_TOKEN = os.getenv('SIGLA_BOT_TOKEN', '')
SIGLA_BASE_URL  = 'https://sigla.sema.ma.gov.br/sigla/'
HEADLESS        = os.getenv('HEADLESS', 'true').lower() == 'true'
LOG_FILE        = os.getenv('LOG_FILE', 'sigla_checker.log')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# Mapeamento tipo de serviço → função de navegação
# Chave: substring do tipoServico no Ecdise (lower-case)
# ──────────────────────────────────────────────
TIPO_SERVICO_MAP = {
    # ⚠️ ORDEM IMPORTA: chaves mais específicas primeiro para evitar
    # que 'lau' (substring de 'laur') seja detectada antes de 'laur',
    # e que o 'lar' genérico (de 'reguLARização') capture 'luar' antes da hora.

    # Requerimentos → Recursos florestais → Listar
    'laur':          'recursos_florestais',       # ✅ confirmado — DEVE vir antes de 'lau'
    'luar':          'recursos_florestais',       # ✅ Licença Única Ambiental de Regularização — bug 2026-07:
                                                    #    "LUAR" caía no 'lar' genérico (de "regularização") e ia
                                                    #    pra aba errada (Licenciamento Ambiental), escondendo
                                                    #    pendências de Recursos Florestais/Supressão. Precisa
                                                    #    vir ANTES da chave 'lar' abaixo.
    'florestal':     'recursos_florestais',
    'floresta':      'recursos_florestais',

    # Requerimentos → Recursos hídricos → Listar
    'hidrico':       'recursos_hidricos',         # ✅ confirmado
    'hídrico':       'recursos_hidricos',
    'hidrica':       'recursos_hidricos',
    'hídrica':       'recursos_hidricos',
    'outorga':       'recursos_hidricos',         # ✅ confirmado
    'osi':           'recursos_hidricos',
    'inexigibilidade': 'recursos_hidricos',

    # Requerimentos → Licenciamento ambiental → Listar requerimentos
    'licenciamento': 'licenciamento_ambiental',
    'lar':           'licenciamento_ambiental',
    'lau':           'licenciamento_ambiental',   # ✅ confirmado — vem DEPOIS de 'laur'
    'urbana':        'licenciamento_ambiental',
}

def detectar_tipo(tipo_servico: str) -> str:
    ts = (tipo_servico or '').lower()
    for chave, funcao in TIPO_SERVICO_MAP.items():
        if chave in ts:
            return funcao
    return 'licenciamento_ambiental'  # fallback


# ──────────────────────────────────────────────
# API Ecdise
# ──────────────────────────────────────────────

def _headers():
    return {
        'Authorization': f'Bearer {SIGLA_BOT_TOKEN}',
        'Content-Type':  'application/json',
    }

def buscar_projetos() -> list:
    url = f'{ECDISE_API_URL}/api/sigla/projetos'
    try:
        resp = requests.get(url, headers=_headers(), timeout=30)
        resp.raise_for_status()
        projetos = resp.json().get('projetos', [])
        log.info(f'{len(projetos)} projeto(s) para verificar.')
        return projetos
    except Exception as e:
        log.error(f'Erro ao buscar projetos da API Ecdise: {e}')
        return []

def enviar_status(projeto_id: str, protocolo: str, status_novo: str | None, erro: str | None = None):
    url  = f'{ECDISE_API_URL}/api/sigla/status'
    body = {'projetoId': projeto_id, 'protocolo': protocolo, 'statusNovo': status_novo, 'erro': erro}
    try:
        resp = requests.post(url, headers=_headers(), json=body, timeout=30)
        resp.raise_for_status()
        r = resp.json()
        if r.get('mudou'):
            log.info(f'  ✔ Status mudou: "{r["statusAnterior"]}" → "{r["statusNovo"]}"')
        else:
            log.info(f'  ✔ Status inalterado: "{status_novo}"')
    except Exception as e:
        log.error(f'  ✖ Erro ao enviar status para Ecdise: {e}')


# ──────────────────────────────────────────────
# Login / Logout
# ──────────────────────────────────────────────

def fazer_login(page, login: str, senha: str):
    """
    Navega para o SIGLA e faz login com CPF + senha via Módulo Empreendedor.

    ⚠️ Histórico (2026-07): a página inicial do SIGLA tem uma caixa de login
    genérica ("Acesso à área restrita") com campos parecidos ("loginForm:cpf"),
    mas ela NÃO é o login do Módulo Empreendedor — é outra área do site.
    Tentar logar por ali faz o Ecdise cair num usuário/área errada e trava
    a navegação depois. O fluxo confirmado (via playwright codegen, validado
    em várias sessões reais) é sempre: clicar em "Módulo Empreendedor"
    primeiro, e só então preencher CPF/senha.

    ⚠️ Histórico (2026-08): o prefixo do ID desses campos (ex: "j_idt37",
    "j_idt38"...) é gerado automaticamente pelo JSF e muda sozinho a cada
    pequena alteração na página — mesmo sem nenhuma mudança visual real.
    Por isso os seletores abaixo usam "termina com" (CSS $=) em vez do
    prefixo exato, para não quebrar de novo só porque esse número mudou.
    """
    log.info('  → Abrindo SIGLA...')
    page.goto(SIGLA_BASE_URL, wait_until='domcontentloaded', timeout=60_000)

    page.get_by_role('cell', name='Módulo Empreendedor', exact=True).click()
    page.locator('input[name$=":cpf"]').fill(login)
    page.locator('[id$=":senha"]').fill(senha)
    page.get_by_role('button', name='Acessar').click()

    page.wait_for_load_state('domcontentloaded', timeout=30_000)
    # Espera extra: a área logada pode demorar a terminar de montar o menu
    # (chamadas AJAX depois do "domcontentloaded"). Sem isso, o próximo clique
    # em "Requerimentos" pode falhar simplesmente porque o menu ainda não
    # renderizou, não porque algo mudou de nome/estrutura.
    try:
        page.wait_for_load_state('networkidle', timeout=15_000)
    except PlaywrightTimeout:
        pass  # segue mesmo assim — melhor tentar do que travar aqui
    log.info('  → Login OK.')

def fazer_logout(page):
    try:
        page.get_by_role('cell', name='Sair', exact=True).click()
        page.wait_for_load_state('domcontentloaded', timeout=10_000)
    except Exception:
        pass  # Logout é opcional


# ──────────────────────────────────────────────
# Leitura da tabela de requerimentos
# ──────────────────────────────────────────────

def extrair_status_da_linha(row, termo: str) -> str | None:
    """
    Dado um elemento <tr> e o termo buscado, extrai o texto de status e o ícone.
    Retorna a string de resultado ou None se a linha não contiver o termo.
    """
    row_text = row.inner_text()
    if termo not in row_text:
        return None

    cells = row.locator('td').all()
    if len(cells) < 2:
        return None

    # Procura a célula com o número do processo e pega o status (coluna anterior)
    status_texto = ''
    for i, cell in enumerate(cells):
        if termo in cell.inner_text().strip():
            if i >= 1:
                status_texto = cells[i - 1].inner_text().strip()
            break

    # Fallback: 4ª coluna (posição mais comum do Status)
    if not status_texto and len(cells) > 3:
        status_texto = cells[3].inner_text().strip()

    em_exigencia = row.get_by_role('img', name='Em exigência').count() > 0
    return f'{status_texto} | {"🔴 Em exigência" if em_exigencia else "✅ Sem pendências"}'


def extrair_status_da_lista(page, num_processo: str) -> str:
    """
    Lê a tabela de requerimentos e encontra a linha pelo Nº do processo.

    Estratégia de busca (em ordem):
      1. Número completo: ex "25110049202/2025"
      2. Sem sufixo /ANO: ex "25110049202"  (fallback se SIGLA omite o ano)

    Lógica de ícone (validada em 2026-07):
      - Ícone vermelho, alt="Em exigência" → pendência aberta
      - Ícone verde (qualquer outro alt)   → sem pendências

    Retorna ex:
      "Constituído processo | 🔴 Em exigência"
      "Em tramitação | ✅ Sem pendências"
    """
    # Aguarda a tabela de RESULTADOS carregar (não o menu, que também é uma
    # tabela). O clique em "Listar" é uma atualização via AJAX (RichFaces),
    # não uma navegação de página inteira — por isso esperamos especificamente
    # pela classe "rf-dt-c" (célula da grade de resultados), em vez de
    # qualquer "table tr td" genérico, que pega o menu lateral antes da hora.
    try:
        page.wait_for_selector('td.rf-dt-c', timeout=15_000)
    except PlaywrightTimeout:
        raise Exception('Tabela de requerimentos não carregou — verifique se o login foi bem-sucedido')

    rows = page.locator('tr:has(td.rf-dt-c)').all()
    log.info(f'  → {len(rows)} linha(s) encontradas. Procurando "{num_processo}"...')

    # Termo primário (completo) e fallback sem "/ANO"
    num_completo = num_processo.strip()
    num_base     = num_completo.split('/')[0].strip()  # ex: "25110049202"
    termos       = [num_completo]
    if num_base and num_base != num_completo:
        termos.append(num_base)

    for termo in termos:
        for row in rows:
            resultado = extrair_status_da_linha(row, termo)
            if resultado is not None:
                if termo != num_completo:
                    log.info(f'  → Encontrado via busca parcial ("{termo}")')
                log.info(f'  → Resultado: {resultado}')
                return resultado

    # Nenhum termo funcionou — loga o conteúdo da tabela para diagnóstico
    log.warning('  → Processo não encontrado. Conteúdo da tabela (primeiras linhas com dados):')
    contagem = 0
    for row in rows:
        texto = row.inner_text().strip().replace('\n', ' | ').replace('\t', ' ')
        if texto and contagem < 8:
            log.warning(f'      {texto[:120]}')
            contagem += 1

    raise Exception(
        f'Nº do processo "{num_processo}" não encontrado na lista de requerimentos. '
        f'Verifique o número cadastrado no Ecdise (veja o log acima para ver o que aparece no SIGLA).'
    )


# ──────────────────────────────────────────────
# Caminhos de navegação por tipo de serviço
# ──────────────────────────────────────────────

def clicar_menu(page, nome: str):
    """
    Clica em item do menu SIGLA.
    O codegen ora grava como 'cell' ora como 'row' dependendo do clique —
    esta função tenta cell primeiro e cai para row se não encontrar.
    """
    try:
        locator = page.get_by_role('cell', name=nome, exact=True)
        locator.wait_for(timeout=10_000)
        locator.click()
    except Exception:
        page.get_by_role('row', name=nome, exact=True).click()
    page.wait_for_load_state('domcontentloaded', timeout=15_000)


def navegar_licenciamento_ambiental(page, num_processo: str) -> str:
    """
    Requerimentos → Licenciamento ambiental → Listar requerimentos
    ✅ Validado 2026-07 — cobre LAU, LAR e demais licenças ambientais.
    """
    clicar_menu(page, 'Requerimentos')
    clicar_menu(page, 'Licenciamento ambiental')
    clicar_menu(page, 'Listar requerimentos')
    return extrair_status_da_lista(page, num_processo)


def navegar_recursos_florestais(page, num_processo: str) -> str:
    """
    Requerimentos → Recursos florestais → Listar
    ✅ Validado 2026-07 — cobre LAUR.
    """
    clicar_menu(page, 'Requerimentos')
    clicar_menu(page, 'Recursos florestais')
    clicar_menu(page, 'Listar')
    return extrair_status_da_lista(page, num_processo)


def navegar_recursos_hidricos(page, num_processo: str) -> str:
    """
    Requerimentos → Recursos hídricos → Listar
    ✅ Validado 2026-07 — cobre Outorga, OSI e Inexigibilidade.
    """
    clicar_menu(page, 'Requerimentos')
    clicar_menu(page, 'Recursos hídricos')
    clicar_menu(page, 'Listar')
    return extrair_status_da_lista(page, num_processo)


NAVEGADORES = {
    'licenciamento_ambiental': navegar_licenciamento_ambiental,
    'recursos_florestais':     navegar_recursos_florestais,
    'recursos_hidricos':       navegar_recursos_hidricos,
}


# ──────────────────────────────────────────────
# Consulta completa de um projeto
# ──────────────────────────────────────────────

def consultar_projeto(page, projeto: dict) -> str:
    login        = projeto['login']
    senha        = projeto['senha']
    num_processo = projeto['protocolo']       # ex: "26070010650/2026"
    tipo_servico = projeto.get('tipoServico', '')
    caminho_explicito = (projeto.get('caminhoSIGLA') or '').strip()

    fazer_login(page, login, senha)

    if caminho_explicito and caminho_explicito in NAVEGADORES:
        # ✅ Caminho definido manualmente no Ecdise (Acompanhamento → Caminho de
        # verificação no SIGLA) — não depende de adivinhar pelo nome do serviço.
        tipo_nav = caminho_explicito
        log.info(f'  → Navegação (definida manualmente): {tipo_nav}')
    else:
        # Fallback: tenta adivinhar pelo texto do tipo de serviço (menos confiável —
        # recomenda-se configurar o "Caminho de verificação no SIGLA" no projeto).
        tipo_nav = detectar_tipo(tipo_servico)
        log.info(f'  → Navegação (adivinhada pelo texto "{tipo_servico}"): {tipo_nav}')

    fn = NAVEGADORES.get(tipo_nav, navegar_licenciamento_ambiental)
    status = fn(page, num_processo)

    fazer_logout(page)
    return status


# ──────────────────────────────────────────────
# Execução principal
# ──────────────────────────────────────────────

def main():
    # Argumentos opcionais de linha de comando
    parser = argparse.ArgumentParser(description='Consulta automática de processos no SIGLA-SEMA/MA')
    parser.add_argument('--id', metavar='PROJETO_ID',
                        help='Verifica apenas o projeto com este ID (ex: --id cm5abc123). '
                             'Omita para verificar todos os projetos em acompanhamento.')
    args = parser.parse_args()

    if not SIGLA_BOT_TOKEN:
        log.error('SIGLA_BOT_TOKEN não definido no .env — abortando.')
        sys.exit(1)

    inicio = datetime.now()
    log.info(f'=== Início — {inicio.strftime("%d/%m/%Y %H:%M")} ===')
    if args.id:
        log.info(f'  → Modo pontual: verificando apenas projeto {args.id}')

    projetos = buscar_projetos()
    if not projetos:
        log.info('Nenhum projeto para consultar. Verifique se há projetos com emAcompanhamento=true e credenciais SIGLA preenchidas.')
        return

    # Filtra para um projeto específico se --id foi passado
    if args.id:
        projetos = [p for p in projetos if p['id'] == args.id]
        if not projetos:
            log.error(f'Projeto {args.id} não encontrado ou não está em acompanhamento.')
            sys.exit(1)

    sucesso = 0
    falha   = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=HEADLESS)

        for proj in projetos:
            projeto_id = proj['id']
            protocolo  = proj['protocolo']
            codigo     = proj['codigo']
            cliente    = proj.get('cliente', '')

            log.info(f'--- [{codigo}] {cliente} | Processo: {protocolo} ---')

            # Cada projeto usa credenciais próprias → browser context isolado
            context = browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                locale='pt-BR',
                timezone_id='America/Fortaleza',
            )
            page = context.new_page()

            try:
                status = consultar_projeto(page, proj)
                enviar_status(projeto_id, protocolo, status)
                sucesso += 1
            except Exception as e:
                erro_msg = str(e)
                log.error(f'  ✖ {erro_msg}')
                enviar_status(projeto_id, protocolo, None, erro=erro_msg)
                falha += 1
            finally:
                context.close()

        browser.close()

    duracao = (datetime.now() - inicio).seconds
    log.info(f'=== Fim — {sucesso} OK, {falha} erro(s), {duracao}s ===')


if __name__ == '__main__':
    main()
