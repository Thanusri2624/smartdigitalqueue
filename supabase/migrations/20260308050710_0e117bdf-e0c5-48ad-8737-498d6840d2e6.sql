
-- Create enum types
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.priority_type AS ENUM ('normal', 'senior', 'pregnant', 'disabled', 'emergency');
CREATE TYPE public.queue_status AS ENUM ('waiting', 'serving', 'completed', 'cancelled', 'no_show');

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  date_of_birth DATE,
  is_pregnant BOOLEAN NOT NULL DEFAULT false,
  is_disabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Services table
CREATE TABLE public.services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  estimated_time_minutes INT NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Admins can manage services" ON public.services FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Counters table
CREATE TABLE public.counters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  service_id UUID REFERENCES public.services(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  current_ticket_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view counters" ON public.counters FOR SELECT USING (true);
CREATE POLICY "Admins can manage counters" ON public.counters FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Queue tickets table
CREATE TABLE public.queue_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_number TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  service_id UUID NOT NULL REFERENCES public.services(id),
  counter_id UUID REFERENCES public.counters(id),
  priority priority_type NOT NULL DEFAULT 'normal',
  status queue_status NOT NULL DEFAULT 'waiting',
  qr_code_data TEXT,
  position INT,
  estimated_wait_minutes INT,
  called_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.queue_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own tickets" ON public.queue_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create tickets" ON public.queue_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all tickets" ON public.queue_tickets FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage tickets" ON public.queue_tickets FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_queue_tickets_updated_at BEFORE UPDATE ON public.queue_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  ticket_id UUID REFERENCES public.queue_tickets(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT WITH CHECK (true);

-- Enable realtime on queue_tickets and notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Seed default services
INSERT INTO public.services (name, description, estimated_time_minutes) VALUES
  ('General Inquiry', 'General information and inquiries', 8),
  ('Account Services', 'Account opening, closing, and management', 15),
  ('Payment Services', 'Bills, transfers, and payment processing', 10),
  ('Document Processing', 'Document verification and processing', 20),
  ('Customer Support', 'Technical support and complaints', 12);

-- Seed default counters
INSERT INTO public.counters (name, service_id) 
SELECT 'Counter ' || n, s.id
FROM public.services s, generate_series(1, 2) AS n;
