-- Create a table for recording metadata
create table recordings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  filename text not null,
  duration integer not null, -- in seconds
  size bigint not null,      -- in bytes
  mime_type text not null,   -- e.g. 'video/webm'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table recordings enable row level security;

-- Policy: Users can only see their own recordings
create policy "Users can view own recordings"
  on recordings for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own recordings
create policy "Users can insert own recordings"
  on recordings for insert
  with check (auth.uid() = user_id);

-- Policy: Users can delete their own recordings
create policy "Users can delete own recordings"
  on recordings for delete
  using (auth.uid() = user_id);

-- Create a storage bucket for recordings
insert into storage.buckets (id, name, public) 
values ('recordings', 'recordings', false);

-- Policy: Users can upload files to their own folder
-- We assume file path is: {user_id}/{filename}
create policy "Users can upload own recordings"
  on storage.objects for insert
  with check (
    bucket_id = 'recordings' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users can read their own recordings
create policy "Users can read own recordings"
  on storage.objects for select
  using (
    bucket_id = 'recordings' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users can delete their own recordings
create policy "Users can delete own recordings"
  on storage.objects for delete
  using (
    bucket_id = 'recordings' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
