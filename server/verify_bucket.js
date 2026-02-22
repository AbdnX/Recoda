const { createPgClient } = require('./db');

async function check() {
  const client = createPgClient();

  try {
    await client.connect();
    
    // Check buckets
    const res = await client.query("SELECT * FROM storage.buckets WHERE id = 'recordings'");
    console.log('Bucket:', res.rows[0]);

    if (res.rows.length === 0) {
      console.log('Creating bucket...');
      await client.query(`
        INSERT INTO storage.buckets (id, name, public) 
        VALUES ('recordings', 'recordings', false);
      `);
      console.log('Bucket created.');
    }

    // Check policies
    const policies = await client.query("SELECT * FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'");
    console.log('Policies:', policies.rows.map(p => p.policyname));

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

check();
