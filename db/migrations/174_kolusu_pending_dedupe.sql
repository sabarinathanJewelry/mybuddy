-- 174: Remove duplicate chat-synced kolusu pending sales and stop new ones.
-- Sync re-imported messages many times (processed-id list capped at 1000 rows; staff chat rows had no
-- chat_message_id; every open admin chat tab imported realtime messages).

-- Preview (run alone first): groups of identical unassigned chat rows and how many extra copies each has
-- SELECT staff_name, tx_date, raw_wt_g, cover_wt_g, qty, description, bill_no, count(*) - 1 AS extra
-- FROM kolusu_pending_sales
-- WHERE source = 'chat' AND box_id IS NULL
-- GROUP BY 1,2,3,4,5,6,7 HAVING count(*) > 1 ORDER BY extra DESC;

-- 1. Same chat message imported more than once: keep the assigned row if any, else the earliest
DELETE FROM kolusu_pending_sales p
USING (
  SELECT id, row_number() OVER (
    PARTITION BY chat_message_id ORDER BY (box_id IS NULL), created_at, id
  ) AS rn
  FROM kolusu_pending_sales
  WHERE chat_message_id IS NOT NULL
) d
WHERE p.id = d.id AND d.rn > 1;

-- 2. Chat message since deleted (chat_message_id now NULL): identical unassigned chat rows from the
--    same staff on the same day are treated as copies; keep the earliest
DELETE FROM kolusu_pending_sales p
USING (
  SELECT id, row_number() OVER (
    PARTITION BY staff_name, tx_date, raw_wt_g, cover_wt_g, qty, coalesce(description, ''), coalesce(bill_no, '')
    ORDER BY created_at, id
  ) AS rn
  FROM kolusu_pending_sales
  WHERE source = 'chat' AND box_id IS NULL
) d
WHERE p.id = d.id AND d.rn > 1;

-- 3. One pending sale per chat message from now on (NULLs stay allowed)
DROP INDEX IF EXISTS idx_kolusu_pending_chat_msg;
CREATE UNIQUE INDEX IF NOT EXISTS uq_kolusu_pending_chat_msg ON kolusu_pending_sales(chat_message_id);
