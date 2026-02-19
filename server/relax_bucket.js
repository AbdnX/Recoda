const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRole) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRole);

async function relaxBucketRules() {
  console.log('Relaxing bucket restrictions...');

  const { data, error } = await supabase.storage.updateBucket('recordings', {
    public: false,
    allowedMimeTypes: null, // Allow ANY mime type
    fileSizeLimit: null     // Unlimited
  });

  if (error) {
    console.error('❌ Failed to update bucket:', error.message);
  } else {
    console.log('✅ Bucket relaxed: No strict MIME types, No size limit.');
  }
}

relaxBucketRules();
