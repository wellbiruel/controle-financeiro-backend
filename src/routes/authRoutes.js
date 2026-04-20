const express = require('express');
const { register, login, changePassword } = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.put('/senha', authenticateToken, changePassword);

module.exports = router;