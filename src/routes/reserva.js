const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authenticateToken = require('../middleware/authMiddleware');

router.get('/resumo', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const [kpisRes, movRes, mediaSaidasRes] = await Promise.all([
      db.query(`
        SELECT
          COALESCE(SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END), 0) AS aportes,
          COALESCE(SUM(CASE WHEN valor < 0 THEN ABS(valor) ELSE 0 END), 0) AS retiradas,
          COALESCE(SUM(valor), 0) AS saldo
        FROM transacoes
        WHERE usuario_id = $1 AND tipo = 'investimento'
      `, [userId]),

      db.query(`
        SELECT id, descricao, valor::float, data
        FROM transacoes
        WHERE usuario_id = $1 AND tipo = 'investimento'
        ORDER BY data ASC, criado_em ASC
      `, [userId]),

      db.query(`
        SELECT COALESCE(AVG(total), 0) AS media FROM (
          SELECT SUM(valor) AS total
          FROM transacoes
          WHERE usuario_id = $1 AND tipo = 'saida'
          GROUP BY EXTRACT(YEAR FROM data), EXTRACT(MONTH FROM data)
        ) t
      `, [userId]),
    ]);

    const saldo         = parseFloat(kpisRes.rows[0].saldo);
    const aportes       = parseFloat(kpisRes.rows[0].aportes);
    const retiradas     = parseFloat(kpisRes.rows[0].retiradas);
    const mediaSaidas   = parseFloat(mediaSaidasRes.rows[0].media);
    const mesesCobertos = mediaSaidas > 0
      ? parseFloat((saldo / mediaSaidas).toFixed(1))
      : null;

    let runSaldo = 0;
    const movimentacoes = movRes.rows.map(m => {
      runSaldo += m.valor;
      return { ...m, saldo_acum: parseFloat(runSaldo.toFixed(2)) };
    }).reverse();

    res.json({ saldo, aportes, retiradas, mediaSaidas, mesesCobertos, movimentacoes });
  } catch (e) {
    console.error('reserva/resumo error:', e);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
