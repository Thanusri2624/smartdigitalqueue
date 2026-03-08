CREATE POLICY "Authenticated users can decrement slot booked_count"
ON public.service_slots
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);