import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed do banco de dados dbgix...')

  // ============================================================
  // USUÁRIOS — administradores do sistema
  // ============================================================
  const usuarios = [
    {
      nome:         'Douglas',
      email:        'douglas@dbgix.com',
      senha:        'Douglas@2024',
      cargo:        'Administrador',
      role:         'ADMIN',
      departamento: 'GESTAO_GERAL',
    },
    {
      nome:         'Bruno',
      email:        'bruno@dbgix.com',
      senha:        'Bruno@2024',
      cargo:        'Administrador',
      role:         'ADMIN',
      departamento: 'GESTAO_GERAL',
    },
  ]

  for (const u of usuarios) {
    const senhaHash = await bcrypt.hash(u.senha, 10)
    await prisma.usuario.upsert({
      where:  { email: u.email },
      update: { nome: u.nome, cargo: u.cargo, ativo: true },
      create: {
        nome:         u.nome,
        email:        u.email,
        senha:        senhaHash,
        cargo:        u.cargo,
        role:         u.role,
        departamento: u.departamento,
        ativo:        true,
      },
    })
  }
  console.log('✅ Usuários criados')

  console.log('\n🎉 Seed concluído!')
  console.log('\n📋 Credenciais de acesso:')
  console.log('   Douglas: douglas@dbgix.com  |  Douglas@2024')
  console.log('   Bruno:   bruno@dbgix.com    |  Bruno@2024')
  console.log('\n⚠️  Altere as senhas após o primeiro acesso!')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
