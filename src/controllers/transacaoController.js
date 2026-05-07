const db = require('../config/database');

async function listarTransacoes(req, res) {
  try {
    const { mes, ano, tipo } = req.query;
    let query = 'SELECT * FROM transacoes WHERE usuario_id = $1';
    const params = [req.userId];

    if (mes && ano) {
      params.push(parseInt(mes), parseInt(ano));
      query += ` AND EXTRACT(MONTH FROM data) = $${params.length - 1} AND EXTRACT(YEAR FROM data) = $${params.length}`;
    }

    if (tipo && tipo !== 'Todos' && tipo !== 'todos') {
      params.push(tipo);
      query += ` AND tipo = $${params.length}`;
    }

    query += ' ORDER BY data DESC LIMIT 50';

    const result = await db.query(query, params);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Erro ao listar transações:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
}

async function criarTransacao(req, res) {
  const { descricao, valor, tipo, data } = req.body;
  if (!descricao || !valor || !tipo || !data) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }
  try {
    const result = await db.query(
      'INSERT INTO transacoes (usuario_id, descricao, valor, tipo, data) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.userId, descricao, valor, tipo, data]
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

module.exports = { listarTransacoes, criarTransacao, deletarTransacao };
