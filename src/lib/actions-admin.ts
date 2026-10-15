'use server';
// Configurações, tipos de manutenção, usuários, anexos e importação de planilha.
import { randomUUID } from 'node:crypto';
import { getDb, nextTractorNumber, transaction } from './db';
import { requireAdmin, requireEditor, type Role } from './auth';
import { hashPassword } from './password';
import { saveSettings } from './settings';
import { isValidIsoDate, todayInTimeZone } from './status';
import { normalizePhone } from './format';
import { parseCsv } from './csv';
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, getAttachment, removeFile, storeFile } from './attachments';
import { ValidationError, number, text } from './validate';
import { done, guard, guardRedirect, type ActionState } from './action-utils';

// ---------- Configurações ----------

export async function saveShopSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    await requireAdmin();
    const hours = number(fd, 'th_hours', 'Aviso por horas', { required: true, max: 1000 })!;
    const days = number(fd, 'th_days', 'Aviso por dias', { required: true, integer: true, max: 365 })!;
    const stale = number(fd, 'th_stale', 'Leitura desatualizada', { required: true, integer: true, positive: true, max: 3650 })!;
    const checklist = String(fd.get('checklist') ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 60);
    await saveSettings({
      shopName: text(fd, 'shopName', 'Nome da oficina', { required: true, max: 120 })!,
      shopPhone: text(fd, 'shopPhone', 'Telefone', { max: 40 }) ?? '',
      shopAddress: text(fd, 'shopAddress', 'Endereço', { max: 200 }) ?? '',
      shopDocument: text(fd, 'shopDocument', 'CNPJ/CPF', { max: 30 }) ?? '',
      whatsappTemplate: text(fd, 'whatsappTemplate', 'Mensagem de aviso', { required: true, max: 1000 })!,
      thresholds: { hours, days, staleReadingDays: stale },
      checklist,
    });
  });
  if (r) return r;
  done('/configuracoes', 'Configurações salvas.');
}

// ---------- Tipos de manutenção ----------

export async function saveMaintenanceType(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    await requireAdmin();
    const name = text(fd, 'name', 'Nome do tipo', { required: true, max: 80 })!;
    const typeId = Number(fd.get('id')) || 0;
    const db = await getDb();
    if (typeId) await db.run('UPDATE maintenance_types SET name = ? WHERE id = ?', name, typeId);
    else await db.run('INSERT INTO maintenance_types (name) VALUES (?)', name);
  });
  if (r) return r;
  done('/configuracoes#tipos', 'Tipo de manutenção salvo.');
}

export async function setMaintenanceTypeActive(fd: FormData) {
  await guardRedirect('/configuracoes', async () => {
    await requireAdmin();
    await (await getDb()).run('UPDATE maintenance_types SET is_active = ? WHERE id = ?', fd.get('active') === '1' ? 1 : 0, Number(fd.get('id')));
  });
  done('/configuracoes#tipos', 'Tipo de manutenção atualizado.');
}

// ---------- Usuários ----------

const ROLES: Role[] = ['admin', 'mecanico', 'consulta'];

async function activeAdmins(excludeId: number): Promise<number> {
  const row = await (await getDb()).get<{ n: number }>("SELECT count(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?", excludeId);
  return row?.n ?? 0;
}

export async function saveUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    await requireAdmin();
    const userId = Number(fd.get('id')) || 0;
    const username = text(fd, 'username', 'Usuário', { required: true, max: 40 })!;
    if (!/^[\w.@-]+$/.test(username)) throw new ValidationError('Usuário: use letras, números, ponto, hífen ou @.');
    const name = text(fd, 'name', 'Nome', { required: true, max: 80 })!;
    const role = String(fd.get('role')) as Role;
    if (!ROLES.includes(role)) throw new ValidationError('Selecione o perfil.');
    const password = String(fd.get('password') ?? '');
    if (password && password.length < 8) throw new ValidationError('A senha deve ter pelo menos 8 caracteres.');
    const db = await getDb();
    if (userId) {
      if (role !== 'admin' && (await activeAdmins(userId)) === 0) throw new ValidationError('É preciso manter ao menos um administrador ativo.');
      await db.run('UPDATE users SET username = ?, name = ?, role = ? WHERE id = ?', username, name, role, userId);
      if (password) await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), userId);
    } else {
      if (!password) throw new ValidationError('Defina uma senha para o novo usuário.');
      await db.run('INSERT INTO users (username, name, role, password_hash) VALUES (?, ?, ?, ?)', username, name, role, hashPassword(password));
    }
  });
  if (r) return r;
  done('/configuracoes/usuarios', 'Usuário salvo.');
}

export async function setUserActive(fd: FormData) {
  const userId = Number(fd.get('id'));
  const active = fd.get('active') === '1' ? 1 : 0;
  await guardRedirect('/configuracoes/usuarios', async () => {
    await requireAdmin();
    if (!active && (await activeAdmins(userId)) === 0) throw new ValidationError('É preciso manter ao menos um administrador ativo.');
    await (await getDb()).run('UPDATE users SET is_active = ? WHERE id = ?', active, userId);
  });
  done('/configuracoes/usuarios', active ? 'Usuário reativado.' : 'Usuário desativado.');
}

// ---------- Anexos ----------

function sniffMime(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** Recebe UM arquivo por chamada (o navegador reduz as fotos e envia um a um, por causa do limite da Vercel). */
export async function uploadAttachment(fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireEditor();
    const tractorId = Number(fd.get('tractor_id')) || null;
    const workOrderId = Number(fd.get('work_order_id')) || null;
    if (!tractorId && !workOrderId) throw new ValidationError('Anexo sem destino.');
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw new ValidationError('Selecione um arquivo.');
    if (file.size > MAX_UPLOAD_BYTES) throw new ValidationError(`${file.name}: arquivo maior que 4 MB.`);
    const caption = text(fd, 'caption', 'Legenda', { max: 200 });
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = sniffMime(buf);
    if (!mime) throw new ValidationError(`${file.name}: envie foto (JPG, PNG, WEBP) ou PDF.`);
    const stored = `${randomUUID()}${ALLOWED_MIME[mime]}`;
    await storeFile(stored, buf, mime);
    try {
      await (await getDb()).run(
        'INSERT INTO attachments (tractor_id, work_order_id, stored_name, original_name, mime, size, caption, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        tractorId, workOrderId, stored, file.name.slice(0, 200), mime, buf.length, caption, user.id,
      );
    } catch (e) {
      await removeFile(stored);
      throw e;
    }
  });
}

export async function deleteAttachment(fd: FormData) {
  const att = await getAttachment(Number(fd.get('id')));
  if (!att) done('/', 'Anexo já removido.');
  const back = att.work_order_id ? `/ordens/${att.work_order_id}#anexos` : `/tratores/${att.tractor_id}#anexos`;
  await guardRedirect(back, async () => {
    await requireEditor();
    await (await getDb()).run('DELETE FROM attachments WHERE id = ?', att.id);
    await removeFile(att.stored_name);
  });
  done(back, 'Anexo removido.');
}

// ---------- Importação de planilha (proprietários + tratores) ----------

function parseNum(v: string): number | null {
  if (!v) return null;
  const n = Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v);
  return Number.isFinite(n) ? n : NaN;
}

/** Converte DD/MM/AAAA ou AAAA-MM-DD para AAAA-MM-DD. */
function parseDate(v: string): string | null {
  if (!v) return null;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  const iso = br ? `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}` : v;
  return isValidIsoDate(iso) ? iso : 'invalid';
}

export async function importSpreadsheet(_: ActionState, fd: FormData): Promise<ActionState> {
  const created = { owners: 0, tractors: 0 };
  const r = await guard(async () => {
    const user = await requireAdmin();
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw new ValidationError('Selecione o arquivo CSV.');
    if (file.size > 4 * 1024 * 1024) throw new ValidationError('Arquivo maior que 4 MB.');
    const rows = parseCsv(await file.text());
    if (rows.length < 2) throw new ValidationError('A planilha precisa do cabeçalho e ao menos uma linha.');
    const header = rows[0].map((h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'));
    const col = (name: string) => header.indexOf(name);
    for (const required of ['proprietario', 'marca', 'modelo']) {
      if (col(required) < 0) throw new ValidationError(`Coluna obrigatória ausente: ${required}.`);
    }
    const today = todayInTimeZone();
    const errors: string[] = [];
    type Row = {
      owner: string; phone: string | null; city: string | null; brand: string; model: string; year: number | null; serial: string | null;
      hours: number | null; readAt: string | null; oil: string | null; liters: number | null; intH: number | null; intM: number | null;
    };
    const parsed: Row[] = [];
    rows.slice(1).forEach((cells, i) => {
      const line = i + 2;
      const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? '').trim() : '');
      const rowErrors: string[] = [];
      const owner = get('proprietario');
      const brand = get('marca');
      const model = get('modelo');
      if (!owner) rowErrors.push('proprietário vazio');
      if (!brand || !model) rowErrors.push('marca/modelo vazio');
      const rawPhone = get('telefone');
      const phone = rawPhone ? normalizePhone(rawPhone) : null;
      if (rawPhone && !phone) rowErrors.push('telefone inválido');
      const nums = { ano: parseNum(get('ano')), horimetro: parseNum(get('horimetro')), litros: parseNum(get('litros')),
        intervalo_horas: parseNum(get('intervalo_horas')), intervalo_meses: parseNum(get('intervalo_meses')) };
      for (const [k, v] of Object.entries(nums)) if (v != null && (Number.isNaN(v) || v < 0)) rowErrors.push(`${k} inválido`);
      if (nums.intervalo_meses != null && !Number.isInteger(nums.intervalo_meses)) rowErrors.push('intervalo_meses deve ser inteiro');
      let readAt = parseDate(get('data_leitura'));
      if (readAt === 'invalid' || (readAt && readAt > today)) rowErrors.push('data_leitura inválida');
      if (nums.horimetro != null && !readAt) readAt = today;
      if (rowErrors.length) { errors.push(`Linha ${line}: ${rowErrors.join(', ')}`); return; }
      parsed.push({
        owner, phone, city: get('municipio') || null, brand, model, year: nums.ano, serial: get('serie') || null,
        hours: nums.horimetro, readAt: nums.horimetro != null ? readAt : null, oil: get('oleo') || null,
        liters: nums.litros || null, intH: nums.intervalo_horas || null, intM: nums.intervalo_meses || null,
      });
    });
    if (errors.length) throw new ValidationError(`Nada foi importado. Corrija:\n${errors.slice(0, 30).join('\n')}${errors.length > 30 ? `\n… e mais ${errors.length - 30}` : ''}`);
    if (parsed.length > 2000) throw new ValidationError('Importe no máximo 2000 linhas por vez.');

    await transaction(async (tx) => {
      const ownerIds = new Map<string, number>();
      for (const row of parsed) {
        const key = row.owner.toLowerCase();
        let ownerId = ownerIds.get(key);
        if (!ownerId) {
          const found = await tx.get<{ id: number }>('SELECT id FROM owners WHERE name = ? COLLATE NOCASE', row.owner);
          if (found) ownerId = found.id;
          else {
            ownerId = (await tx.run('INSERT INTO owners (name, phone, city) VALUES (?, ?, ?)', row.owner, row.phone, row.city)).lastInsertRowid;
            created.owners++;
          }
          ownerIds.set(key, ownerId);
        }
        const tractorId = (await tx.run(
          `INSERT INTO tractors (sequential_number, owner_id, brand, model, year, serial_number, current_hours, hours_read_at,
             oil_spec, oil_capacity_liters, interval_hours, interval_months, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Importado de planilha')`,
          await nextTractorNumber(tx), ownerId, row.brand, row.model, row.year, row.serial, row.hours, row.readAt,
          row.oil, row.liters, row.intH, row.intM,
        )).lastInsertRowid;
        created.tractors++;
        if (row.hours != null) {
          await tx.run('INSERT INTO hour_readings (tractor_id, hours, read_at, created_by) VALUES (?, ?, ?, ?)', tractorId, row.hours, row.readAt, user.id);
        }
      }
    });
  });
  if (r) return r;
  done('/tratores', `Importação concluída: ${created.tractors} ${created.tractors === 1 ? 'trator' : 'tratores'} e ${created.owners} ${created.owners === 1 ? 'proprietário novo' : 'proprietários novos'}.`);
}
