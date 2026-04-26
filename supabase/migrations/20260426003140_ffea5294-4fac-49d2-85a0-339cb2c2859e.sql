UPDATE items_turco t
SET image_url = b.image_url, updated_at = now()
FROM items b
WHERE b.id = t.id
  AND t.image_url IS NULL
  AND b.image_url IS NOT NULL;