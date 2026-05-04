CREATE TABLE IF NOT EXISTS investimentos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  patrimonio_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  data_referencia DATE NOT NULL,
  observacao TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
