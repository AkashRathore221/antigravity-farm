import React, { useState } from 'react';
import {
  Search, Leaf, Shield, Droplet, Thermometer, Zap, Info
} from 'lucide-react';

interface Deficiency {
  id: string;
  nutrient: string;
  severity: 'Critical' | 'Moderate' | 'Mild';
  symptoms: string;
  causes: string;
  solutions: string;
  stage: string;
}

export const Reference: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<'deficiencies' | 'fertigation' | 'sprays' | 'irrigation'>('deficiencies');

  const deficiencies: Deficiency[] = [
    {
      id: 'def-n',
      nutrient: 'Nitrogen (N) Deficiency',
      severity: 'Critical',
      symptoms: 'Overall pale green foliage (chlorosis). Lower older leaves turn bright yellow and may die first. Stunted stem elongation and thin lateral shoots. Cucumbers become pale, pointed at the blossom end, and bitter.',
      causes: 'Leaching in sandy soils, low organic matter, excessive watering washouts, or cold root zones slowing root uptake.',
      solutions: 'Drip apply Calcium Nitrate or Urea (2-3g/plant). Foliar spray a 1% balanced NPK (19:19:19) solution for quick vegetative recovery.',
      stage: 'Vegetative & Early Sowing'
    },
    {
      id: 'def-k',
      nutrient: 'Potassium (K) Deficiency',
      severity: 'Critical',
      symptoms: 'Marginal yellowing (chlorosis) starting at leaf edges of older foliage, advancing to necrotic brown margins (leaf burn). Leaf margins curl upward. Fruit sizing is severely stunted; cucumbers appear pinched at the stem end and bloated at the blossom end (crooking).',
      causes: 'High competition with Calcium or Magnesium in soil, waterlogged clay soils blocking K uptake, or heavy fruit loading taxing root reserves.',
      solutions: 'Fertigate Potassium Nitrate (KNO3) or Potassium Sulfate (K2SO4) at 2-3g/plant/day during heavy harvest flushes.',
      stage: 'Harvesting & Fruit Loading'
    },
    {
      id: 'def-ca',
      nutrient: 'Calcium (Ca) Deficiency',
      severity: 'Critical',
      symptoms: 'Death of grow tips (apical meristems). Young leaves emerge deformed, cup-shaped (margins curling downward), with dry necrotic tips. Heavy blossom-end rot on young fruits. Roots appear dark brown, short, and stubby.',
      causes: 'Extremely high greenhouse humidity (>85%) or extreme heat causing stomatal lock and stopping transpiration (Calcium only moves with water flow). Very acidic soils.',
      solutions: 'Maintain greenhouse VPD between 1.0 - 1.5 kPa to promote continuous transpiration. Drip fertigate YaraLiva Calcium Nitrate weekly at 1.5-2.0g/plant.',
      stage: 'Flowering & Sizing'
    },
    {
      id: 'def-fe',
      nutrient: 'Iron (Fe) Deficiency',
      severity: 'Moderate',
      symptoms: 'Distinct interveinal chlorosis on the youngest upper leaves. The leaf blade turns pale yellow or ivory while the intricate vein network remains sharp, dark green.',
      causes: 'Alkaline soil pH (>7.2) locking iron minerals, cold wet soils, or high phosphorus levels blocking absorption.',
      solutions: 'Foliar spray Fe-EDTA or Fe-DTPA chelates at 0.5-1.0g per liter of water. Drip feed chelated iron during early morning irrigation.',
      stage: 'Vegetative growth'
    },
    {
      id: 'def-mg',
      nutrient: 'Magnesium (Mg) Deficiency',
      severity: 'Moderate',
      symptoms: 'Interveinal chlorosis on older, mature leaves. Leaf center turns pale green/yellow while veins and outer margins stay green. White necrotic spots may form in severe cases.',
      causes: 'Excessive Potassium (K) fertigation blocking Mg uptake, acidic soils, or weak roots.',
      solutions: 'Foliar spray Magnesium Sulfate (Epsom Salt) at 2% concentration (20g per liter of water). Add Magnesium to fertigation tanks.',
      stage: 'Mid-flowering'
    }
  ];

  const filteredDeficiencies = deficiencies.filter(d => 
    d.nutrient.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.symptoms.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* SECTION TABS HEADER */}
      <div className="no-print flex overflow-x-auto pb-2 gap-2 border-b border-slate-200 dark:border-slate-800 no-scrollbar">
        <button
          onClick={() => setActiveCategory('deficiencies')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            activeCategory === 'deficiencies'
              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/10'
              : 'bg-slate-100 hover:bg-slate-250 dark:bg-slate-900/60 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-400'
          }`}
        >
          <Leaf size={14} />
          <span>Deficiencies Diagnostic Grid</span>
        </button>
        <button
          onClick={() => setActiveCategory('fertigation')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            activeCategory === 'fertigation'
              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/10'
              : 'bg-slate-100 hover:bg-slate-250 dark:bg-slate-900/60 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-400'
          }`}
        >
          <Zap size={14} />
          <span>Fertigation & NPK Plans</span>
        </button>
        <button
          onClick={() => setActiveCategory('sprays')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            activeCategory === 'sprays'
              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/10'
              : 'bg-slate-100 hover:bg-slate-250 dark:bg-slate-900/60 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-400'
          }`}
        >
          <Shield size={14} />
          <span>Foliar Spray Rotation</span>
        </button>
        <button
          onClick={() => setActiveCategory('irrigation')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            activeCategory === 'irrigation'
              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/10'
              : 'bg-slate-100 hover:bg-slate-250 dark:bg-slate-900/60 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-400'
          }`}
        >
          <Droplet size={14} />
          <span>Irrigation Regimens</span>
        </button>
      </div>

      {/* 1. DEFICIENCY DIAGNOSTIC GRID */}
      {activeCategory === 'deficiencies' && (
        <div className="space-y-6">
          <div className="no-print flex items-center justify-between gap-4 flex-col md:flex-row">
            <div>
              <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">Leaf Deficiency Diagnostics</h3>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">Diagnose cucumber nutrition shortages based on physical leaf symptoms.</p>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Search symptom, nutrient..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-900 pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none border border-transparent dark:border-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {filteredDeficiencies.map((d) => (
              <div 
                key={d.id} 
                className={`glass-premium p-6 rounded-2xl border shadow-sm transition-all flex flex-col md:flex-row gap-6 ${
                  d.severity === 'Critical' 
                    ? 'border-red-500/10 dark:border-red-500/5 bg-red-500/5' 
                    : 'border-slate-200/50 dark:border-slate-800/50'
                }`}
              >
                {/* Visual marker */}
                <div className="md:w-48 shrink-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      d.severity === 'Critical' ? 'bg-red-500' : 'bg-amber-500'
                    }`}></span>
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">{d.severity} Alert</span>
                  </div>
                  <h4 className="font-heading font-bold text-slate-800 dark:text-slate-100 text-base">{d.nutrient}</h4>
                  <div className="text-[10px] bg-slate-100 dark:bg-slate-850 px-2 py-1 rounded-md text-slate-500 dark:text-slate-400 font-bold inline-block">
                    Stage: {d.stage}
                  </div>
                </div>

                {/* Content details */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[9px] block">Leaf Symptoms</span>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-semibold">{d.symptoms}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[9px] block">Root Causes</span>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{d.causes}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[9px] block">Agronomist Solution</span>
                    <p className="text-emerald-650 dark:text-emerald-350 leading-relaxed font-semibold">{d.solutions}</p>
                  </div>
                </div>
              </div>
            ))}
            {filteredDeficiencies.length === 0 && (
              <div className="glass p-12 text-center text-slate-400 italic">No matching deficiency reports found. Try typing "Calcium" or "Yellow".</div>
            )}
          </div>
        </div>
      )}

      {/* 2. FERTIGATION SCHEDULES */}
      {activeCategory === 'fertigation' && (
        <div className="space-y-6 animate-slide-up">
          <div>
            <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">Cucumber Fertigation Schedule Plan</h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">High-frequency nutritional calendar for drip line polyhouse irrigation.</p>
          </div>

          <div className="glass-premium rounded-2xl border border-slate-200/50 dark:border-slate-800/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-100/50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                    <th className="p-4">Crop Stage</th>
                    <th className="p-4">Duration</th>
                    <th className="p-4">NPK Nutrition Ratio</th>
                    <th className="p-4">Dosage per Plant</th>
                    <th className="p-4">Agronomist Recommendation / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/30">
                  <tr>
                    <td className="p-4 font-bold text-slate-850 dark:text-slate-100">Stage 1: Seedling & Establishment</td>
                    <td className="p-4">Days 1 - 10</td>
                    <td className="p-4 font-bold text-emerald-600 dark:text-emerald-400">NPK 19:19:19 (Balanced)</td>
                    <td className="p-4">0.5 grams / day</td>
                    <td className="p-4 text-slate-500">Focus on rapid root zone expansion. Keep soil slightly moist. Avoid high salts.</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-bold text-slate-850 dark:text-slate-100">Stage 2: Vegetative Training</td>
                    <td className="p-4">Days 11 - 25</td>
                    <td className="p-4 font-bold text-teal-500">NPK 30:10:10 (High Nitrogen)</td>
                    <td className="p-4">1.2 grams / day</td>
                    <td className="p-4 text-slate-500">Accelerate stem vertical training and lateral pruning. Introduce Calcium Nitrate weekly (1.0g/plant).</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-bold text-slate-850 dark:text-slate-100">Stage 3: Flowering & Fruit Set</td>
                    <td className="p-4">Days 26 - 45</td>
                    <td className="p-4 font-bold text-amber-500">NPK 12:12:36 (Mid Potassium)</td>
                    <td className="p-4">1.8 grams / day</td>
                    <td className="p-4 text-slate-500">Crucial transition stage. Weekly Calcium Nitrate is absolute (1.5g/plant) to prevent blossom rot. Add boron.</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-bold text-slate-850 dark:text-slate-100">Stage 4: Harvesting Flush</td>
                    <td className="p-4">Days 46 - End</td>
                    <td className="p-4 font-bold text-red-500">NPK 13:0:45 (High Potassium)</td>
                    <td className="p-4">2.2 grams / day</td>
                    <td className="p-4 text-slate-500">Harvesting depletes potassium. KNO3 drip lines drive thick straight cucumber skin density. Maintain humidity.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-4 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 text-xs">
            <Info size={20} className="text-indigo-500 shrink-0 mt-0.5" />
            <p className="text-slate-500 leading-relaxed">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-0.5">Fertigation Precaution Note</span>
              Never mix Calcium Nitrate and Sulfate-based fertilizers (like Magnesium Sulfate) in the same concentrated header tank (Tank A & B). They will react and form insoluble Gypsum, completely clogging your drip emitters.
            </p>
          </div>
        </div>
      )}

      {/* 3. SPRAY ROTATIONS */}
      {activeCategory === 'sprays' && (
        <div className="space-y-6 animate-slide-up">
          <div>
            <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">Pest Resistance Foliar Spray Plan</h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">Pest spray rotation schedule designed to prevent insecticide resistance in polyhouse glasshouse systems.</p>
          </div>

          <div className="glass-premium p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
              
              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800/40">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[9px] block">Block A: Sucking Pests (Whitefly, Thrips)</span>
                <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">Active: Imidacloprid (Confidor)</div>
                <p className="text-slate-500 leading-normal">
                  Foliar spray 0.5ml/L at early morning canopy. Alternated with Acetamiprid 20% SP every 12 days to break thrips lifecycle.
                </p>
                <div className="text-[10px] text-slate-400 font-bold">Safety Interval (PHI): 7 Days</div>
              </div>

              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800/40">
                <span className="font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider text-[9px] block">Block B: Fungal Control (Mildew, Blight)</span>
                <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">Active: Azoxystrobin (Amistar)</div>
                <p className="text-slate-500 leading-normal">
                  Mix 1.0ml/L. Exceptional broad-spectrum protection against Downy and Powdery mildew. Apply immediately on low VPD risk warnings.
                </p>
                <div className="text-[10px] text-slate-400 font-bold">Safety Interval (PHI): 5 Days</div>
              </div>

              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800/40">
                <span className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider text-[9px] block">Block C: Red Spider Mite Management</span>
                <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">Active: Abamectin (Agri-Mek)</div>
                <p className="text-slate-500 leading-normal">
                  Mix 0.4ml/L. Severe in hot dry climates. Targets both eggs and mature mites. Rotate with Spiromesifen to safeguard canopy.
                </p>
                <div className="text-[10px] text-slate-400 font-bold">Safety Interval (PHI): 3 Days</div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 4. IRRIGATION REGIMENS */}
      {activeCategory === 'irrigation' && (
        <div className="space-y-6 animate-slide-up">
          <div>
            <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">Cucumber Drip Irrigation Regimen</h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">Irrigation schedules calibrated by external temperature and active greenhouse canopy transpiring status.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="glass-premium p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-3 text-xs">
              <div className="flex items-center gap-2 text-blue-500">
                <Thermometer size={18} />
                <span className="font-heading font-bold text-sm">Cold / Cloudy Conditions</span>
              </div>
              <div className="text-[10px] text-slate-400 font-bold">Temps: 18°C - 24°C &bull; Humidity: &gt;75%</div>
              <div className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100 py-1">0.8 - 1.2 Liters</div>
              <p className="text-slate-500 leading-relaxed">
                Per plant per day. Apply in 2 brief cycles: early morning and early afternoon. Watch for low transpiration and avoid overwatering root zones.
              </p>
            </div>

            <div className="glass-premium p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-500">
                <Thermometer size={18} />
                <span className="font-heading font-bold text-sm">Optimal Spring / Moderate Days</span>
              </div>
              <div className="text-[10px] text-slate-400 font-bold">Temps: 25°C - 30°C &bull; Humidity: 55% - 70%</div>
              <div className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100 py-1">1.8 - 2.4 Liters</div>
              <p className="text-slate-500 leading-relaxed">
                Per plant per day. Apply in 4 cycles: 8:00 AM, 11:00 AM, 1:00 PM, 3:30 PM. Roots transpire at premium efficiency during these intervals.
              </p>
            </div>

            <div className="glass-premium p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-3 text-xs">
              <div className="flex items-center gap-2 text-amber-500">
                <Thermometer size={18} />
                <span className="font-heading font-bold text-sm">Hot / Dry Summer Peaks</span>
              </div>
              <div className="text-[10px] text-slate-400 font-bold">Temps: &gt;31°C &bull; Humidity: &lt;50%</div>
              <div className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100 py-1">2.8 - 3.6 Liters</div>
              <p className="text-slate-500 leading-relaxed">
                Per plant per day. Apply in 6-8 brief pulses. Short high-frequency irrigation prevents drying root stress and cools down greenhouse temperatures.
              </p>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
