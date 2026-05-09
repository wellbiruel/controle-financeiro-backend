const express = require('express');
const router  = express.Router();
const pool    = require('../config/database');
const auth    = require('../middleware/authMiddleware');

// GET /api/patrimonio?ano=XXXX
// Retorna array de 12 meses com herança do mês anterior para meses sem registro.
router.get('/', auth, async (req, res) => {
  const ano = parseInt(req.query.ano) || new Date().getFullYear();
  const uid = req.userId;
  try {
    const [anoRes, prevRes] = await Promise.all([
      pool.query(
        `SELECT mes, valor, atualizado_em
         FROM patrimonio_liquido_historico
         WHERE usuario_id = $1 AND ano = $2
         ORDER BY mes`,
        [uid, ano]
      ),
      // Último valor de anos anteriores (semente da herança para janeiro)
      pool.query(
        `SELECT valor FROM patrimonio_liquido_historico
         WHERE usuario_id = $1 AND ano < $2
         ORDER BY ano DESC, mes DESC LIMIT 1`,
        [uid, ano]
      ),
    ]);

    let valorAnterior = prevRes.rows.length > 0 ? parseFloat(prevRes.rows[0].valor) : null;
    const resultado   = [];

    for (let m = 1; m <= 12; m++) {
      const r = anoRes.rows.find(row => row.mes === m);
      if (r) {
        valorAnterior = parseFloat(r.valor);
        resultado.push({ mes: m, ano, valor: parseFloat(r.valor), manual: true,  atualizado_em: r.atualizado_em });
      } else {
        resultado.push({ mes: m, ano, valor: valorAnterior,        manual: false, atualizado_em: null });
      }
    }

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/patrimonio — upsert { mes, ano, valor }
router.post('/', auth, async (req, res) => {
  const { mes, ano, valor } = req.body;
  if (!mes || !ano || valor == null || valor < 0) {
    return res.status(400).json({ message: 'mes, ano e valor são obrigatórios.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO patrimonio_liquido_historico (usuario_id, mes, ano, valor, atualizado_em)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (usuario_id, mes, ano) DO UPDATE
         SET valor = EXCLUDED.valor, atualizado_em = NOW()
       RETURNING *`,
      [req.userId, mes, ano, valor]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// DELETE /api/patrimonio/:mes/:ano — remove registro manual (mês volta a herdar)
router.delete('/:mes/:ano', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM patrimonio_liquido_historico
       WHERE usuario_id = $1 AND mes = $2 AND ano = $3`,
      [req.userId, req.params.mes, req.params.ano]
    );
    res.json({ ok: true, removed: rowCount > 0 });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
