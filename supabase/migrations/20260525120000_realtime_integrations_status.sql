-- Enable realtime broadcasting on integrations so the frontend can react to status changes
-- (e.g. show a toast when a WhatsApp instance disconnects).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'integrations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.integrations;
  END IF;
END
$$;
