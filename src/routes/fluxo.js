const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const verificarToken = require('../middleware/authMiddleware');

router.get('/grupos', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.*,
        COALESCE(
          json_agg(
            json_build_object('id',i.id,'nome',i.nome,'tipo',i.tipo,'ordem',i.ordem)
            ORDER BY i.ordem
          ) FILTER (WHERE i.id IS NOT NULL),
          '[]'
        ) as itens
       FROM grupos_financeiros g
       LEFT JOIN itens_financeiros i ON i.grupo_id = g.id
       WHERE g.usuario_id = $1
       GROUP BY g.id
       ORDER BY g.ordem, g.id`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post('/grupos', verificarToken, async (req, res) => {
  const { nome } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO grupos_financeiros (usuario_id, nome) VALUES ($1, $2) RETURNING *',
      [req.usuario.id, nome]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.put('/grupos/:id', verificarToken, async (req, res) => {
  const { nome } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE grupos_financeiros SET nome=$1 WHERE id=$2 AND usuario_id=$3 RETURNING *',
      [nome, req.params.id, req.usuario.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.delete('/grupos/:id', verificarToken, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM grupos_financeiros WHERE id=$1 AND usuario_id=$2',
      [req.params.id, req.usuario.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post('/itens', verificarToken, async (req, res) => {
  const { grupo_id, nome, tipo } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO itens_financeiros (grupo_id, usuario_id, nome, tipo) VALUES ($1,$2,$3,$4) RETURNING *',
      [grupo_id, req.usuario.id, nome, tipo || 'fixo']
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.put('/itens/:id', verificarToken, async (req, res) => {
  const { nome } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE itens_financeiros SET nome=$1 WHERE id=$2 AND usuario_id=$3 RETURNING *',
      [nome, req.params.id, req.usuario.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.delete('/itens/:id', verificarToken, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM itens_financeiros WHERE id=$1 AND usuario_id=$2',
      [req.params.id, req.usuario.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.get('/lancamentos/:ano', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.* FROM lancamentos_mensais l
       WHERE l.usuario_id=$1 AND l.ano=$2`,
      [req.usuario.id, req.params.ano]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post('/lancamentos', verificarToken, async (req, res) => {
  const { item_id, mes, ano, valor } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO lancamentos_mensais (item_id, usuario_id, mes, ano, valor)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (item_id, mes, ano) DO UPDATE SET valor=$5
       RETURNING *`,
      [item_id, req.usuario.id, mes, ano, valor]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
