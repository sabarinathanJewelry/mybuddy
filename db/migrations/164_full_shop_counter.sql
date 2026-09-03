-- 164: Add a "Full Shop" counter for ehelper cleanliness tracking.
-- Appears alongside the individual counters in the cleanliness check UI.
-- Assign the ehelper to this counter via counter_assignments each month.
-- Their reward cleanliness score is then based on how often Full Shop is marked neat.

INSERT INTO counters (name, display_order)
VALUES ('Full Shop', 99)
ON CONFLICT DO NOTHING;
