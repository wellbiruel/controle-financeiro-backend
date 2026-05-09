const pool = require('../config/database');

// Retorna array de 12 meses com PL computado para o ano dado.
// Cada item: { mes, ano, valor, manual, movimentacoes[] }
// - manual: true se o mês tem ao menos um movimento próprio
// - valor: null se não há histórico algum; herdado do mês anterior se manual=false
async function getPatrimonioLiquidoPorPeriodo(usuarioId, ano) {
  const [{ rows: thisYear }, { rows: prevYears }] = await Promise.all([
    pool.query(
      `SELECT id, mes, tipo, valor::float, descricao, criado_em
       FROM patrimonio_liquido_movimentacoes
       WHERE usuario_id = $1 AND ano = $2
       ORDER BY mes, criado_em`,
      [usuarioId, ano]
    ),
    pool.query(
      `SELECT tipo, valor::float
       FROM patrimonio_liquido_movimentacoes
       WHERE usuario_id = $1 AND ano < $2
       ORDER BY ano ASC, mes ASC, criado_em ASC`,
      [usuarioId, ano]
    ),
  ]);

  // Computa PL semente a partir de todos os movimentos anteriores ao ano
  let valorAnterior = null;
  for (const r of prevYears) {
    if      (r.tipo === 'valor_total') valorAnterior = r.valor;
    else if (r.tipo === 'adicionar')   valorAnterior = (valorAnterior ?? 0) + r.valor;
    else if (r.tipo === 'retirar')     valorAnterior = (valorAnterior ?? 0) - r.valor;
  }

  const resultado = [];
  for (let m = 1; m <= 12; m++) {
    const movs = thisYear.filter(r => r.mes === m);
    if (movs.length === 0) {
      resultado.push({ mes: m, ano, valor: valorAnterior, manual: false, movimentacoes: [] });
    } else {
      let pl = valorAnterior;
      for (const mov of movs) {
        if      (mov.tipo === 'valor_total') pl = mov.valor;
        else if (mov.tipo === 'adicionar')   pl = (pl ?? 0) + mov.valor;
        else if (mov.tipo === 'retirar')     pl = (pl ?? 0) - mov.valor;
      }
      valorAnterior = pl;
      resultado.push({ mes: m, ano, valor: pl, manual: true, movimentacoes: movs });
    }
  }
  return resultado;
}

module.exports = { getPatrimonioLiquidoPorPeriodo };
