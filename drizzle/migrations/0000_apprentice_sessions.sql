CREATE TABLE public.apprentice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'capture',
  title text NOT NULL DEFAULT '',
  person text NOT NULL DEFAULT '',
  sheet_id text,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_map jsonb,
  teachback_confirmed boolean NOT NULL DEFAULT false,
  tests jsonb NOT NULL DEFAULT '{}'::jsonb,
  score jsonb,
  redactions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.apprentice_sessions TO service_role;
ALTER TABLE public.apprentice_sessions ENABLE ROW LEVEL SECURITY;