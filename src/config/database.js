const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
console.log('DATABASE_URL recebida:', connectionString ? 'SIM' : 'NÃO');

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Erro no PostgreSQL:', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};