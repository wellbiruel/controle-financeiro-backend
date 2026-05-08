const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const authenticateToken = require('../middleware/authMiddleware');

const CAT_RESERVA = 'Reserva de Segurança';

router.get('/resumo', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const mes = parseInt(req.query.mes) || new Date().getMonth() + 1;
    const ano = parseInt(req.query.ano) || new Date().getFullYear();

    const [totalRes, mesRes, anoRes, catRes, histRes] = await Promise.all([

      // Patrimônio total acumulado (todos os aportes - retiradas, exceto reserva)
      db.query(`
        SELECT COALESCE(SUM(t.valor), 0) AS total
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND t.tipo = 'investimento'
          AND (c.nome IS NULL OR c.nome != $2)
      `, [userId, CAT_RESERVA]),

      // Aporte líquido do mês selecionado
      db.query(`
        SELECT COALESCE(SUM(t.valor), 0) AS total
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND t.tipo = 'investimento'
          AND (c.nome IS NULL OR c.nome != $2)
          AND EXTRACT(MONTH FROM t.data) = $3
          AND EXTRACT(YEAR  FROM t.data) = $4
      `, [userId, CAT_RESERVA, mes, ano]),

      // Total aportado no ano
      db.query(`
        SELECT COALESCE(SUM(t.valor), 0) AS total
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND t.tipo = 'investimento'
          AND (c.nome IS NULL OR c.nome != $2)
          AND EXTRACT(YEAR FROM t.data) = $3
      `, [userId, CAT_RESERVA, ano]),

      // Breakdown por categoria (todo o período)
      db.query(`
        SELECT COALESCE(c.nome, 'Outros') AS categoria,
               COALESCE(SUM(t.valor), 0) AS total
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND t.tipo = 'investimento'
          AND (c.nome IS NULL OR c.nome != $2)
        GROUP BY c.nome
        ORDER BY total DESC
      `, [userId, CAT_RESERVA]),

      // Histórico do mês selecionado
      db.query(`
        SELECT t.id, t.descricao, t.valor::float, t.data,
               COALESCE(c.nome, 'Outros') AS categoria
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND t.tipo = 'investimento'
          AND (c.nome IS NULL OR c.nome != $2)
          AND EXTRACT(MONTH FROM t.data) = $3
          AND EXTRACT(YEAR  FROM t.data) = $4
        ORDER BY t.data DESC, t.criado_em DESC
      `, [userId, CAT_RESERVA, mes, ano]),
    ]);

    const patrimonioTotal = parseFloat(totalRes.rows[0].total);
    const aporteMes       = parseFloat(mesRes.rows[0].total);
    const totalAno        = parseFloat(anoRes.rows[0].total);

    const categorias = catRes.rows.map(r => ({
      nome:  r.categoria,
      total: parseFloat(r.total),
      pct:   patrimonioTotal > 0
        ? parseFloat(((parseFloat(r.total) / patrimonioTotal) * 100).toFixed(1))
        : 0,
    }));

    res.json({ patrimonioTotal, aporteMes, totalAno, categorias, historico: histRes.rows });
  } catch (e) {
    console.error('investimentos/resumo error:', e);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
