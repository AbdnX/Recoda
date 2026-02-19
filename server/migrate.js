const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Connection string with manual password replacement (better than URL encoding sometimes)
// Project Ref: bcmtpbpniajwvtyftpxs
// Password: Sumayyah21@ (URL encoded @ is %40)
const connectionString = 'postgresql://postgres.bcmtpbpniajwvtyftpxs:Sumayyah21%40@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

const sqlPath = path.join(__dirname, '../supabase_schema.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function migrate() {
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

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
        VALUES ('recordings', 'recordings', true)
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
