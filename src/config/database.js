const { Pool } = require('pg');

const pool = new Pool({
  host: 'db.qjjaeudgkcnetlzprtcw.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Abaia86702030',
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Erro no PostgreSQL:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};