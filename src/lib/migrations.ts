// Migrações versionadas (aplicadas em ordem na inicialização). Gerado a partir dos antigos arquivos .sql.
// Para mudar o esquema, acrescente uma nova entrada ao final; nunca edite uma já aplicada.

export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_init.sql",
    sql: `
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
`,
  },
  {
    name: "002_oficina_completa.sql",
    sql: `
-- 002: configurações, papéis de usuário, modelos de trator, outras manutenções,
-- estoque (saldo derivado das movimentações), ordens de serviço e anexos.

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'mecanico', 'consulta'));

-- ---------- Modelos (templates revisados pela oficina) ----------
CREATE TABLE tractor_models (
  id                  INTEGER PRIMARY KEY,
  brand               TEXT    NOT NULL CHECK (length(trim(brand)) > 0),
  model               TEXT    NOT NULL CHECK (length(trim(model)) > 0),
  oil_spec            TEXT,
  oil_capacity_liters REAL    CHECK (oil_capacity_liters IS NULL OR oil_capacity_liters > 0),
  interval_hours      REAL    CHECK (interval_hours IS NULL OR interval_hours > 0),
  interval_months     INTEGER CHECK (interval_months IS NULL OR interval_months > 0),
  notes               TEXT,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (brand COLLATE NOCASE, model COLLATE NOCASE)
);

CREATE TABLE tractor_model_filters (
  id             INTEGER PRIMARY KEY,
  model_id       INTEGER NOT NULL REFERENCES tractor_models (id) ON DELETE CASCADE,
  filter_type    TEXT    NOT NULL CHECK (filter_type IN ('oleo', 'combustivel', 'ar', 'hidraulico', 'outros')),
  reference_code TEXT    NOT NULL CHECK (length(trim(reference_code)) > 0),
  manufacturer   TEXT,
  quantity       INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes          TEXT
);
CREATE INDEX idx_model_filters_model ON tractor_model_filters (model_id);

-- ---------- Outras manutenções (cada tipo com regras próprias por trator) ----------
CREATE TABLE maintenance_types (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);
-- Somente nomes; intervalos técnicos são definidos por trator pela oficina.
INSERT INTO maintenance_types (name) VALUES
  ('Óleo da transmissão / hidráulico'),
  ('Filtro hidráulico'),
  ('Filtro de combustível'),
  ('Filtro de ar'),
  ('Líquido de arrefecimento'),
  ('Correias'),
  ('Lubrificação (graxa)');

CREATE TABLE maintenance_plans (
  id              INTEGER PRIMARY KEY,
  tractor_id      INTEGER NOT NULL REFERENCES tractors (id) ON DELETE CASCADE,
  type_id         INTEGER NOT NULL REFERENCES maintenance_types (id) ON DELETE RESTRICT,
  interval_hours  REAL    CHECK (interval_hours IS NULL OR interval_hours > 0),
  interval_months INTEGER CHECK (interval_months IS NULL OR interval_months > 0),
  spec            TEXT,
  notes           TEXT,
  UNIQUE (tractor_id, type_id)
);

CREATE TABLE maintenance_records (
  id            INTEGER PRIMARY KEY,
  tractor_id    INTEGER NOT NULL REFERENCES tractors (id) ON DELETE RESTRICT,
  type_id       INTEGER NOT NULL REFERENCES maintenance_types (id) ON DELETE RESTRICT,
  serviced_at   TEXT    NOT NULL CHECK (date(serviced_at) = serviced_at),
  service_hours REAL    CHECK (service_hours IS NULL OR service_hours >= 0),
  product_used  TEXT,
  quantity      REAL    CHECK (quantity IS NULL OR quantity > 0),
  notes         TEXT,
  performed_by  TEXT,
  work_order_id INTEGER REFERENCES work_orders (id) ON DELETE SET NULL,
  created_by    INTEGER REFERENCES users (id),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_maint_records ON maintenance_records (tractor_id, type_id, serviced_at DESC);

-- ---------- Ordens de serviço ----------
INSERT INTO sequences (name, value) VALUES ('work_order_number', 0);

CREATE TABLE work_orders (
  id            INTEGER PRIMARY KEY,
  number        INTEGER NOT NULL UNIQUE,
  tractor_id    INTEGER NOT NULL REFERENCES tractors (id) ON DELETE RESTRICT,
  status        TEXT    NOT NULL DEFAULT 'orcamento'
                CHECK (status IN ('orcamento', 'aprovada', 'em_execucao', 'concluida', 'cancelada')),
  opened_at     TEXT    NOT NULL CHECK (date(opened_at) = opened_at),
  closed_at     TEXT    CHECK (closed_at IS NULL OR date(closed_at) = closed_at),
  hours_at_open REAL    CHECK (hours_at_open IS NULL OR hours_at_open >= 0),
  complaint     TEXT,
  diagnosis     TEXT,
  notes         TEXT,
  discount      REAL    NOT NULL DEFAULT 0 CHECK (discount >= 0),
  created_by    INTEGER REFERENCES users (id),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_work_orders_tractor ON work_orders (tractor_id);
CREATE INDEX idx_work_orders_status ON work_orders (status, opened_at DESC);

-- ---------- Estoque ----------
CREATE TABLE stock_items (
  id             INTEGER PRIMARY KEY,
  kind           TEXT    NOT NULL CHECK (kind IN ('filtro', 'oleo', 'peca', 'outro')),
  reference_code TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(reference_code)) > 0),
  description    TEXT,
  manufacturer   TEXT,
  unit           TEXT    NOT NULL DEFAULT 'un',
  min_quantity   REAL    NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  cost_price     REAL    CHECK (cost_price IS NULL OR cost_price >= 0),
  sale_price     REAL    CHECK (sale_price IS NULL OR sale_price >= 0),
  location       TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE work_order_items (
  id             INTEGER PRIMARY KEY,
  work_order_id  INTEGER NOT NULL REFERENCES work_orders (id) ON DELETE CASCADE,
  kind           TEXT    NOT NULL CHECK (kind IN ('peca', 'servico')),
  description    TEXT    NOT NULL CHECK (length(trim(description)) > 0),
  reference_code TEXT,
  stock_item_id  INTEGER REFERENCES stock_items (id) ON DELETE SET NULL,
  quantity       REAL    NOT NULL CHECK (quantity > 0),
  unit_price     REAL    NOT NULL DEFAULT 0 CHECK (unit_price >= 0)
);
CREATE INDEX idx_wo_items ON work_order_items (work_order_id);

CREATE TABLE work_order_checklist (
  id            INTEGER PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders (id) ON DELETE CASCADE,
  label         TEXT    NOT NULL,
  done          INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  position      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_wo_checklist ON work_order_checklist (work_order_id, position);

ALTER TABLE oil_changes ADD COLUMN work_order_id INTEGER REFERENCES work_orders (id) ON DELETE SET NULL;

-- Saldo = soma das movimentações. Excluir a origem (troca/item de OS) devolve o estoque.
CREATE TABLE stock_movements (
  id                 INTEGER PRIMARY KEY,
  item_id            INTEGER NOT NULL REFERENCES stock_items (id) ON DELETE CASCADE,
  delta              REAL    NOT NULL CHECK (delta <> 0),
  reason             TEXT    NOT NULL,
  oil_change_id      INTEGER REFERENCES oil_changes (id) ON DELETE CASCADE,
  work_order_item_id INTEGER REFERENCES work_order_items (id) ON DELETE CASCADE,
  created_by         INTEGER REFERENCES users (id),
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_stock_movements_item ON stock_movements (item_id);

-- ---------- Anexos (fotos/PDF) ----------
CREATE TABLE attachments (
  id            INTEGER PRIMARY KEY,
  tractor_id    INTEGER REFERENCES tractors (id) ON DELETE CASCADE,
  work_order_id INTEGER REFERENCES work_orders (id) ON DELETE CASCADE,
  stored_name   TEXT    NOT NULL UNIQUE,
  original_name TEXT    NOT NULL,
  mime          TEXT    NOT NULL,
  size          INTEGER NOT NULL,
  caption       TEXT,
  created_by    INTEGER REFERENCES users (id),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (tractor_id IS NOT NULL OR work_order_id IS NOT NULL)
);
CREATE INDEX idx_attachments_tractor ON attachments (tractor_id);
CREATE INDEX idx_attachments_wo ON attachments (work_order_id);
`,
  },
  {
    name: '003_catalogo_filtros.sql',
    sql: `
-- 003: catálogo técnico de filtros (marca > modelo > aplicação) e confirmações por trator.
-- origin = 'oficina' marca registros criados/editados pela oficina: a importação nunca os sobrescreve.
-- Códigos de filtro são TEXTO (preserva espaços, barras, zeros e letras).

CREATE TABLE catalog_brands (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  coverage   TEXT,
  origin     TEXT NOT NULL DEFAULT 'importado' CHECK (origin IN ('importado', 'oficina')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX idx_catalog_brands_name ON catalog_brands (name COLLATE NOCASE);

CREATE TABLE catalog_models (
  id             TEXT PRIMARY KEY,
  brand_id       TEXT NOT NULL REFERENCES catalog_brands (id),
  model          TEXT NOT NULL CHECK (length(trim(model)) > 0),
  engine_ref     TEXT,
  catalog_status TEXT,
  notes          TEXT,
  origin         TEXT NOT NULL DEFAULT 'importado' CHECK (origin IN ('importado', 'oficina')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_catalog_models_brand ON catalog_models (brand_id);
CREATE INDEX idx_catalog_models_model ON catalog_models (model COLLATE NOCASE);

CREATE TABLE catalog_applications (
  id                  TEXT PRIMARY KEY,
  model_id            TEXT NOT NULL REFERENCES catalog_models (id),
  system              TEXT NOT NULL CHECK (length(trim(system)) > 0),
  position            TEXT,
  filter_brand        TEXT,
  filter_code         TEXT NOT NULL CHECK (length(trim(filter_code)) > 0),
  original_code       TEXT,
  version_condition   TEXT,
  quantity            INTEGER CHECK (quantity IS NULL OR quantity > 0),
  verification_status TEXT NOT NULL DEFAULT 'catalogo_aplicacao_geral'
                      CHECK (verification_status IN ('catalogo_aplicacao_geral', 'pendente', 'verificado_oficina')),
  source_url          TEXT,
  notes               TEXT,
  origin              TEXT NOT NULL DEFAULT 'importado' CHECK (origin IN ('importado', 'oficina')),
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_catalog_apps_model ON catalog_applications (model_id, system);
CREATE INDEX idx_catalog_apps_code ON catalog_applications (filter_code COLLATE NOCASE);

-- Histórico: estado anterior de cada aplicação antes de uma edição (nada é apagado).
CREATE TABLE catalog_application_history (
  id             INTEGER PRIMARY KEY,
  application_id TEXT NOT NULL,
  snapshot       TEXT NOT NULL,
  changed_by     TEXT,
  changed_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_catalog_history_app ON catalog_application_history (application_id);

ALTER TABLE tractors ADD COLUMN catalog_model_id TEXT REFERENCES catalog_models (id);

-- Confirmação da aplicação real em UM trator. Registro só de inclusão: o estado atual é o mais recente.
-- Não altera o catálogo global nem outros tratores.
CREATE TABLE tractor_filter_confirmations (
  id                INTEGER PRIMARY KEY,
  tractor_id        INTEGER NOT NULL REFERENCES tractors (id),
  application_id    TEXT REFERENCES catalog_applications (id),
  status            TEXT NOT NULL CHECK (status IN ('confirmado', 'descartado', 'candidato')),
  system            TEXT NOT NULL,
  filter_brand      TEXT,
  filter_code       TEXT NOT NULL,
  version_condition TEXT,
  notes             TEXT,
  confirmed_on      TEXT NOT NULL CHECK (date(confirmed_on) = confirmed_on),
  responsible       TEXT,
  created_by        INTEGER REFERENCES users (id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_tfc_tractor ON tractor_filter_confirmations (tractor_id, application_id, id DESC);
`,
  },
];
