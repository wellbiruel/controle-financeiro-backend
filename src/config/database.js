const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.qijaeudgkcnetlzprtcw:r249713s32jUdXo5@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

pool.on('error', (err) => {
  console.error('Erro no PostgreSQL:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};