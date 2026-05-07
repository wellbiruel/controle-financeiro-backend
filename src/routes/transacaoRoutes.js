const express = require('express');
const { listarTransacoes, criarTransacao, atualizarTransacao, deletarTransacao, getResumoSaidas } = require('../controllers/transacaoController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/resumo-saidas', authenticateToken, getResumoSaidas);
router.get('/', authenticateToken, listarTransacoes);
router.post('/', authenticateToken, criarTransacao);
router.put('/:id', authenticateToken, atualizarTransacao);
router.delete('/:id', authenticateToken, deletarTransacao);

module.exports = router;
