import type { Crop, InventoryItem, UsageLog, Harvest, Expense, WeatherLog } from '../db/types';
import { supabase } from './supabase';

type AnyRecord = Record<string, unknown>;

// Per-table column allowlist — must match the Supabase table schemas. Any key
// present on the local object but missing from this list is stripped before
// the upsert so it can't trigger a 400 ("column does not exist"). When you add
// a column to a Supabase table via migration, add it here too.
const TABLE_COLUMNS: Record<string, ReadonlyArray<string>> = {
  crops:        ['id', 'user_id', 'name', 'variety', 'seed_company', 'start_date', 'transplant_date', 'expected_end_date', 'end_date', 'area_covered', 'num_plants', 'seed_nursery_cost', 'target_yield_kg', 'notes', 'status', 'created_at'],
  inventory:    ['id', 'user_id', 'name', 'brand', 'category', 'unit', 'purchased_qty', 'remaining_qty', 'price', 'purchase_date', 'supplier', 'low_stock_threshold', 'notes', 'image_url', 'created_at'],
  usage_logs:   ['id', 'user_id', 'crop_id', 'date', 'inventory_id', 'product_name', 'quantity_used', 'unit', 'area_treated', 'cost', 'type', 'notes', 'repeat_schedule', 'repeat_interval_days', 'created_at'],
  harvests:     ['id', 'user_id', 'crop_id', 'date', 'weight_total', 'weight_grade_a', 'weight_grade_b', 'weight_grade_c', 'wastage', 'buyer_name', 'mandi_rate', 'sale_rate', 'revenue', 'notes', 'image_url', 'created_at'],
  expenses:     ['id', 'user_id', 'crop_id', 'date', 'category', 'amount', 'notes', 'created_at'],
  weather_logs: ['id', 'user_id', 'date', 'temp', 'humidity', 'rainfall', 'wind', 'aqi', 'uv_index', 'sunrise', 'sunset', 'vpd', 'dew_point', 'temp_min', 'temp_max', 'created_at'],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toDbRow(obj: AnyRecord, table: string, userId: string): AnyRecord {
  // Strip tenant_id (client-only synthetic field), add user_id, then restrict
  // to the column allowlist for this table. Also drops undefined values so
  // optional fields don't end up as JSON `null` in unexpected places.
  const { tenant_id: _t, ...rest } = obj;
  const withUser: AnyRecord = { ...rest, user_id: userId };

  const allowed = TABLE_COLUMNS[table];
  const out: AnyRecord = {};
  const source = allowed ?? Object.keys(withUser);
  for (const key of source) {
    const v = withUser[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function fromDbRow<T>(row: AnyRecord): T {
  const { user_id: _u, ...rest } = row;
  return { ...rest, tenant_id: 'tenant-1' } as T;
}

function logSupabaseError(op: 'upsert' | 'delete', table: string, error: { message?: string; code?: string; details?: string; hint?: string }, extra: AnyRecord): void {
  console.error(
    `[Sync] Supabase ${op} failed for ${table}:`,
    `\n  message: ${error.message ?? '(none)'}`,
    `\n  code:    ${error.code ?? '(none)'}`,
    `\n  details: ${error.details ?? '(none)'}`,
    `\n  hint:    ${error.hint ?? '(none)'}`,
    extra,
  );
}

export async function pullAllData(userId: string) {
  const [crops, inventory, usageLogs, harvests, expenses, weatherLogs] = await Promise.all([
    supabase.from('crops').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('inventory').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('usage_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('harvests').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('expenses').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('weather_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);

  return {
    crops: (crops.data ?? []).map(r => fromDbRow<Crop>(r as AnyRecord)),
    inventory: (inventory.data ?? []).map(r => fromDbRow<InventoryItem>(r as AnyRecord)),
    usageLogs: (usageLogs.data ?? []).map(r => fromDbRow<UsageLog>(r as AnyRecord)),
    harvests: (harvests.data ?? []).map(r => fromDbRow<Harvest>(r as AnyRecord)),
    expenses: (expenses.data ?? []).map(r => fromDbRow<Expense>(r as AnyRecord)),
    weatherLogs: (weatherLogs.data ?? []).map(r => fromDbRow<WeatherLog>(r as AnyRecord)),
    errors: [crops.error, inventory.error, usageLogs.error, harvests.error, expenses.error, weatherLogs.error].filter(Boolean),
  };
}

export async function upsertRow(table: string, obj: AnyRecord): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error(`[Sync] No active session — cannot write to ${table}`);
  const row = toDbRow(obj, table, user.id);

  // Surface non-UUID ids early — Supabase rejects them on uuid columns with a
  // cryptic 400 ("invalid input syntax for type uuid"). This usually means a
  // mock-data row (e.g. 'crop-active-1') leaked into the sync queue.
  const id = row.id;
  if (typeof id === 'string' && !UUID_RE.test(id)) {
    console.warn(`[Sync] Row id for ${table} is not a UUID: "${id}". This will likely be rejected by Supabase.`);
  }

  const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
  if (error) {
    logSupabaseError('upsert', table, error, { payload: row });
    throw error;
  }
}

export async function deleteRow(table: string, id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error(`[Sync] No active session — cannot delete from ${table}`);
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) {
    logSupabaseError('delete', table, error, { id });
    throw error;
  }
}
