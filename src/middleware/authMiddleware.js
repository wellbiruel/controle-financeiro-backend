const { verifyToken } = require('../utils/jwtUtils');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Token não fornecido.' });

  const user = verifyToken(token);
  if (!user) return res.status(403).json({ message: 'Token inválido ou expirado.' });

  req.usuario = user;
  req.userId = user.id;
  next();
}

module.exports = authenticateToken;