-- Allow admins to delete feedback entries (e.g. after resolving)

CREATE POLICY "Admins can delete feedback"
ON public.feedback
FOR DELETE
USING (public.is_admin_user_safe());
