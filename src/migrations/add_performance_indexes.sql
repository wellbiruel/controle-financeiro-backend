-- Índices de performance para o dashboard
-- Execute no Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Índice principal: filtra por usuario_id + extrai mes/ano de data
-- Cobre a maioria das queries do dashboardController
CREATE INDEX IF NOT EXISTS idx_transacoes_uid_data
  ON transacoes (usuario_id, data DESC);

-- Índice composto com tipo: cobre queries de saida/entrada/investimento
CREATE INDEX IF NOT EXISTS idx_transacoes_uid_tipo_data
  ON transacoes (usuario_id, tipo, data DESC);

-- Índice para o JOIN com categorias (maiorGasto, categoriasResult)
CREATE INDEX IF NOT EXISTS idx_transacoes_categoria_id
  ON transacoes (categoria_id)
  WHERE categoria_id IS NOT NULL;

-- Índice para tabela investimentos (patrimonioResult)
CREATE INDEX IF NOT EXISTS idx_investimentos_uid_data
  ON investimentos (usuario_id, data_referencia DESC);

-- Ver índices existentes na tabela transacoes:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'transacoes';
