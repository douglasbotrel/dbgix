import re
from playwright.sync_api import Playwright, sync_playwright, expect


def run(playwright: Playwright) -> None:
    browser = playwright.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()
    page.goto("https://sigla.sema.ma.gov.br/sigla/index.jsf")
    page.get_by_role("cell", name="Módulo Empreendedor", exact=True).click()
    page.locator("input[name=\"j_idt38:cpf\"]").click()
    page.locator("input[name=\"j_idt38:cpf\"]").fill("0.196-54")
    page.locator("input[name=\"j_idt38:cpf\"]").press("Enter")
    page.locator("input[name=\"j_idt38:cpf\"]").fill("019.654.393-22")
    page.locator("[id=\"j_idt38:senha\"]").click()
    page.locator("[id=\"j_idt38:senha\"]").fill("dy9ev692")
    page.get_by_role("button", name="Acessar").click()
    page.get_by_role("cell", name="Requerimentos", exact=True).click()

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run(playwright)
