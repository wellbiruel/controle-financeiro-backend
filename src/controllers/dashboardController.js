const db = require('../config/database');

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

async function getDashboardCompleto(req, res) {
  try {
    const usuarioId = req.userId;
    const mes = parseInt(req.query.mes) || new Date().getMonth() + 1;
    const ano = parseInt(req.query.ano) || new Date().getFullYear();

    // ── KPIs do mês ──────────────────────────────────────────────
    const kpisResult = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo = 'entrada'      THEN valor ELSE 0 END), 0) AS entradas,
        COALESCE(SUM(CASE WHEN tipo = 'saida'        THEN valor ELSE 0 END), 0) AS saidas,
        COALESCE(SUM(CASE WHEN tipo = 'investimento' THEN valor ELSE 0 END), 0) AS aportes_mes
      FROM transacoes
      WHERE usuario_id = $1
        AND EXTRACT(MONTH FROM data) = $2
        AND EXTRACT(YEAR  FROM data) = $3
    `, [usuarioId, mes, ano]);

    const entradas   = parseFloat(kpisResult.rows[0].entradas);
    const saidas     = parseFloat(kpisResult.rows[0].saidas);
    const aportesMes = parseFloat(kpisResult.rows[0].aportes_mes);
    const saldo      = entradas - saidas;

    // ── Mês anterior para comparativos ───────────────────────────
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const anoAnt = mes === 1 ? ano - 1 : ano;
    const kpisAntResult = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo = 'entrada'      THEN valor ELSE 0 END), 0) AS entradas,
        COALESCE(SUM(CASE WHEN tipo = 'saida'        THEN valor ELSE 0 END), 0) AS saidas,
        COALESCE(SUM(CASE WHEN tipo = 'investimento' THEN valor ELSE 0 END), 0) AS aportes
      FROM transacoes
      WHERE usuario_id = $1
        AND EXTRACT(MONTH FROM data) = $2
        AND EXTRACT(YEAR  FROM data) = $3
    `, [usuarioId, mesAnt, anoAnt]);

    const entradasAnt = parseFloat(kpisAntResult.rows[0].entradas);
    const saidasAnt   = parseFloat(kpisAntResult.rows[0].saidas);
    const aportesAnt  = parseFloat(kpisAntResult.rows[0].aportes);
    const saldoAnt    = entradasAnt - saidasAnt;

    const pctEntradas = entradasAnt > 0 ? Math.round(((entradas - entradasAnt) / entradasAnt) * 100) : 0;
    const pctSaidas   = saidasAnt   > 0 ? Math.round(((saidas   - saidasAnt)   / saidasAnt)   * 100) : 0;
    const pctAportes  = aportesAnt  > 0 ? Math.round(((aportesMes - aportesAnt) / aportesAnt) * 100) : 0;

    // ── Patrimônio investido (último registro salvo) ──────────────
    let patrimonioTotal = 0;
    let patrimonioVsMes = aportesMes;
    try {
      const patResult = await db.query(`
        SELECT patrimonio_total FROM investimentos
        WHERE usuario_id = $1
        ORDER BY data_referencia DESC, id DESC
        LIMIT 1
      `, [usuarioId]);
      if (patResult.rows.length > 0) {
        patrimonioTotal = parseFloat(patResult.rows[0].patrimonio_total);
      }
    } catch (_) { /* tabela pode não existir ainda */ }

    // Crescimento patrimonial no ano
    let patrimonioCrescimentoAno = 0;
    try {
      const patInicioResult = await db.query(`
        SELECT patrimonio_total FROM investimentos
        WHERE usuario_id = $1
          AND EXTRACT(YEAR FROM data_referencia) = $2
        ORDER BY data_referencia ASC, id ASC
        LIMIT 1
      `, [usuarioId, ano]);
      if (patInicioResult.rows.length > 0) {
        const patInicio = parseFloat(patInicioResult.rows[0].patrimonio_total);
        if (patInicio > 0) {
          patrimonioCrescimentoAno = Math.round(((patrimonioTotal - patInicio) / patInicio) * 100);
        }
      }
    } catch (_) {}

    // ── Saldo por mês do ano ─────────────────────────────────────
    const saldoPorMesResult = await db.query(`
      SELECT
        EXTRACT(MONTH FROM data) AS mes,
        COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) AS entradas,
        COALESCE(SUM(CASE WHEN tipo = 'saida'   THEN valor ELSE 0 END), 0) AS saidas
      FROM transacoes
      WHERE usuario_id = $1
        AND EXTRACT(YEAR FROM data) = $2
        AND tipo IN ('entrada', 'saida')
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

    // ── Categorias do mês ────────────────────────────────────────
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
      LIMIT 6
    `, [usuarioId, mes, ano]);

    const totalCategorias = categoriasResult.rows.reduce((s, r) => s + parseFloat(r.total), 0);

    // ── Maior gasto do mês ───────────────────────────────────────
    const maiorGastoResult = await db.query(`
      SELECT descricao, valor, COALESCE(categoria, 'Outros') AS categoria
      FROM transacoes
      WHERE usuario_id = $1
        AND tipo = 'saida'
        AND EXTRACT(MONTH FROM data) = $2
        AND EXTRACT(YEAR  FROM data) = $3
      ORDER BY valor DESC
      LIMIT 1
    `, [usuarioId, mes, ano]);

    const maiorGasto = maiorGastoResult.rows[0] || null;

    const maiorGastoAntResult = await db.query(`
      SELECT valor FROM transacoes
      WHERE usuario_id = $1
        AND tipo = 'saida'
        AND EXTRACT(MONTH FROM data) = $2
        AND EXTRACT(YEAR  FROM data) = $3
      ORDER BY valor DESC LIMIT 1
    `, [usuarioId, mesAnt, anoAnt]);
    const maiorGastoAnt = maiorGastoAntResult.rows[0]?.valor || 0;
    const tendenciaMaiorGasto = maiorGastoAnt > 0 && maiorGasto
      ? Math.round(((parseFloat(maiorGasto.valor) - parseFloat(maiorGastoAnt)) / parseFloat(maiorGastoAnt)) * 100)
      : 0;

    // ── Resumo Jan–mês selecionado ───────────────────────────────
    const resumoResult = await db.query(`
      SELECT
        EXTRACT(MONTH FROM data) AS mes,
        COALESCE(SUM(CASE WHEN tipo = 'entrada'      THEN valor ELSE 0 END), 0) AS entradas,
        COALESCE(SUM(CASE WHEN tipo = 'saida'        THEN valor ELSE 0 END), 0) AS saidas,
        COALESCE(SUM(CASE WHEN tipo = 'investimento' THEN valor ELSE 0 END), 0) AS aportes
      FROM transacoes
      WHERE usuario_id = $1
        AND EXTRACT(YEAR  FROM data) = $2
        AND EXTRACT(MONTH FROM data) <= $3
      GROUP BY EXTRACT(MONTH FROM data)
      ORDER BY mes
    `, [usuarioId, ano, mes]);

    const totalEntradas  = resumoResult.rows.reduce((s, r) => s + parseFloat(r.entradas), 0);
    const totalSaidas    = resumoResult.rows.reduce((s, r) => s + parseFloat(r.saidas),   0);
    const totalAportes   = resumoResult.rows.reduce((s, r) => s + parseFloat(r.aportes),  0);
    const totalSaldo     = totalEntradas - totalSaidas;
    const mesesComDados  = resumoResult.rows.length || 1;
    const taxaPoupanca   = totalEntradas > 0 ? ((totalSaldo / totalEntradas) * 100).toFixed(1) : '0';
    const pctInvestRenda = totalEntradas > 0 ? ((totalAportes / totalEntradas) * 100).toFixed(1) : '0';

    // Melhor e pior mês
    const melhorMesIdx = saldoPorMes.reduce((best, d, i) =>
      d && (!saldoPorMes[best] || d.sd > (saldoPorMes[best]?.sd ?? -Infinity)) ? i : best, 0);
    const piorMesIdx = saldoPorMes.reduce((worst, d, i) =>
      d && (!saldoPorMes[worst] || d.sd < (saldoPorMes[worst]?.sd ?? Infinity)) ? i : worst, 0);

    // Maior impacto no período
    const maiorImpactoResult = await db.query(`
      SELECT
        COALESCE(categoria, 'Outros') AS categoria,
        SUM(valor) AS total
      FROM transacoes
      WHERE usuario_id = $1
        AND tipo = 'saida'
        AND EXTRACT(YEAR  FROM data) = $2
        AND EXTRACT(MONTH FROM data) <= $3
      GROUP BY categoria
      ORDER BY total DESC
      LIMIT 1
    `, [usuarioId, ano, mes]);
    const maiorImpacto = maiorImpactoResult.rows[0] || null;

    // ── Score ─────────────────────────────────────────────────────
    const pctTeto = entradas > 0 ? (saidas / entradas) * 100 : 0;
    let score = 100;
    if (saldo < 0)         score -= 30;
    if (pctTeto > 100)     score -= 20;
    else if (pctTeto > 90) score -= 10;
    else if (pctTeto > 80) score -= 5;
    if (aportesMes === 0)  score -= 10;
    score = Math.max(0, Math.min(100, score));

    const status = score >= 75 ? 'ok' : score >= 55 ? 'atencao' : 'critico';
    const cor    = score >= 75 ? '#16A34A' : score >= 55 ? '#F59E0B' : '#EF4444';

    // ── Resposta ──────────────────────────────────────────────────
    return res.json({
      periodo: { mes, ano },

      // KPIs linha 2
      entradas: { valor: entradas, sub: 'Salário + extras', tendencia: pctEntradas },
      saidas:   { valor: saidas,   sub: 'Total de gastos',  tendencia: pctSaidas },
      saldo:    { valor: saldo, pctRenda: entradas > 0 ? parseFloat(((saldo / entradas) * 100).toFixed(1)) : 0, melhorMes: saldo >= saldoAnt },

      // Campos legados
      e: entradas, s: saidas, sd: saldo,
      score, cor, status,

      // Linha 1 — cards coloridos
      investimentos: {
        aporteMes: aportesMes,
        aportePctRenda: entradas > 0 ? parseFloat(((aportesMes / entradas) * 100).toFixed(1)) : 0,
        aporteVsAnterior: aportesMes - aportesAnt,
        aportePctVsAnterior: pctAportes,
        vsMediaSemestral: 0,
        patrimonioTotal,
        patrimonioVsMes,
        patrimonioVsAno: patrimonioCrescimentoAno,
      },
      reserva:       { valor: 0, metaValor: 12000, pctMeta: 0, mesesCobertos: 0 },
      metasAtivas:   { total: 0, resumo: 'Nenhuma meta cadastrada', barras: [] },
      limiteRestante: { valor: 0, pctRestante: 0, teto: 0 },

      tetoGastos: { pct: Math.round(pctTeto), gasto: saidas, teto: entradas },

      maiorGasto: maiorGasto ? {
        nome:      maiorGasto.descricao,
        descricao: maiorGasto.descricao,
        valor:     parseFloat(maiorGasto.valor),
        categoria: maiorGasto.categoria,
        pctSaidas: saidas > 0 ? parseFloat(((parseFloat(maiorGasto.valor) / saidas) * 100).toFixed(1)) : 0,
        tendencia: tendenciaMaiorGasto,
      } : null,

      saldoPorMes,

      categorias: {
        maiorImpacto: categoriasResult.rows[0] ? {
          nome:      categoriasResult.rows[0].categoria,
          valor:     parseFloat(categoriasResult.rows[0].total),
          pct:       totalCategorias > 0 ? parseFloat(((parseFloat(categoriasResult.rows[0].total) / totalCategorias) * 100).toFixed(1)) : 0,
          tendencia: 0,
        } : null,
        lista: categoriasResult.rows.map(r => ({
          nome:  r.categoria,
          valor: parseFloat(r.total),
          pct:   totalCategorias > 0 ? parseFloat(((parseFloat(r.total) / totalCategorias) * 100).toFixed(1)) : 0,
          cor:   '#6B7280',
        })),
        total: totalCategorias,
      },

      saudeFinanceira: [
        { lbl: 'Poupança', val: `${entradas > 0 ? ((saldo/entradas)*100).toFixed(1) : 0}%`, cor: saldo >= 0 ? '#16A34A' : '#EF4444', pct: entradas > 0 ? Math.round((saldo/entradas)*100) : 0, ctx: `Meta 20% · Jan–${MESES_ABREV[mes-1]} ${ano}` },
        { lbl: 'Teto',     val: `${Math.round(pctTeto)}%`, cor: pctTeto < 80 ? '#16A34A' : pctTeto < 100 ? '#F59E0B' : '#EF4444', pct: Math.min(Math.round(pctTeto), 100), ctx: saidas > 0 ? `R$ ${Math.round(entradas - saidas).toLocaleString('pt-BR')} disponíveis` : 'Sem gastos' },
        { lbl: 'Metas',    val: '0%',  cor: '#9CA3AF', pct: 0,  ctx: 'Nenhuma meta cadastrada' },
        { lbl: 'Reserva',  val: '0 meses', cor: '#EF4444', pct: 0, ctx: 'Ideal 6 meses · sem dados' },
      ],

      comparativos: {
        vsMesAnterior: {
          label: `VS ${MESES_ABREV[mesAnt - 1]} ${anoAnt}`,
          entradas: pctEntradas >= 0 ? `+${pctEntradas}%` : `${pctEntradas}%`,
          saidas:   pctSaidas   >= 0 ? `+${pctSaidas}%`   : `${pctSaidas}%`,
          saldo:    saldo >= saldoAnt ? 'melhor' : 'pior',
          corE:   pctEntradas >= 0 ? '#16A34A' : '#EF4444',
          corS:   pctSaidas   <= 0 ? '#16A34A' : '#EF4444',
          corSal: saldo >= saldoAnt  ? '#3B82F6' : '#EF4444',
        },
        vsMedia: {
          label: `VS Média Jan–${MESES_ABREV[mes - 1]}`,
          entradas: '+0%', saidas: '+0%', poupanca: 'calculando',
          corE: '#9CA3AF', corS: '#9CA3AF', corP: '#9CA3AF',
        },
      },

      comparativoPerfil: { pctPerfil: 12, pctVoce: entradas > 0 ? parseFloat(((saldo/entradas)*100).toFixed(1)) : 0 },

      radarFinanceiro: [],

      metasAndamento: [],

      scoreFinanceiro: score,

      acaoAgora: [
        aportesMes === 0
          ? { txt: 'Nenhum investimento registrado neste mês. Considere aportar algo.', btn: 'Ver planejamento' }
          : { txt: `Aporte de R$ ${Math.round(aportesMes).toLocaleString('pt-BR')} registrado este mês. Bom trabalho!`, btn: 'Ver planejamento' },
        saldo < 0
          ? { txt: 'Saldo negativo este mês. Revise seus gastos para equilibrar as contas.', btn: 'Ver cartões' }
          : { txt: `Saldo positivo de R$ ${Math.round(saldo).toLocaleString('pt-BR')} em ${MESES_ABREV[mes-1]}/${ano}.`, btn: 'Ver fluxo' },
      ],

      resumoPeriodo: {
        titulo: `Resumo ${ano}`,
        intervalo: `Jan – ${MESES_ABREV[mes - 1]}`,
        diagnostico: status === 'ok' ? 'Saudável' : status === 'atencao' ? 'Em atenção' : 'Crítico',
        entradasTotal:    totalEntradas,
        entradasMediaMes: parseFloat((totalEntradas / mesesComDados).toFixed(2)),
        saidasTotal:      totalSaidas,
        saidasMediaMes:   parseFloat((totalSaidas / mesesComDados).toFixed(2)),
        saldoPeriodo:     totalSaldo,
        taxaPoupancaPeriodo: parseFloat(taxaPoupanca),
        saldoMesSelecionado: saldo,
        melhorMes: saldoPorMes[melhorMesIdx] ? MESES_ABREV[melhorMesIdx] : null,
        maiorImpactoNome:        maiorImpacto?.categoria || null,
        maiorImpactoValor:       maiorImpacto ? parseFloat(maiorImpacto.total) : 0,
        maiorImpactoPercentual:  maiorImpacto && totalSaidas > 0
          ? parseFloat(((parseFloat(maiorImpacto.total) / totalSaidas) * 100).toFixed(1))
          : 0,
        investimentosPeriodo:         totalAportes,
        investimentosPercentualRenda:  parseFloat(pctInvestRenda),
        patrimonioCrescimentoPercentual: patrimonioCrescimentoAno,
        scoreMedio: score,
        piorMes: saldoPorMes[piorMesIdx] ? MESES_ABREV[piorMesIdx] : null,
      },
    });
  } catch (err) {
    console.error('dashboardController error:', err);
    return res.status(500).json({ error: 'Erro interno ao carregar dashboard.' });
  }
}

async function atualizarPatrimonio(req, res) {
  try {
    const usuarioId = req.userId;
    const { patrimonio_total, data_referencia, observacao } = req.body;
    if (!patrimonio_total || !data_referencia) {
      return res.status(400).json({ error: 'patrimonio_total e data_referencia são obrigatórios.' });
    }
    const result = await db.query(
      `INSERT INTO investimentos (usuario_id, patrimonio_total, data_referencia, observacao)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [usuarioId, patrimonio_total, data_referencia, observacao || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('atualizarPatrimonio error:', err);
    return res.status(500).json({ error: 'Erro ao salvar patrimônio.' });
  }
}

module.exports = { getDashboardCompleto, atualizarPatrimonio };
