-- 1. Create the recordings table to store file metadata
CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  duration NUMERIC,
  size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
-- This ensures users can ONLY see and manage their own data.
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

-- 3. Create Security Policies
-- Policy: Users can view only their own recordings
CREATE POLICY "Users can view their own recordings" 
ON recordings FOR SELECT 
USING (auth.uid() = user_id);

-- Policy: Users can insert their own recordings
CREATE POLICY "Users can insert their own recordings" 
ON recordings FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own recordings
CREATE POLICY "Users can delete their own recordings" 
ON recordings FOR DELETE 
USING (auth.uid() = user_id);
