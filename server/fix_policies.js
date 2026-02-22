const { createPgClient } = require('./db');

const sql = `
-- Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "Authenticated users can upload recordings" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own recordings" ON storage.objects;

-- Create comprehensive policies
-- 1. INSERT
CREATE POLICY "Users can upload own recordings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'recordings' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. SELECT
CREATE POLICY "Users can view own recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'recordings' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. UPDATE (Important for overwrites)
CREATE POLICY "Users can update own recordings"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'recordings' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'recordings' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. DELETE
CREATE POLICY "Users can delete own recordings"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'recordings' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

`;

async function fix() {
  const client = createPgClient();

  try {
    await client.connect();
    console.log('🚀 Fixing storage policies...');
    await client.query(sql);
    console.log('✅ Policies updated.');
  } catch (err) {
    console.error('❌ Failed:', err.message);
  } finally {
    await client.end();
  }
}

fix();
