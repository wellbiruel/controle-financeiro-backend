const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const authenticateToken = require('../middleware/authMiddleware');

router.get('/resumo-completo', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const mes    = parseInt(req.query.mes) || new Date().getMonth() + 1;
    const ano    = parseInt(req.query.ano) || new Date().getFullYear();
    const mesPrev = mes === 1 ? 12 : mes - 1;
    const anoPrev = mes === 1 ? ano - 1 : ano;

    const [
      mesRes, antRes, catsRes, catsAntRes,
      grafRes, maiorRes, diasRes, proximasRes, mediaRes,
    ] = await Promise.all([

      db.query(`
        SELECT COALESCE(SUM(ABS(t.valor)), 0) AS total
        FROM transacoes t
        WHERE t.usuario_id = $1 AND t.tipo = 'saida'
          AND EXTRACT(MONTH FROM t.data) = $2 AND EXTRACT(YEAR FROM t.data) = $3
      `, [userId, mes, ano]),

      db.query(`
        SELECT COALESCE(SUM(ABS(t.valor)), 0) AS total
        FROM transacoes t
        WHERE t.usuario_id = $1 AND t.tipo = 'saida'
          AND EXTRACT(MONTH FROM t.data) = $2 AND EXTRACT(YEAR FROM t.data) = $3
      `, [userId, mesPrev, anoPrev]),

      db.query(`
        SELECT COALESCE(c.nome, 'Outros') AS nome,
               COALESCE(SUM(ABS(t.valor)), 0) AS total
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1 AND t.tipo = 'saida'
          AND EXTRACT(MONTH FROM t.data) = $2 AND EXTRACT(YEAR FROM t.data) = $3
        GROUP BY c.nome ORDER BY total DESC
      `, [userId, mes, ano]),

      db.query(`
        SELECT COALESCE(c.nome, 'Outros') AS nome,
               COALESCE(SUM(ABS(t.valor)), 0) AS total
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1 AND t.tipo = 'saida'
          AND EXTRACT(MONTH FROM t.data) = $2 AND EXTRACT(YEAR FROM t.data) = $3
        GROUP BY c.nome
      `, [userId, mesPrev, anoPrev]),

      db.query(`
        SELECT EXTRACT(MONTH FROM data)::int AS mes,
               COALESCE(SUM(ABS(valor)), 0) AS total
        FROM transacoes
        WHERE usuario_id = $1 AND tipo = 'saida' AND EXTRACT(YEAR FROM data) = $2
        GROUP BY mes ORDER BY mes
      `, [userId, ano]),

      db.query(`
        SELECT t.descricao, ABS(t.valor)::float AS valor,
               COALESCE(c.nome, 'Outros') AS categoria
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1 AND t.tipo = 'saida'
          AND EXTRACT(MONTH FROM t.data) = $2 AND EXTRACT(YEAR FROM t.data) = $3
        ORDER BY ABS(t.valor) DESC LIMIT 1
      `, [userId, mes, ano]),

      db.query(`
        SELECT COUNT(DISTINCT data)::int AS dias
        FROM transacoes
        WHERE usuario_id = $1 AND tipo = 'saida'
          AND EXTRACT(MONTH FROM data) = $2 AND EXTRACT(YEAR FROM data) = $3
      `, [userId, mes, ano]),

      db.query(`
        SELECT t.id, t.descricao, ABS(t.valor)::float AS valor, t.data,
               COALESCE(c.nome, 'Outros') AS categoria
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1 AND t.tipo = 'saida' AND t.data > CURRENT_DATE
        ORDER BY t.data ASC LIMIT 10
      `, [userId]),

      db.query(`
        SELECT COALESCE(AVG(mens.total), 0) AS media
        FROM (
          SELECT EXTRACT(MONTH FROM data) AS m, SUM(ABS(valor)) AS total
          FROM transacoes
          WHERE usuario_id = $1 AND tipo = 'saida' AND EXTRACT(YEAR FROM data) = $2
          GROUP BY m
        ) mens
      `, [userId, ano]),
    ]);

    const totalMes    = parseFloat(mesRes.rows[0].total);
    const totalAnt    = parseFloat(antRes.rows[0].total);
    const variacao    = totalAnt > 0
      ? parseFloat(((totalMes - totalAnt) / totalAnt * 100).toFixed(1))
      : 0;
    const diasComGasto = parseInt(diasRes.rows[0].dias);
    const mediaMensal  = parseFloat(mediaRes.rows[0].media);
    const maiorGastoRaw = maiorRes.rows[0] || null;

    const catsAntMap = {};
    catsAntRes.rows.forEach(r => { catsAntMap[r.nome] = parseFloat(r.total); });

    const categorias = catsRes.rows.map(r => {
      const total       = parseFloat(r.total);
      const totalAntCat = catsAntMap[r.nome] || 0;
      const variacaoPct = totalAntCat > 0
        ? parseFloat(((total - totalAntCat) / totalAntCat * 100).toFixed(1))
        : null;
      return {
        nome: r.nome,
        total,
        pct:  totalMes > 0 ? parseFloat(((total / totalMes) * 100).toFixed(1)) : 0,
        totalAnt: totalAntCat,
        variacaoPct,
      };
    });

    const graficoAnual = Array.from({ length: 12 }, (_, i) => {
      const found = grafRes.rows.find(r => r.mes === i + 1);
      return { mes: i + 1, total: found ? parseFloat(found.total) : 0 };
    });

    const maiorGasto = maiorGastoRaw
      ? { ...maiorGastoRaw, pct: totalMes > 0 ? parseFloat(((maiorGastoRaw.valor / totalMes) * 100).toFixed(1)) : 0 }
      : null;

    res.json({
      periodo: { mes, ano },
      totalMes, totalAnt, variacao,
      mediaMensal, diasComGasto, maiorGasto,
      categorias, graficoAnual,
      proximasSaidas: proximasRes.rows,
    });
  } catch (e) {
    console.error('saidas/resumo-completo error:', e);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
