/**
 * Recoda Backend API
 * Node.js + Express server powered by Supabase.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;
const MAX_JSON_BODY = process.env.MAX_JSON_BODY || '1mb';
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 100 * 1024 * 1024); // 100MB
const ALLOWED_UPLOAD_MIME_TYPES = new Set(['video/webm', 'video/mp4', 'audio/webm']);
const configuredCorsOrigins = new Set(
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function isAllowedLocalhostOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function sanitizeFilename(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/') || trimmed.includes('\\')) return null;
  const base = path.basename(trimmed).replace(/[^\w.\-]/g, '_');
  if (!base || base === '.' || base === '..' || base.length > 200) return null;
  return base;
}

function parsePositiveNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

// Local Storage Setup
// When running from api/index.js, __dirname is .../api
// We want recordings to be in project root/recordings locally
const RECORDINGS_DIR = process.env.VERCEL ? 
  path.join('/tmp', 'recordings') : 
  path.join(__dirname, '../recordings');

// NOTE: We do NOT create directories at startup to avoid "Read-only file system" errors on Vercel
// during cold starts or build analysis. Directory creation is handled lazily in routes.

// Multer Setup for local saves
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // If authenticated, we could sub-folder by user ID
    // On Vercel, use /tmp
    // Locally use the defined RECORDINGS_DIR (which handles ../recordings)
    const baseDir = RECORDINGS_DIR;
    
    try {
        const userDir = req.user ? path.join(baseDir, req.user.id) : baseDir;
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    } catch (e) {
        cb(e);
    }
  },
  filename: (req, file, cb) => {
    // Use the filename provided in the body or originalname
    const rawName = req.body.filename || file.originalname || `recording-${Date.now()}.webm`;
    const name = sanitizeFilename(rawName);
    if (!name) {
      return cb(new Error('Invalid filename'));
    }
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  }
});

// Middleware
app.use(cors({
  origin(origin, callback) {
    // Allow requests without origin (curl/health checks/server-to-server).
    if (!origin) return callback(null, true);

    if (configuredCorsOrigins.has(origin)) {
      return callback(null, true);
    }

    if (process.env.NODE_ENV !== 'production' && isAllowedLocalhostOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  }
}));
app.use(express.json({ limit: MAX_JSON_BODY }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
    // Only in production
  } else {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Async route wrapper to prevent unhandled promise rejections
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables!');
} else {
  supabase = createClient(supabaseUrl, supabaseKey);
}

function hasSupabase(res) {
  if (supabase) return true;
  if (res) {
    res.status(503).json({ error: 'Supabase not configured' });
  }
  return false;
}

// Auth Middleware
const requireAuth = async (req, res, next) => {
  if (process.env.NODE_ENV === 'test' && process.env.RECODA_TEST_BYPASS_AUTH === '1') {
    req.user = { id: req.headers['x-test-user-id'] || 'test-user' };
    return next();
  }
  if (!hasSupabase(res)) return;

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.split(' ')[1];
  
  // Verify token with Supabase
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
};

// POST /api/waitlist
// Add email to waitlist.json
app.post('/api/waitlist', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    // On Vercel, filesystem is ephemeral. We can't persist waitlist to JSON.
    // Ideally use a database. For now, if on Vercel, just log it or return 200 to not break UI.
    // Or save to /tmp but it will disappear.
    if (process.env.VERCEL) {
        console.log(`[Waitlist Vercel] New email: ${email}`);
        return res.json({ success: true, message: 'Joined waitlist (Ephemeral)' });
    }

    const waitlistPath = path.join(__dirname, '../waitlist.json');
    let waitlist = [];
    
    if (fs.existsSync(waitlistPath)) {
      try {
        waitlist = JSON.parse(fs.readFileSync(waitlistPath, 'utf8'));
      } catch (e) {
        waitlist = [];
      }
    }
    
    // Check dupe
    if (!waitlist.some(e => e.email === email)) {
      waitlist.push({ email, date: new Date().toISOString() });
      fs.writeFileSync(waitlistPath, JSON.stringify(waitlist, null, 2));
    }

    res.json({ success: true, message: 'Joined waitlist' });
  } catch (err) {
    console.error('Waitlist error:', err);
    res.status(500).json({ error: 'Internal error' });
  }

});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/config/supabase
// Serve public Supabase config to the frontend (anon key only — NEVER expose service role key)
app.get('/api/config/supabase', (req, res) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: 'Supabase not configured' });
  }
  res.json({
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY
  });
});

// ─── Cloud Sync API (Placeholders) ──────────────────────────

// POST /api/recordings/sync
app.post('/api/recordings/sync', requireAuth, async (req, res) => {
  try {
    const localRecordings = Array.isArray(req.body?.localRecordings) ? req.body.localRecordings : [];
    if (localRecordings.length > 2000) {
      return res.status(413).json({ error: 'Too many recordings in one sync payload' });
    }
    const normalizedLocal = localRecordings
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        filename: sanitizeFilename(r.filename),
        created_at: parseIsoDate(r.created_at),
        duration: parsePositiveNumber(r.duration),
        size: parsePositiveNumber(r.size),
        mime_type: typeof r.mime_type === 'string' ? r.mime_type : null
      }))
      .filter((r) => r.filename);

    const localByFilename = new Map();
    normalizedLocal.forEach((r) => {
      if (!localByFilename.has(r.filename)) {
        localByFilename.set(r.filename, r);
      }
    });

    const { data: cloudRows, error } = await supabase
      .from('recordings')
      .select('id, filename, duration, size, mime_type, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const cloudByFilename = new Map();
    (cloudRows || []).forEach((row) => {
      if (!cloudByFilename.has(row.filename)) {
        cloudByFilename.set(row.filename, row);
      }
    });

    const toUpload = [];
    localByFilename.forEach((rec, filename) => {
      if (!cloudByFilename.has(filename)) {
        toUpload.push(rec);
      }
    });

    const toDownloadBase = [];
    cloudByFilename.forEach((rec, filename) => {
      if (!localByFilename.has(filename)) {
        toDownloadBase.push(rec);
      }
    });

    const signedDownloads = await Promise.all(
      toDownloadBase.map(async (rec) => {
        const storagePath = `${req.user.id}/${rec.filename}`;
        const { data, error: signError } = await supabase.storage
          .from('recordings')
          .createSignedUrl(storagePath, 60 * 30);

        if (signError || !data?.signedUrl) {
          console.warn(`Unable to sign download URL for ${storagePath}:`, signError?.message || 'Unknown error');
          return null;
        }

        return {
          ...rec,
          storagePath,
          downloadUrl: data.signedUrl
        };
      })
    );

    const toDownload = signedDownloads.filter(Boolean);

    res.json({ toUpload, toDownload });
  } catch (err) {
    console.error('Sync route error:', err);
    res.status(500).json({ error: 'Failed to build sync plan' });
  }
});

// POST /api/upload/sign
app.post('/api/upload/sign', requireAuth, async (req, res) => {
  const filename = sanitizeFilename(req.body?.filename);
  if (!filename) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const path = `${req.user.id}/${filename}`;
  
  // Actually get signed URL from Supabase
  const { data, error } = await supabase.storage
    .from('recordings')
    .createSignedUploadUrl(path);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ signedUrl: data.signedUrl, path });
});

// POST /api/recordings (Metadata)
app.post('/api/recordings', requireAuth, async (req, res) => {
  const filename = sanitizeFilename(req.body?.filename);
  const duration = parsePositiveNumber(req.body?.duration);
  const size = parsePositiveNumber(req.body?.size);
  const mime_type = typeof req.body?.mime_type === 'string' ? req.body.mime_type.trim() : '';

  if (!filename) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  if (duration == null || size == null || !ALLOWED_UPLOAD_MIME_TYPES.has(mime_type)) {
    return res.status(400).json({ error: 'Invalid recording metadata' });
  }

  const { data, error } = await supabase
    .from('recordings')
    .insert([{
      user_id: req.user.id,
      filename,
      duration,
      size,
      mime_type
    }]);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

// ─── Local Save API ──────────────────────────────────────────

// POST /api/local/save
// Save a recording file to the server's local filesystem + metadata
app.post('/api/local/save', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (process.env.VERCEL) {
        return res.status(503).json({ error: 'Local save not supported on Vercel. Use Cloud Sync.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const duration = parsePositiveNumber(req.body?.duration) ?? 0;
    const mime = typeof req.body?.mime === 'string' ? req.body.mime : req.file.mimetype;
    const ts = parseIsoDate(req.body?.ts) || new Date().toISOString();

    if (!ALLOWED_UPLOAD_MIME_TYPES.has(mime)) {
      return res.status(400).json({ error: 'Unsupported mime type' });
    }
    const userDir = req.user ? path.join(RECORDINGS_DIR, req.user.id) : RECORDINGS_DIR;
    const metaPath = path.join(userDir, 'recordings.json');

    // Load or create metadata file
    let metadata = [];
    if (fs.existsSync(metaPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (e) {
        metadata = [];
      }
    }

    // Add new entry
    const newEntry = {
      filename: req.file.filename,
      duration,
      mime,
      ts,
      size: req.file.size
    };

    // Prevent duplicates in metadata
    metadata = metadata.filter(m => m.filename !== newEntry.filename);
    metadata.unshift(newEntry);

    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

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

    if (!fs.existsSync(metaPath)) {
      return res.json([]);
    }

    const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
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
    const filename = sanitizeFilename(req.params?.filename);
    if (!filename) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const filePath = path.join(RECORDINGS_DIR, req.user.id, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (err) {
    console.error('Local file serve error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  if (err && typeof err.message === 'string' && err.message.startsWith('CORS blocked')) {
    return res.status(403).json({ error: err.message });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Max size is ${MAX_UPLOAD_BYTES} bytes` });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err && typeof err.message === 'string' && (
    err.message.includes('Unsupported file type') ||
    err.message.includes('Invalid filename')
  )) {
    return res.status(400).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server if run directly (local development)
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 Recoda API running on http://localhost:${port}`);
    console.log(`Helpers:`);
    console.log(`  Health: http://localhost:${port}/api/health`);
  });
}

// Export for Vercel - explicit handler wrapper
module.exports = (req, res) => {
  app(req, res);
};
