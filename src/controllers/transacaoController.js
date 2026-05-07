const db = require('../config/database');

// Retorna o ID de uma categoria existente ou cria uma nova
async function getOrCreateCategoria(userId, nome, tipo) {
  if (!nome) return null;
  const found = await db.query(
    'SELECT id FROM categorias WHERE usuario_id = $1 AND nome = $2',
    [userId, nome]
  );
  if (found.rows.length > 0) return found.rows[0].id;
  const created = await db.query(
    'INSERT INTO categorias (id, usuario_id, nome, tipo) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id',
    [userId, nome, tipo || 'geral']
  );
  return created.rows[0].id;
}

async function listarTransacoes(req, res) {
  try {
    const { mes, ano, tipo, categoria } = req.query;

    let query = `
      SELECT t.*, COALESCE(c.nome, '') AS categoria
      FROM transacoes t
      LEFT JOIN categorias c ON t.categoria_id = c.id
      WHERE t.usuario_id = $1
    `;
    const params = [req.userId];

    if (mes && ano) {
      params.push(parseInt(mes), parseInt(ano));
      query += ` AND EXTRACT(MONTH FROM t.data) = $${params.length - 1} AND EXTRACT(YEAR FROM t.data) = $${params.length}`;
    }

    if (tipo && tipo !== 'Todos' && tipo !== 'todos') {
      params.push(tipo);
      query += ` AND t.tipo = $${params.length}`;
    }

    if (categoria && categoria !== 'Todos' && categoria !== 'todos') {
      params.push(categoria);
      query += ` AND c.nome = $${params.length}`;
    }

    query += ' ORDER BY t.data DESC LIMIT 50';

    const result = await db.query(query, params);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Erro ao listar transações:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
}

async function criarTransacao(req, res) {
  const { descricao, valor, tipo, data, categoria } = req.body;
  if (!descricao || !valor || !tipo || !data) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }
  try {
    const categoriaId = categoria
      ? await getOrCreateCategoria(req.userId, categoria, tipo)
      : null;

    const result = await db.query(
      'INSERT INTO transacoes (usuario_id, descricao, valor, tipo, data, categoria_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.userId, descricao, valor, tipo, data, categoriaId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar transação:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
}

async function deletarTransacao(req, res) {
  try {
    const { id } = req.params;
    await db.query(
      'DELETE FROM transacoes WHERE id = $1 AND usuario_id = $2',
      [id, req.userId]
    );
    res.status(200).json({ message: 'Transação removida.' });
  } catch (error) {
    console.error('Erro ao deletar transação:', error);
    res.status(500).json({ message: 'Erro interno.' });
  }
}

async function getResumoSaidas(req, res) {
  try {
    const usuarioId = req.userId;
    const mes    = parseInt(req.query.mes)  || new Date().getMonth() + 1;
    const ano    = parseInt(req.query.ano)  || new Date().getFullYear();
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const anoAnt = mes === 1 ? ano - 1 : ano;

    const [totalRes, totalAntRes, catRes, maiorRes, graficoRes, mediaRes] = await Promise.all([
      db.query(`
        SELECT COALESCE(SUM(valor),0) AS total FROM transacoes
        WHERE usuario_id=$1 AND tipo='saida'
          AND EXTRACT(MONTH FROM data)=$2 AND EXTRACT(YEAR FROM data)=$3
      `, [usuarioId, mes, ano]),

      db.query(`
        SELECT COALESCE(SUM(valor),0) AS total FROM transacoes
        WHERE usuario_id=$1 AND tipo='saida'
          AND EXTRACT(MONTH FROM data)=$2 AND EXTRACT(YEAR FROM data)=$3
      `, [usuarioId, mesAnt, anoAnt]),

      db.query(`
        SELECT COALESCE(c.nome,'Outros') AS categoria, SUM(t.valor) AS total
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id=$1 AND t.tipo='saida'
          AND EXTRACT(MONTH FROM t.data)=$2 AND EXTRACT(YEAR FROM t.data)=$3
        GROUP BY c.nome ORDER BY total DESC
      `, [usuarioId, mes, ano]),

      db.query(`
        SELECT t.descricao, t.valor, COALESCE(c.nome,'Outros') AS categoria
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.usuario_id=$1 AND t.tipo='saida'
          AND EXTRACT(MONTH FROM t.data)=$2 AND EXTRACT(YEAR FROM t.data)=$3
        ORDER BY t.valor DESC LIMIT 1
      `, [usuarioId, mes, ano]),

      db.query(`
        SELECT EXTRACT(MONTH FROM data) AS mes, COALESCE(SUM(valor),0) AS total
        FROM transacoes
        WHERE usuario_id=$1 AND tipo='saida' AND EXTRACT(YEAR FROM data)=$2
        GROUP BY EXTRACT(MONTH FROM data) ORDER BY mes
      `, [usuarioId, ano]),

      db.query(`
        SELECT COALESCE(AVG(total),0) AS media FROM (
          SELECT EXTRACT(MONTH FROM data) AS m, SUM(valor) AS total
          FROM transacoes WHERE usuario_id=$1 AND tipo='saida'
            AND EXTRACT(YEAR FROM data)=$2
          GROUP BY EXTRACT(MONTH FROM data)
        ) t
      `, [usuarioId, ano]),
    ]);

    const total    = parseFloat(totalRes.rows[0].total);
    const totalAnt = parseFloat(totalAntRes.rows[0].total);
    const variacao = total - totalAnt;
    const variacaoPct = totalAnt > 0 ? ((variacao / totalAnt) * 100).toFixed(1) : 0;
    const maiorCat  = catRes.rows[0]    || null;
    const maiorGasto = maiorRes.rows[0] || null;

    const graficoAnual = Array.from({ length: 12 }, (_, i) => {
      const found = graficoRes.rows.find(r => parseInt(r.mes) === i + 1);
      return { mes: i + 1, total: found ? parseFloat(found.total) : null };
    });

    return res.json({
      totalMes: total,
      maiorCategoria: maiorCat
        ? { nome: maiorCat.categoria, total: parseFloat(maiorCat.total), pct: total > 0 ? ((parseFloat(maiorCat.total) / total) * 100).toFixed(1) : 0 }
        : null,
      maiorGasto: maiorGasto
        ? { descricao: maiorGasto.descricao, valor: parseFloat(maiorGasto.valor), categoria: maiorGasto.categoria, pct: total > 0 ? ((parseFloat(maiorGasto.valor) / total) * 100).toFixed(1) : 0 }
        : null,
      variacao: { valor: variacao, pct: Number(variacaoPct) },
      mediaMensalAno: parseFloat(mediaRes.rows[0].media),
      graficoAnual,
      categorias: catRes.rows.map(r => ({
        nome: r.categoria,
        total: parseFloat(r.total),
        pct: total > 0 ? ((parseFloat(r.total) / total) * 100).toFixed(1) : 0,
      })),
    });
  } catch (err) {
    console.error('getResumoSaidas error:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}

module.exports = { listarTransacoes, criarTransacao, deletarTransacao, getResumoSaidas };
