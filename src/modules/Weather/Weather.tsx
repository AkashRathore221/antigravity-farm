import React, { useState, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { CloudSun, Navigation, MapPin, PlusCircle, Cloud, CloudRain, Sun, Wind, Droplets, RefreshCw, AlertTriangle, Calendar } from 'lucide-react';

interface ForecastDay {
  day: string;
  tempMax: string;
  tempMin: string;
  humidity: string;
  rain: string;
  wind: string;
  desc: string;
  code: number;
}

interface GeoResult {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  admin1?: string;
}

function wmoCodeToDesc(code: number): string {
  if (code === 0) return 'Clear Sky';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67) return 'Rainy';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain Showers';
  if (code <= 86) return 'Snow Showers';
  return 'Thunderstorm';
}

function ForecastIcon({ code, size = 24 }: { code: number; size?: number }) {
  if (code === 0) return <Sun size={size} className="text-amber-400" />;
  if (code <= 3) return <CloudSun size={size} className="text-emerald-400" />;
  if (code <= 67) return <CloudRain size={size} className="text-sky-400" />;
  return <Cloud size={size} className="text-slate-400" />;
}

export const Weather: React.FC = () => {
  const { weatherLogs, addWeatherLog } = useAppStore();

  const [gpsLoading, setGpsLoading] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState('');
  const [activeCoords, setActiveCoords] = useState({ lat: 0, lon: 0 });
  const [hasCoords, setHasCoords] = useState(false);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    temp: '29.5',
    humidity: '65',
    rainfall: '0',
    wind: '12',
    aqi: '65',
    uv_index: '8',
    sunrise: '05:45 AM',
    sunset: '06:50 PM',
    dew_point: '21.5'
  });

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    setApiLoading(true);
    setApiError(null);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,uv_index,dew_point_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset,uv_index_max,weather_code&timezone=auto&forecast_days=4`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const cur = data.current;
      const daily = data.daily;

      // Format sunrise/sunset
      const sunriseStr = daily.sunrise?.[0]
        ? new Date(daily.sunrise[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '05:45 AM';
      const sunsetStr = daily.sunset?.[0]
        ? new Date(daily.sunset[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '06:50 PM';

      setFormData(prev => ({
        ...prev,
        temp: (cur.temperature_2m ?? prev.temp).toString(),
        humidity: (cur.relative_humidity_2m ?? prev.humidity).toString(),
        rainfall: (cur.precipitation ?? 0).toString(),
        wind: (cur.wind_speed_10m ?? prev.wind).toString(),
        uv_index: (cur.uv_index ?? prev.uv_index).toString(),
        dew_point: (cur.dew_point_2m ?? prev.dew_point).toString(),
        sunrise: sunriseStr,
        sunset: sunsetStr,
      }));

      // Build 3-day forecast from days 1, 2, 3 (skip day 0 = today)
      const labels = ['Tomorrow', 'In 2 Days', 'In 3 Days'];
      const days: ForecastDay[] = labels.map((label, i) => ({
        day: label,
        tempMax: (daily.temperature_2m_max?.[i + 1] ?? '--').toString(),
        tempMin: (daily.temperature_2m_min?.[i + 1] ?? '--').toString(),
        humidity: '--',
        rain: (daily.precipitation_sum?.[i + 1] ?? 0).toFixed(1),
        wind: (daily.wind_speed_10m_max?.[i + 1] ?? '--').toString(),
        desc: wmoCodeToDesc(daily.weather_code?.[i + 1] ?? 0),
        code: daily.weather_code?.[i + 1] ?? 0,
      }));
      setForecast(days);
    } catch (err) {
      setApiError('Could not reach Open-Meteo. Check your connection, or log data manually.');
    } finally {
      setApiLoading(false);
    }
  }, []);

  const captureGpsLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(4));
        const lon = parseFloat(pos.coords.longitude.toFixed(4));
        setActiveCoords({ lat, lon });
        setHasCoords(true);
        setLocationName(`GPS: ${lat}° N, ${lon}° E`);
        setSearchQuery(`GPS: ${lat}° N, ${lon}° E`);
        setGpsLoading(false);
        fetchWeather(lat, lon);
      },
      () => {
        alert('Failed to capture GPS. Please search for a location manually.');
        setGpsLoading(false);
      }
    );
  };

  const handleLocationSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`);
      const data = await res.json();
      setSearchResults((data.results as GeoResult[]) || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const selectLocation = (result: GeoResult) => {
    const name = result.admin1
      ? `${result.name}, ${result.admin1}, ${result.country}`
      : `${result.name}, ${result.country}`;
    setLocationName(name);
    setSearchQuery(name);
    setActiveCoords({ lat: result.latitude, lon: result.longitude });
    setHasCoords(true);
    setSearchResults([]);
    fetchWeather(result.latitude, result.longitude);
  };

  const handleWeatherSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addWeatherLog({
      date: formData.date,
      temp: Number(formData.temp),
      humidity: Number(formData.humidity),
      rainfall: Number(formData.rainfall),
      wind: Number(formData.wind),
      aqi: Number(formData.aqi),
      uv_index: Number(formData.uv_index),
      sunrise: formData.sunrise,
      sunset: formData.sunset,
      dew_point: Number(formData.dew_point)
    });
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">

      {/* 1. LOCATION SETUP BANNER */}
      <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-md">
            <MapPin size={24} />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Active Micro-climate Location</span>
            <h4 className="text-lg font-black text-slate-850 dark:text-slate-100 font-heading">
              {locationName || 'No location set'}
            </h4>
            {hasCoords && (
              <span className="text-xs text-slate-400 font-bold">{activeCoords.lat}° N, {activeCoords.lon}° E</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Location search bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search city or region..."
              value={searchQuery}
              onChange={(e) => handleLocationSearch(e.target.value)}
              className="text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300 focus:outline-none focus:border-emerald-500 w-56 pr-8"
            />
            {searchLoading && (
              <RefreshCw size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
            )}
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-1 left-0 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => selectLocation(r)}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <span className="font-bold">{r.name}</span>
                    {r.admin1 && <span className="text-slate-400">, {r.admin1}</span>}
                    <span className="text-slate-400">, {r.country}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={captureGpsLocation}
            disabled={gpsLoading || apiLoading}
            className="px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm shrink-0"
          >
            <Navigation size={14} className={gpsLoading ? 'animate-spin' : ''} />
            {gpsLoading ? 'GPS Capturing...' : 'Capture GPS + Live Data'}
          </button>
        </div>
      </div>

      {/* API Error Banner */}
      {apiError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      {/* 2. THREE-DAY FORECAST */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: 3-Day Forecast */}
        <div className="lg:col-span-2 glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/20 dark:border-slate-800/20 pb-2">
            <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200 text-sm">
              3-Day Greenhouse Climate Outlook
            </h4>
            {forecast.length > 0 && (
              <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Live — Open-Meteo
              </span>
            )}
          </div>

          {apiLoading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
              <RefreshCw size={28} className="animate-spin text-emerald-400" />
              <span className="text-xs font-semibold">Fetching live forecast data...</span>
            </div>
          ) : forecast.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-semibold text-xs text-slate-600 dark:text-slate-400">
              {forecast.map(item => (
                <div key={item.day} className="p-4 bg-slate-100/30 dark:bg-slate-900/20 border border-slate-200/20 rounded-2xl text-center space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{item.day}</span>
                  <div className="flex justify-center items-center gap-1.5">
                    <ForecastIcon code={item.code} size={26} />
                    <span className="text-2xl font-black text-slate-700 dark:text-slate-100 font-heading">{item.tempMax}°</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] block font-bold text-slate-400">Min: {item.tempMin}° &bull; Rain: {item.rain}mm</span>
                    <div className="flex items-center justify-center gap-1 text-[9px] text-slate-400">
                      <Wind size={10} /><span>{item.wind} km/h</span>
                      <Droplets size={10} className="ml-1" />
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-900 border border-slate-200/10 block w-fit mx-auto capitalize">
                      {item.desc}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center text-slate-400 italic text-xs space-y-3">
              <CloudSun size={36} className="mx-auto text-slate-300 dark:text-slate-700" />
              <p>Click <span className="font-bold text-sky-500">Fetch Live Weather</span> or <span className="font-bold text-emerald-500">Capture GPS</span> to load real forecast data from Open-Meteo.</p>
            </div>
          )}
        </div>

        {/* Right: Logger Actions */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm h-fit flex flex-col gap-4">
          <div className="space-y-1">
            <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200 text-sm">Climatic Capture Logger</h4>
            <p className="text-[10px] text-slate-400">
              Use <strong>Fetch Live Weather</strong> to auto-fill current conditions from Open-Meteo, then log a reading manually.
            </p>
          </div>

          {/* Current condition summary if fetched */}
          {!apiLoading && forecast.length > 0 && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
              <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Current Conditions (Live)</span>
              <div className="grid grid-cols-2 gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                <span>Temp: <strong className="text-slate-800 dark:text-slate-200">{formData.temp}°C</strong></span>
                <span>Humidity: <strong className="text-slate-800 dark:text-slate-200">{formData.humidity}%</strong></span>
                <span>Wind: <strong className="text-slate-800 dark:text-slate-200">{formData.wind} km/h</strong></span>
                <span>Rain: <strong className="text-slate-800 dark:text-slate-200">{formData.rainfall} mm</strong></span>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all"
          >
            <PlusCircle size={14} />
            {showAddForm ? 'Hide Logger' : 'Log Today\'s Climatic Record'}
          </button>
        </div>
      </div>

      {/* 3. LOG WEATHER DATA FORM */}
      {showAddForm && (
        <div className="glass-premium rounded-2xl p-6 border border-slate-200/50 dark:border-slate-800/40 shadow-md animate-slide-up space-y-4">
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-800 dark:text-slate-100">Log Greenhouse Climatic Readings</h3>
            <p className="text-xs text-slate-400">Values are pre-filled from live API data if fetched. VPD will be auto-computed from temp and humidity.</p>
          </div>

          <form onSubmit={handleWeatherSubmit} className="space-y-4 text-xs font-semibold">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Reading Date</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Greenhouse Temp (°C)</label>
                <input
                  type="number"
                  required
                  step="any"
                  value={formData.temp}
                  onChange={(e) => setFormData({...formData, temp: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Relative Humidity (%)</label>
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="any"
                  value={formData.humidity}
                  onChange={(e) => setFormData({...formData, humidity: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Rainfall (mm)</label>
                <input
                  type="number"
                  required
                  value={formData.rainfall}
                  onChange={(e) => setFormData({...formData, rainfall: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Wind Speed (km/h)</label>
                <input
                  type="number"
                  required
                  value={formData.wind}
                  onChange={(e) => setFormData({...formData, wind: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">AQI Index</label>
                <input
                  type="number"
                  required
                  value={formData.aqi}
                  onChange={(e) => setFormData({...formData, aqi: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">UV Index</label>
                <input
                  type="number"
                  required
                  value={formData.uv_index}
                  onChange={(e) => setFormData({...formData, uv_index: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Sunrise Time</label>
                <input
                  type="text"
                  placeholder="e.g. 05:45 AM"
                  value={formData.sunrise}
                  onChange={(e) => setFormData({...formData, sunrise: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Sunset Time</label>
                <input
                  type="text"
                  placeholder="e.g. 06:50 PM"
                  value={formData.sunset}
                  onChange={(e) => setFormData({...formData, sunset: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Dew Point (°C)</label>
                <input
                  type="number"
                  step="any"
                  value={formData.dew_point}
                  onChange={(e) => setFormData({...formData, dew_point: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl shadow-md transition-all"
            >
              Record Daily Micro-climate Reading
            </button>
          </form>
        </div>
      )}

      {/* 4. CLIMATE LEDGER TABLE */}
      <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
        <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200 text-sm">Climatic Registration Ledger</h4>

        {weatherLogs.length > 0 ? (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-xs font-semibold text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-200/30 dark:border-slate-800/30 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-2.5">Date</th>
                  <th className="py-2.5">Temp (°C)</th>
                  <th className="py-2.5">Humidity (%)</th>
                  <th className="py-2.5">VPD Index</th>
                  <th className="py-2.5">Dew Point</th>
                  <th className="py-2.5">Wind</th>
                  <th className="py-2.5">Rain</th>
                  <th className="py-2.5">AQI / UV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/10 text-slate-700 dark:text-slate-350">
                {weatherLogs.map(log => {
                  let alertText = 'Optimal';
                  let alertTheme = 'text-emerald-500';
                  if (log.vpd) {
                    if (log.vpd < 1.0) { alertText = 'Fungal Threat'; alertTheme = 'text-amber-500'; }
                    else if (log.vpd > 1.6) { alertText = 'Stomata Shut'; alertTheme = 'text-amber-500'; }
                  }
                  return (
                    <tr key={log.id}>
                      <td className="py-3 font-bold text-slate-850 dark:text-slate-100 flex items-center gap-1.5">
                        <Calendar size={14} className="text-slate-400" />
                        {log.date}
                      </td>
                      <td className="py-3">{log.temp}°C</td>
                      <td className="py-3">{log.humidity}%</td>
                      <td className="py-3 font-extrabold font-heading text-slate-850 dark:text-slate-100">
                        {log.vpd} kPa <span className={`text-[9px] block font-bold ${alertTheme}`}>({alertText})</span>
                      </td>
                      <td className="py-3">{log.dew_point}°C</td>
                      <td className="py-3">{log.wind} km/h</td>
                      <td className="py-3">{log.rainfall} mm</td>
                      <td className="py-3">{log.aqi} AQI &bull; {log.uv_index} UV</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-slate-400 italic">No historical micro-climate registers cataloged.</div>
        )}
      </div>

    </div>
  );
};
