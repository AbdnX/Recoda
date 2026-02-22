const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_EXT = new Set(['.js', '.cjs', '.mjs', '.html', '.css', '.md', '.json', '.sql']);
const EXCLUDED_DIRS = new Set(['node_modules', '.git']);
const EXCLUDED_FILES = new Set(['package-lock.json']);

const bannedPatterns = [
  {
    name: 'Hardcoded Postgres URL',
    regex: /postgresql:\/\/[^\s'"`]+/g
  },
  {
    name: 'Committed Supabase Service Role value',
    regex: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?!YOUR_)[^\s#]+/g
  },
  {
    name: 'Hardcoded JWT-looking token',
    regex: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{8,}/g
  }
];

function isTextSource(filePath) {
  if (EXCLUDED_FILES.has(path.basename(filePath))) return false;
  return SOURCE_EXT.has(path.extname(filePath));
}

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.env')) continue;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      collectFiles(path.join(dir, entry.name), out);
      continue;
    }
    const filePath = path.join(dir, entry.name);
    if (isTextSource(filePath)) out.push(filePath);
  }
  return out;
}

function getLine(source, index) {
  return source.slice(0, index).split('\n').length;
}

function scanFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const findings = [];
  for (const rule of bannedPatterns) {
    for (const match of source.matchAll(rule.regex)) {
      findings.push({
        rule: rule.name,
        line: getLine(source, match.index || 0),
        sample: String(match[0]).slice(0, 120)
      });
    }
  }
  return findings;
}

const files = collectFiles(ROOT);
let totalFindings = 0;

for (const file of files) {
  const findings = scanFile(file);
  if (findings.length === 0) continue;
  totalFindings += findings.length;
  const rel = path.relative(ROOT, file);
  for (const finding of findings) {
    console.error(`${rel}:${finding.line} ${finding.rule}: ${finding.sample}`);
  }
}

if (totalFindings > 0) {
  console.error(`\nLint failed with ${totalFindings} security finding(s).`);
  process.exit(1);
}

console.log(`Lint passed. Scanned ${files.length} files with no blocked patterns.`);
