-- Keep the deployed D1 catalog aligned with the catchable Java octopus.
-- Preserve any historical preview records before claiming its catalog number.
UPDATE fish_species
SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
WHERE id LIKE 'unknown-%' AND number = 17 AND catalog_status = 'preview'
  AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
    OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));

DELETE FROM fish_species
WHERE id LIKE 'unknown-%' AND number = 17 AND catalog_status = 'preview'
  AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
  AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

INSERT INTO fish_species
  (id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status)
VALUES
  ('java-001', 17, 'Javaタコ', 'SOFT-BODY SPECIES', '8本の腕が、それぞれ探りながら動く。', 'マダコ型のタコ。岩や砂底のすき間を吸盤で探り、腕を使って移動する。危険時は漏斗から水を噴き、腕を後ろへたたんで逃げる。Javaの並行処理を、独立して動く腕と逃走時の連携で表す。', '沿岸の岩場・砂底', 'RARE', 'java-octopus', 'active')
ON CONFLICT(id) DO UPDATE SET
  number=excluded.number, name=excluded.name, classification=excluded.classification,
  tagline=excluded.tagline, description=excluded.description, habitat=excluded.habitat,
  rarity=excluded.rarity, model_key=excluded.model_key, catalog_status=excluded.catalog_status;
