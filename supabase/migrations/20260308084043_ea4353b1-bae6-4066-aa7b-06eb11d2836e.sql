CREATE POLICY "Staff can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));