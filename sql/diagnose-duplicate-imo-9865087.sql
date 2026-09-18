-- Resolve duplicate IMO 9865087 before applying vessels_imo_unique_idx.
-- Do NOT auto-merge. Review output, then clear the wrong IMO (set to NULL)
-- or correct it on the vessel that has the wrong identity.

-- 1) Side-by-side vessel rows
SELECT
  v.id,
  v.name,
  v.imo,
  v.mmsi,
  v.type,
  v.is_official,
  v.vessel_manager_id,
  v.ais_tracking_enabled,
  v.ais_provider_poll_enabled,
  v.flag,
  v.length_m,
  v.created_at
FROM public.vessels v
WHERE v.imo = '9865087'
ORDER BY v.created_at NULLS LAST;

-- 2) Manager emails / roles
SELECT
  v.id AS vessel_id,
  v.name,
  u.id AS manager_id,
  u.email,
  u.role,
  u.subscription_tier
FROM public.vessels v
LEFT JOIN public.users u ON u.id = v.vessel_manager_id
WHERE v.imo = '9865087';

-- 3) Active crew assignments
SELECT
  v.name,
  va.vessel_id,
  COUNT(*) AS assignment_rows,
  COUNT(*) FILTER (WHERE va.end_date IS NULL) AS active_assignments
FROM public.vessels v
JOIN public.vessel_assignments va ON va.vessel_id = v.id
WHERE v.imo = '9865087'
GROUP BY v.name, va.vessel_id;

-- 4) AIS history presence
SELECT
  v.name,
  v.id AS vessel_id,
  EXISTS (SELECT 1 FROM public.vessel_ais_status s WHERE s.vessel_id = v.id) AS has_ais_status,
  (SELECT COUNT(*) FROM public.ais_observations o WHERE o.vessel_id = v.id) AS observation_count,
  (SELECT COUNT(*) FROM public.vessel_daily_ais_summary d WHERE d.vessel_id = v.id) AS daily_summary_count
FROM public.vessels v
WHERE v.imo = '9865087';

-- 5) After you decide which vessel KEEP the IMO, clear it on the other:
-- Example (ONLY after you confirm which id is wrong):
--
-- UPDATE public.vessels
-- SET imo = NULL
-- WHERE id = '<wrong-vessel-uuid>';
--
-- Or set the correct IMO if you know it:
-- UPDATE public.vessels
-- SET imo = '<correct-imo>'
-- WHERE id = '<wrong-vessel-uuid>';
--
-- Then re-run the duplicate IMO diagnostic — it must return 0 rows
-- before sql/add-vessels-mmsi-imo-unique-indexes.sql.
