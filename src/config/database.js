const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.qijaeudgkcnetlzprtcw:r249713s32jUdXo5@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Erro no PostgreSQL:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};