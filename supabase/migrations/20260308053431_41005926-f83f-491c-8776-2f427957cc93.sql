
-- Add new columns to services table
ALTER TABLE public.services 
  ADD COLUMN IF NOT EXISTS required_documents jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS max_queue_capacity integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS slots_enabled boolean DEFAULT false;

-- Create document_uploads table
CREATE TABLE public.document_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  ticket_id uuid REFERENCES public.queue_tickets(id) ON DELETE SET NULL,
  document_name text NOT NULL,
  file_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  verified_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents" ON public.document_uploads
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upload documents" ON public.document_uploads
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Staff can view all documents" ON public.document_uploads
  FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));
CREATE POLICY "Staff can update documents" ON public.document_uploads
  FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- Create service_slots table
CREATE TABLE public.service_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  slot_date date NOT NULL,
  slot_time time NOT NULL,
  max_tokens integer NOT NULL DEFAULT 10,
  booked_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(service_id, slot_date, slot_time)
);

ALTER TABLE public.service_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active slots" ON public.service_slots
  FOR SELECT USING (true);
CREATE POLICY "Admins can manage slots" ON public.service_slots
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Create slot_bookings table
CREATE TABLE public.slot_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slot_id uuid REFERENCES public.service_slots(id) ON DELETE CASCADE NOT NULL,
  ticket_id uuid REFERENCES public.queue_tickets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'booked',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.slot_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookings" ON public.slot_bookings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create bookings" ON public.slot_bookings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bookings" ON public.slot_bookings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Staff can view all bookings" ON public.slot_bookings
  FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));
CREATE POLICY "Staff can update bookings" ON public.slot_bookings
  FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- Create staff_activity_logs table
CREATE TABLE public.staff_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  action text NOT NULL,
  ticket_id uuid REFERENCES public.queue_tickets(id) ON DELETE SET NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can insert own logs" ON public.staff_activity_logs
  FOR INSERT WITH CHECK (auth.uid() = staff_id);
CREATE POLICY "Admins can view all logs" ON public.staff_activity_logs
  FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Staff can view own logs" ON public.staff_activity_logs
  FOR SELECT USING (auth.uid() = staff_id);

-- Staff can view and manage tickets
CREATE POLICY "Staff can view assigned tickets" ON public.queue_tickets
  FOR SELECT USING (has_role(auth.uid(), 'staff'));
CREATE POLICY "Staff can update tickets" ON public.queue_tickets
  FOR UPDATE USING (has_role(auth.uid(), 'staff'));

-- Create storage bucket for document uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

CREATE POLICY "Users upload own documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users view own documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Staff view all documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff')));

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_slots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.slot_bookings;
