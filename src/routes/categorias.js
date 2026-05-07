const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authenticateToken = require('../middleware/authMiddleware');

const DEFAULTS = {
  saida:   ['Cartões','Casa','Transporte','Alimentação','Saúde','Lazer','Outros'],
  entrada: [
    'Salário principal','Adiantamento','Comissão CLT','Bônus',
    'Freelance','Venda','Comissão','Cashback','Trabalho Extra',
    'Aluguel','Dividendos','Reembolso','Presente','Restituição','Investimentos',
  ],
};

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { tipo } = req.query;
    const params = [req.userId];
    let q = 'SELECT id, nome, tipo FROM categorias WHERE usuario_id = $1';
    if (tipo) { params.push(tipo); q += ` AND tipo = $${params.length}`; }
    q += ' ORDER BY nome';
    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (e) {
    console.error('categorias GET error:', e);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.post('/seed', authenticateToken, async (req, res) => {
  try {
    const { tipo } = req.body;
    const nomes = DEFAULTS[tipo] || [];
    let criadas = 0;
    for (const nome of nomes) {
      const exists = await db.query(
        'SELECT id FROM categorias WHERE usuario_id = $1 AND nome = $2',
        [req.userId, nome]
      );
      if (!exists.rows.length) {
        await db.query(
          'INSERT INTO categorias (id, usuario_id, nome, tipo) VALUES (gen_random_uuid(), $1, $2, $3)',
          [req.userId, nome, tipo]
        );
        criadas++;
      }
    }
    res.json({ criadas });
  } catch (e) {
    console.error('categorias seed error:', e);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  const { nome, tipo } = req.body;
  if (!nome || !tipo) return res.status(400).json({ error: 'Nome e tipo são obrigatórios.' });
  try {
    const exists = await db.query(
      'SELECT id FROM categorias WHERE usuario_id = $1 AND nome = $2',
      [req.userId, nome.trim()]
    );
    if (exists.rows.length) return res.status(409).json({ error: 'Categoria já existe.' });
    const r = await db.query(
      'INSERT INTO categorias (id, usuario_id, nome, tipo) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *',
      [req.userId, nome.trim(), tipo]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error('categorias POST error:', e);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
  try {
    const r = await db.query(
      'UPDATE categorias SET nome = $1 WHERE id = $2 AND usuario_id = $3 RETURNING *',
      [nome.trim(), req.params.id, req.userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Categoria não encontrada.' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('categorias PUT error:', e);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const uso = await db.query(
      'SELECT COUNT(*) FROM transacoes WHERE categoria_id = $1 AND usuario_id = $2',
      [req.params.id, req.userId]
    );
    const count = parseInt(uso.rows[0].count);
    if (count > 0) {
      return res.status(409).json({
        error: `Categoria em uso por ${count} transação(ões). Reatribua antes de excluir.`,
      });
    }
    await db.query('DELETE FROM categorias WHERE id = $1 AND usuario_id = $2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('categorias DELETE error:', e);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
