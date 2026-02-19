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
    const name = req.body.filename || file.originalname || `recording-${Date.now()}.webm`;
    cb(null, name);
  }
});
const upload = multer({ storage });

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase Admin Client...
// (skipping unchanged lines)

// ...

// ─── Waitlist API ──────────────────────────────────────────────

// POST /api/waitlist
// Add email to waitlist.json
app.post('/api/waitlist', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
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

    const { duration, mime, ts } = req.body;
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
      duration: parseFloat(duration) || 0,
      mime: mime || req.file.mimetype,
      ts: ts || new Date().toISOString(),
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
    const { filename } = req.params;
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

// Start server
// Start server if run directly (local development)
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 Recoda API running on http://localhost:${port}`);
    console.log(`Helpers:`);
    console.log(`  Health: http://localhost:${port}/api/health`);
  });
}

// Export for Vercel
// Export for Vercel - explicit handler wrapper
module.exports = (req, res) => {
  app(req, res);
};
