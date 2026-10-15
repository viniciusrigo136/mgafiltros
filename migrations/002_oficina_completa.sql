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
