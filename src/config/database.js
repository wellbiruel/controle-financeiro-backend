const { Pool } = require('pg');

console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'OK' : 'MISSING');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Erro no PostgreSQL:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};