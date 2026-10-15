-- 001: esquema inicial do MVP (óleo do motor e filtros).
-- Datas de serviço/leitura são datas locais (America/Sao_Paulo) no formato YYYY-MM-DD.
-- Carimbos de auditoria (created_at) são UTC ISO-8601.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Contadores atômicos que nunca retrocedem (números de trator não são reutilizados).
CREATE TABLE sequences (
  name  TEXT    PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT INTO sequences (name, value) VALUES ('tractor_number', 0);

CREATE TABLE owners (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  phone      TEXT,
  city       TEXT,
  notes      TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_owners_name ON owners (name COLLATE NOCASE);

CREATE TABLE tractors (
  id                  INTEGER PRIMARY KEY,
  sequential_number   INTEGER NOT NULL UNIQUE CHECK (sequential_number > 0),
  owner_id            INTEGER NOT NULL REFERENCES owners (id) ON DELETE RESTRICT,
  brand               TEXT    NOT NULL CHECK (length(trim(brand)) > 0),
  model               TEXT    NOT NULL CHECK (length(trim(model)) > 0),
  year                INTEGER CHECK (year IS NULL OR year BETWEEN 1900 AND 2100),
  serial_number       TEXT,
  current_hours       REAL    CHECK (current_hours IS NULL OR current_hours >= 0),
  hours_read_at       TEXT    CHECK (hours_read_at IS NULL OR date(hours_read_at) = hours_read_at),
  oil_spec            TEXT,
  oil_capacity_liters REAL    CHECK (oil_capacity_liters IS NULL OR oil_capacity_liters > 0),
  interval_hours      REAL    CHECK (interval_hours IS NULL OR interval_hours > 0),
  interval_months     INTEGER CHECK (interval_months IS NULL OR interval_months > 0),
  notes               TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK ((current_hours IS NULL) = (hours_read_at IS NULL))
);
CREATE INDEX idx_tractors_owner ON tractors (owner_id);
CREATE INDEX idx_tractors_brand_model ON tractors (brand COLLATE NOCASE, model COLLATE NOCASE);

CREATE TABLE tractor_filters (
  id             INTEGER PRIMARY KEY,
  tractor_id     INTEGER NOT NULL REFERENCES tractors (id) ON DELETE CASCADE,
  filter_type    TEXT    NOT NULL CHECK (filter_type IN ('oleo', 'combustivel', 'ar', 'hidraulico', 'outros')),
  reference_code TEXT    NOT NULL CHECK (length(trim(reference_code)) > 0),
  manufacturer   TEXT,
  quantity       INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes          TEXT
);
CREATE INDEX idx_tractor_filters_tractor ON tractor_filters (tractor_id);
CREATE INDEX idx_tractor_filters_code ON tractor_filters (reference_code COLLATE NOCASE);

CREATE TABLE oil_changes (
  id            INTEGER PRIMARY KEY,
  tractor_id    INTEGER NOT NULL REFERENCES tractors (id) ON DELETE RESTRICT,
  serviced_at   TEXT    NOT NULL CHECK (date(serviced_at) = serviced_at),
  service_hours REAL    NOT NULL CHECK (service_hours >= 0),
  oil_used      TEXT,
  liters_used   REAL    CHECK (liters_used IS NULL OR liters_used > 0),
  notes         TEXT,
  performed_by  TEXT,
  is_initial    INTEGER NOT NULL DEFAULT 0 CHECK (is_initial IN (0, 1)),
  created_by    INTEGER REFERENCES users (id),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_oil_changes_tractor ON oil_changes (tractor_id, serviced_at DESC, service_hours DESC);

-- Cópia dos filtros no momento do serviço: não muda se o cadastro do trator mudar.
CREATE TABLE oil_change_filters (
  id                      INTEGER PRIMARY KEY,
  oil_change_id           INTEGER NOT NULL REFERENCES oil_changes (id) ON DELETE CASCADE,
  filter_type_snapshot    TEXT    NOT NULL,
  reference_code_snapshot TEXT    NOT NULL,
  manufacturer_snapshot   TEXT,
  quantity                INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0)
);
CREATE INDEX idx_oil_change_filters_change ON oil_change_filters (oil_change_id);

-- Histórico de leituras do horímetro (inclui correções justificadas).
CREATE TABLE hour_readings (
  id            INTEGER PRIMARY KEY,
  tractor_id    INTEGER NOT NULL REFERENCES tractors (id) ON DELETE CASCADE,
  hours         REAL    NOT NULL CHECK (hours >= 0),
  read_at       TEXT    NOT NULL CHECK (date(read_at) = read_at),
  is_correction INTEGER NOT NULL DEFAULT 0 CHECK (is_correction IN (0, 1)),
  reason        TEXT,
  created_by    INTEGER REFERENCES users (id),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (is_correction = 0 OR length(trim(coalesce(reason, ''))) > 0)
);
CREATE INDEX idx_hour_readings_tractor ON hour_readings (tractor_id, read_at DESC);
