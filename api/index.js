/**
 * Recoda Backend API
 * Node.js + Express server powered by Supabase.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Local Storage Setup
// When running from api/index.js, __dirname is .../api
// We want recordings to be in project root/recordings locally
const RECORDINGS_DIR = process.env.VERCEL ? path.join(process.env.tmpdir || '/tmp', 'recordings') : path.join(__dirname, '../recordings');

// In serverless, we might not have permission to write to __dirname or it might be read-only.
// We should only attempt to create dirs if we are NOT in a read-only env, or accept it might fail.

try {
  // Try to create the directory. If it fails (read-only), we just log it.
  // Real local saves won't work in Vercel anyway.
  if (!process.env.VERCEL) {
      fs.ensureDirSync(RECORDINGS_DIR);
  }
} catch (e) {
  console.warn('⚠️  Could not create recordings directory (expected in Serverless):', e.message);
}

// Multer Setup for local saves
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // If authenticated, we could sub-folder by user ID
    // On Vercel, use /tmp
    // Locally use the defined RECORDINGS_DIR (which handles ../recordings)
    const baseDir = RECORDINGS_DIR;
    
    try {
        const userDir = req.user ? path.join(baseDir, req.user.id) : baseDir;
        fs.ensureDirSync(userDir);
        cb(null, userDir);
    } catch (e) {
        cb(e);
    }
  },
  filename: (req, file, cb) => {
    // Use the filename provided in the body or originalname
    const name = req.body.filename || file.originalname || `recording-${Date.now()}.webm`;
    cb(null, name);
  }
});
const upload = multer({ storage });

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase Admin Client (for service role operations if needed)
// NOTE: For user operations, we'll create a scoped client per request using their token.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRole) {
  console.warn('⚠️  Supabase Config missing in .env');
}

// Create Admin Client for bypassing RLS on storage ops
let supabaseAdmin = null;

if (supabaseUrl && supabaseServiceRole) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
} else {
  console.warn('⚠️  Supabase Admin Client not initialized (missing config)');
}

/**
 * Auth Middleware
 * Verifies the Supabase JWT sent in the Authorization header.
 * Attaches the authenticated user to req.user.
 */
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  
  // Create a client instance scoped to this user's token
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Server authentication not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  // Verify the token by fetching the user
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Attach user and scoped client to request
  req.user = user;
  req.supabase = supabase;
  next();
};

// ─── Routes ─────────────────────────────────────────────────

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Recoda API is running', version: '1.0.0' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Protected route example: Get current user profile
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    last_sign_in: req.user.last_sign_in_at
  });
});

// ─── Config Route ──────────────────────────────────────────

// Serve Supabase public config to frontend
app.get('/api/config/supabase', (req, res) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase not configured on server' });
  }
  res.json({
    url: supabaseUrl,
    anonKey: supabaseAnonKey
  });
});

// ─── Cloud Sync API ────────────────────────────────────────

// GET /api/recordings
// Fetch all recordings metadata for the current user
app.get('/api/recordings', requireAuth, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('recordings')
      .select('*')
      .eq('user_id', req.user.id) // Redundant with RLS but good for safety
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recordings
// Save metadata for a new recording
app.post('/api/recordings', requireAuth, async (req, res) => {
  try {
    const { filename, duration, size, mime_type } = req.body;
    
    // Validate
    if (!filename || !duration || !size || !mime_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await req.supabase
      .from('recordings')
      .insert({
        user_id: req.user.id,
        filename,
        duration,
        size,
        mime_type
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Insert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recordings/sync
// Compare local list with cloud list to find diffs
app.post('/api/recordings/sync', requireAuth, async (req, res) => {
  try {
    const { localRecordings } = req.body; // Expect array of { filename, ... }
    
    if (!Array.isArray(localRecordings)) {
      return res.status(400).json({ error: 'localRecordings must be an array' });
    }

    // 1. Fetch cloud list
    const { data: cloudRecs, error } = await req.supabase
      .from('recordings')
      .select('*') // Select all fields to ensure we have duration, size, mime_type
      .eq('user_id', req.user.id);

    if (error) throw error;

    const cloudFilenames = new Set(cloudRecs.map(r => r.filename));
    const localFilenames = new Set(localRecordings.map(r => r.filename));

    // 2. Determine what to upload (Local has it, Cloud missing)
    // We strictly use filename as the unique key for simplicity in this version.
    // If cloud has the filename, we assume it's synced.
    const toUpload = localRecordings.filter(r => !cloudFilenames.has(r.filename));

    // 3. Determine what to download (Cloud has it, Local missing)
    // Note: To download, we also need signed URLs for the files
    const missingInLocal = cloudRecs.filter(r => !localFilenames.has(r.filename));
    
    const toDownload = [];
    for (const rec of missingInLocal) {
      // Generate signed URL for download (valid for 1 hour) using Admin Client
      let downloadUrl = null;
      
      if (supabaseAdmin) {
        const path = `${req.user.id}/${rec.filename}`;
        const { data: urlData } = await supabaseAdmin.storage
          .from('recordings')
          .createSignedUrl(path, 3600);
        downloadUrl = urlData?.signedUrl;
      }

      toDownload.push({
        ...rec,
        downloadUrl
      });
    }

    res.json({
      toUpload,   // Frontend should iterate these and call /api/upload/sign then upload
      toDownload  // Frontend should download these and save to IndexedDB
    });

  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload/sign
// Generate a signed upload URL for a specific file
app.post('/api/upload/sign', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) {
        return res.status(503).json({ error: 'Storage service not configured' });
    }
      
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'Filename required' });

    const path = `${req.user.id}/${filename}`;

    const { data, error } = await supabaseAdmin.storage
      .from('recordings')
      .createSignedUploadUrl(path);

    if (error) throw error;

    res.json({
      signedUrl: data.signedUrl,
      path: data.path,
      token: data.token // Some clients need the token
    });
  } catch (err) {
    console.error('Sign upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Waitlist API ──────────────────────────────────────────────

// POST /api/waitlist
// Add email to waitlist.json
app.post('/api/waitlist', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    const waitlistPath = path.join(__dirname, 'waitlist.json');
    let waitlist = [];
    
    if (await fs.pathExists(waitlistPath)) {
      waitlist = await fs.readJson(waitlistPath);
    }
    
    // Check dupe
    if (!waitlist.some(e => e.email === email)) {
      waitlist.push({ email, date: new Date().toISOString() });
      await fs.writeJson(waitlistPath, waitlist, { spaces: 2 });
    }

    res.json({ success: true, message: 'Joined waitlist' });
  } catch (err) {
    console.error('Waitlist error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── Local Save API ──────────────────────────────────────────

// POST /api/local/save
// Save a recording file to the server's local filesystem + metadata
app.post('/api/local/save', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { duration, mime, ts } = req.body;
    const userDir = req.user ? path.join(RECORDINGS_DIR, req.user.id) : RECORDINGS_DIR;
    const metaPath = path.join(userDir, 'recordings.json');

    // Load or create metadata file
    let metadata = [];
    if (await fs.pathExists(metaPath)) {
      metadata = await fs.readJson(metaPath);
    }

    // Add new entry
    const newEntry = {
      filename: req.file.filename,
      duration: parseFloat(duration) || 0,
      mime: mime || req.file.mimetype,
      ts: ts || new Date().toISOString(),
      size: req.file.size
    };

    // Prevent duplicates in metadata
    metadata = metadata.filter(m => m.filename !== newEntry.filename);
    metadata.unshift(newEntry);

    await fs.writeJson(metaPath, metadata, { spaces: 2 });

    console.log(`✅ File and metadata saved locally: ${req.file.path}`);

    res.json({
      success: true,
      message: 'File saved to local library',
      path: req.file.path,
      filename: req.file.filename
    });
  } catch (err) {
    console.error('Local save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/local/recordings
// List all locally saved recordings for the current user
app.get('/api/local/recordings', requireAuth, async (req, res) => {
  try {
    const userDir = path.join(RECORDINGS_DIR, req.user.id);
    const metaPath = path.join(userDir, 'recordings.json');

    if (!(await fs.pathExists(metaPath))) {
      return res.json([]);
    }

    const metadata = await fs.readJson(metaPath);
    res.json(metadata);
  } catch (err) {
    console.error('Local list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/local/file/:filename
// Serve a locally saved recording file
app.get('/api/local/file/:filename', requireAuth, async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(RECORDINGS_DIR, req.user.id, filename);

    if (!(await fs.pathExists(filePath))) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (err) {
    console.error('Local file serve error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 Recoda API running on http://localhost:${port}`);
    console.log(`Helpers:`);
    console.log(`  Health: http://localhost:${port}/api/health`);
  });
}

module.exports = app;
