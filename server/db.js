const { Client } = require('pg');
require('dotenv').config();

function getConnectionString() {
  return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
}

function createPgClient() {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error('Missing SUPABASE_DB_URL (or DATABASE_URL) environment variable');
  }

  return new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
}

module.exports = { createPgClient };
