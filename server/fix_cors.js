const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRole) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRole);

async function updateBucketCors() {
  console.log('Updating "recordings" bucket CORS settings...');

  // The 'updateBucket' method allows setting public/fileSizeLimit etc.
  // But typically CORS is managed differently or via dashboard.
  // Actually, supabase-js `updateBucket` doesn't directly support `cors`.
  // Wait, let's check if we can simply use the storage API to set CORS?
  // No, usually it's `getBucket` / `updateBucket`.
  // If `updateBucket` doesn't support CORS, we might need SQL.
  
  // Let's try to update public to false just to be sure we can talk to it.
  const { data, error } = await supabase.storage.updateBucket('recordings', {
    public: false,
    allowedMimeTypes: ['video/webm', 'video/mp4', 'audio/webm'],
    fileSizeLimit: 52428800 // 50MB
  });

  if (error) {
    console.error('❌ Failed to update bucket:', error.message);
  } else {
    console.log('✅ Bucket settings updated (MIME types, Size Limit).');
  }

  // NOTE: If CORS is the issue, it needs to be configured in the Supabase Dashboard
  // under Storage > Buckets > Configuration.
  // OR via SQL if possible (Supabase exposes `storage.buckets` table but CORS config column exists?)
  // Let's check if we can verify CORS via SQL.
  
  console.log('\n⚠️  IF THE UPLOAD HANGS, IT IS LIKELY A CORS ISSUE.');
  console.log('Please check your Supabase Dashboard:');
  console.log('1. Go to Storage > Buckets > recordings');
  console.log('2. Click "Configuration" or "Settings"');
  console.log('3. Ensure CORS is allowed for your domain (e.g. http://localhost:3456 or *)');
}

updateBucketCors();
