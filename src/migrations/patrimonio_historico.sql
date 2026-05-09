-- Tabela: patrimônio líquido histórico
-- Armazena o valor TOTAL do patrimônio registrado manualmente mês a mês.
-- Meses sem registro herdam o último valor conhecido (lógica no backend).
--
-- Rode no Supabase SQL Editor antes de reiniciar o backend.

CREATE TABLE IF NOT EXISTS patrimonio_liquido_historico (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    UUID          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  mes           INTEGER       NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano           INTEGER       NOT NULL CHECK (ano >= 2020),
  valor         NUMERIC(14,2) NOT NULL CHECK (valor >= 0),
  criado_em     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, mes, ano)
);

CREATE INDEX IF NOT EXISTS idx_patrimonio_uid_ano_mes
  ON patrimonio_liquido_historico (usuario_id, ano DESC, mes DESC);
