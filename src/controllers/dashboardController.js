const db = require('../config/database');
const { getPatrimonioLiquidoPorPeriodo } = require('../services/patrimonioService');

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

async function getDashboardCompleto(req, res) {
  try {
    const usuarioId = req.userId;
    const mes = parseInt(req.query.mes) || new Date().getMonth() + 1;
    const ano = parseInt(req.query.ano) || new Date().getFullYear();
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const anoAnt = mes === 1 ? ano - 1 : ano;

    // Todas as queries rodam em paralelo — nenhuma depende do resultado de outra
    const [
      kpisRes,
      kpisAntRes,
      patrimonioRes,
      patInicioRes,
      saldoPorMesRes,
      categoriasRes,
      maiorGastoRes,
      maiorGastoAntRes,
      resumoRes,
      maiorImpactoRes,
      patrimonioHistRes,
      reservaRes,
      reservaAntRes,
      patrimonioHistAntRes,
    ] = await Promise.all([

      // 1. KPIs do mês atual (aportes excluem Reserva de Segurança)
      db.query(`
        SELECT
          COALESCE(SUM(CASE WHEN t.tipo = 'entrada' THEN t.valor ELSE 0 END), 0) AS entradas,
          COALESCE(SUM(CASE WHEN t.tipo = 'saida'   THEN t.valor ELSE 0 END), 0) AS saidas,
          COALESCE(SUM(CASE WHEN t.tipo = 'investimento'
            AND (c.nome IS NULL OR c.nome != 'Reserva de Segurança')
            THEN t.valor ELSE 0 END), 0) AS aportes_mes
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND EXTRACT(MONTH FROM t.data) = $2
          AND EXTRACT(YEAR  FROM t.data) = $3
      `, [usuarioId, mes, ano]),

      // 2. KPIs do mês anterior (comparativos, mesma exclusão)
      db.query(`
        SELECT
          COALESCE(SUM(CASE WHEN t.tipo = 'entrada' THEN t.valor ELSE 0 END), 0) AS entradas,
          COALESCE(SUM(CASE WHEN t.tipo = 'saida'   THEN t.valor ELSE 0 END), 0) AS saidas,
          COALESCE(SUM(CASE WHEN t.tipo = 'investimento'
            AND (c.nome IS NULL OR c.nome != 'Reserva de Segurança')
            THEN t.valor ELSE 0 END), 0) AS aportes
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND EXTRACT(MONTH FROM t.data) = $2
          AND EXTRACT(YEAR  FROM t.data) = $3
      `, [usuarioId, mesAnt, anoAnt]),

      // 3. Patrimônio acumulado até o mês selecionado (excluindo Reserva de Segurança)
      db.query(`
        SELECT COALESCE(SUM(t.valor), 0) AS patrimonio_total
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND t.tipo = 'investimento'
          AND (c.nome IS NULL OR c.nome != 'Reserva de Segurança')
          AND (
            EXTRACT(YEAR FROM t.data) < $2
            OR (EXTRACT(YEAR FROM t.data) = $2 AND EXTRACT(MONTH FROM t.data) <= $3)
          )
      `, [usuarioId, ano, mes]),

      // 4. Patrimônio ao final de Janeiro do ano selecionado — base do crescimento anual
      db.query(`
        SELECT COALESCE(SUM(t.valor), 0) AS patrimonio_total
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND t.tipo = 'investimento'
          AND (c.nome IS NULL OR c.nome != 'Reserva de Segurança')
          AND (
            EXTRACT(YEAR FROM t.data) < $2
            OR (EXTRACT(YEAR FROM t.data) = $2 AND EXTRACT(MONTH FROM t.data) <= 1)
          )
      `, [usuarioId, ano]),

      // 5. Saldo por mês do ano (gráfico)
      db.query(`
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
      `, [usuarioId, ano]),

      // 6. Categorias de saída do mês (pizza)
      db.query(`
        SELECT COALESCE(c.nome, 'Outros') AS categoria, SUM(t.valor) AS total
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND t.tipo = 'saida'
          AND EXTRACT(MONTH FROM t.data) = $2
          AND EXTRACT(YEAR  FROM t.data) = $3
        GROUP BY c.nome
        ORDER BY total DESC
        LIMIT 6
      `, [usuarioId, mes, ano]),

      // 7. Maior gasto do mês
      db.query(`
        SELECT t.descricao, t.valor, COALESCE(c.nome, 'Outros') AS categoria
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND t.tipo = 'saida'
          AND EXTRACT(MONTH FROM t.data) = $2
          AND EXTRACT(YEAR  FROM t.data) = $3
        ORDER BY t.valor DESC
        LIMIT 1
      `, [usuarioId, mes, ano]),

      // 8. Maior gasto do mês anterior (tendência)
      db.query(`
        SELECT valor FROM transacoes
        WHERE usuario_id = $1
          AND tipo = 'saida'
          AND EXTRACT(MONTH FROM data) = $2
          AND EXTRACT(YEAR  FROM data) = $3
        ORDER BY valor DESC LIMIT 1
      `, [usuarioId, mesAnt, anoAnt]),

      // 9. Resumo Jan–mês atual (acumulado do ano, aportes excluem Reserva)
      db.query(`
        SELECT
          EXTRACT(MONTH FROM t.data) AS mes,
          COALESCE(SUM(CASE WHEN t.tipo = 'entrada' THEN t.valor ELSE 0 END), 0) AS entradas,
          COALESCE(SUM(CASE WHEN t.tipo = 'saida'   THEN t.valor ELSE 0 END), 0) AS saidas,
          COALESCE(SUM(CASE WHEN t.tipo = 'investimento'
            AND (c.nome IS NULL OR c.nome != 'Reserva de Segurança')
            THEN t.valor ELSE 0 END), 0) AS aportes
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND EXTRACT(YEAR  FROM t.data) = $2
          AND EXTRACT(MONTH FROM t.data) <= $3
        GROUP BY EXTRACT(MONTH FROM t.data)
        ORDER BY mes
      `, [usuarioId, ano, mes]),

      // 10. Maior categoria de impacto no período (Jan–mês)
      db.query(`
        SELECT COALESCE(c.nome, 'Outros') AS categoria, SUM(t.valor) AS total
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND t.tipo = 'saida'
          AND EXTRACT(YEAR  FROM t.data) = $2
          AND EXTRACT(MONTH FROM t.data) <= $3
        GROUP BY c.nome
        ORDER BY total DESC
        LIMIT 1
      `, [usuarioId, ano, mes]),

      // 11. Patrimônio histórico via service central — fallback silencioso se tabela não existir
      getPatrimonioLiquidoPorPeriodo(usuarioId, ano).catch(() => []),

      // 12. Reserva de Segurança — saldo acumulado até o mês selecionado
      db.query(`
        SELECT COALESCE(SUM(t.valor), 0) AS reserva_total
        FROM transacoes t
        JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND t.tipo = 'investimento'
          AND c.nome = 'Reserva de Segurança'
          AND (
            EXTRACT(YEAR FROM t.data) < $2
            OR (EXTRACT(YEAR FROM t.data) = $2 AND EXTRACT(MONTH FROM t.data) <= $3)
          )
      `, [usuarioId, ano, mes]),

      // 13. Reserva de Segurança — saldo acumulado até o mês ANTERIOR
      db.query(`
        SELECT COALESCE(SUM(t.valor), 0) AS reserva_total
        FROM transacoes t
        JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id = $1
          AND t.tipo = 'investimento'
          AND c.nome = 'Reserva de Segurança'
          AND (
            EXTRACT(YEAR FROM t.data) < $2
            OR (EXTRACT(YEAR FROM t.data) = $2 AND EXTRACT(MONTH FROM t.data) <= $3)
          )
      `, [usuarioId, anoAnt, mesAnt]),

      // 14. Patrimônio do ano anterior — base crescimento anual e Jan vs Dez
      getPatrimonioLiquidoPorPeriodo(usuarioId, ano - 1).catch(() => []),
    ]);

    // ── Processa KPIs ─────────────────────────────────────────────
    const entradas   = parseFloat(kpisRes.rows[0].entradas);
    const saidas     = parseFloat(kpisRes.rows[0].saidas);
    const aportesMes = parseFloat(kpisRes.rows[0].aportes_mes);
    const saldo      = entradas - saidas;

    const entradasAnt = parseFloat(kpisAntRes.rows[0].entradas);
    const saidasAnt   = parseFloat(kpisAntRes.rows[0].saidas);
    const aportesAnt  = parseFloat(kpisAntRes.rows[0].aportes);
    const saldoAnt    = entradasAnt - saidasAnt;

    const pctEntradas = entradasAnt > 0 ? Math.round(((entradas - entradasAnt) / entradasAnt) * 100) : 0;
    const pctSaidas   = saidasAnt   > 0 ? Math.round(((saidas   - saidasAnt)   / saidasAnt)   * 100) : 0;
    const pctAportes  = aportesAnt  > 0 ? Math.round(((aportesMes - aportesAnt) / aportesAnt) * 100) : 0;

    // ── Patrimônio ────────────────────────────────────────────────
    // patrimonioHistRes é array direto (service retorna array, não {rows})
    const patrimonioHistRows  = patrimonioHistRes || [];
    const patrimonioHistorico = patrimonioHistRows; // já é array de 12 meses com {mes,valor,manual}
    // Se existe valor manual para o mês atual, usa ele; senão soma transações
    const patrimonioManualMes = patrimonioHistRows.find(r => r.mes === mes && r.manual);
    const patrimonioSomado    = patrimonioRes.rows.length > 0
      ? parseFloat(patrimonioRes.rows[0].patrimonio_total) : 0;
    const patrimonioTotal     = patrimonioManualMes
      ? patrimonioManualMes.valor
      : patrimonioSomado;

    // ── Variação vs mês anterior (usa service — inclui entradas manuais) ────────
    const patrimonioHistAntRows = Array.isArray(patrimonioHistAntRes) ? patrimonioHistAntRes : [];
    const histMesAntObj = mes === 1
      ? patrimonioHistAntRows.find(r => r.mes === 12)   // Janeiro → Dezembro do ano anterior
      : patrimonioHistRows.find(r => r.mes === mesAnt);  // Demais meses → mesmo ano
    const patrimonioMesAnt = histMesAntObj?.valor ?? null;

    const patrimonioVsMesValor = patrimonioMesAnt !== null ? patrimonioTotal - patrimonioMesAnt : 0;
    const patrimonioVsMesPct = patrimonioMesAnt !== null && patrimonioMesAnt > 0
      ? parseFloat(((patrimonioTotal - patrimonioMesAnt) / patrimonioMesAnt * 100).toFixed(1))
      : (patrimonioTotal > 0 ? 100 : 0);

    // ── Crescimento anual: base = Dezembro do ano anterior ──────────────────────
    const patDezembro = patrimonioHistAntRows.find(r => r.mes === 12)?.valor ?? null;
    let patrimonioCrescimentoAno = 0;
    if (patDezembro !== null && patDezembro > 0) {
      patrimonioCrescimentoAno = Math.round(((patrimonioTotal - patDezembro) / patDezembro) * 100);
    } else if (patrimonioTotal > 0) {
      patrimonioCrescimentoAno = 100;
    }

    // ── Reserva de Segurança ──────────────────────────────────────
    const reservaValor        = parseFloat(reservaRes.rows[0].reserva_total) || 0;
    const reservaMetaValor    = 12000;
    const reservaMeses        = saidas > 0 ? parseFloat((reservaValor / saidas).toFixed(1)) : 0;
    const reservaPctMeta      = reservaMetaValor > 0 ? Math.min(Math.round((reservaValor / reservaMetaValor) * 100), 100) : 0;
    const reservaAntValor     = parseFloat(reservaAntRes.rows[0]?.reserva_total ?? 0);
    const variacaoReserva     = reservaValor - reservaAntValor;
    const variacaoReservaPct  = reservaAntValor > 0
      ? parseFloat(((variacaoReserva / reservaAntValor) * 100).toFixed(1))
      : (reservaValor > 0 ? 100 : 0);
    const estadoReserva       = reservaValor === 0 ? 'zerado' : variacaoReserva > 0 ? 'crescendo' : variacaoReserva < 0 ? 'reduzindo' : 'estavel';

    // ── Radar financeiro — insights dinâmicos ─────────────────────
    const pctTeto = entradas > 0 ? (saidas / entradas) * 100 : 0;
    const radarInsights = [];
    const pctPoupanca = entradas > 0 ? Math.round((saldo / entradas) * 100) : 0;
    const pctAporteRenda = entradas > 0 ? Math.round((aportesMes / entradas) * 100) : 0;

    if (pctTeto >= 100) {
      radarInsights.push({ tipo: 'alert', cat: 'Teto ultrapassado', txt: `Gastos superaram entradas em ${MESES_ABREV[mes-1]} (${Math.round(pctTeto)}%). Revise lançamentos e reduza despesas.`, cta: 'Ver fluxo' });
    } else if (pctTeto >= 80) {
      radarInsights.push({ tipo: 'warn', cat: 'Teto próximo do limite', txt: `${Math.round(pctTeto)}% do orçamento utilizado. Restam R$ ${Math.round(entradas - saidas).toLocaleString('pt-BR')} — evite novos gastos.`, cta: 'Ver fluxo' });
    } else if (entradas > 0) {
      radarInsights.push({ tipo: 'ok', cat: 'Teto sob controle', txt: `Apenas ${Math.round(pctTeto)}% do orçamento utilizado em ${MESES_ABREV[mes-1]}. Bom equilíbrio entre entradas e saídas.`, cta: 'Ver fluxo' });
    }

    if (saldo < 0) {
      radarInsights.push({ tipo: 'alert', cat: 'Déficit no período', txt: `Saídas superaram entradas em R$ ${Math.abs(Math.round(saldo)).toLocaleString('pt-BR')}. Priorize cortar gastos não essenciais.`, cta: 'Ver insights' });
    } else if (pctPoupanca >= 20) {
      radarInsights.push({ tipo: 'ok', cat: 'Poupança saudável', txt: `Guardando ${pctPoupanca}% da renda em ${MESES_ABREV[mes-1]}. Meta atingida! Continue assim para acelerar seus objetivos.`, cta: 'Ver metas' });
    } else if (entradas > 0) {
      radarInsights.push({ tipo: 'info', cat: 'Poupança abaixo da meta', txt: `Guardando ${pctPoupanca}% da renda. Meta recomendada: 20%. Reduzir gastos variáveis pode ajudar.`, cta: 'Ver metas' });
    }

    if (reservaValor === 0) {
      radarInsights.push({ tipo: 'alert', cat: 'Reserva de emergência', txt: `Sem reserva de emergência. O ideal é ter 6 meses de despesas guardados${saidas > 0 ? ` (≈ R$ ${Math.round(saidas * 6).toLocaleString('pt-BR')})` : ''}.`, cta: 'Ajustar' });
    } else if (reservaMeses < 3) {
      radarInsights.push({ tipo: 'warn', cat: 'Reserva insuficiente', txt: `Reserva cobre ${reservaMeses} ${reservaMeses === 1 ? 'mês' : 'meses'}. Recomendado: 6 meses. Continue aportando para aumentá-la.`, cta: 'Ajustar' });
    } else {
      radarInsights.push({ tipo: 'ok', cat: 'Reserva adequada', txt: `Reserva cobre ${reservaMeses} meses de despesas — dentro do recomendado. Mantenha o ritmo de aportes.`, cta: 'Ajustar' });
    }

    if (aportesMes === 0) {
      radarInsights.push({ tipo: 'info', cat: 'Sem aportes no mês', txt: `Nenhum investimento registrado em ${MESES_ABREV[mes-1]}. Investir regularmente é essencial para atingir objetivos financeiros.`, cta: 'Ver metas' });
    } else if (pctAporteRenda >= 10) {
      radarInsights.push({ tipo: 'ok', cat: 'Investindo bem', txt: `Aporte de ${pctAporteRenda}% da renda em ${MESES_ABREV[mes-1]}. Excelente disciplina — patrimônio cresce de forma consistente.`, cta: 'Ver metas' });
    } else {
      radarInsights.push({ tipo: 'info', cat: 'Aporte abaixo do ideal', txt: `Investindo ${pctAporteRenda}% da renda. Meta recomendada: 10–15%. Pequenos aumentos mensais fazem grande diferença.`, cta: 'Ver insights' });
    }

    // ── Saldo por mês ─────────────────────────────────────────────
    const saldoPorMes = Array.from({ length: 12 }, (_, i) => {
      const found = saldoPorMesRes.rows.find(r => parseInt(r.mes) === i + 1);
      if (!found) return null;
      const e = parseFloat(found.entradas);
      const s = parseFloat(found.saidas);
      return { mes: i + 1, e, s, saldo: e - s };
    });

    // ── Categorias ────────────────────────────────────────────────
    const totalCategorias = categoriasRes.rows.reduce((s, r) => s + parseFloat(r.total), 0);

    // ── Maior gasto ───────────────────────────────────────────────
    const maiorGasto    = maiorGastoRes.rows[0] || null;
    const maiorGastoAnt = maiorGastoAntRes.rows[0]?.valor || 0;
    const tendenciaMaiorGasto = maiorGastoAnt > 0 && maiorGasto
      ? Math.round(((parseFloat(maiorGasto.valor) - parseFloat(maiorGastoAnt)) / parseFloat(maiorGastoAnt)) * 100)
      : 0;

    // ── Resumo acumulado ──────────────────────────────────────────
    const totalEntradas = resumoRes.rows.reduce((s, r) => s + parseFloat(r.entradas), 0);
    const totalSaidas   = resumoRes.rows.reduce((s, r) => s + parseFloat(r.saidas),   0);
    const totalAportes  = resumoRes.rows.reduce((s, r) => s + parseFloat(r.aportes),  0);
    const totalSaldo    = totalEntradas - totalSaidas;
    const mesesComDados = resumoRes.rows.length || 1;
    const taxaPoupanca  = totalEntradas > 0 ? ((totalSaldo / totalEntradas) * 100).toFixed(1) : '0';
    const pctInvestRenda = totalEntradas > 0 ? ((totalAportes / totalEntradas) * 100).toFixed(1) : '0';

    // ── Melhor / pior mês ─────────────────────────────────────────
    const melhorMesIdx = saldoPorMes.reduce((best, d, i) =>
      d && (!saldoPorMes[best] || d.saldo > (saldoPorMes[best]?.saldo ?? -Infinity)) ? i : best, 0);
    const piorMesIdx = saldoPorMes.reduce((worst, d, i) =>
      d && (!saldoPorMes[worst] || d.saldo < (saldoPorMes[worst]?.saldo ?? Infinity)) ? i : worst, 0);

    // ── Score financeiro ──────────────────────────────────────────
    let score = 100;
    if (saldo < 0)         score -= 30;
    if (pctTeto > 100)     score -= 20;
    else if (pctTeto > 90) score -= 10;
    else if (pctTeto > 80) score -= 5;
    if (aportesMes === 0)  score -= 10;
    score = Math.max(0, Math.min(100, score));

    const status = score >= 75 ? 'ok' : score >= 55 ? 'atencao' : 'critico';
    const cor    = score >= 75 ? '#16A34A' : score >= 55 ? '#F59E0B' : '#EF4444';

    const maiorImpacto = maiorImpactoRes.rows[0] || null;

    // ── Resposta ──────────────────────────────────────────────────
    return res.json({
      periodo: { mes, ano },

      entradas: { valor: entradas, sub: 'Salário + extras', tendencia: pctEntradas },
      saidas:   { valor: saidas,   sub: 'Total de gastos',  tendencia: pctSaidas },
      saldo:    { valor: saldo, pctRenda: entradas > 0 ? parseFloat(((saldo / entradas) * 100).toFixed(1)) : 0, melhorMes: saldo >= saldoAnt },

      e: entradas, s: saidas, sd: saldo,
      score, cor, status,

      investimentos: {
        aporteMes: aportesMes,
        aportePctRenda: entradas > 0 ? parseFloat(((aportesMes / entradas) * 100).toFixed(1)) : 0,
        aporteVsAnterior: aportesMes - aportesAnt,
        aportePctVsAnterior: pctAportes,
        vsMediaSemestral: 0,
        patrimonioTotal,
        patrimonioHistorico,
        patrimonioVsMes: patrimonioVsMesValor,
        patrimonioVsMesPct,
        patrimonioVsAno: patrimonioCrescimentoAno,
      },
      reserva:       { valor: reservaValor, metaValor: reservaMetaValor, pctMeta: reservaPctMeta, mesesCobertos: reservaMeses, variacao: variacaoReserva, variacaoPct: variacaoReservaPct, estado: estadoReserva },
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
        maiorImpacto: categoriasRes.rows[0] ? {
          nome:      categoriasRes.rows[0].categoria,
          valor:     parseFloat(categoriasRes.rows[0].total),
          pct:       totalCategorias > 0 ? parseFloat(((parseFloat(categoriasRes.rows[0].total) / totalCategorias) * 100).toFixed(1)) : 0,
          tendencia: 0,
        } : null,
        lista: categoriasRes.rows.map(r => ({
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
        { lbl: 'Metas',    val: '0%',      cor: '#9CA3AF', pct: 0, ctx: 'Nenhuma meta cadastrada' },
        { lbl: 'Reserva',  val: `${reservaMeses} ${reservaMeses === 1 ? 'mês' : 'meses'}`, cor: reservaMeses >= 6 ? '#16A34A' : reservaMeses >= 3 ? '#F59E0B' : '#EF4444', pct: Math.min(Math.round((reservaMeses / 6) * 100), 100), ctx: `Ideal 6 meses · ${reservaValor > 0 ? `R$ ${Math.round(reservaValor).toLocaleString('pt-BR')}` : 'sem dados'}` },
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

      radarFinanceiro: radarInsights,
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
          ? parseFloat(((parseFloat(maiorImpacto.total) / totalSaidas) * 100).toFixed(1)) : 0,
        investimentosPeriodo:              totalAportes,
        investimentosPercentualRenda:      parseFloat(pctInvestRenda),
        patrimonioCrescimentoPercentual:   patrimonioCrescimentoAno,
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
