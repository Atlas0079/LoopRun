CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS gps_meta (id integer PRIMARY KEY CHECK(id=1), schema_version integer NOT NULL);
INSERT INTO gps_meta VALUES (1,1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS players (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS pools (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS territory_cells (
  pool_id text NOT NULL REFERENCES pools(id), cell_key text NOT NULL,
  owner_id text REFERENCES players(id), fortification smallint NOT NULL CHECK(fortification BETWEEN 0 AND 3),
  center geometry(Point,4326) NOT NULL, PRIMARY KEY(pool_id,cell_key)
);
CREATE INDEX IF NOT EXISTS cells_center_gist ON territory_cells USING gist(center);
CREATE INDEX IF NOT EXISTS cells_owner_idx ON territory_cells(pool_id,owner_id);
CREATE TABLE IF NOT EXISTS activities (id text PRIMARY KEY, player_id text NOT NULL REFERENCES players(id), data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS activities_player_idx ON activities(player_id);
CREATE TABLE IF NOT EXISTS run_samples (
  activity_id text NOT NULL REFERENCES activities(id), seq integer NOT NULL CHECK(seq>0),
  lat double precision NOT NULL, lng double precision NOT NULL, recorded_at bigint NOT NULL,
  accuracy double precision NOT NULL, PRIMARY KEY(activity_id,seq)
);
CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS invites (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS events (id text PRIMARY KEY, data jsonb NOT NULL);
