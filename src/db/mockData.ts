import type { Crop, InventoryItem, UsageLog, Harvest, Expense, WeatherLog, AppSettings } from './types';

// Helper to get relative dates based on current date
const getRelativeDate = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

export const mockCrops: Crop[] = [
  {
    id: 'crop-active-1',
    tenant_id: 'tenant-1',
    name: 'Cucumber Polyhouse Alpha',
    variety: 'Multistar F1 (English Cucumber)',
    seed_company: 'Rijk Zwaan',
    start_date: getRelativeDate(-45),      // Seed sown 45 days ago
    transplant_date: getRelativeDate(-30),  // Transplanted 30 days ago
    expected_end_date: getRelativeDate(60), // Expected end in 60 days
    area_covered: 1000,                    // 1000 sq meters (approx 10,000 sq ft)
    num_plants: 3200,                      // Standard high density
    notes: 'Primary greenhouse, high-yield drip fertigation setup. Excellent vegetative growth observed.',
    status: 'active',
    created_at: new Date(getRelativeDate(-45)).toISOString()
  },
  {
    id: 'crop-archived-1',
    tenant_id: 'tenant-1',
    name: 'Cucumber Winter Batch 2025',
    variety: 'Kian F1',
    seed_company: 'Seminis',
    start_date: '2025-10-15',
    transplant_date: '2025-11-01',
    expected_end_date: '2026-02-15',
    end_date: '2026-02-20',
    area_covered: 1000,
    num_plants: 3000,
    notes: 'Successful winter batch. Lower yield due to fog in January but higher market prices.',
    status: 'archived',
    created_at: new Date('2025-10-15').toISOString()
  }
];

export const mockInventory: InventoryItem[] = [
  {
    id: 'inv-1',
    tenant_id: 'tenant-1',
    name: 'Calcium Nitrate (Water Soluble)',
    brand: 'YaraLiva',
    category: 'fertilizers',
    unit: 'kg',
    purchased_qty: 100,
    remaining_qty: 45,
    price: 1.5, // $1.50 per kg
    purchase_date: getRelativeDate(-25),
    supplier: 'AgroGro Supplies',
    low_stock_threshold: 50, // ALERT: Remaining 45 < 50
    notes: 'Crucial for cucumber cell wall strength and blossom end rot prevention.',
    created_at: new Date(getRelativeDate(-25)).toISOString()
  },
  {
    id: 'inv-2',
    tenant_id: 'tenant-1',
    name: 'NPK 19:19:19 (Balanced Fertilizer)',
    brand: 'Mahadhan',
    category: 'fertilizers',
    unit: 'kg',
    purchased_qty: 200,
    remaining_qty: 120,
    price: 1.8,
    purchase_date: getRelativeDate(-25),
    supplier: 'AgroGro Supplies',
    low_stock_threshold: 40,
    notes: 'Starter and vegetative stage balance spray.',
    created_at: new Date(getRelativeDate(-25)).toISOString()
  },
  {
    id: 'inv-3',
    tenant_id: 'tenant-1',
    name: 'Imidacloprid 17.8% SL',
    brand: 'Confidor',
    category: 'insecticides',
    unit: 'ml',
    purchased_qty: 1000,
    remaining_qty: 850,
    price: 0.08, // $0.08 per ml
    purchase_date: getRelativeDate(-20),
    supplier: 'GreenTech Labs',
    low_stock_threshold: 200,
    notes: 'For control of sucking pests like whitefly and thrips.',
    created_at: new Date(getRelativeDate(-20)).toISOString()
  },
  {
    id: 'inv-4',
    tenant_id: 'tenant-1',
    name: 'Trichoderma Viride (Bio Control)',
    brand: 'BioCure-T',
    category: 'bio_stimulants',
    unit: 'kg',
    purchased_qty: 10,
    remaining_qty: 2,
    price: 6.0,
    purchase_date: getRelativeDate(-15),
    supplier: 'Organic Earth Co',
    low_stock_threshold: 5, // ALERT: Remaining 2 < 5
    notes: 'Root inoculation to protect against Fusarium wilt.',
    created_at: new Date(getRelativeDate(-15)).toISOString()
  },
  {
    id: 'inv-5',
    tenant_id: 'tenant-1',
    name: 'Blue Sticky Traps (Double Sided)',
    brand: 'TrapNIP',
    category: 'sticky_traps',
    unit: 'piece',
    purchased_qty: 100,
    remaining_qty: 15,
    price: 0.5,
    purchase_date: getRelativeDate(-28),
    supplier: 'AgroGro Supplies',
    low_stock_threshold: 20, // ALERT: Remaining 15 < 20
    notes: 'Attracts and captures thrips. Hang close to cucumber canopy.',
    created_at: new Date(getRelativeDate(-28)).toISOString()
  },
  {
    id: 'inv-6',
    tenant_id: 'tenant-1',
    name: 'Premium Corrugated Cucumber Box (10kg)',
    brand: 'PackShield',
    category: 'packaging_material',
    unit: 'piece',
    purchased_qty: 500,
    remaining_qty: 420,
    price: 0.8,
    purchase_date: getRelativeDate(-5),
    supplier: 'Express Carton Mfg',
    low_stock_threshold: 100,
    notes: '5-ply sturdy boxes for mandi and direct supply transport.',
    created_at: new Date(getRelativeDate(-5)).toISOString()
  }
];

export const mockUsageLogs: UsageLog[] = [
  {
    id: 'use-1',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-25),
    inventory_id: 'inv-2',
    product_name: 'NPK 19:19:19 (Balanced Fertilizer)',
    quantity_used: 10,
    unit: 'kg',
    area_treated: 1000,
    cost: 18.0, // 10kg * $1.8
    type: 'fertigation',
    notes: 'Early vegetative booster through drip system. Balanced nutrition.',
    repeat_schedule: false,
    created_at: new Date(getRelativeDate(-25)).toISOString()
  },
  {
    id: 'use-2',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-15),
    inventory_id: 'inv-1',
    product_name: 'Calcium Nitrate (Water Soluble)',
    quantity_used: 15,
    unit: 'kg',
    area_treated: 1000,
    cost: 22.5, // 15kg * $1.5
    type: 'fertigation',
    notes: 'Drip fertigation. Initiating flowering stage bone structure reinforcement.',
    repeat_schedule: true,
    repeat_interval_days: 7, // Every week
    created_at: new Date(getRelativeDate(-15)).toISOString()
  },
  {
    id: 'use-3',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-8),
    inventory_id: 'inv-3',
    product_name: 'Imidacloprid 17.8% SL',
    quantity_used: 150,
    unit: 'ml',
    area_treated: 1000,
    cost: 12.0, // 150ml * $0.08
    type: 'spray',
    notes: 'Preventative spray against Whiteflies. Mixed in 200L tank.',
    repeat_schedule: true,
    repeat_interval_days: 15, // Every 15 days
    created_at: new Date(getRelativeDate(-8)).toISOString()
  },
  {
    id: 'use-4',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-8),
    inventory_id: 'inv-1',
    product_name: 'Calcium Nitrate (Water Soluble)',
    quantity_used: 15,
    unit: 'kg',
    area_treated: 1000,
    cost: 22.5,
    type: 'fertigation',
    notes: 'Weekly recurring Calcium fertigation block.',
    repeat_schedule: false,
    created_at: new Date(getRelativeDate(-8)).toISOString()
  },
  {
    id: 'use-5',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-1),
    inventory_id: 'inv-1',
    product_name: 'Calcium Nitrate (Water Soluble)',
    quantity_used: 15,
    unit: 'kg',
    area_treated: 1000,
    cost: 22.5,
    type: 'fertigation',
    notes: 'Weekly recurring Calcium fertigation block.',
    repeat_schedule: false,
    created_at: new Date(getRelativeDate(-1)).toISOString()
  }
];

export const mockHarvests: Harvest[] = [
  {
    id: 'har-1',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-10),
    weight_total: 450,
    weight_grade_a: 320,
    weight_grade_b: 100,
    weight_grade_c: 20,
    wastage: 10,
    buyer_name: 'City Wholesale Mandi',
    mandi_rate: 0.9,
    sale_rate: 1.1, // Premium direct buyer
    revenue: 495.0, // 450 * 1.1
    notes: 'First flush harvest. Exceptional quality, shiny green skins, straight cucumbers.',
    created_at: new Date(getRelativeDate(-10)).toISOString()
  },
  {
    id: 'har-2',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-7),
    weight_total: 580,
    weight_grade_a: 410,
    weight_grade_b: 130,
    weight_grade_c: 30,
    wastage: 10,
    buyer_name: 'City Wholesale Mandi',
    mandi_rate: 0.85,
    sale_rate: 1.05,
    revenue: 609.0,
    notes: 'Second flush. Standard grading. Buyers pleased with consistency.',
    created_at: new Date(getRelativeDate(-7)).toISOString()
  },
  {
    id: 'har-3',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-4),
    weight_total: 620,
    weight_grade_a: 430,
    weight_grade_b: 150,
    weight_grade_c: 30,
    wastage: 10,
    buyer_name: 'Metro Hypermarkets Ltd',
    mandi_rate: 0.9,
    sale_rate: 1.25, // High premium direct supplier contract
    revenue: 775.0,
    notes: 'High demand direct store shipment. Highly select grading criteria.',
    created_at: new Date(getRelativeDate(-4)).toISOString()
  },
  {
    id: 'har-4',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-1),
    weight_total: 510,
    weight_grade_a: 350,
    weight_grade_b: 120,
    weight_grade_c: 30,
    wastage: 10,
    buyer_name: 'City Wholesale Mandi',
    mandi_rate: 0.95,
    sale_rate: 1.15,
    revenue: 586.5,
    notes: 'Consistent daily sizing. High temperature driving fast maturity.',
    created_at: new Date(getRelativeDate(-1)).toISOString()
  }
];

export const mockExpenses: Expense[] = [
  {
    id: 'exp-1',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-30),
    category: 'labour',
    amount: 150.0,
    notes: 'Transplanting crew - 6 labourers for 1 full day including soil bed alignment.',
    created_at: new Date(getRelativeDate(-30)).toISOString()
  },
  {
    id: 'exp-2',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-20),
    category: 'labour',
    amount: 80.0,
    notes: 'Trellis netting and vertical training of primary vines.',
    created_at: new Date(getRelativeDate(-20)).toISOString()
  },
  {
    id: 'exp-3',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-12),
    category: 'labour',
    amount: 120.0,
    notes: 'De-suckering (pruning lower lateral branches) and leaf trimming for aeration.',
    created_at: new Date(getRelativeDate(-12)).toISOString()
  },
  {
    id: 'exp-4',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-10),
    category: 'transport',
    amount: 45.0,
    notes: 'First harvest delivery truck charges to City Mandi.',
    created_at: new Date(getRelativeDate(-10)).toISOString()
  },
  {
    id: 'exp-5',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-7),
    category: 'transport',
    amount: 45.0,
    notes: 'Second harvest delivery truck hire.',
    created_at: new Date(getRelativeDate(-7)).toISOString()
  },
  {
    id: 'exp-6',
    tenant_id: 'tenant-1',
    crop_id: 'crop-active-1',
    date: getRelativeDate(-4),
    category: 'packaging',
    amount: 60.0,
    notes: 'Extra bubble wraps and heavy duty tape for premium hypermarket boxes.',
    created_at: new Date(getRelativeDate(-4)).toISOString()
  }
];

// Helper to calculate saturated vapor pressure
const calculateVPD = (temp: number, humidity: number): number => {
  const svp = 0.61078 * Math.exp((17.27 * temp) / (temp + 237.3));
  const avp = svp * (humidity / 100);
  return parseFloat((svp - avp).toFixed(2));
};

export const mockWeatherLogs: WeatherLog[] = [
  {
    id: 'we-1',
    tenant_id: 'tenant-1',
    date: getRelativeDate(-5),
    temp: 29.5,
    humidity: 65,
    rainfall: 0,
    wind: 12,
    aqi: 72,
    uv_index: 8,
    sunrise: '05:42 AM',
    sunset: '06:55 PM',
    vpd: calculateVPD(29.5, 65), // 1.45 kPa (optimal transpiring range)
    dew_point: 22.1,
    created_at: new Date(getRelativeDate(-5)).toISOString()
  },
  {
    id: 'we-2',
    tenant_id: 'tenant-1',
    date: getRelativeDate(-4),
    temp: 31.0,
    humidity: 58,
    rainfall: 0,
    wind: 14,
    aqi: 80,
    uv_index: 9,
    sunrise: '05:42 AM',
    sunset: '06:56 PM',
    vpd: calculateVPD(31.0, 58), // 1.88 kPa (high transpiration, monitor humidity)
    dew_point: 21.6,
    created_at: new Date(getRelativeDate(-4)).toISOString()
  },
  {
    id: 'we-3',
    tenant_id: 'tenant-1',
    date: getRelativeDate(-3),
    temp: 27.2,
    humidity: 78,
    rainfall: 12.5, // Rain day
    wind: 18,
    aqi: 35,
    uv_index: 3,
    sunrise: '05:41 AM',
    sunset: '06:56 PM',
    vpd: calculateVPD(27.2, 78), // 0.79 kPa (low, caution for fungal outbreaks)
    dew_point: 23.0,
    created_at: new Date(getRelativeDate(-3)).toISOString()
  },
  {
    id: 'we-4',
    tenant_id: 'tenant-1',
    date: getRelativeDate(-2),
    temp: 28.0,
    humidity: 72,
    rainfall: 2.0,
    wind: 10,
    aqi: 48,
    uv_index: 6,
    sunrise: '05:41 AM',
    sunset: '06:57 PM',
    vpd: calculateVPD(28.0, 72), // 1.06 kPa (excellent recovery index)
    dew_point: 22.4,
    created_at: new Date(getRelativeDate(-2)).toISOString()
  },
  {
    id: 'we-5',
    tenant_id: 'tenant-1',
    date: getRelativeDate(-1),
    temp: 30.2,
    humidity: 60,
    rainfall: 0,
    wind: 11,
    aqi: 65,
    uv_index: 9,
    sunrise: '05:40 AM',
    sunset: '06:57 PM',
    vpd: calculateVPD(30.2, 60), // 1.72 kPa
    dew_point: 21.5,
    created_at: new Date(getRelativeDate(-1)).toISOString()
  }
];

export const defaultSettings: AppSettings = {
  modules: {
    dashboard: true,
    cropLifecycle: true,
    inventory: true,
    usageLogs: true,
    harvest: true,
    expenses: true,
    weather: true,
    analytics: true,
    reports: true,
    reference: true
  },
  features: {
    expenseAnalytics: true,
    charts: true,
    inventoryAlerts: true,
    recurringReminders: true,
    weatherForecast: true,
    photoUploads: true
  },
  widgetsOrder: [
    'cropSummary',
    'financials',
    'stockAlerts',
    'spraysReminders',
    'miniCharts',
    'weatherBrief',
    'activityFeed'
  ],
  categories: {
    inventory: [
      'fertilizers',
      'pesticides',
      'fungicides',
      'insecticides',
      'bio_stimulants',
      'sticky_traps',
      'packaging_material'
    ],
    expense: ['labour', 'inventory', 'transport', 'packaging', 'miscellaneous']
  },
  fields: {
    mandiRate: true,
    areaTreated: true,
    gradesWeight: true
  },
  supabaseUrl: '',
  supabaseAnonKey: '',
  isOnlineSyncEnabled: false
};
