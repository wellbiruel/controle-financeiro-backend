const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authenticateToken = require('../middleware/authMiddleware');

const SALARIO_CATS    = ['Salário principal', 'Adiantamento', 'Comissão CLT', 'Bônus'];
const RENDA_EXTRA_CATS = ['Freelance', 'Venda', 'Comissão', 'Cashback', 'Trabalho Extra'];

router.get('/resumo', authenticateToken, async (req, res) => {
  try {
    const usuarioId = req.userId;
    const mes    = parseInt(req.query.mes)  || new Date().getMonth() + 1;
    const ano    = parseInt(req.query.ano)  || new Date().getFullYear();
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const anoAnt = mes === 1 ? ano - 1 : ano;

    const [totalRes, totalAntRes, graficoRes, mediaRes] = await Promise.all([
      db.query(`
        SELECT
          COALESCE(SUM(t.valor), 0) AS total,
          COALESCE(SUM(CASE WHEN c.nome = ANY($2) THEN t.valor ELSE 0 END), 0) AS salario,
          COALESCE(SUM(CASE WHEN c.nome = ANY($3) THEN t.valor ELSE 0 END), 0) AS renda_extra
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1 AND t.tipo = 'entrada'
          AND EXTRACT(MONTH FROM t.data) = $4
          AND EXTRACT(YEAR  FROM t.data) = $5
      `, [usuarioId, SALARIO_CATS, RENDA_EXTRA_CATS, mes, ano]),

      db.query(`
        SELECT COALESCE(SUM(valor), 0) AS total
        FROM transacoes
        WHERE usuario_id = $1 AND tipo = 'entrada'
          AND EXTRACT(MONTH FROM data) = $2
          AND EXTRACT(YEAR  FROM data) = $3
      `, [usuarioId, mesAnt, anoAnt]),

      db.query(`
        SELECT EXTRACT(MONTH FROM data) AS mes, COALESCE(SUM(valor), 0) AS total
        FROM transacoes
        WHERE usuario_id = $1 AND tipo = 'entrada'
          AND EXTRACT(YEAR FROM data) = $2
        GROUP BY EXTRACT(MONTH FROM data)
        ORDER BY mes
      `, [usuarioId, ano]),

      db.query(`
        SELECT COALESCE(AVG(total), 0) AS media FROM (
          SELECT EXTRACT(MONTH FROM data) AS m, SUM(valor) AS total
          FROM transacoes
          WHERE usuario_id = $1 AND tipo = 'entrada'
            AND EXTRACT(YEAR FROM data) = $2
          GROUP BY EXTRACT(MONTH FROM data)
        ) t
      `, [usuarioId, ano]),
    ]);

    const total      = parseFloat(totalRes.rows[0].total);
    const salario    = parseFloat(totalRes.rows[0].salario);
    const rendaExtra = parseFloat(totalRes.rows[0].renda_extra);
    const outros     = Math.max(0, total - salario - rendaExtra);
    const totalAnt   = parseFloat(totalAntRes.rows[0].total);

    const graficoAnual = Array.from({ length: 12 }, (_, i) => {
      const found = graficoRes.rows.find(r => parseInt(r.mes) === i + 1);
      return { mes: i + 1, realizado: found ? parseFloat(found.total) : 0 };
    });

    const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    return res.json({
      totalMes:          total,
      salario,
      rendaExtra,
      outros,
      mediaMensal:       parseFloat(mediaRes.rows[0].media),
      comparativoMensal: total - totalAnt,
      graficoAnual,
      insights: total > 0
        ? [`Total de ${fmt(total)} em entradas este mês`]
        : ['Nenhuma entrada registrada neste mês.'],
    });
  } catch (err) {
    console.error('entradas/resumo error:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
