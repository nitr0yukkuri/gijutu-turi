-- Additive, idempotent schema and catalog setup for the Cloudflare Worker.

CREATE TABLE IF NOT EXISTS fish_species (
    id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, name TEXT, classification TEXT,
    tagline TEXT, description TEXT, habitat TEXT, rarity TEXT, model_key TEXT,
    catalog_status TEXT NOT NULL CHECK (catalog_status IN ('active', 'preview'))
  );

CREATE TABLE IF NOT EXISTS player_collections (
    player_id TEXT NOT NULL, fish_id TEXT NOT NULL REFERENCES fish_species(id),
    catches INTEGER NOT NULL DEFAULT 0, first_caught_at TEXT NOT NULL, last_caught_at TEXT NOT NULL,
    PRIMARY KEY (player_id, fish_id)
  );

CREATE TABLE IF NOT EXISTS collection_catch_events (
    event_key TEXT PRIMARY KEY, player_id TEXT NOT NULL, fish_id TEXT NOT NULL REFERENCES fish_species(id),
    caught_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS player_sessions (
    player_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS ocean_rooms (
    room_id TEXT PRIMARY KEY, player_id TEXT NOT NULL, fish_id TEXT, created_at TEXT NOT NULL
  );

UPDATE fish_species
    SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
    WHERE id LIKE 'unknown-%' AND number = 1 AND catalog_status = 'preview'
      AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
        OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));

DELETE FROM fish_species
    WHERE id LIKE 'unknown-%' AND number = 1 AND catalog_status = 'preview'
      AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
      AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

INSERT INTO fish_species
    (id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status)
    VALUES ('fish-001', 1, 'Go魚', 'CONCURRENCY SPECIES', '複数の魚が、同時に動く。', '一匹が複数に分かれ、同時に引く。Goの並行処理を、群れの抵抗として体験する魚。', '静かな沖', 'COMMON', 'go-fish', 'active')
    ON CONFLICT(id) DO UPDATE SET number=excluded.number, name=excluded.name,
      classification=excluded.classification, tagline=excluded.tagline, description=excluded.description,
      habitat=excluded.habitat, rarity=excluded.rarity, model_key=excluded.model_key,
      catalog_status=excluded.catalog_status;

UPDATE fish_species
    SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
    WHERE id LIKE 'unknown-%' AND number = 2 AND catalog_status = 'preview'
      AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
        OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));

DELETE FROM fish_species
    WHERE id LIKE 'unknown-%' AND number = 2 AND catalog_status = 'preview'
      AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
      AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

INSERT INTO fish_species
    (id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status)
    VALUES ('whale-001', 2, 'Dockerクジラ', 'CONTAINER SPECIES', 'コンテナを載せたクジラ。', '背中にコンテナを載せたクジラ。Dockerがアプリと実行環境をまとめる仕組みを、重い引きと慣性で表現する。', '深いコンテナ海溝', 'RARE', 'docker-whale', 'active')
    ON CONFLICT(id) DO UPDATE SET number=excluded.number, name=excluded.name,
      classification=excluded.classification, tagline=excluded.tagline, description=excluded.description,
      habitat=excluded.habitat, rarity=excluded.rarity, model_key=excluded.model_key,
      catalog_status=excluded.catalog_status;

UPDATE fish_species
    SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
    WHERE id LIKE 'unknown-%' AND number = 3 AND catalog_status = 'preview'
      AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
        OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));

DELETE FROM fish_species
    WHERE id LIKE 'unknown-%' AND number = 3 AND catalog_status = 'preview'
      AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
      AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

INSERT INTO fish_species
    (id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status)
    VALUES ('css-001', 3, 'CSS fish', 'STYLE SPECIES', '形はそのまま、状態で色が変わる。', '魚の構造は変えず、状態に応じて色・模様・発光が変化する。CSSの構造と見た目の分離を表す魚。', 'カスケード海域', 'UNCOMMON', 'css-fish', 'active')
    ON CONFLICT(id) DO UPDATE SET number=excluded.number, name=excluded.name,
      classification=excluded.classification, tagline=excluded.tagline, description=excluded.description,
      habitat=excluded.habitat, rarity=excluded.rarity, model_key=excluded.model_key,
      catalog_status=excluded.catalog_status;

UPDATE fish_species
    SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
    WHERE id LIKE 'unknown-%' AND number = 4 AND catalog_status = 'preview'
      AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
        OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));

DELETE FROM fish_species
    WHERE id LIKE 'unknown-%' AND number = 4 AND catalog_status = 'preview'
      AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
      AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

INSERT INTO fish_species
    (id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status)
    VALUES ('k8s-001', 4, 'K8sレヴィアタン', 'CLUSTER SPECIES', '本体の後を、二つの影が追う。', '本体の後を二つの影が追い、引きに合わせて隊形を変える古代魚。釣り上げられるのは本体だけ。Kubernetesのコンテナ管理を表す。', '深海クラスター海溝', 'LEGENDARY', 'cluster-leviathan', 'active')
    ON CONFLICT(id) DO UPDATE SET number=excluded.number, name=excluded.name,
      classification=excluded.classification, tagline=excluded.tagline, description=excluded.description,
      habitat=excluded.habitat, rarity=excluded.rarity, model_key=excluded.model_key,
      catalog_status=excluded.catalog_status;

UPDATE fish_species
    SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
    WHERE id LIKE 'unknown-%' AND number = 5 AND catalog_status = 'preview'
      AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
        OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));

DELETE FROM fish_species
    WHERE id LIKE 'unknown-%' AND number = 5 AND catalog_status = 'preview'
      AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
      AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

INSERT INTO fish_species
    (id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status)
    VALUES ('rust-001', 5, 'Rustカジキ', 'OWNERSHIP SPECIES', '短く突進し、すぐに進路を変える。', '青い縦縞と長い吻を持つカジキ。短く突進して進路を変える動きを、Rustの所有権と値の移動に重ねた。', '所有権の外洋', 'RARE', 'rust-swordfish', 'active')
    ON CONFLICT(id) DO UPDATE SET number=excluded.number, name=excluded.name,
      classification=excluded.classification, tagline=excluded.tagline, description=excluded.description,
      habitat=excluded.habitat, rarity=excluded.rarity, model_key=excluded.model_key,
      catalog_status=excluded.catalog_status;

UPDATE fish_species
    SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
    WHERE id LIKE 'unknown-%' AND number = 6 AND catalog_status = 'preview'
      AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
        OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id));

DELETE FROM fish_species
    WHERE id LIKE 'unknown-%' AND number = 6 AND catalog_status = 'preview'
      AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
      AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id);

INSERT INTO fish_species
    (id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status)
    VALUES ('js-001', 6, 'JSアナゴ', 'ASYNC SPECIES', '全身を波打たせて泳ぐ魚。', '砂泥底にすむマアナゴをモデルに、体側の白い点と尾まで続くひれを再現。全身を使う泳ぎをJavaScriptのイベントループと非同期処理に重ねた。', '沿岸の砂泥底', 'UNCOMMON', 'js-eel', 'active')
    ON CONFLICT(id) DO UPDATE SET number=excluded.number, name=excluded.name,
      classification=excluded.classification, tagline=excluded.tagline, description=excluded.description,
      habitat=excluded.habitat, rarity=excluded.rarity, model_key=excluded.model_key,
      catalog_status=excluded.catalog_status;

