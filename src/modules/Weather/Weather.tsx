import React, { useState, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  CloudSun, Navigation, MapPin, Cloud, CloudRain, Sun, Wind,
  Droplets, RefreshCw, AlertTriangle, Calendar, Thermometer, Trash2
} from 'lucide-react';

interface GeoResult {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  admin1?: string;
}

interface ForecastDay {
  day: string;
  tempMax: string;
  tempMin: string;
  rain: string;
  code: number;
}

interface TodayWeather {
  temp: number;
  tempMax: number;
  tempMin: number;
  tempMaxTime: string;
  tempMinTime: string;
  humidity: number;
  rainfall: number;
  wind: number;
  uvIndex: number;
  dewPoint: number;
  vpd: number;
  weatherCode: number;
  sunrise: string;
  sunset: string;
  desc: string;
}

function calcVpd(tempC: number, rh: number): number {
  const es = 0.6108 * Math.exp(17.27 * tempC / (tempC + 237.3));
  return parseFloat((es * (1 - rh / 100)).toFixed(2));
}

function fmtIsoTime(isoStr: string): string {
  const timePart = (isoStr ?? '00:00').split('T')[1] ?? '00:00';
  const [hh, mm] = timePart.split(':').map(Number);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${mm.toString().padStart(2, '0')} ${ampm}`;
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
  if (code <= 3) return <CloudSun size={size} className="text-sky-400" />;
  if (code <= 67) return <CloudRain size={size} className="text-blue-400" />;
  return <Cloud size={size} className="text-slate-400" />;
}

function vpdStatus(vpd: number): { text: string; color: string } {
  if (vpd < 0.4) return { text: 'Too Humid', color: 'text-blue-500' };
  if (vpd < 1.0) return { text: 'Fungal Risk', color: 'text-amber-500' };
  if (vpd <= 1.6) return { text: 'Optimal', color: 'text-emerald-500' };
  return { text: 'Stomata Stress', color: 'text-red-500' };
}

function getDayLabel(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
}

export const Weather: React.FC = () => {
  const { weatherLogs, addWeatherLog, deleteWeatherLog } = useAppStore();

  const [gpsLoading, setGpsLoading] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState('');
  const [activeCoords, setActiveCoords] = useState({ lat: 0, lon: 0 });
  const [hasCoords, setHasCoords] = useState(false);
  const [todayWeather, setTodayWeather] = useState<TodayWeather | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loggedNow, setLoggedNow] = useState(false);

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    setApiLoading(true);
    setApiError(null);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,uv_index,dew_point_2m` +
        `&hourly=temperature_2m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset,uv_index_max,weather_code` +
        `&timezone=auto&forecast_days=8`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const cur = data.current as Record<string, number>;
      const daily = data.daily as Record<string, unknown[]>;
      const hourly = data.hourly as { temperature_2m: number[]; time: string[] };

      // Find today's hourly max/min from first 24 values
      const todayTemps = hourly.temperature_2m.slice(0, 24);
      const maxTemp = Math.max(...todayTemps);
      const minTemp = Math.min(...todayTemps);
      const maxIdx = todayTemps.indexOf(maxTemp);
      const minIdx = todayTemps.indexOf(minTemp);
      const tempMaxTime = fmtIsoTime(hourly.time[maxIdx] ?? '12:00');
      const tempMinTime = fmtIsoTime(hourly.time[minIdx] ?? '06:00');

      const sunriseStr = daily.sunrise?.[0] ? fmtIsoTime(daily.sunrise[0] as string) : '05:45 AM';
      const sunsetStr = daily.sunset?.[0] ? fmtIsoTime(daily.sunset[0] as string) : '06:50 PM';
      const vpd = calcVpd(cur.temperature_2m, cur.relative_humidity_2m);

      setTodayWeather({
        temp: parseFloat((cur.temperature_2m ?? 0).toFixed(1)),
        tempMax: parseFloat(((daily.temperature_2m_max?.[0] as number) ?? maxTemp).toFixed(1)),
        tempMin: parseFloat(((daily.temperature_2m_min?.[0] as number) ?? minTemp).toFixed(1)),
        tempMaxTime,
        tempMinTime,
        humidity: Math.round(cur.relative_humidity_2m ?? 0),
        rainfall: parseFloat((cur.precipitation ?? 0).toFixed(1)),
        wind: parseFloat((cur.wind_speed_10m ?? 0).toFixed(1)),
        uvIndex: parseFloat((cur.uv_index ?? 0).toFixed(1)),
        dewPoint: parseFloat((cur.dew_point_2m ?? 0).toFixed(1)),
        vpd,
        weatherCode: (daily.weather_code?.[0] as number) ?? 0,
        sunrise: sunriseStr,
        sunset: sunsetStr,
        desc: wmoCodeToDesc((daily.weather_code?.[0] as number) ?? 0),
      });

      // 7-day forecast (indices 1–7)
      setForecast(
        Array.from({ length: 7 }, (_, i) => ({
          day: getDayLabel(i + 1),
          tempMax: ((daily.temperature_2m_max?.[i + 1] as number | undefined)?.toFixed(1) ?? '--'),
          tempMin: ((daily.temperature_2m_min?.[i + 1] as number | undefined)?.toFixed(1) ?? '--'),
          rain: ((daily.precipitation_sum?.[i + 1] as number | undefined) ?? 0).toFixed(1),
          code: (daily.weather_code?.[i + 1] as number) ?? 0,
        }))
      );
    } catch {
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
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`
      );
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

  const handleQuickLog = () => {
    if (!todayWeather) return;
    addWeatherLog({
      date: new Date().toISOString().split('T')[0],
      temp: todayWeather.temp,
      humidity: todayWeather.humidity,
      rainfall: todayWeather.rainfall,
      wind: todayWeather.wind,
      aqi: 0,
      uv_index: todayWeather.uvIndex,
      sunrise: todayWeather.sunrise,
      sunset: todayWeather.sunset,
      dew_point: todayWeather.dewPoint,
    });
    setLoggedNow(true);
    setTimeout(() => setLoggedNow(false), 2500);
  };

  const vpdInfo = todayWeather ? vpdStatus(todayWeather.vpd) : null;

  return (
    <div className="space-y-6">

      {/* LOCATION BANNER */}
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

      {/* API ERROR */}
      {apiError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      {/* TODAY'S DETAILED CARD */}
      {apiLoading ? (
        <div className="glass rounded-2xl p-10 border border-slate-200/30 dark:border-slate-800/30 shadow-sm flex flex-col items-center gap-4">
          <RefreshCw size={32} className="animate-spin text-emerald-400" />
          <span className="text-xs font-semibold text-slate-400">Fetching live weather data...</span>
        </div>
      ) : todayWeather ? (
        <div className="glass rounded-2xl p-6 border border-slate-200/30 dark:border-slate-800/30 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200/20 dark:border-slate-800/20 pb-3 mb-5">
            <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200 text-sm">Today's Greenhouse Conditions</h4>
            <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Live — Open-Meteo
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Temperature hero */}
            <div className="flex items-start gap-5">
              <ForecastIcon code={todayWeather.weatherCode} size={52} />
              <div>
                <div className="text-5xl font-black font-heading text-slate-800 dark:text-slate-100 leading-none tracking-tight">
                  {todayWeather.temp}°<span className="text-xl font-bold text-slate-400">C</span>
                </div>
                <div className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-1">{todayWeather.desc}</div>
                <div className="mt-3 space-y-1.5 text-xs font-semibold">
                  <div className="flex items-center gap-2 text-rose-500">
                    <Thermometer size={13} />
                    Max: <strong>{todayWeather.tempMax}°C</strong> at {todayWeather.tempMaxTime}
                  </div>
                  <div className="flex items-center gap-2 text-sky-500">
                    <Thermometer size={13} />
                    Min: <strong>{todayWeather.tempMin}°C</strong> at {todayWeather.tempMinTime}
                  </div>
                </div>
              </div>
            </div>

            {/* Stats grid: 4 cols × 2 rows */}
            <div className="grid grid-cols-4 gap-2 text-xs font-semibold">
              {[
                { icon: <Droplets size={15} className="text-sky-400" />, label: 'Humidity', value: `${todayWeather.humidity}%` },
                { icon: <Wind size={15} className="text-indigo-400" />, label: 'Wind', value: `${todayWeather.wind}`, unit: 'km/h' },
                { icon: <CloudRain size={15} className="text-blue-400" />, label: 'Rain', value: `${todayWeather.rainfall}`, unit: 'mm' },
                { icon: <Sun size={15} className="text-amber-400" />, label: 'UV Index', value: `${todayWeather.uvIndex}` },
              ].map(({ icon, label, value, unit }) => (
                <div key={label} className="p-2.5 rounded-xl bg-slate-100/40 dark:bg-slate-900/30 border border-slate-200/20 text-center space-y-1.5">
                  <div className="flex justify-center">{icon}</div>
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider">{label}</div>
                  <div className="font-black text-slate-700 dark:text-slate-100 text-sm leading-none">
                    {value}{unit && <span className="text-[9px] font-bold text-slate-400 ml-0.5">{unit}</span>}
                  </div>
                </div>
              ))}

              <div className="p-2.5 rounded-xl bg-slate-100/40 dark:bg-slate-900/30 border border-slate-200/20 text-center space-y-0.5">
                <div className="text-[14px] font-black text-teal-400 leading-tight">VPD</div>
                <div className="text-[9px] text-slate-400 uppercase tracking-wider">kPa</div>
                <div className={`font-black text-sm ${vpdInfo?.color}`}>{todayWeather.vpd}</div>
                <div className={`text-[9px] font-bold leading-none ${vpdInfo?.color}`}>{vpdInfo?.text}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100/40 dark:bg-slate-900/30 border border-slate-200/20 text-center space-y-1.5">
                <Droplets size={15} className="mx-auto text-cyan-400" />
                <div className="text-[9px] text-slate-400 uppercase tracking-wider">Dew Pt</div>
                <div className="font-black text-slate-700 dark:text-slate-100 text-sm">{todayWeather.dewPoint}°</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100/40 dark:bg-slate-900/30 border border-slate-200/20 text-center space-y-0.5">
                <div className="text-amber-400 text-base font-black leading-tight">↑</div>
                <div className="text-[9px] text-slate-400 uppercase tracking-wider">Sunrise</div>
                <div className="font-black text-slate-700 dark:text-slate-100 text-[11px]">{todayWeather.sunrise}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100/40 dark:bg-slate-900/30 border border-slate-200/20 text-center space-y-0.5">
                <div className="text-indigo-400 text-base font-black leading-tight">↓</div>
                <div className="text-[9px] text-slate-400 uppercase tracking-wider">Sunset</div>
                <div className="font-black text-slate-700 dark:text-slate-100 text-[11px]">{todayWeather.sunset}</div>
              </div>
            </div>
          </div>

          {/* One-click log */}
          <div className="mt-5 pt-4 border-t border-slate-200/20 dark:border-slate-800/20 flex flex-wrap items-center gap-3">
            <button
              onClick={handleQuickLog}
              disabled={loggedNow}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                loggedNow
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 cursor-default'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md'
              }`}
            >
              <Calendar size={13} />
              {loggedNow ? 'Logged ✓' : "Log Today's Climatic Record"}
            </button>
            <span className="text-[10px] text-slate-400 font-semibold">
              Instantly saves current live readings — no edits needed
            </span>
          </div>
        </div>
      ) : !hasCoords ? (
        <div className="glass rounded-2xl p-10 border border-slate-200/30 dark:border-slate-800/30 shadow-sm text-center space-y-3">
          <CloudSun size={44} className="mx-auto text-slate-300 dark:text-slate-700" />
          <p className="text-slate-400 text-sm font-semibold">
            Search for a location or use <span className="text-emerald-500 font-bold">Capture GPS</span> to load live weather.
          </p>
        </div>
      ) : null}

      {/* 7-DAY FORECAST STRIP */}
      {forecast.length > 0 && (
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-3">
          <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200 text-sm">7-Day Climate Outlook</h4>
          <div className="overflow-x-auto no-scrollbar">
            <div className="flex gap-2 min-w-max">
              {forecast.map((item) => (
                <div
                  key={item.day}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-100/30 dark:bg-slate-900/20 border border-slate-200/20 w-[82px] text-center shrink-0"
                >
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-tight">{item.day}</span>
                  <ForecastIcon code={item.code} size={20} />
                  <div className="text-xs font-black text-slate-700 dark:text-slate-100">{item.tempMax}°</div>
                  <div className="text-[10px] text-slate-400 font-bold">{item.tempMin}°</div>
                  <div className="flex items-center gap-0.5 text-[9px] text-sky-500 font-bold">
                    <Droplets size={8} />{item.rain}mm
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CLIMATIC LEDGER */}
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
                  <th className="py-2.5"></th>
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
                      <td className="py-3">
                        <button
                          onClick={() => deleteWeatherLog(log.id)}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                          title="Delete this log entry"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
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
