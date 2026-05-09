const fs   = require('fs');
const path = require('path');

// ── Verificação de rotas no startup ──────────────────────────────────────────
// Lê o source do app.js e garante que todas as rotas críticas estão registradas.
// Se qualquer uma estiver faltando, o processo encerra antes de abrir a porta.
const ROTAS_OBRIGATORIAS = [
  "'/api/auth'",
  "'/api/transacoes'",
  "'/api/dashboard'",
  "'/api/entradas'",
  "'/api/categorias'",
  "'/api/reserva'",
  "'/api/investimentos'",
  "'/api/patrimonio'",
  "'/api/fluxo'",
  "'/api/importacao'",
];

const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const faltando  = ROTAS_OBRIGATORIAS.filter(r => !appSource.includes(r));

if (faltando.length > 0) {
  console.error('\n[STARTUP ERROR] Rotas faltando no app.js — o servidor NÃO vai subir:');
  faltando.forEach(r => console.error('  ✗ ' + r));
  console.error('\nAbra src/app.js e restaure as rotas acima, depois reinicie.\n');
  process.exit(1);
}

console.log(`[STARTUP] ${ROTAS_OBRIGATORIAS.length} rotas verificadas ✓`);

// ── Sobe o servidor ───────────────────────────────────────────────────────────
const app  = require('./app');
const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
