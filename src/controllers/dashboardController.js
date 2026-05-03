const db = require('../config/database');

async function getDashboardCompleto(req, res) {
  try {
    const usuarioId = req.userId;
    const mes = parseInt(req.query.mes) || new Date().getMonth() + 1;
    const ano = parseInt(req.query.ano) || new Date().getFullYear();

    // KPIs do mês
    const kpisResult = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) AS entradas,
        COALESCE(SUM(CASE WHEN tipo = 'saida'   THEN valor ELSE 0 END), 0) AS saidas
      FROM transacoes
      WHERE usuario_id = $1
        AND EXTRACT(MONTH FROM data) = $2
        AND EXTRACT(YEAR  FROM data) = $3
    `, [usuarioId, mes, ano]);

    const { entradas, saidas } = kpisResult.rows[0];
    const saldo = parseFloat(entradas) - parseFloat(saidas);

    // Saldo por mês do ano (para o gráfico)
    const saldoPorMesResult = await db.query(`
      SELECT
        EXTRACT(MONTH FROM data) AS mes,
        COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) AS entradas,
        COALESCE(SUM(CASE WHEN tipo = 'saida'   THEN valor ELSE 0 END), 0) AS saidas
      FROM transacoes
      WHERE usuario_id = $1
        AND EXTRACT(YEAR FROM data) = $2
      GROUP BY EXTRACT(MONTH FROM data)
      ORDER BY mes
    `, [usuarioId, ano]);

    const saldoPorMes = Array.from({ length: 12 }, (_, i) => {
      const found = saldoPorMesResult.rows.find(r => parseInt(r.mes) === i + 1);
      if (!found) return null;
      const e = parseFloat(found.entradas);
      const s = parseFloat(found.saidas);
      return { mes: i + 1, e, s, sd: e - s };
    });

    // Categorias do mês
    const categoriasResult = await db.query(`
      SELECT
        COALESCE(categoria, 'Outros') AS categoria,
        SUM(valor) AS total
      FROM transacoes
      WHERE usuario_id = $1
        AND tipo = 'saida'
        AND EXTRACT(MONTH FROM data) = $2
        AND EXTRACT(YEAR  FROM data) = $3
      GROUP BY categoria
      ORDER BY total DESC
    `, [usuarioId, mes, ano]);

    // Maior gasto do mês
    const maiorGastoResult = await db.query(`
      SELECT descricao, valor, categoria
      FROM transacoes
      WHERE usuario_id = $1
        AND tipo = 'saida'
        AND EXTRACT(MONTH FROM data) = $2
        AND EXTRACT(YEAR  FROM data) = $3
      ORDER BY valor DESC
      LIMIT 1
    `, [usuarioId, mes, ano]);

    // Resumo do período (Jan até mês selecionado)
    const resumoResult = await db.query(`
      SELECT
        EXTRACT(MONTH FROM data) AS mes,
        COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) AS entradas,
        COALESCE(SUM(CASE WHEN tipo = 'saida'   THEN valor ELSE 0 END), 0) AS saidas
      FROM transacoes
      WHERE usuario_id = $1
        AND EXTRACT(YEAR  FROM data) = $2
        AND EXTRACT(MONTH FROM data) <= $3
      GROUP BY EXTRACT(MONTH FROM data)
      ORDER BY mes
    `, [usuarioId, ano, mes]);

    const totalEntradas = resumoResult.rows.reduce((s, r) => s + parseFloat(r.entradas), 0);
    const totalSaidas   = resumoResult.rows.reduce((s, r) => s + parseFloat(r.saidas),   0);
    const totalSaldo    = totalEntradas - totalSaidas;
    const mesesComDados = resumoResult.rows.length || 1;
    const taxaPoupanca  = totalEntradas > 0 ? ((totalSaldo / totalEntradas) * 100).toFixed(1) : '0';

    // Score simples (0-100)
    const pct = saidas > 0 && entradas > 0 ? (saidas / entradas) * 100 : 0;
    let score = 100;
    if (saldo < 0)     score -= 30;
    if (pct > 100)     score -= 20;
    else if (pct > 90) score -= 10;
    else if (pct > 80) score -= 5;
    score = Math.max(0, Math.min(100, score));

    const status = score >= 75 ? 'ok' : score >= 55 ? 'atencao' : 'critico';
    const cor    = score >= 75 ? '#16A34A' : score >= 55 ? '#F59E0B' : '#EF4444';

    return res.json({
      periodo: { mes, ano },
      e: parseFloat(entradas),
      s: parseFloat(saidas),
      sd: saldo,
      score,
      cor,
      status,
      saldoPorMes,
      categorias: categoriasResult.rows.map(r => ({
        nome: r.categoria,
        total: parseFloat(r.total),
        pct: totalSaidas > 0 ? ((parseFloat(r.total) / totalSaidas) * 100).toFixed(1) : 0,
      })),
      maiorGasto: maiorGastoResult.rows[0] || null,
      resumoPeriodo: {
        titulo: `Resumo ${ano}`,
        intervalo: `Jan–${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][mes - 1]}`,
        entradasTotal: totalEntradas,
        entradasMediaMes: (totalEntradas / mesesComDados).toFixed(2),
        saidasTotal: totalSaidas,
        saidasMediaMes: (totalSaidas / mesesComDados).toFixed(2),
        saldoPeriodo: totalSaldo,
        taxaPoupanca,
        scoreMedio: score,
        melhorMes: saldoPorMes.reduce((best, d) => d && (!best || d.sd > best.sd) ? d : best, null)?.mes || null,
        piorMes:   saldoPorMes.reduce((worst, d) => d && (!worst || d.sd < worst.sd) ? d : worst, null)?.mes || null,
      },
    });
  } catch (err) {
    console.error('dashboardController error:', err);
    return res.status(500).json({ error: 'Erro interno ao carregar dashboard.' });
  }
}

module.exports = { getDashboardCompleto };
