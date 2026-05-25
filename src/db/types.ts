export type CropStatus = 'active' | 'archived';

export interface Crop {
  id: string;
  tenant_id: string;
  name: string;
  variety: string;
  seed_company: string;
  start_date: string; // YYYY-MM-DD
  transplant_date: string; // YYYY-MM-DD
  expected_end_date: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD (present if status is 'archived')
  area_covered: number; // in square meters
  num_plants: number;
  seed_nursery_cost: number; // total seed/nursery tray cost (₹)
  target_yield_kg?: number; // target harvest volume goal (kg)
  notes: string;
  status: CropStatus;
  created_at: string;
}

export type InventoryCategory =
  | 'fertilizers'
  | 'pesticides'
  | 'fungicides'
  | 'insecticides'
  | 'bio_stimulants'
  | 'sticky_traps'
  | 'packaging_material';

export type UnitType = 'kg' | 'liter' | 'piece' | 'gram' | 'ml';

export interface InventoryItem {
  id: string;
  tenant_id: string;
  name: string;
  brand: string;
  category: InventoryCategory;
  unit: UnitType;
  purchased_qty: number;
  remaining_qty: number;
  price: number; // total purchase price for the whole `purchased_qty` (per-unit cost = price / purchased_qty)
  purchase_date: string;
  supplier: string;
  low_stock_threshold: number;
  notes: string;
  image_url?: string;
  created_at: string;
}

export type UsageType = 'fertigation' | 'spray' | 'chemical' | 'bio_stimulant';

export interface UsageLog {
  id: string;
  tenant_id: string;
  crop_id: string;
  date: string;
  inventory_id: string | null; // null if manual text entry
  product_name: string;
  quantity_used: number;
  unit: UnitType;
  area_treated: number; // square meters
  cost: number; // auto-calculated based on inventory item price per unit
  type: UsageType;
  notes: string;
  repeat_schedule: boolean;
  repeat_interval_days?: number; // e.g. 5, 7, 15
  created_at: string;
}

export interface Harvest {
  id: string;
  tenant_id: string;
  crop_id: string;
  date: string;
  weight_total: number; // in kg
  weight_grade_a: number; // in kg
  weight_grade_b: number; // in kg
  weight_grade_c: number; // in kg
  wastage: number; // in kg
  buyer_name: string;
  mandi_rate: number; // local benchmark rate ($ or ₹ / kg)
  sale_rate: number; // contract sold rate ($ or ₹ / kg)
  revenue: number; // weight_total * sale_rate
  notes: string;
  image_url?: string;
  created_at: string;
}

export type ExpenseCategory = 'labour' | 'inventory' | 'transport' | 'packaging' | 'miscellaneous' | 'personal_vehicle_fuel';

export interface Expense {
  id: string;
  tenant_id: string;
  crop_id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  notes: string;
  created_at: string;
}

export interface WeatherLog {
  id: string;
  tenant_id: string;
  date: string; // YYYY-MM-DD
  temp: number; // in °C
  humidity: number; // %
  rainfall: number; // mm
  wind: number; // km/h
  aqi?: number;
  uv_index?: number;
  sunrise?: string;
  sunset?: string;
  vpd?: number; // Vapor Pressure Deficit (kPa)
  dew_point?: number; // °C
  temp_min?: number; // daily minimum temperature (°C)
  temp_max?: number; // daily maximum temperature (°C)
  created_at: string;
}

export interface ModuleConfig {
  dashboard: boolean;
  cropLifecycle: boolean;
  inventory: boolean;
  usageLogs: boolean;
  harvest: boolean;
  expenses: boolean;
  weather: boolean;
  analytics: boolean;
  reports: boolean;
  reference: boolean;
}

export interface AppSettings {
  modules: ModuleConfig;
  features: {
    expenseAnalytics: boolean;
    charts: boolean;
    inventoryAlerts: boolean;
    recurringReminders: boolean;
    weatherForecast: boolean;
    photoUploads: boolean;
  };
  widgetsOrder: string[]; // Order of cards on dashboard
  categories: {
    inventory: string[];
    expense: string[];
  };
  fields: {
    mandiRate: boolean;
    areaTreated: boolean;
    gradesWeight: boolean;
  };
  supabaseUrl: string;
  supabaseAnonKey: string;
  isOnlineSyncEnabled: boolean;
  farmProfile?: {
    farmName: string;
    ownerName: string;
    farmCity: string;
    farmLat?: number;
    farmLng?: number;
    totalAreaSqM: number;
  };
}

export interface SyncQueueItem {
  id: string;
  action: 'insert' | 'update' | 'delete';
  // Settings are intentionally NOT in this union — they're local-only,
  // see updateSettings() in src/store/useAppStore.ts.
  table: 'crops' | 'inventory' | 'usage_logs' | 'harvests' | 'expenses' | 'weather_logs';
  data: any;
  timestamp: string;
}
