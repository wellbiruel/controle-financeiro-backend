const db = require('../config/database');

async function createUser(email, passwordHash, nome) {
  const result = await db.query(
    'INSERT INTO usuarios (email, senha_hash, nome) VALUES ($1, $2, $3) RETURNING id, email, nome, data_registro',
    [email, passwordHash, nome]
  );
  return result.rows[0];
}

async function findUserByEmail(email) {
  const result = await db.query('SELECT * FROM usuarios WHERE email = $1', [email]);
  return result.rows[0];
}

async function findUserById(id) {
  const result = await db.query('SELECT id, email, nome FROM usuarios WHERE id = $1', [id]);
  return result.rows[0];
}

async function updatePassword(id, newHash) {
  await db.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [newHash, id]);
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  updatePassword,
};