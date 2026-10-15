'use server';
// Mutações de acesso, proprietários, tratores, horímetro e trocas de óleo.
// Cada ação verifica permissão e valida os dados no servidor.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, nextTractorNumber, transaction, type Db } from './db';
import { requireAdmin, requireEditor } from './auth';
import { verifyPassword } from './password';
import { SESSION_COOKIE, SESSION_MAX_AGE_S, createSessionToken } from './session';
import { todayInTimeZone } from './status';
import { normalizePhone } from './format';
import { ValidationError, date, id, number, text } from './validate';
import {
  done, guard, guardRedirect, readFilterRows, replaceFilters, snapshotFilters,
  type ActionState, type FilterInput,
} from './action-utils';

// ---------- Acesso ----------

// Bloqueio simples contra tentativa e erro: 5 falhas por usuário = 15 min de espera (memória da instância).
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const username = String(fd.get('username') ?? '').trim();
  const password = String(fd.get('password') ?? '');
  const key = username.toLowerCase();
  const f = failures.get(key);
  if (f && f.count >= MAX_FAILURES && f.until > Date.now()) {
    return { error: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' };
  }
  const user = await (await getDb()).get<{ id: number; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE username = ? AND is_active = 1',
    username,
  );
  if (!user || !verifyPassword(password, user.password_hash)) {
    const count = f && f.until > Date.now() ? f.count + 1 : 1;
    failures.set(key, { count, until: Date.now() + LOCK_MS });
    return { error: 'Usuário ou senha incorretos.' };
  }
  failures.delete(key);
  (await cookies()).set(SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIE !== '1',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });
  redirect('/');
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}

// ---------- Proprietários ----------

export async function saveOwner(_: ActionState, fd: FormData): Promise<ActionState> {
  let ownerId = 0;
  const r = await guard(async () => {
    await requireEditor();
    const name = text(fd, 'name', 'Nome', { required: true, max: 120 })!;
    const rawPhone = text(fd, 'phone', 'Telefone', { max: 30 });
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (rawPhone && !phone) throw new ValidationError('Telefone: informe DDD + número (10 ou 11 dígitos).');
    const city = text(fd, 'city', 'Município', { max: 120 });
    const notes = text(fd, 'notes', 'Observações', { max: 2000 });
    const db = await getDb();
    const existing = Number(fd.get('id')) || 0;
    if (existing) {
      await db.run('UPDATE owners SET name = ?, phone = ?, city = ?, notes = ? WHERE id = ?', name, phone, city, notes, existing);
      ownerId = existing;
    } else {
      ownerId = (await db.run('INSERT INTO owners (name, phone, city, notes) VALUES (?, ?, ?, ?)', name, phone, city, notes)).lastInsertRowid;
    }
  });
  if (r) return r;
  done(`/proprietarios/${ownerId}`, 'Proprietário salvo.');
}

export async function setOwnerActive(fd: FormData) {
  const ownerId = Number(fd.get('id'));
  const active = fd.get('active') === '1' ? 1 : 0;
  await guardRedirect(`/proprietarios/${ownerId}`, async () => {
    await requireEditor();
    await (await getDb()).run('UPDATE owners SET is_active = ? WHERE id = ?', active, ownerId);
  });
  done(`/proprietarios/${ownerId}`, active ? 'Proprietário reativado.' : 'Proprietário inativado.');
}

/** Exclusão definitiva só é permitida para proprietário sem nenhum trator vinculado. */
export async function deleteOwner(fd: FormData) {
  const ownerId = Number(fd.get('id'));
  await guardRedirect(`/proprietarios/${ownerId}`, async () => {
    await requireAdmin();
    const db = await getDb();
    const row = await db.get<{ n: number }>('SELECT count(*) AS n FROM tractors WHERE owner_id = ?', ownerId);
    if (row && row.n > 0) throw new ValidationError('Proprietário com tratores não pode ser excluído; use Inativar.');
    await db.run('DELETE FROM owners WHERE id = ?', ownerId);
  });
  done('/proprietarios', 'Proprietário excluído.');
}

// ---------- Tratores ----------

export async function saveTractor(_: ActionState, fd: FormData): Promise<ActionState> {
  let tractorId = 0;
  const r = await guard(async () => {
    const user = await requireEditor();
    const today = todayInTimeZone();
    const existing = Number(fd.get('id')) || 0;
    const ownerId = id(fd, 'owner_id', 'Proprietário');
    const brand = text(fd, 'brand', 'Marca', { required: true, max: 80 })!;
    const model = text(fd, 'model', 'Modelo', { required: true, max: 80 })!;
    const year = number(fd, 'year', 'Ano', { integer: true, min: 1900, max: Number(today.slice(0, 4)) + 1 });
    const serial = text(fd, 'serial_number', 'Nº de série', { max: 80 });
    const oilSpec = text(fd, 'oil_spec', 'Especificação do óleo', { max: 120 });
    const oilCap = number(fd, 'oil_capacity_liters', 'Capacidade de óleo', { positive: true, max: 1000 });
    const intHours = number(fd, 'interval_hours', 'Intervalo em horas', { positive: true, max: 10000 });
    const intMonths = number(fd, 'interval_months', 'Intervalo em meses', { integer: true, positive: true, max: 120 });
    const notes = text(fd, 'notes', 'Observações', { max: 2000 });
    const filters = readFilterRows(fd);
    if (!(await (await getDb()).get('SELECT 1 AS ok FROM owners WHERE id = ?', ownerId))) throw new ValidationError('Proprietário não encontrado.');

    if (existing) {
      await transaction(async (tx) => {
        await tx.run(
          `UPDATE tractors SET owner_id = ?, brand = ?, model = ?, year = ?, serial_number = ?, oil_spec = ?,
             oil_capacity_liters = ?, interval_hours = ?, interval_months = ?, notes = ? WHERE id = ?`,
          ownerId, brand, model, year, serial, oilSpec, oilCap, intHours, intMonths, notes, existing,
        );
        await replaceFilters(tx, 'tractor_filters', existing, filters);
      });
      tractorId = existing;
      return;
    }

    // Cadastro novo: leitura atual e última troca já realizada (opcionais).
    let hours = number(fd, 'current_hours', 'Horímetro atual', { max: 1_000_000 });
    let readAt = date(fd, 'hours_read_at', 'Data da leitura', { notAfter: today });
    if (hours != null && !readAt) readAt = today;
    if (hours == null) readAt = null;
    const initDate = date(fd, 'init_date', 'Data da última troca', { notAfter: today });
    const initHours = number(fd, 'init_hours', 'Horímetro na última troca', { max: 1_000_000 });
    if ((initDate == null) !== (initHours == null)) {
      throw new ValidationError('Última troca: informe a data e o horímetro.');
    }
    if (initDate != null && initHours != null) {
      if (hours == null) { hours = initHours; readAt = initDate; }
      else if (readAt! >= initDate && hours < initHours) {
        throw new ValidationError('Horímetro atual não pode ser menor que o da última troca.');
      } else if (readAt! < initDate && hours > initHours) {
        throw new ValidationError('Leitura do horímetro anterior à última troca com valor maior: verifique as datas.');
      }
    }
    const initOil = text(fd, 'init_oil', 'Óleo da última troca', { max: 120 }) ?? oilSpec;
    const initLiters = number(fd, 'init_liters', 'Litros da última troca', { positive: true, max: 1000 });
    await transaction(async (tx) => {
      const seq = await nextTractorNumber(tx);
      tractorId = (await tx.run(
        `INSERT INTO tractors (sequential_number, owner_id, brand, model, year, serial_number, current_hours, hours_read_at,
           oil_spec, oil_capacity_liters, interval_hours, interval_months, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        seq, ownerId, brand, model, year, serial, hours, readAt, oilSpec, oilCap, intHours, intMonths, notes,
      )).lastInsertRowid;
      await replaceFilters(tx, 'tractor_filters', tractorId, filters);
      if (hours != null) {
        await tx.run('INSERT INTO hour_readings (tractor_id, hours, read_at, created_by) VALUES (?, ?, ?, ?)', tractorId, hours, readAt, user.id);
      }
      if (initDate != null) {
        const changeId = (await tx.run(
          `INSERT INTO oil_changes (tractor_id, serviced_at, service_hours, oil_used, liters_used, notes, is_initial, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          tractorId, initDate, initHours, initOil, initLiters, 'Última troca informada no cadastro do trator.', user.id,
        )).lastInsertRowid;
        if (fd.get('init_filters') === '1') await snapshotFilters(tx, changeId, filters);
      }
    });
  });
  if (r) return r;
  done(`/tratores/${tractorId}`, 'Trator salvo.');
}

export async function setTractorActive(fd: FormData) {
  const tractorId = Number(fd.get('id'));
  const active = fd.get('active') === '1' ? 1 : 0;
  await guardRedirect(`/tratores/${tractorId}`, async () => {
    await requireEditor();
    await (await getDb()).run('UPDATE tractors SET is_active = ? WHERE id = ?', active, tractorId);
  });
  done(`/tratores/${tractorId}`, active ? 'Trator reativado.' : 'Trator inativado (o número não será reutilizado).');
}

interface TractorState { current_hours: number | null; hours_read_at: string | null }

/** Atualiza o horímetro sem registrar serviço. Valores menores exigem correção justificada. */
export async function updateHours(_: ActionState, fd: FormData): Promise<ActionState> {
  const tractorId = Number(fd.get('tractor_id'));
  const r = await guard(async () => {
    const user = await requireEditor();
    const today = todayInTimeZone();
    const hours = number(fd, 'hours', 'Horímetro', { required: true, max: 1_000_000 })!;
    const readAt = date(fd, 'read_at', 'Data da leitura', { required: true, notAfter: today })!;
    const correction = fd.get('correction') === '1';
    const reason = text(fd, 'reason', 'Justificativa', { max: 500 });
    if (correction && !reason) throw new ValidationError('Correção exige justificativa (ex.: substituição do horímetro).');
    await transaction(async (tx) => {
      const t = await tx.get<TractorState>('SELECT current_hours, hours_read_at FROM tractors WHERE id = ?', tractorId);
      if (!t) throw new ValidationError('Trator não encontrado.');
      if (!correction && t.current_hours != null) {
        if (hours < t.current_hours) {
          throw new ValidationError(`Leitura menor que a anterior (${t.current_hours} h). Marque "Correção" e justifique, se for o caso.`);
        }
        if (readAt < t.hours_read_at!) {
          throw new ValidationError('Já existe leitura com data mais recente. Use "Correção" para ajustar.');
        }
      }
      await tx.run('UPDATE tractors SET current_hours = ?, hours_read_at = ? WHERE id = ?', hours, readAt, tractorId);
      await tx.run(
        'INSERT INTO hour_readings (tractor_id, hours, read_at, is_correction, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        tractorId, hours, readAt, correction ? 1 : 0, correction ? reason : null, user.id,
      );
    });
  });
  if (r) return r;
  done(`/tratores/${tractorId}`, 'Horímetro atualizado.');
}

// ---------- Trocas de óleo ----------

/** Baixa filtros e óleo do estoque, ligando as movimentações à troca (excluir a troca devolve o estoque). */
async function deductForOilChange(tx: Db, changeId: number, filters: FilterInput[], oilUsed: string | null, liters: number | null, userId: number | null) {
  const findItem = (code: string) => tx.get<{ id: number }>('SELECT id FROM stock_items WHERE reference_code = ? AND is_active = 1', code);
  const move = (itemId: number, delta: number) =>
    tx.run('INSERT INTO stock_movements (item_id, delta, reason, oil_change_id, created_by) VALUES (?, ?, ?, ?, ?)', itemId, delta, 'Troca de óleo', changeId, userId);
  const missing: string[] = [];
  let count = 0;
  for (const f of filters) {
    const item = await findItem(f.code);
    if (item) { await move(item.id, -f.qty); count++; }
    else missing.push(f.code);
  }
  if (oilUsed && liters) {
    const item = await findItem(oilUsed);
    if (item) { await move(item.id, -liters); count++; }
    else missing.push(oilUsed);
  }
  return { count, missing };
}

export async function saveOilChange(_: ActionState, fd: FormData): Promise<ActionState> {
  let tractorId = 0;
  let stockNote = '';
  const r = await guard(async () => {
    const user = await requireEditor();
    const today = todayInTimeZone();
    tractorId = id(fd, 'tractor_id', 'Trator');
    const servicedAt = date(fd, 'serviced_at', 'Data do serviço', { required: true, notAfter: today })!;
    const hours = number(fd, 'service_hours', 'Horímetro no serviço', { required: true, max: 1_000_000 })!;
    const oilUsed = text(fd, 'oil_used', 'Óleo utilizado', { max: 120 });
    const liters = number(fd, 'liters_used', 'Litros', { positive: true, max: 1000 });
    const performedBy = text(fd, 'performed_by', 'Responsável', { max: 120 }) ?? (user.name || null);
    let notes = text(fd, 'notes', 'Observações', { max: 2000 });
    const correction = fd.get('correction') === '1';
    const reason = text(fd, 'reason', 'Justificativa', { max: 500 });
    if (correction && !reason) throw new ValidationError('Correção exige justificativa.');
    const workOrderId = Number(fd.get('work_order_id')) || null;
    const deduct = fd.get('deduct_stock') === '1';
    const selectedIds = fd.getAll('filter_id').map(Number).filter(Number.isInteger);
    const extraFilters = readFilterRows(fd, 'extra_');
    if (correction) notes = `[Correção: ${reason}]${notes ? ` ${notes}` : ''}`;

    await transaction(async (tx) => {
      const t = await tx.get<TractorState>('SELECT current_hours, hours_read_at FROM tractors WHERE id = ?', tractorId);
      if (!t) throw new ValidationError('Trator não encontrado.');

      // Consistência com o histórico: horas não podem "voltar" ao longo das datas.
      if (!correction) {
        const conflict = await tx.get<{ serviced_at: string; service_hours: number }>(
          `SELECT serviced_at, service_hours FROM oil_changes WHERE tractor_id = ?
           AND ((serviced_at < ? AND service_hours > ?) OR (serviced_at > ? AND service_hours < ?)) LIMIT 1`,
          tractorId, servicedAt, hours, servicedAt, hours,
        );
        if (conflict) {
          throw new ValidationError(
            `Inconsistente com a troca de ${conflict.serviced_at.split('-').reverse().join('/')} (${conflict.service_hours} h). Marque "Correção" e justifique, se for o caso.`,
          );
        }
      }
      const isLatestReading = t.hours_read_at == null || servicedAt >= t.hours_read_at;
      if (!correction && t.current_hours != null) {
        if (isLatestReading && hours < t.current_hours) {
          throw new ValidationError(`Horímetro no serviço menor que a última leitura (${t.current_hours} h). Marque "Correção" e justifique, se for o caso.`);
        }
        if (!isLatestReading && hours > t.current_hours) {
          throw new ValidationError('Serviço com data anterior à última leitura mas com horímetro maior: verifique os dados.');
        }
      }

      // Filtros trocados: os cadastrados (snapshot do momento) + linhas avulsas.
      const registered = selectedIds.length
        ? await tx.all<{ filter_type: string; reference_code: string; manufacturer: string | null; quantity: number }>(
            `SELECT * FROM tractor_filters WHERE tractor_id = ? AND id IN (${selectedIds.map(() => '?').join(',')})`,
            tractorId, ...selectedIds,
          )
        : [];
      const filters: FilterInput[] = [
        ...registered.map((f) => ({ type: f.filter_type, code: f.reference_code, maker: f.manufacturer, qty: f.quantity, notes: null })),
        ...extraFilters,
      ];

      const changeId = (await tx.run(
        `INSERT INTO oil_changes (tractor_id, serviced_at, service_hours, oil_used, liters_used, notes, performed_by, created_by, work_order_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        tractorId, servicedAt, hours, oilUsed, liters, notes, performedBy, user.id, workOrderId,
      )).lastInsertRowid;
      await snapshotFilters(tx, changeId, filters);
      if (isLatestReading || correction) {
        await tx.run('UPDATE tractors SET current_hours = ?, hours_read_at = ? WHERE id = ?', hours, servicedAt, tractorId);
        await tx.run(
          'INSERT INTO hour_readings (tractor_id, hours, read_at, is_correction, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)',
          tractorId, hours, servicedAt, correction ? 1 : 0, correction ? reason : null, user.id,
        );
      }
      if (deduct) {
        const res = await deductForOilChange(tx, changeId, filters, oilUsed, liters, user.id);
        stockNote = ` Estoque: ${res.count} ${res.count === 1 ? 'item baixado' : 'itens baixados'}.`;
        if (res.missing.length) stockNote += ` Sem cadastro no estoque: ${res.missing.join(', ')}.`;
      }
    });
  });
  if (r) return r;
  done(`/tratores/${tractorId}`, `Troca de óleo registrada. Próximo vencimento recalculado.${stockNote}`);
}

/** Remove um lançamento feito por engano (o cálculo volta a usar a troca anterior e o estoque é devolvido). */
export async function deleteOilChange(fd: FormData) {
  const changeId = Number(fd.get('id'));
  const row = await (await getDb()).get<{ tractor_id: number }>('SELECT tractor_id FROM oil_changes WHERE id = ?', changeId);
  if (!row) redirect('/manutencoes');
  await guardRedirect(`/tratores/${row.tractor_id}`, async () => {
    await requireEditor();
    await transaction(async (tx) => {
      // Exclusões explícitas (não depende de ON DELETE CASCADE estar ativo na conexão).
      await tx.run('DELETE FROM stock_movements WHERE oil_change_id = ?', changeId);
      await tx.run('DELETE FROM oil_change_filters WHERE oil_change_id = ?', changeId);
      await tx.run('DELETE FROM oil_changes WHERE id = ?', changeId);
    });
  });
  done(`/tratores/${row.tractor_id}`, 'Registro de troca excluído.');
}
