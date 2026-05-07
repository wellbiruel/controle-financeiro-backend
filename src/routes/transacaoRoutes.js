const express = require('express');
const { listarTransacoes, criarTransacao, deletarTransacao } = require('../controllers/transacaoController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, listarTransacoes);
router.post('/', authenticateToken, criarTransacao);
router.delete('/:id', authenticateToken, deletarTransacao);

module.exports = router;
