-- Allow crew members to delete (cancel) their own pending sea time requests.
-- Without this policy, DELETE returns success but 0 rows affected (RLS blocks silently).

CREATE POLICY "Crew members can delete own pending requests"
ON public.sea_time_requests
FOR DELETE
USING (auth.uid() = crew_user_id AND status = 'pending');

COMMENT ON POLICY "Crew members can delete own pending requests" ON public.sea_time_requests IS
'Allows crew to cancel their own pending sea time requests. Approved/rejected requests cannot be deleted.';
