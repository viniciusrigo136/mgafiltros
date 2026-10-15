'use server';
// Modelos de trator (templates).
import { getDb, transaction } from './db';
import { requireAdmin, requireEditor } from './auth';
import { number, text } from './validate';
import { done, guard, guardRedirect, readFilterRows, replaceFilters, type ActionState } from './action-utils';

export async function saveModel(_: ActionState, fd: FormData): Promise<ActionState> {
  let modelId = Number(fd.get('id')) || 0;
  const r = await guard(async () => {
    await requireEditor();
    const brand = text(fd, 'brand', 'Marca', { required: true, max: 80 })!;
    const model = text(fd, 'model', 'Modelo', { required: true, max: 80 })!;
    const oilSpec = text(fd, 'oil_spec', 'Especificação do óleo', { max: 120 });
    const oilCap = number(fd, 'oil_capacity_liters', 'Capacidade de óleo', { positive: true, max: 1000 });
    const intHours = number(fd, 'interval_hours', 'Intervalo em horas', { positive: true, max: 10000 });
    const intMonths = number(fd, 'interval_months', 'Intervalo em meses', { integer: true, positive: true, max: 120 });
    const notes = text(fd, 'notes', 'Observações', { max: 2000 });
    const filters = readFilterRows(fd);
    const db = getDb();
    transaction(db, () => {
      if (modelId) {
        db.prepare(
          `UPDATE tractor_models SET brand = ?, model = ?, oil_spec = ?, oil_capacity_liters = ?, interval_hours = ?, interval_months = ?, notes = ?
           WHERE id = ?`,
        ).run(brand, model, oilSpec, oilCap, intHours, intMonths, notes, modelId);
      } else {
        modelId = Number(
          db.prepare(
            `INSERT INTO tractor_models (brand, model, oil_spec, oil_capacity_liters, interval_hours, interval_months, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ).run(brand, model, oilSpec, oilCap, intHours, intMonths, notes).lastInsertRowid,
        );
      }
      replaceFilters(db, 'tractor_model_filters', modelId, filters);
    });
  });
  if (r) return r;
  done('/modelos', 'Modelo salvo.');
}

/** Cria (ou atualiza) um modelo a partir do cadastro de um trator já revisado. */
export async function modelFromTractor(fd: FormData) {
  const tractorId = Number(fd.get('tractor_id'));
  let modelId = 0;
  await guardRedirect(`/tratores/${tractorId}`, async () => {
    await requireEditor();
    const db = getDb();
    const t = db.prepare('SELECT * FROM tractors WHERE id = ?').get(tractorId) as {
      brand: string; model: string; oil_spec: string | null; oil_capacity_liters: number | null;
      interval_hours: number | null; interval_months: number | null;
    };
    transaction(db, () => {
      modelId = Number(
        (db.prepare(
          `INSERT INTO tractor_models (brand, model, oil_spec, oil_capacity_liters, interval_hours, interval_months)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (brand COLLATE NOCASE, model COLLATE NOCASE) DO UPDATE SET oil_spec = excluded.oil_spec, oil_capacity_liters = excluded.oil_capacity_liters,
             interval_hours = excluded.interval_hours, interval_months = excluded.interval_months
           RETURNING id`,
        ).get(t.brand, t.model, t.oil_spec, t.oil_capacity_liters, t.interval_hours, t.interval_months) as { id: number }).id,
      );
      db.prepare('DELETE FROM tractor_model_filters WHERE model_id = ?').run(modelId);
      db.prepare(
        `INSERT INTO tractor_model_filters (model_id, filter_type, reference_code, manufacturer, quantity, notes)
         SELECT ?, filter_type, reference_code, manufacturer, quantity, notes FROM tractor_filters WHERE tractor_id = ?`,
      ).run(modelId, tractorId);
    });
  });
  done(`/modelos/${modelId}`, 'Modelo salvo a partir do trator. Revise os dados.');
}

export async function deleteModel(fd: FormData) {
  const modelId = Number(fd.get('id'));
  await guardRedirect(`/modelos/${modelId}`, async () => {
    await requireAdmin();
    getDb().prepare('DELETE FROM tractor_models WHERE id = ?').run(modelId);
  });
  done('/modelos', 'Modelo excluído (tratores já cadastrados não mudam).');
}
