const express = require('express');
const { listarTransacoes, criarTransacao, deletarTransacao, getResumoSaidas } = require('../controllers/transacaoController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/resumo-saidas', authenticateToken, getResumoSaidas);
router.get('/', authenticateToken, listarTransacoes);
router.post('/', authenticateToken, criarTransacao);
router.delete('/:id', authenticateToken, deletarTransacao);

module.exports = router;
