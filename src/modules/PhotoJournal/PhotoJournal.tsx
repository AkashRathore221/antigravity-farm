import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { PHOTO_CATEGORIES, PHOTO_CATEGORY_EMOJI } from '../../db/types';
import type { PhotoCategory } from '../../db/types';
import {
  Camera, Plus, Trash2, X, ChevronLeft, ChevronRight, UploadCloud, Search
} from 'lucide-react';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmtDate = (d: string): string => {
  const [y, m, day] = (d || '').split('-').map(Number);
  if (!y || !m || !day) return d;
  return `${MONTHS[m - 1]} ${day}, ${y}`;
};

// ─── Upload Modal ──────────────────────────────────────────────────────────────
const UploadModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { crops, addPhoto } = useAppStore();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<PhotoCategory>('General/Other');
  const [caption, setCaption] = useState('');
  const [cropId, setCropId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Revoke the object URL when it changes or the modal unmounts.
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const selectFile = (f: File | undefined) => {
    if (!f) return;
    if (!ACCEPTED_TYPES.includes(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) {
      setError('Unsupported file type. Use JPG, PNG, WEBP, or HEIC.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('File is too large. Maximum size is 10 MB.');
      return;
    }
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!file) { setError('Please select a photo'); return; }
    setUploading(true);
    setError(null);
    const res = await addPhoto(file, {
      caption,
      category,
      photo_date: date,
      crop_id: cropId || null,
    });
    setUploading(false);
    if (res.ok) {
      onClose();
    } else {
      setError(res.error ?? 'Upload failed. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 my-8">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Camera size={18} className="text-emerald-500" /> Add Photo
          </h3>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* 1. File drop zone */}
        <label
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); selectFile(e.dataTransfer.files?.[0]); }}
          className={`flex flex-col items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed cursor-pointer transition-colors p-4 ${
            dragOver ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-300 dark:border-slate-700 hover:border-emerald-400'
          }`}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="preview" className="w-full h-40 object-cover rounded-lg" />
          ) : (
            <>
              <UploadCloud size={28} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 text-center">
                Click to select or drag &amp; drop<br />
                <span className="text-[10px] text-slate-400">JPG, PNG, WEBP, HEIC · max 10 MB</span>
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            onChange={e => selectFile(e.target.files?.[0])}
            className="hidden"
          />
        </label>

        {/* 2. Date */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Date</label>
          <input
            type="date"
            required
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* 3. Category */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as PhotoCategory)}
            className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {PHOTO_CATEGORIES.map(c => (
              <option key={c} value={c}>{PHOTO_CATEGORY_EMOJI[c]} {c}</option>
            ))}
          </select>
        </div>

        {/* 4. Caption */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Caption</label>
            <span className="text-[10px] font-semibold text-slate-400">{caption.length} / 300</span>
          </div>
          <textarea
            rows={2}
            maxLength={300}
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Describe what's happening..."
            className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500 resize-none"
          />
        </div>

        {/* 5. Crop tag */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Link to crop</label>
          <select
            value={cropId}
            onChange={e => setCropId(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="">— Not linked —</option>
            {crops.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.start_date})</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="text-xs font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={uploading}
            className="min-h-[44px] px-5 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading}
            className="min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-60 text-white font-bold rounded-xl text-xs shadow-md flex items-center justify-center gap-2 transition-all"
          >
            {uploading ? (
              <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Uploading…</>
            ) : 'Upload Photo'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Module ───────────────────────────────────────────────────────────────
export const PhotoJournal: React.FC = () => {
  const { photoJournal, crops, deletePhoto } = useAppStore();

  const [fCategory, setFCategory] = useState<'all' | PhotoCategory>('all');
  const [fMonth, setFMonth] = useState<string>('all'); // 'YYYY-MM' or 'all'
  const [fSearch, setFSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const cropName = useCallback(
    (id: string | null) => (id ? crops.find(c => c.id === id)?.name ?? null : null),
    [crops]
  );

  // Months that actually have photos, newest first.
  const monthOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of photoJournal) {
      const key = (p.photo_date || '').slice(0, 7); // YYYY-MM
      if (key.length === 7 && !map.has(key)) {
        const [y, m] = key.split('-').map(Number);
        map.set(key, `${MONTHS[m - 1]} ${y}`);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [photoJournal]);

  // AND-combined filters.
  const filtered = useMemo(() => {
    const q = fSearch.trim().toLowerCase();
    return photoJournal.filter(p => {
      if (fCategory !== 'all' && p.category !== fCategory) return false;
      if (fMonth !== 'all' && (p.photo_date || '').slice(0, 7) !== fMonth) return false;
      if (q && !(p.caption || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [photoJournal, fCategory, fMonth, fSearch]);

  // Keyboard nav for the lightbox.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      else if (e.key === 'ArrowLeft') setLightboxIndex(i => (i === null ? null : Math.max(0, i - 1)));
      else if (e.key === 'ArrowRight') setLightboxIndex(i => (i === null ? null : Math.min(filtered.length - 1, i + 1)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, filtered.length]);

  // Keep the lightbox index valid if the filtered set shrinks (e.g. a delete).
  useEffect(() => {
    if (lightboxIndex !== null && lightboxIndex >= filtered.length) {
      setLightboxIndex(filtered.length > 0 ? filtered.length - 1 : null);
    }
  }, [filtered.length, lightboxIndex]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this photo? It will be permanently removed from cloud storage.')) return;
    await deletePhoto(id);
  };

  const lightboxPhoto = lightboxIndex !== null ? filtered[lightboxIndex] : null;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold font-heading text-slate-800 dark:text-slate-100">📸 Photo Journal</h2>
        <button
          onClick={() => setShowUpload(true)}
          className="min-h-[44px] flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl text-xs shadow-md transition-all"
        >
          <Plus size={16} /> Add Photo
        </button>
      </div>

      {/* FILTER BAR */}
      <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-semibold">
          <select
            value={fCategory}
            onChange={e => setFCategory(e.target.value as 'all' | PhotoCategory)}
            className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Categories</option>
            {PHOTO_CATEGORIES.map(c => (
              <option key={c} value={c}>{PHOTO_CATEGORY_EMOJI[c]} {c}</option>
            ))}
          </select>

          <select
            value={fMonth}
            onChange={e => setFMonth(e.target.value)}
            className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Time</option>
            {monthOptions.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={fSearch}
              onChange={e => setFSearch(e.target.value)}
              placeholder="Search captions..."
              className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl pl-9 pr-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
        <p className="text-[10px] font-semibold text-slate-400">
          Showing {filtered.length} of {photoJournal.length} photos
        </p>
      </div>

      {/* GRID / EMPTY STATE */}
      {photoJournal.length === 0 ? (
        <div className="glass rounded-2xl p-12 border border-slate-200/30 dark:border-slate-800/30 shadow-sm text-center space-y-2">
          <Camera size={44} className="mx-auto text-slate-300 dark:text-slate-700" />
          <h4 className="text-base font-bold text-slate-700 dark:text-slate-300">No photos yet</h4>
          <p className="text-xs text-slate-400">Tap <span className="font-bold text-emerald-500">+ Add Photo</span> to start your farm journal</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 border border-slate-200/30 dark:border-slate-800/30 shadow-sm text-center text-xs text-slate-400 italic">
          No photos match these filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p, idx) => (
            <div
              key={p.id}
              onClick={() => setLightboxIndex(idx)}
              className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-slate-100 dark:bg-slate-900 shadow-sm"
            >
              <img src={p.public_url} alt={p.caption || 'farm photo'} loading="lazy" className="w-full h-full object-cover" />

              {/* Category badge */}
              <span className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded-lg backdrop-blur-sm">
                {PHOTO_CATEGORY_EMOJI[p.category]} {p.category}
              </span>

              {/* Date */}
              <span className="absolute bottom-2 left-2 text-white text-[10px] font-bold drop-shadow">
                {fmtDate(p.photo_date)}
              </span>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                <p className="text-white text-xs font-semibold text-center line-clamp-4">{p.caption || 'No caption'}</p>
              </div>

              {/* Delete */}
              <button
                onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
                className="absolute top-2 right-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white bg-black/40 hover:bg-rose-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                aria-label="Delete photo"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* UPLOAD MODAL */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}

      {/* LIGHTBOX */}
      {lightboxPhoto && lightboxIndex !== null && (
        <div className="fixed inset-0 z-[110] bg-black/95 flex items-center justify-center" onClick={() => setLightboxIndex(null)}>
          {/* Close */}
          <button
            onClick={e => { e.stopPropagation(); setLightboxIndex(null); }}
            className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80 hover:text-white bg-white/10 rounded-full z-10"
            aria-label="Close"
          >
            <X size={24} />
          </button>

          {/* Prev */}
          {lightboxIndex > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setLightboxIndex(i => (i === null ? null : Math.max(0, i - 1))); }}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80 hover:text-white bg-white/10 rounded-full z-10"
              aria-label="Previous"
            >
              <ChevronLeft size={28} />
            </button>
          )}

          {/* Next */}
          {lightboxIndex < filtered.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); setLightboxIndex(i => (i === null ? null : Math.min(filtered.length - 1, i + 1))); }}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80 hover:text-white bg-white/10 rounded-full z-10"
              aria-label="Next"
            >
              <ChevronRight size={28} />
            </button>
          )}

          {/* Image */}
          <img
            src={lightboxPhoto.public_url}
            alt={lightboxPhoto.caption || 'farm photo'}
            onClick={e => e.stopPropagation()}
            className="object-contain"
            style={{ maxWidth: '90vw', maxHeight: '90vh' }}
          />

          {/* Bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 pt-12" onClick={e => e.stopPropagation()}>
            <div className="max-w-3xl mx-auto space-y-1.5 text-white">
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                <span className="flex items-center gap-1 bg-white/15 px-2 py-1 rounded-lg">
                  {PHOTO_CATEGORY_EMOJI[lightboxPhoto.category]} {lightboxPhoto.category}
                </span>
                <span className="text-white/70">{fmtDate(lightboxPhoto.photo_date)}</span>
                {cropName(lightboxPhoto.crop_id) && (
                  <span className="text-emerald-300">🌱 {cropName(lightboxPhoto.crop_id)}</span>
                )}
              </div>
              {lightboxPhoto.caption && (
                <p className="text-sm font-medium text-white/90">{lightboxPhoto.caption}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoJournal;
