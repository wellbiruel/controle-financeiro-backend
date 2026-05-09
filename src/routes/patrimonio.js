const express = require('express');
const router  = express.Router();
const pool    = require('../config/database');
const auth    = require('../middleware/authMiddleware');
const { getPatrimonioLiquidoPorPeriodo } = require('../services/patrimonioService');

const TIPOS_VALIDOS = ['valor_total', 'adicionar', 'retirar'];

// GET /api/patrimonio?ano=XXXX — array de 12 meses com PL computado
router.get('/', auth, async (req, res) => {
  const ano = parseInt(req.query.ano) || new Date().getFullYear();
  try {
    const resultado = await getPatrimonioLiquidoPorPeriodo(req.userId, ano);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/patrimonio — { mes, ano, tipo, valor, descricao? }
router.post('/', auth, async (req, res) => {
  const { mes, ano, tipo, valor, descricao } = req.body;
  if (!mes || !ano || !tipo || valor == null || valor < 0) {
    return res.status(400).json({ message: 'mes, ano, tipo e valor são obrigatórios.' });
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ message: 'tipo inválido. Use: valor_total, adicionar, retirar' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO patrimonio_liquido_movimentacoes (usuario_id, mes, ano, tipo, valor, descricao)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.userId, mes, ano, tipo, valor, descricao || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/patrimonio/movimentacoes?mes=X&ano=Y — movimentos de um mês
// DEVE vir antes de /:mes/:ano para não ser capturado como parâmetro
router.get('/movimentacoes', auth, async (req, res) => {
  const { mes, ano } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT id, mes, ano, tipo, valor::float, descricao, criado_em
       FROM patrimonio_liquido_movimentacoes
       WHERE usuario_id = $1 AND mes = $2 AND ano = $3
       ORDER BY criado_em ASC`,
      [req.userId, mes, ano]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// DELETE /api/patrimonio/movimentacoes/:id — remove um movimento individual
router.delete('/movimentacoes/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM patrimonio_liquido_movimentacoes WHERE id = $1 AND usuario_id = $2`,
      [req.params.id, req.userId]
    );
    res.json({ ok: true, removed: rowCount > 0 });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// DELETE /api/patrimonio/:mes/:ano — remove TODOS os movimentos do mês
router.delete('/:mes/:ano', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM patrimonio_liquido_movimentacoes
       WHERE usuario_id = $1 AND mes = $2 AND ano = $3`,
      [req.userId, req.params.mes, req.params.ano]
    );
    res.json({ ok: true, removed: rowCount });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
