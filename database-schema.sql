-- VocabVault Database Schema
-- Run this SQL in your Supabase SQL Editor

-- Drop old tables first (they depend on the type)
DROP TABLE IF EXISTS public.admin_stats CASCADE;
DROP TABLE IF EXISTS public.game_sessions CASCADE;
DROP TABLE IF EXISTS public.words CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop old enum if exists
DROP TYPE IF EXISTS public.app_role;

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'player');

-- Create new profiles table linked to auth.users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  role app_role NOT NULL DEFAULT 'player',
  games_played_today INTEGER DEFAULT 0,
  total_games_won INTEGER DEFAULT 0,
  total_games_played INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create words table
CREATE TABLE public.words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word TEXT UNIQUE NOT NULL CHECK (length(word) = 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create game_sessions table
CREATE TABLE public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  word TEXT NOT NULL CHECK (length(word) = 5),
  guesses TEXT[] DEFAULT '{}',
  won BOOLEAN DEFAULT FALSE,
  completed BOOLEAN DEFAULT FALSE,
  game_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create admin_stats table for dashboard statistics
CREATE TABLE public.admin_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  today_users INTEGER DEFAULT 0,
  today_correct_guesses INTEGER DEFAULT 0,
  total_users INTEGER DEFAULT 0,
  total_games INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO anon, authenticated
  USING (true);

-- RLS Policies for words
CREATE POLICY "Anyone can view words"
  ON public.words FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can insert words"
  ON public.words FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id::text = current_setting('app.current_user_id', true) 
      AND role = 'admin'
    )
  );

-- RLS Policies for game_sessions
CREATE POLICY "Users can view their own game sessions"
  ON public.game_sessions FOR SELECT
  TO anon, authenticated
  USING (
    user_id::text = current_setting('app.current_user_id', true)
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id::text = current_setting('app.current_user_id', true) 
      AND role = 'admin'
    )
  );

CREATE POLICY "Users can insert their own game sessions"
  ON public.game_sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update their own game sessions"
  ON public.game_sessions FOR UPDATE
  TO anon, authenticated
  USING (user_id::text = current_setting('app.current_user_id', true));

-- RLS Policies for admin_stats
CREATE POLICY "Admins can view admin stats"
  ON public.admin_stats FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id::text = current_setting('app.current_user_id', true) 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update admin stats"
  ON public.admin_stats FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id::text = current_setting('app.current_user_id', true) 
      AND role = 'admin'
    )
  );

-- Insert the 20 five-letter words
INSERT INTO public.words (word) VALUES
  ('REACT'),
  ('BRAIN'),
  ('CLOUD'),
  ('CRANE'),
  ('PLANT'),
  ('SMILE'),
  ('HEART'),
  ('LIGHT'),
  ('DREAM'),
  ('SPACE'),
  ('MAGIC'),
  ('OCEAN'),
  ('TRUTH'),
  ('PEACE'),
  ('HAPPY'),
  ('DANCE'),
  ('MUSIC'),
  ('TRUST'),
  ('BRAVE'),
  ('SHINE');

-- Insert initial admin stats
INSERT INTO public.admin_stats (today_users, today_correct_guesses, total_users, total_games) VALUES
  (0, 0, 0, 0);

-- Helper function to set current user context (for RLS)
CREATE OR REPLACE FUNCTION public.set_current_user_id(user_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.current_user_id', user_uuid::text, false);
END;
$$;