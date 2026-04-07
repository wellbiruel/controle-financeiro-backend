const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.qijaeudgkcnetlzprtcw:Abaia86702030@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Erro no PostgreSQL:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};