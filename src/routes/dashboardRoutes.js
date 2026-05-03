const express = require('express');
const router  = express.Router();
const { getDashboardCompleto } = require('../controllers/dashboardController');
const authenticateToken        = require('../middleware/authMiddleware');

router.get('/completo', authenticateToken, getDashboardCompleto);

module.exports = router;
