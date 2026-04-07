const db = require('../config/database');

async function listarTransacoes(req, res) {
  try {
    const result = await db.query(
      'SELECT * FROM transacoes WHERE usuario_id = $1 ORDER BY data DESC',
      [req.userId]
    );
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

module.exports = { listarTransacoes, criarTransacao };