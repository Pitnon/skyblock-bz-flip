import React, { useEffect, useMemo, useState } from 'react'

function computeApiBase() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  if (typeof window === 'undefined') return 'http://localhost:3001/api/flips'

  const { hostname, protocol, origin } = window.location
  
  // Handle GitHub Codespaces
  if (hostname.endsWith('.app.github.dev')) {
    // If we are on port 5173 (frontend), we want to reach port 3001 (backend)
    // The format is usually <codespace-name>-<port>.app.github.dev
    const parts = hostname.split('-');
    // The last part is the port (e.g. "5173.app.github.dev" or just "5173")
    // But sometimes the format is complex. 
    // Let's try to replace the port number in the URL if it exists, 
    // or append -3001 if we are on the main domain.
    
    // Robust regex to find the port number at the end of the subdomain
    const portRegex = /-5173(?=\.app\.github\.dev)/;
    if (portRegex.test(hostname)) {
        return `https://${hostname.replace(portRegex, '-3001')}/api/flips`;
    }
    
    // Fallback: if we can't find -5173, maybe we are on a different port or format.
    // Let's try to construct it from the base.
    // Example: psychic-space-waddle-q5gpjg5v9qpfxq7x-5173.app.github.dev
    // We want: psychic-space-waddle-q5gpjg5v9qpfxq7x-3001.app.github.dev
    return `https://${hostname.replace(/-\d+\.app\.github\.dev$/, '-3001.app.github.dev')}/api/flips`;
  }

  if (import.meta.env.DEV) {
    return `${protocol}//${hostname}:3001/api/flips`
  }

  return `${origin.replace(/\/$/, '')}/api/flips`
}

const API = computeApiBase()

const defaultFilters = {
  buyMin: '',
  buyMax: '',
  sellMin: '',
  sellMax: '',
  instaBuyMin: '',
  instaBuyMax: '',
  instaSellMin: '',
  instaSellMax: '',
  marginMin: '',
  marginMax: '',
  cphMin: '',
  cphMax: '',
  blacklist: '',
}

const filterConfig = [
  { field: 'buy', label: 'Buy price', minKey: 'buyMin', maxKey: 'buyMax', step: 1000, defaultMax: 50_000_000 },
  { field: 'sell', label: 'Sell price', minKey: 'sellMin', maxKey: 'sellMax', step: 1000, defaultMax: 50_000_000 },
  { field: 'instabuy', label: 'Instabuy volume', minKey: 'instaBuyMin', maxKey: 'instaBuyMax', step: 1, defaultMax: 50_000 },
  { field: 'instasell', label: 'Instasell volume', minKey: 'instaSellMin', maxKey: 'instaSellMax', step: 1, defaultMax: 50_000 },
  { field: 'margin', label: 'Margin', minKey: 'marginMin', maxKey: 'marginMax', step: 1000, defaultMax: 100_000_000 },
  { field: 'coinsPerHour', label: 'Coins / hour', minKey: 'cphMin', maxKey: 'cphMax', step: 1000, defaultMax: 100_000_000 },
]

function numberOrNull(n) {
  return n == null ? '—' : n.toLocaleString('en-US')
}

const STORAGE_KEY = 'skyblock_flips_prefs'

function loadPrefs() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch (e) {
    console.error('Failed to load prefs', e)
  }
  return null
}

export default function App() {
  const prefs = useMemo(() => loadPrefs() || {}, [])

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const [filters, setFilters] = useState(() => prefs.filters || { ...defaultFilters })
  const [sortBy, setSortBy] = useState(() => prefs.sortBy || 'margin')
  const [sortDir, setSortDir] = useState(() => prefs.sortDir || 'desc')
  const [tax, setTax] = useState(() => prefs.tax ?? 1.125)
  const [showFilters, setShowFilters] = useState(false)
  
  const [lastUpdated, setLastUpdated] = useState(null)

  // Save prefs whenever they change
  useEffect(() => {
    const toSave = { filters, sortBy, sortDir, tax }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  }, [filters, sortBy, sortDir, tax])

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => fetchData(true), 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchData(silent = false) {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch(API)
      const j = await res.json()
      if (!j.success) throw new Error(j.error || 'Failed to load flips')
      setItems(j.data || [])
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  function setFilter(key, value) {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  function resetFilters() {
    setFilters({ ...defaultFilters })
  }

  const blacklistTokens = useMemo(
    () =>
      filters.blacklist
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    [filters.blacklist],
  )

  const valueStats = useMemo(() => {
    const stats = {}
    for (const cfg of filterConfig) {
      let min = Infinity
      let max = -Infinity
      for (const item of items) {
        const val = item[cfg.field]
        if (typeof val !== 'number' || Number.isNaN(val)) continue
        if (val < min) min = val
        if (val > max) max = val
      }
      if (min !== Infinity && max !== -Infinity) {
        stats[cfg.field] = { min, max }
      }
    }
    return stats
  }, [items])

  const filtered = useMemo(() => {
    function inRange(value, minStr, maxStr) {
      if (value == null) return false
      const min = minStr === '' ? -Infinity : Number(minStr)
      const max = maxStr === '' ? Infinity : Number(maxStr)
      return value >= min && value <= max
    }

    return items.map(item => {
        // Recalculate margin and CPH based on user tax
        // Tax is applied on the Sell Order (which is at the 'Buy Price' value in this data)
        // Wait, let's be careful.
        // Data: Buy Price (High), Sell Price (Low).
        // You Buy at Sell Price (Low). You Sell at Buy Price (High).
        // Tax is on the Sale (High Price).
        // Margin = (HighPrice * (1 - tax/100)) - LowPrice
        
        const highPrice = item.buy || 0;
        const lowPrice = item.sell || 0;
        const taxMultiplier = 1 - (tax / 100);
        
        const newMargin = (highPrice * taxMultiplier) - lowPrice;
        
        // CPH calculation: Margin * Volume
        // Volume is limited by the slower side of the trade (min of instabuy/instasell)
        const volume = Math.min(item.instabuy || 0, item.instasell || 0);
        const newCPH = newMargin * volume;
        
        return {
            ...item,
            margin: newMargin,
            coinsPerHour: newCPH
        };
    }).filter((item) => {
      const haystack = `${item.title} ${item.raw || ''}`.toLowerCase()
      if (blacklistTokens.some((kw) => haystack.includes(kw))) return false

      for (const cfg of filterConfig) {
        if (
          (filters[cfg.minKey] !== '' || filters[cfg.maxKey] !== '') &&
          !inRange(item[cfg.field], filters[cfg.minKey], filters[cfg.maxKey])
        ) {
          return false
        }
      }

      return true
    })
  }, [items, filters, blacklistTokens, tax])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const A = a[sortBy] ?? -Infinity
      const B = b[sortBy] ?? -Infinity
      if (A === B) return 0
      return sortDir === 'asc' ? A - B : B - A
    })
    return arr
  }, [filtered, sortBy, sortDir])

  const friendlyError = useMemo(() => {
    if (!error) return null
    if (/networkerror|failed to fetch/i.test(error)) {
      return `Network error. Make sure the backend is running at ${API}.`
    }
    return error
  }, [error])

  const topFlip = sorted[0]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <header className="frosted-panel rounded-2xl p-6 md:p-8 shadow-2xl border border-white/5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p className="text-cyan-300 text-xs uppercase tracking-[0.4em] mb-3">Skyblock Special "Intelligence"</p>
              <h1 className="text-4xl md:text-5xl font-semibold leading-tight">Skyblock Flips</h1>
              <p className="text-sm md:text-base text-slate-400 mt-3 max-w-2xl">
                Real-time scraping of skyblock.bz flips with granular filtering, sorting, keyword blacklists, and slider-adjusted thresholds.
              </p>
            </div>
            <div className="inline-flex flex-col items-end gap-2">
              <button className="btn-primary" onClick={fetchData} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh data'}
              </button>
              <button className="btn-ghost text-xs" onClick={resetFilters}>
                Reset filters
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="stat-pill">
              <p className="stat-label">Visible flips</p>
              <p className="stat-value">{sorted.length.toLocaleString('en-US')}</p>
              <p className="stat-meta">after filters</p>
            </div>
            <div className="stat-pill">
              <p className="stat-label">Top margin</p>
              <p className="stat-value">{numberOrNull(topFlip?.margin)}</p>
              <p className="stat-meta">coins</p>
            </div>
            <div className="stat-pill">
              <p className="stat-label">Updated</p>
              <p className="stat-value">{lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}</p>
              <p className="stat-meta">local time</p>
            </div>
          </div>
        </header>

        <section className="frosted-panel rounded-2xl overflow-hidden">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-colors text-left group"
          >
            <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">Filters &amp; Sorting</h2>
                    <p className="text-sm text-slate-400">Configure tax, thresholds, and sort order</p>
                </div>
            </div>
            <svg 
                className={`w-6 h-6 text-slate-500 transform transition-transform duration-300 ${showFilters ? 'rotate-180' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showFilters && (
            <div className="p-6 pt-0 space-y-6 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Sort Configuration</h3>
                    <div className="flex flex-wrap gap-3 text-sm">
                    <label className="sr-only" htmlFor="sortBy">
                        Sort by
                    </label>
                    <select id="sortBy" className="input select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                        <option value="margin">margin</option>
                        <option value="buy">buy</option>
                        <option value="sell">sell</option>
                        <option value="instabuy">instabuy</option>
                        <option value="instasell">instasell</option>
                        <option value="coinsPerHour">coinsPerHour</option>
                        <option value="title">title</option>
                    </select>
                    <select className="input select" value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
                        <option value="desc">desc</option>
                        <option value="asc">asc</option>
                    </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="frosted-card p-4 rounded-xl border border-white/5 space-y-2">
                        <div className="flex justify-between items-center">
                            <label htmlFor="taxInput" className="text-sm font-medium text-slate-300">Bazaar Tax (%)</label>
                            <span className="text-xs text-slate-500 font-mono">{tax}%</span>
                        </div>
                        <input
                            id="taxInput"
                            type="number"
                            step="0.001"
                            min="0"
                            max="100"
                            className="input w-full"
                            value={tax}
                            onChange={(e) => setTax(Number(e.target.value))}
                        />
                        <p className="text-xs text-slate-500">Applied to sales (Buy Price). Default: 1.125%</p>
                    </div>
                    {filterConfig.map((cfg) => (
                    <RangeFilterCard
                key={cfg.field}
                config={cfg}
                filters={filters}
                setFilter={setFilter}
                setFilters={setFilters}
                sliderBounds={{
                  min: 0,
                  max: Math.max(cfg.defaultMax, valueStats[cfg.field]?.max || 0),
                }}
              />
            ))}

            <div className="filter-card">
              <label className="text-xs uppercase tracking-wide text-slate-400">Blacklist keywords</label>
              <p className="text-[0.8rem] text-slate-500 mt-1">Comma separated (e.g. rune, enchanted).</p>
              <input
                className="input w-full mt-3"
                placeholder="rune, enchanted"
                value={filters.blacklist}
                onChange={(e) => setFilter('blacklist', e.target.value)}
              />
              {!!blacklistTokens.length && (
                <div className="flex flex-wrap gap-2 mt-3 text-xs text-slate-400">
                  {blacklistTokens.map((token) => (
                    <span key={token} className="badge">
                      {token}
                    </span>
                  ))}
                </div>
              )}
            </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm text-slate-400">
            <span>{loading ? 'Fetching flips…' : `${sorted.length} flips visible`}</span>
            {friendlyError && <span className="text-rose-400">{friendlyError}</span>}
          </div>

          <div className="grid gap-4">
            {sorted.map((item) => (
              <a
                key={item.id}
                href={item.href || '#'}
                target="_blank"
                rel="noreferrer"
                className="flip-card"
              >
                <div className="flex gap-4 items-center">
                  <div className="w-16 h-16 rounded-xl bg-slate-900/70 border border-white/5 flex items-center justify-center overflow-hidden">
                    <img src={item.img || 'https://via.placeholder.com/64'} alt={item.title} className="w-14 h-14 object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-lg font-semibold truncate">{item.title || 'Unknown item'}</h3>
                      <p className="text-sm text-slate-400 truncate">{item.href || 'No link provided'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-slate-500 text-xs uppercase">Buy</p>
                      <p className="font-medium">{numberOrNull(item.buy)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs uppercase">Sell</p>
                      <p className="font-medium">{numberOrNull(item.sell)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs uppercase">Margin</p>
                      <p className="font-medium text-lime-300">{numberOrNull(item.margin)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs uppercase">Instabuy</p>
                      <p className="font-medium">{numberOrNull(item.instabuy)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs uppercase">Instasell</p>
                      <p className="font-medium">{numberOrNull(item.instasell)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs uppercase">Coins/hr</p>
                      <p className="font-medium">{numberOrNull(item.coinsPerHour)}</p>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function RangeFilterCard({ config, filters, setFilter, setFilters, sliderBounds }) {
  const { label, minKey, maxKey, step = 1 } = config
  const sliderMin = sliderBounds.min ?? 0
  const computedMax = sliderBounds.max ?? sliderMin + step * 10
  const sliderMax = computedMax <= sliderMin ? sliderMin + step * 10 : computedMax

  const minValue = filters[minKey] === '' ? sliderMin : Number(filters[minKey])
  const maxValue = filters[maxKey] === '' ? sliderMax : Number(filters[maxKey])

  function formatCompact(val) {
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}b`
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}m`
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`
    return val.toLocaleString('en-US')
  }

  function handleSliderChange(kind, raw) {
    const numericValue = Number(raw)
    if (Number.isNaN(numericValue)) return
    setFilters((prev) => {
      const next = { ...prev }
      if (kind === 'min') {
        next[minKey] = String(numericValue)
        if (next[maxKey] !== '' && numericValue > Number(next[maxKey])) {
          next[maxKey] = String(numericValue)
        }
      } else {
        next[maxKey] = String(numericValue)
        if (next[minKey] !== '' && numericValue < Number(next[minKey])) {
          next[minKey] = String(numericValue)
        }
      }
      return next
    })
  }

  return (
    <div className="filter-card">
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs uppercase tracking-wide text-slate-400">{label}</label>
        <span className="text-[0.65rem] text-slate-500">slider optional</span>
      </div>
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="min"
          value={filters[minKey]}
          onChange={(e) => setFilter(minKey, e.target.value)}
          inputMode="numeric"
        />
        <input
          className="input"
          placeholder="max"
          value={filters[maxKey]}
          onChange={(e) => setFilter(maxKey, e.target.value)}
          inputMode="numeric"
        />
      </div>
      <div className="range-wrapper mt-4">
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={step}
          value={minValue}
          onChange={(e) => handleSliderChange('min', e.target.value)}
          className="range-track"
        />
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={step}
          value={maxValue}
          onChange={(e) => handleSliderChange('max', e.target.value)}
          className="range-track"
        />
      </div>
      <div className="flex justify-between text-[0.7rem] text-slate-500 mt-1">
        <span>{filters[minKey] === '' ? 'No min' : formatCompact(Number(filters[minKey]))}</span>
        <span>{filters[maxKey] === '' ? 'No cap' : formatCompact(Number(filters[maxKey]))}</span>
      </div>
    </div>
  )
}
