const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRole) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRole);

async function runMigration() {
  console.log('Running migration: Create storage bucket and policies...');

  // 1. Create Bucket
  const { data: bucket, error: bucketError } = await supabase.storage.createBucket('recordings', {
    public: false,
    fileSizeLimit: null, // unlimited
    allowedMimeTypes: ['video/webm', 'video/mp4', 'audio/webm']
  });

  if (bucketError) {
    if (bucketError.message.includes('already exists')) {
       console.log('✅ Bucket "recordings" already exists.');
    } else {
       console.error('❌ Failed to create bucket:', bucketError.message);
    }
  } else {
    console.log('✅ Bucket "recordings" created.');
  }

  // NOTE: JS Client cannot run arbitrary SQL (CREATE POLICY). 
  // We can only create buckets and manipulate data.
  // The policies MUST be applied via the Supabase Dashboard SQL Editor.
  
  console.log('\n⚠️  IMPORTANT: The Supabase JS Client cannot create RLS Policies.');
  console.log('You MUST run the following SQL manually in the Supabase Dashboard > SQL Editor:');
  console.log(`
  create policy "Users can upload own recordings"
    on storage.objects for insert
    with check (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]);

  create policy "Users can view own recordings"
    on storage.objects for select
    using (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]);

  create policy "Users can delete own recordings"
    on storage.objects for delete
    using (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]);
  `);
}

runMigration();
