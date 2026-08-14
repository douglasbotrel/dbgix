# Script para remover os 17 arquivos originais "-Douglas" restantes
# (os 16 .tsx ja foram removidos por voce; isso cobre os 16 .ts + 1 .prisma)
# Todos ja estao copiados e verificados em _backups-douglas/
# Rode este script na raiz do repositorio (C:\Users\dougl\OneDrive\Documents\GitHub\Ecdise)

$arquivos = @(
  "src\app\api\notificacoes\route-Douglas.ts",
  "src\middleware-Douglas.ts",
  "src\app\api\auth\login\route-Douglas.ts",
  "src\app\api\auth\logout\route-Douglas.ts",
  "src\lib\auth-Douglas.ts",
  "src\app\api\projetos\route-Douglas.ts",
  "src\app\api\vistorias\[id]\route-Douglas.ts",
  "src\app\api\projetos\[id]\route-Douglas.ts",
  "src\lib\utils-Douglas.ts",
  "src\app\api\vistorias\route-Douglas.ts",
  "src\app\api\usuarios\route-Douglas.ts",
  "src\app\api\pagamentos\route-Douglas.ts",
  "src\app\api\tarefas\route-Douglas.ts",
  "src\app\api\contratos\route-Douglas.ts",
  "src\app\api\dashboard\route-Douglas.ts",
  "src\app\api\pre-cadastros\route-Douglas.ts",
  "prisma\schema-Douglas.prisma"
)

foreach ($f in $arquivos) {
  if (Test-Path $f) {
    Remove-Item $f -Force
    Write-Host "Removido: $f"
  } else {
    Write-Host "Nao encontrado (ja removido?): $f"
  }
}

Write-Host "`nConcluido. $($arquivos.Count) arquivos processados."
