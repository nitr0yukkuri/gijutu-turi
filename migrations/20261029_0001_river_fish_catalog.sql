-- Add the river-only fish catalog for gameplay and durable catch records.
-- Preserve any legacy catch references before assigning catalog slot 7.
UPDATE fish_species
SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
WHERE id LIKE 'unknown-%' AND number = 7 AND catalog_status = 'preview'
  AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
    OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));
DELETE FROM fish_species
WHERE id LIKE 'unknown-%' AND number = 7 AND catalog_status = 'preview'
  AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
  AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

-- Preserve any legacy catch references before assigning catalog slot 8.
UPDATE fish_species
SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
WHERE id LIKE 'unknown-%' AND number = 8 AND catalog_status = 'preview'
  AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
    OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));
DELETE FROM fish_species
WHERE id LIKE 'unknown-%' AND number = 8 AND catalog_status = 'preview'
  AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
  AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

-- Preserve any legacy catch references before assigning catalog slot 9.
UPDATE fish_species
SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
WHERE id LIKE 'unknown-%' AND number = 9 AND catalog_status = 'preview'
  AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
    OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));
DELETE FROM fish_species
WHERE id LIKE 'unknown-%' AND number = 9 AND catalog_status = 'preview'
  AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
  AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

-- Preserve any legacy catch references before assigning catalog slot 10.
UPDATE fish_species
SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
WHERE id LIKE 'unknown-%' AND number = 10 AND catalog_status = 'preview'
  AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
    OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));
DELETE FROM fish_species
WHERE id LIKE 'unknown-%' AND number = 10 AND catalog_status = 'preview'
  AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
  AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

-- Preserve any legacy catch references before assigning catalog slot 11.
UPDATE fish_species
SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
WHERE id LIKE 'unknown-%' AND number = 11 AND catalog_status = 'preview'
  AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
    OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));
DELETE FROM fish_species
WHERE id LIKE 'unknown-%' AND number = 11 AND catalog_status = 'preview'
  AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
  AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

-- Preserve any legacy catch references before assigning catalog slot 12.
UPDATE fish_species
SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
WHERE id LIKE 'unknown-%' AND number = 12 AND catalog_status = 'preview'
  AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
    OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));
DELETE FROM fish_species
WHERE id LIKE 'unknown-%' AND number = 12 AND catalog_status = 'preview'
  AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
  AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

-- Preserve any legacy catch references before assigning catalog slot 13.
UPDATE fish_species
SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
WHERE id LIKE 'unknown-%' AND number = 13 AND catalog_status = 'preview'
  AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
    OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));
DELETE FROM fish_species
WHERE id LIKE 'unknown-%' AND number = 13 AND catalog_status = 'preview'
  AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
  AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

-- Preserve any legacy catch references before assigning catalog slot 14.
UPDATE fish_species
SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
WHERE id LIKE 'unknown-%' AND number = 14 AND catalog_status = 'preview'
  AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
    OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));
DELETE FROM fish_species
WHERE id LIKE 'unknown-%' AND number = 14 AND catalog_status = 'preview'
  AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
  AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

-- Preserve any legacy catch references before assigning catalog slot 15.
UPDATE fish_species
SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
WHERE id LIKE 'unknown-%' AND number = 15 AND catalog_status = 'preview'
  AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
    OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));
DELETE FROM fish_species
WHERE id LIKE 'unknown-%' AND number = 15 AND catalog_status = 'preview'
  AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
  AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

-- Preserve any legacy catch references before assigning catalog slot 16.
UPDATE fish_species
SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
WHERE id LIKE 'unknown-%' AND number = 16 AND catalog_status = 'preview'
  AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
    OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));
DELETE FROM fish_species
WHERE id LIKE 'unknown-%' AND number = 16 AND catalog_status = 'preview'
  AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
  AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

INSERT INTO fish_species
  (id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status)
VALUES
  ('river-ayu', 7, 'Goアユ', 'RIVER GO · 並行処理', '流れの中で、群れが同時に向きを変える。', '細身の流線形、黄緑がかった背、二つの背びれと小さな脂びれ。複数の仕事を独立して進め、結果をまとめる。群れの個体が別々の方向へ短く引く。', '上流〜中流の瀬', 'COMMON', 'river-ayu', 'active'),
  ('river-yamame', 8, 'Rustヤマメ', 'RIVER RUST · 所有権', '岩陰から一気に出て、流れへ戻る。', '厚みのある体、背中の黒点、体側の小判形のパーマークを持つヤマメ。短い加速のあとに減速し、向きを切り替える。', '冷たく澄んだ上流域', 'UNCOMMON', 'river-yamame', 'active'),
  ('river-oikawa', 9, 'CSSオイカワ', 'RIVER CSS · 構造と見た目', '魚体はそのまま、婚姻色だけが走る。', '細く銀白色の体。繁殖期のオスには青や赤みを帯びた婚姻色が現れる。平常時は軽快に泳ぎ、抵抗が上がると短い横走りを挟む。', '中流〜下流の浅瀬', 'COMMON', 'river-oikawa', 'active'),
  ('river-ugui', 10, 'K8sウグイ', 'RIVER KUBERNETES · 運用', '広がった群れが、流れに合わせてまとまる。', '銀色でやや厚みのあるウグイ。小群が位置をずらして追従し、短い突進では隊形が開く。', '上流から河口まで', 'COMMON', 'river-ugui', 'active'),
  ('river-kawamutsu', 11, 'JSカワムツ', 'RIVER JAVASCRIPT · イベントループ', '物音に反応して、淵の中を素早く切り返す。', '黄褐色を帯びた銀色の体と、側面を走る一本の黒い線が特徴。短い切り返しを中心に泳ぐ。', '中上流の淵や緩流域', 'COMMON', 'river-kawamutsu', 'active'),
  ('river-namazu', 12, 'Dockerナマズ', 'RIVER DOCKER · コンテナ', '底に沿って待ち、掛かると重く動き出す。', '鱗の目立たない長い体、幅広く平たい頭、長い口ひげ、丸みのある尾を持つ底層魚。', '中流〜下流の淵や岸際', 'UNCOMMON', 'river-namazu', 'active'),
  ('river-dojo', 13, 'Pythonドジョウ', 'RIVER PYTHON · 柔軟な処理', '細長い体を波打たせ、底の隙間を抜ける。', '円筒形の細長い体と小さな胸びれ、口のまわりのひげを持つ。全身に柔らかい波を伝え、底近くを進む。', '中下流の泥底や水路', 'COMMON', 'river-dojo', 'active'),
  ('river-kamatsuka', 14, 'SQLカマツカ', 'RIVER SQL · 検索と抽出', '砂底をなぞり、餌を探して少しずつ進む。', '前へ突き出した吻、平たい腹、低い位置につく口を持つ底生魚。底すれすれに進み、小さく向きを変える。', '中下流の砂底・砂礫底', 'COMMON', 'river-kamatsuka', 'active'),
  ('river-koi', 15, 'Javaコイ', 'RIVER JAVA · 長期実行', 'ゆっくり向きを変え、重い力を保ち続ける。', '大きく厚い体、厚い唇、二対の口ひげ、幅のある尾を持つコイ。重い初動と慣性を保ち、向きを変えると胴と尾が遅れてついてくる。', '中下流の淵や緩流域', 'UNCOMMON', 'river-koi', 'active'),
  ('river-ginbuna', 16, 'Linuxギンブナ', 'RIVER LINUX · 基盤', '静かな場所を保ち、乱れた流れを受け流す。', '背が高く側扁した銀色の体。コイのような口ひげはなく、流れの弱い場所で暮らす。', '中下流のゆるい流れや池', 'COMMON', 'river-ginbuna', 'active')
ON CONFLICT(id) DO UPDATE SET
  number=excluded.number, name=excluded.name, classification=excluded.classification,
  tagline=excluded.tagline, description=excluded.description, habitat=excluded.habitat,
  rarity=excluded.rarity, model_key=excluded.model_key, catalog_status=excluded.catalog_status;
