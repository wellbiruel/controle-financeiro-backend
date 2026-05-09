-- Tabela: movimentações do patrimônio líquido
-- Substitui patrimonio_liquido_historico (que armazenava só um valor absoluto por mês).
-- Permite múltiplos movimentos por mês com 3 tipos:
--   valor_total  → redefine o PL absoluto ("hoje meu patrimônio é R$ X")
--   adicionar    → soma ao PL atual (aporte, rendimento)
--   retirar      → subtrai do PL atual (resgate, perda)
-- A lógica de herança e cômputo fica em src/services/patrimonioService.js.
--
-- Rode no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS patrimonio_liquido_movimentacoes (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  mes         INTEGER       NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano         INTEGER       NOT NULL CHECK (ano >= 2020),
  tipo        VARCHAR(20)   NOT NULL CHECK (tipo IN ('valor_total', 'adicionar', 'retirar')),
  valor       NUMERIC(14,2) NOT NULL CHECK (valor >= 0),
  descricao   TEXT,
  criado_em   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patmov_uid_ano_mes
  ON patrimonio_liquido_movimentacoes (usuario_id, ano DESC, mes DESC);
