const express = require('express');
const { listarTransacoes, criarTransacao } = require('../controllers/transacaoController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, listarTransacoes);
router.post('/', authenticateToken, criarTransacao);

module.exports = router;