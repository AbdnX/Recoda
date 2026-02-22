const { createPgClient } = require('./db');

async function check() {
  const client = createPgClient();

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
