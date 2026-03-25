CREATE TABLE public.disabled_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_phone text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, contact_phone)
);

ALTER TABLE public.disabled_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own disabled_contacts" ON public.disabled_contacts FOR SELECT TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own disabled_contacts" ON public.disabled_contacts FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own disabled_contacts" ON public.disabled_contacts FOR DELETE TO public USING (auth.uid() = user_id);