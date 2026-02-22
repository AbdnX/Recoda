const fs = require('fs');
const path = require('path');
const { createPgClient } = require('./db');

const sqlPath = path.join(__dirname, '../supabase_schema.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function migrate() {
  const client = createPgClient();

  try {
    console.log('🔗 Connecting to Supabase Database via Pooler...');
    await client.connect();
    console.log('✅ Connected.');

    console.log('🚀 Running migration script...');
    await client.query(sql);
    console.log('✅ SQL Migration complete.');

    // Attempt to create storage bucket via SQL
    console.log('📦 Attempting to create "recordings" storage bucket...');
    try {
      await client.query(`
        INSERT INTO storage.buckets (id, name, public) 
        VALUES ('recordings', 'recordings', false)
        ON CONFLICT (id) DO NOTHING;
      `);
      console.log('✅ Storage bucket ensured.');
    } catch (bucketErr) {
      console.warn('⚠️  Could not create bucket via SQL:', bucketErr.message);
    }

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
