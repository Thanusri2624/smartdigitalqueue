
-- Allow users to update (cancel) their own tickets
CREATE POLICY "Users can update own tickets"
ON public.queue_tickets
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
