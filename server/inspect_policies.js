const { Client } = require('pg');

const connectionString = 'postgresql://postgres.bcmtpbpniajwvtyftpxs:Sumayyah21%40@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

async function check() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    // Check policies with definitions
    const res = await client.query(`
      SELECT policyname, permissive, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE schemaname = 'storage' AND tablename = 'objects'
    `);
    console.log(JSON.stringify(res.rows, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

check();
