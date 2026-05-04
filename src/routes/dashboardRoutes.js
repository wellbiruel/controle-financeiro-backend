const express = require('express');
const router  = express.Router();
const { getDashboardCompleto, atualizarPatrimonio } = require('../controllers/dashboardController');
const authenticateToken = require('../middleware/authMiddleware');

router.get('/completo',    authenticateToken, getDashboardCompleto);
router.post('/patrimonio', authenticateToken, atualizarPatrimonio);

module.exports = router;
