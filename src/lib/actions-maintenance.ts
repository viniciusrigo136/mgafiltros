'use server';
// Outras manutenções: planos por trator e registros de serviço.
import { getDb, transaction } from './db';
import { requireEditor } from './auth';
import { todayInTimeZone } from './status';
import { ValidationError, date, id, number, text } from './validate';
import { done, guard, guardRedirect, type ActionState } from './action-utils';

export async function savePlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const tractorId = Number(fd.get('tractor_id'));
  const r = await guard(async () => {
    await requireEditor();
    const typeId = id(fd, 'type_id', 'Tipo de manutenção');
    const intHours = number(fd, 'interval_hours', 'Intervalo em horas', { positive: true, max: 20000 });
    const intMonths = number(fd, 'interval_months', 'Intervalo em meses', { integer: true, positive: true, max: 240 });
    const spec = text(fd, 'spec', 'Produto/peça', { max: 120 });
    const notes = text(fd, 'notes', 'Observações', { max: 500 });
    if (!intHours && !intMonths) throw new ValidationError('Informe o intervalo em horas e/ou meses.');
    await (await getDb()).run(
      `INSERT INTO maintenance_plans (tractor_id, type_id, interval_hours, interval_months, spec, notes) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (tractor_id, type_id) DO UPDATE SET interval_hours = excluded.interval_hours,
         interval_months = excluded.interval_months, spec = excluded.spec, notes = excluded.notes`,
      tractorId, typeId, intHours, intMonths, spec, notes,
    );
  });
  if (r) return r;
  done(`/tratores/${tractorId}#outras`, 'Plano de manutenção salvo.');
}

export async function deletePlan(fd: FormData) {
  const planId = Number(fd.get('id'));
  const tractorId = Number(fd.get('tractor_id'));
  await guardRedirect(`/tratores/${tractorId}`, async () => {
    await requireEditor();
    await (await getDb()).run('DELETE FROM maintenance_plans WHERE id = ? AND tractor_id = ?', planId, tractorId);
  });
  done(`/tratores/${tractorId}#outras`, 'Plano removido (o histórico de serviços foi mantido).');
}

export async function saveRecord(_: ActionState, fd: FormData): Promise<ActionState> {
  let tractorId = 0;
  const r = await guard(async () => {
    const user = await requireEditor();
    const today = todayInTimeZone();
    tractorId = id(fd, 'tractor_id', 'Trator');
    const typeId = id(fd, 'type_id', 'Tipo de manutenção');
    const servicedAt = date(fd, 'serviced_at', 'Data do serviço', { required: true, notAfter: today })!;
    const hours = number(fd, 'service_hours', 'Horímetro no serviço', { required: true, max: 1_000_000 })!;
    const product = text(fd, 'product_used', 'Produto/peça', { max: 120 });
    const qty = number(fd, 'quantity', 'Quantidade', { positive: true, max: 10000 });
    const notes = text(fd, 'notes', 'Observações', { max: 2000 });
    const performedBy = text(fd, 'performed_by', 'Responsável', { max: 120 }) ?? (user.name || null);
    const workOrderId = Number(fd.get('work_order_id')) || null;
    await transaction(async (tx) => {
      const t = await tx.get<{ current_hours: number | null; hours_read_at: string | null }>(
        'SELECT current_hours, hours_read_at FROM tractors WHERE id = ?', tractorId,
      );
      if (!t) throw new ValidationError('Trator não encontrado.');
      const isLatest = t.hours_read_at == null || servicedAt >= t.hours_read_at;
      if (t.current_hours != null && isLatest && hours < t.current_hours) {
        throw new ValidationError(`Horímetro no serviço menor que a última leitura (${t.current_hours} h). Corrija o horímetro na ficha antes, se for o caso.`);
      }
      await tx.run(
        `INSERT INTO maintenance_records (tractor_id, type_id, serviced_at, service_hours, product_used, quantity, notes, performed_by, work_order_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        tractorId, typeId, servicedAt, hours, product, qty, notes, performedBy, workOrderId, user.id,
      );
      if (isLatest) {
        await tx.run('UPDATE tractors SET current_hours = ?, hours_read_at = ? WHERE id = ?', hours, servicedAt, tractorId);
        await tx.run('INSERT INTO hour_readings (tractor_id, hours, read_at, created_by) VALUES (?, ?, ?, ?)', tractorId, hours, servicedAt, user.id);
      }
    });
  });
  if (r) return r;
  done(`/tratores/${tractorId}#outras`, 'Serviço registrado.');
}

export async function deleteRecord(fd: FormData) {
  const recordId = Number(fd.get('id'));
  const tractorId = Number(fd.get('tractor_id'));
  await guardRedirect(`/tratores/${tractorId}`, async () => {
    await requireEditor();
    await (await getDb()).run('DELETE FROM maintenance_records WHERE id = ? AND tractor_id = ?', recordId, tractorId);
  });
  done(`/tratores/${tractorId}#outras`, 'Registro de serviço excluído.');
}
