import type { Crop, InventoryItem, UsageLog, Harvest, Expense, WeatherLog } from '../db/types';
import { supabase } from './supabase';

type AnyRecord = Record<string, unknown>;

function toDbRow(obj: AnyRecord, userId: string): AnyRecord {
  const { tenant_id: _t, ...rest } = obj;
  return { ...rest, user_id: userId };
}

function fromDbRow<T>(row: AnyRecord): T {
  const { user_id: _u, ...rest } = row;
  return { ...rest, tenant_id: 'tenant-1' } as T;
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

export function upsertRow(table: string, obj: AnyRecord, userId: string) {
  const row = toDbRow(obj, userId);
  return supabase.from(table).upsert(row, { onConflict: 'id' });
}

export function deleteRow(table: string, id: string) {
  return supabase.from(table).delete().eq('id', id);
}
