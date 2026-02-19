const { Client } = require('pg');

const connectionString = 'postgresql://postgres.bcmtpbpniajwvtyftpxs:Sumayyah21%40@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

async function checkStorage() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    console.log('--- Buckets ---');
    const buckets = await client.query('SELECT id, name, public FROM storage.buckets;');
    console.table(buckets.rows);

    console.log('--- Storage Policies ---');
    const policies = await client.query("SELECT * FROM pg_policies WHERE schemaname = 'storage';");
    console.table(policies.rows);

    // List recordings table just in case
    console.log('--- Recordings Table ---');
    const tables = await client.query("SELECT * FROM information_schema.tables WHERE table_name = 'recordings';");
    console.table(tables.rows);

  } catch (err) {
    console.error('Check failed:', err.message);
  } finally {
    await client.end();
  }
}

checkStorage();
