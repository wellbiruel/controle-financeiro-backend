const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'financeiro_amanda_well_2026_secreto';

function generateToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken,
};