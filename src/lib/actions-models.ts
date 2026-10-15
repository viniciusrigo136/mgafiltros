'use server';
// Modelos de trator (templates).
import { transaction } from './db';
import { requireAdmin, requireEditor } from './auth';
import { ValidationError, number, text } from './validate';
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
    await transaction(async (tx) => {
      if (modelId) {
        await tx.run(
          `UPDATE tractor_models SET brand = ?, model = ?, oil_spec = ?, oil_capacity_liters = ?, interval_hours = ?, interval_months = ?, notes = ?
           WHERE id = ?`,
          brand, model, oilSpec, oilCap, intHours, intMonths, notes, modelId,
        );
      } else {
        modelId = (await tx.run(
          `INSERT INTO tractor_models (brand, model, oil_spec, oil_capacity_liters, interval_hours, interval_months, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          brand, model, oilSpec, oilCap, intHours, intMonths, notes,
        )).lastInsertRowid;
      }
      await replaceFilters(tx, 'tractor_model_filters', modelId, filters);
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
    await transaction(async (tx) => {
      const t = await tx.get<{
        brand: string; model: string; oil_spec: string | null; oil_capacity_liters: number | null;
        interval_hours: number | null; interval_months: number | null;
      }>('SELECT * FROM tractors WHERE id = ?', tractorId);
      if (!t) throw new ValidationError('Trator não encontrado.');
      const row = await tx.get<{ id: number }>(
        `INSERT INTO tractor_models (brand, model, oil_spec, oil_capacity_liters, interval_hours, interval_months)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (brand COLLATE NOCASE, model COLLATE NOCASE) DO UPDATE SET oil_spec = excluded.oil_spec,
           oil_capacity_liters = excluded.oil_capacity_liters, interval_hours = excluded.interval_hours, interval_months = excluded.interval_months
         RETURNING id`,
        t.brand, t.model, t.oil_spec, t.oil_capacity_liters, t.interval_hours, t.interval_months,
      );
      modelId = row!.id;
      await tx.run('DELETE FROM tractor_model_filters WHERE model_id = ?', modelId);
      await tx.run(
        `INSERT INTO tractor_model_filters (model_id, filter_type, reference_code, manufacturer, quantity, notes)
         SELECT ?, filter_type, reference_code, manufacturer, quantity, notes FROM tractor_filters WHERE tractor_id = ?`,
        modelId, tractorId,
      );
    });
  });
  done(`/modelos/${modelId}`, 'Modelo salvo a partir do trator. Revise os dados.');
}

export async function deleteModel(fd: FormData) {
  const modelId = Number(fd.get('id'));
  await guardRedirect(`/modelos/${modelId}`, async () => {
    await requireAdmin();
    await transaction(async (tx) => {
      await tx.run('DELETE FROM tractor_model_filters WHERE model_id = ?', modelId);
      await tx.run('DELETE FROM tractor_models WHERE id = ?', modelId);
    });
  });
  done('/modelos', 'Modelo excluído (tratores já cadastrados não mudam).');
}
