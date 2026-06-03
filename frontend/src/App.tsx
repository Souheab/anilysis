import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightLeft,
  Building2,
  EyeOff,
  Film,
  Flame,
  Focus,
  Hand,
  Info,
  Loader2,
  Maximize2,
  MousePointer2,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

import './App.css'
import {
  compareAnime,
  fetchGraph,
  fetchNodeDetail,
  searchAnime,
  type AnimeSearchResult,
  type CompareResponse,
  type GraphResponse,
  type NodeDetail,
  type SharedStaff,
} from './api'
import { GraphView, type GraphViewHandle } from './GraphView'

const ROLE_FILTERS = [
  { id: 'direction', label: 'Director', color: '#b580ff' },
  { id: 'writing', label: 'Writer', color: '#ffd400' },
  { id: 'music', label: 'Composer', color: '#2aa8ff' },
  { id: 'design', label: 'Character Design', color: '#26d9d1' },
  { id: 'animation', label: 'Animation Director', color: '#4bd66d' },
  { id: 'production', label: 'Production', color: '#ff8a3d' },
  { id: 'studio', label: 'Studio', color: '#65c56f' },
  { id: 'other', label: 'Other', color: '#94a3b8' },
]

const ALL_ROLE_IDS = ROLE_FILTERS.map((filter) => filter.id)

function titleFor(anime: AnimeSearchResult) {
  return anime.titleEnglish || anime.titleRomaji
}

function filtersForApi(activeFilters: string[]) {
  return activeFilters.length === ROLE_FILTERS.length ? [] : activeFilters
}

function formatMeta(anime: AnimeSearchResult) {
  return [anime.format, anime.year].filter(Boolean).join(' • ') || 'Cached title'
}

function compactNumber(value?: number | null) {
  if (!value) {
    return '0'
  }
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function stripHtml(value?: string | null) {
  return value ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : ''
}

function primaryRole(staff: SharedStaff) {
  return staff.sourceRoles[0] || staff.targetRoles[0] || staff.roleCategories[0] || 'Role'
}

function App() {
  const graphRef = useRef<GraphViewHandle | null>(null)
  const [sourceAnime, setSourceAnime] = useState<AnimeSearchResult | null>(null)
  const [targetAnime, setTargetAnime] = useState<AnimeSearchResult | null>(null)
  const [activeSlot, setActiveSlot] = useState<1 | 2>(1)
  const [activeFilters, setActiveFilters] = useState(() => ALL_ROLE_IDS)
  const [hideUnselectedNodeTypes, setHideUnselectedNodeTypes] = useState(true)
  const [comparison, setComparison] = useState<CompareResponse | null>(null)
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  const [isLoadingNode, setIsLoadingNode] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apiFilters = useMemo(() => filtersForApi(activeFilters), [activeFilters])
  const canCompare = Boolean(sourceAnime && targetAnime && sourceAnime.id !== targetAnime.id)
  const duplicateSelection = Boolean(sourceAnime && targetAnime && sourceAnime.id === targetAnime.id)

  useEffect(() => {
    if (!sourceAnime || !targetAnime) {
      return
    }
    if (sourceAnime.id === targetAnime.id) {
      return
    }

    let cancelled = false
    window.queueMicrotask(() => {
      if (!cancelled) {
        setIsComparing(true)
        setError(null)
      }
    })
    void Promise.all([
      compareAnime(sourceAnime.id, targetAnime.id, apiFilters),
      fetchGraph(sourceAnime.id, targetAnime.id, apiFilters, 2),
    ])
      .then(([nextComparison, nextGraph]) => {
        if (cancelled) return
        setComparison(nextComparison)
        setGraph(nextGraph)
        setNodeDetail(null)
        setSelectedNodeId(null)
      })
      .catch((requestError) => {
        if (cancelled) return
        setError(requestError instanceof Error ? requestError.message : 'Comparison failed')
      })
      .finally(() => {
        if (!cancelled) {
          setIsComparing(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [apiFilters, sourceAnime, targetAnime])

  const clearComparisonState = useCallback(() => {
    setComparison(null)
    setGraph(null)
    setNodeDetail(null)
    setSelectedNodeId(null)
  }, [])

  const assignAnime = useCallback(
    (anime: AnimeSearchResult, slot = activeSlot) => {
      setError(null)
      if ((slot === 1 && targetAnime?.id === anime.id) || (slot === 2 && sourceAnime?.id === anime.id)) {
        clearComparisonState()
      }
      if (slot === 1) {
        setSourceAnime(anime)
        if (!targetAnime) setActiveSlot(2)
      } else {
        setTargetAnime(anime)
        if (!sourceAnime) setActiveSlot(1)
      }
    },
    [activeSlot, clearComparisonState, sourceAnime, targetAnime],
  )

  const clearSourceAnime = () => {
    setSourceAnime(null)
    clearComparisonState()
  }

  const clearTargetAnime = () => {
    setTargetAnime(null)
    clearComparisonState()
  }

  const swapAnime = () => {
    setSourceAnime(targetAnime)
    setTargetAnime(sourceAnime)
  }

  const toggleFilter = (filterId: string) => {
    setActiveFilters((current) => {
      if (current.includes(filterId)) {
        return current.filter((item) => item !== filterId)
      }
      return [...current, filterId]
    })
  }

  const selectNode = useCallback(async (nodeId: string) => {
    const [type, rawId] = nodeId.split(':')
    const id = Number(rawId)
    if (!type || !Number.isFinite(id)) {
      return
    }
    setSelectedNodeId(nodeId)
    setIsLoadingNode(true)
    setError(null)
    try {
      setNodeDetail(await fetchNodeDetail(type, id))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load node details')
    } finally {
      setIsLoadingNode(false)
    }
  }, [])

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>Six Degrees of Anime</h1>
        <CommandSearch
          activeSlot={activeSlot}
          sourceAnime={sourceAnime}
          targetAnime={targetAnime}
          onActiveSlotChange={setActiveSlot}
          onSelect={assignAnime}
        />
      </header>

      <div className="workspace">
        <aside className="left-panel panel">
          <PanelHeader
            title="Compare Anime"
            action={<button type="button" className="icon-button-ghost" onClick={swapAnime} aria-label="Swap anime"><ArrowRightLeft size={18} /></button>}
          />
          <div className="anime-slots">
            <AnimeSlot slot={1} anime={sourceAnime} active={activeSlot === 1} onPick={() => setActiveSlot(1)} onClear={clearSourceAnime} />
            <AnimeSlot slot={2} anime={targetAnime} active={activeSlot === 2} onPick={() => setActiveSlot(2)} onClear={clearTargetAnime} />
          </div>

          {duplicateSelection ? <div className="inline-error">Pick two different anime.</div> : null}
          {error ? <div className="inline-error">{error}</div> : null}

          <ConnectionScore comparison={comparison} loading={isComparing} canCompare={canCompare} />
          <TopSharedStaff items={comparison?.sharedStaff ?? []} onSelect={(staff) => void selectNode(`staff:${staff.staffId}`)} />
        </aside>

        <section className="graph-panel">
          <GraphToolbar
            loading={isComparing}
            nodeCount={graph?.nodes.length ?? 0}
            onZoomIn={() => graphRef.current?.zoomIn()}
            onZoomOut={() => graphRef.current?.zoomOut()}
            onFit={() => graphRef.current?.fit()}
            onReset={() => graphRef.current?.reset()}
          />
          <GraphView
            ref={graphRef}
            graph={graph}
            selectedNodeId={selectedNodeId}
            activeRoleFilters={activeFilters}
            allRoleFilterIds={ALL_ROLE_IDS}
            hideUnselectedNodeTypes={hideUnselectedNodeTypes}
            onNodeSelect={selectNode}
          />
          <GraphLegend />
        </section>

        <aside className="right-panel panel">
          <DetailPanel detail={nodeDetail} loading={isLoadingNode} onClose={() => {
            setNodeDetail(null)
            setSelectedNodeId(null)
          }} />
          <RoleFilters
            activeFilters={activeFilters}
            comparison={comparison}
            hideUnselectedNodeTypes={hideUnselectedNodeTypes}
            onToggle={toggleFilter}
            onReset={() => setActiveFilters(ALL_ROLE_IDS)}
            onHideToggle={() => setHideUnselectedNodeTypes((current) => !current)}
          />
        </aside>
      </div>
    </main>
  )
}

function CommandSearch({
  activeSlot,
  sourceAnime,
  targetAnime,
  onActiveSlotChange,
  onSelect,
}: {
  activeSlot: 1 | 2
  sourceAnime: AnimeSearchResult | null
  targetAnime: AnimeSearchResult | null
  onActiveSlotChange: (slot: 1 | 2) => void
  onSelect: (anime: AnimeSearchResult, slot?: 1 | 2) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AnimeSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
        window.setTimeout(() => inputRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void searchAnime(query.trim(), controller.signal)
        .then(setResults)
        .catch((requestError) => {
          if (controller.signal.aborted) return
          setError(requestError instanceof Error ? requestError.message : 'Search failed')
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 220)
    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [query])

  const choose = (anime: AnimeSearchResult, slot = activeSlot) => {
    onSelect(anime, slot)
    setQuery(titleFor(anime))
    setOpen(false)
  }

  const updateQuery = (value: string) => {
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      setError(null)
      setLoading(false)
    }
  }

  return (
    <div className="command-wrap">
      <div className="search-box" onClick={() => setOpen(true)}>
        <Search size={18} />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0]) {
              choose(results[0])
            }
            if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
          placeholder="Search anime, staff, or studio..."
        />
      </div>
      {open ? (
        <div className="command-popover">
          <div className="slot-tabs" role="tablist" aria-label="Assignment slot">
            <button type="button" className={activeSlot === 1 ? 'active' : ''} onClick={() => onActiveSlotChange(1)}>
              Slot 1 {sourceAnime ? `• ${titleFor(sourceAnime)}` : ''}
            </button>
            <button type="button" className={activeSlot === 2 ? 'active' : ''} onClick={() => onActiveSlotChange(2)}>
              Slot 2 {targetAnime ? `• ${titleFor(targetAnime)}` : ''}
            </button>
          </div>
          {loading ? <p className="command-state"><Loader2 className="spin" size={16} /> Searching AniList...</p> : null}
          {error ? <p className="command-state error-text">{error}</p> : null}
          {!loading && !error && query.trim().length < 2 ? <p className="command-state">Type at least two characters.</p> : null}
          <div className="command-results">
            {results.map((anime) => (
              <div key={anime.id} className="command-result">
                <AnimeThumb anime={anime} />
                <button type="button" className="result-main" onClick={() => choose(anime)}>
                  <span>{titleFor(anime)}</span>
                  <small>{formatMeta(anime)}</small>
                </button>
                <button type="button" className="mini-assign" onClick={() => choose(anime, 1)}>1</button>
                <button type="button" className="mini-assign" onClick={() => choose(anime, 2)}>2</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PanelHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      {action}
    </div>
  )
}

function AnimeSlot({
  slot,
  anime,
  active,
  onPick,
  onClear,
}: {
  slot: 1 | 2
  anime: AnimeSearchResult | null
  active: boolean
  onPick: () => void
  onClear: () => void
}) {
  return (
    <button type="button" className={`anime-slot ${active ? 'active' : ''}`} onClick={onPick}>
      <span className="slot-number">{slot}</span>
      {anime ? <AnimeThumb anime={anime} /> : <span className="empty-thumb"><Plus size={20} /></span>}
      <span className="slot-copy">
        <strong>{anime ? titleFor(anime) : `Choose anime ${slot}`}</strong>
        <small>{anime ? formatMeta(anime) : 'Use the search bar'}</small>
      </span>
      {anime ? (
        <span
          className="clear-slot"
          onClick={(event) => {
            event.stopPropagation()
            onClear()
          }}
        >
          <X size={16} />
        </span>
      ) : null}
    </button>
  )
}

function AnimeThumb({ anime }: { anime: AnimeSearchResult }) {
  if (anime.coverImageUrl) {
    return <img className="anime-thumb" src={anime.coverImageUrl} alt="" />
  }
  return <span className="anime-thumb fallback"><Film size={18} /></span>
}

function ConnectionScore({ comparison, loading, canCompare }: { comparison: CompareResponse | null; loading: boolean; canCompare: boolean }) {
  const score = Math.round(comparison?.score ?? 0)
  const activeStars = Math.round(score / 20)
  return (
    <section className="score-card">
      <div className="score-title">
        <span>Connection Score</span>
        <Info size={15} />
      </div>
      {loading ? (
        <div className="loading-row"><Loader2 className="spin" size={18} /> Comparing creative DNA...</div>
      ) : (
        <>
          <div className="score-row">
            <strong>{comparison ? `${score}%` : '--'}</strong>
            <span className="stars">{Array.from({ length: 5 }, (_, index) => <span key={index}>{index < activeStars ? '★' : '☆'}</span>)}</span>
          </div>
          <p>{comparison ? 'Shared creative DNA through staff and studio overlap' : canCompare ? 'Comparison will run automatically.' : 'Choose two anime to compare.'}</p>
        </>
      )}
    </section>
  )
}

function TopSharedStaff({ items, onSelect }: { items: SharedStaff[]; onSelect: (staff: SharedStaff) => void }) {
  return (
    <section className="staff-card">
      <div className="section-title">
        <h3>Top Shared Staff</h3>
        <ArrowRightLeft size={16} />
      </div>
      <div className="staff-list">
        {items.length === 0 ? <p className="muted">No shared staff under the active filters.</p> : null}
        {items.slice(0, 5).map((staff, index) => (
          <button key={staff.staffId} type="button" className="staff-row" onClick={() => onSelect(staff)}>
            <span className="rank">{index + 1}</span>
            <span className="staff-name">{staff.name}</span>
            <span className="role-pill">{primaryRole(staff)}</span>
            <span className="heat"><Flame size={14} /> {compactNumber(staff.favourites)}</span>
          </button>
        ))}
      </div>
      <button type="button" className="full-list-button">View full shared staff list <span>→</span></button>
    </section>
  )
}

function GraphToolbar({
  loading,
  nodeCount,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
}: {
  loading: boolean
  nodeCount: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onReset: () => void
}) {
  return (
    <div className="graph-toolbar">
      <div className="tool-cluster">
        <button type="button" className="tool-button active" title="Select"><MousePointer2 size={18} /></button>
        <button type="button" className="tool-button" title="Pan"><Hand size={18} /></button>
        <button type="button" className="tool-button" title="Fit view" onClick={onFit}><Maximize2 size={18} /></button>
        <button type="button" className="tool-button" title="Zoom in" onClick={onZoomIn}><ZoomIn size={18} /></button>
        <button type="button" className="tool-button" title="Zoom out" onClick={onZoomOut}><ZoomOut size={18} /></button>
      </div>
      <div className="tool-cluster">
        {loading ? <span className="graph-loading"><Loader2 className="spin" size={16} /> Loading</span> : <span className="node-count">{nodeCount} nodes</span>}
        <button type="button" className="reset-button" onClick={onReset}><Focus size={17} /> Reset view</button>
      </div>
    </div>
  )
}

function GraphLegend() {
  return (
    <div className="legend">
      <h3>Legend</h3>
      <span><i className="legend-anime" /> Anime</span>
      <span><i className="legend-staff" /> Staff</span>
      <span><i className="legend-studio" /> Studio</span>
      <span><i className="legend-line primary" /> Primary Role</span>
      <span><i className="legend-line dashed" /> Studio / Affiliation</span>
      <span><i className="legend-line shortest" /> Shortest Path</span>
    </div>
  )
}

function DetailPanel({ detail, loading, onClose }: { detail: NodeDetail | null; loading: boolean; onClose: () => void }) {
  return (
    <section className="detail-section">
      <div className="panel-header">
        <h2>Node Details</h2>
        {detail ? <button type="button" className="icon-close" onClick={onClose}><X size={18} /></button> : null}
      </div>
      {loading ? <div className="detail-empty"><Loader2 className="spin" size={18} /> Loading details.</div> : null}
      {!loading && !detail ? <div className="detail-empty">Select a graph node to inspect its roles and connected anime.</div> : null}
      {!loading && detail ? <NodeDetailContent detail={detail} /> : null}
    </section>
  )
}

function NodeDetailContent({ detail }: { detail: NodeDetail }) {
  const about = stripHtml(detail.description)
  const related = detail.relatedConnections.length > 0 ? detail.relatedConnections : detail.relatedAnime.map((anime) => ({ ...anime, roles: [], roleCategories: [] }))
  return (
    <div className="detail-content">
      <div className="node-identity">
        {detail.imageUrl ? <img src={detail.imageUrl} alt="" /> : <span className={`node-avatar ${detail.type}`}><NodeTypeIcon type={detail.type} /></span>}
        <span>
          <h3>{detail.label}</h3>
          <small>{detail.type}</small>
        </span>
      </div>
      {detail.topRoles.length > 0 ? (
        <div>
          <h4>Roles (Top)</h4>
          <div className="pill-row">
            {detail.topRoles.slice(0, 4).map((role) => <span key={`${role.label}-${role.category}`} className="role-pill">{role.label}</span>)}
          </div>
        </div>
      ) : null}
      <div>
        <h4>Popularity</h4>
        <p className="popularity"><Flame size={16} /> {compactNumber(detail.favourites)} <small>Community favorites</small></p>
      </div>
      {about ? (
        <div>
          <h4>About</h4>
          <p className="about-text">{about}</p>
        </div>
      ) : null}
      <div>
        <div className="section-title compact">
          <h4>Connected Anime ({detail.connectionCounts.anime || related.length})</h4>
          <button type="button">View all</button>
        </div>
        <div className="connected-list">
          {related.slice(0, 8).map((anime) => (
            <div key={anime.id} className="connected-row">
              <span className="blue-dot" />
              <span>{titleFor(anime)}</span>
              <small>{anime.roles?.[0] ?? anime.format ?? ''}</small>
            </div>
          ))}
          {related.length === 0 ? <p className="muted">No connected anime are cached yet.</p> : null}
        </div>
      </div>
    </div>
  )
}

function NodeTypeIcon({ type }: { type: NodeDetail['type'] }) {
  if (type === 'anime') return <Film size={22} />
  if (type === 'studio') return <Building2 size={22} />
  return <Users size={22} />
}

function RoleFilters({
  activeFilters,
  comparison,
  hideUnselectedNodeTypes,
  onToggle,
  onReset,
  onHideToggle,
}: {
  activeFilters: string[]
  comparison: CompareResponse | null
  hideUnselectedNodeTypes: boolean
  onToggle: (id: string) => void
  onReset: () => void
  onHideToggle: () => void
}) {
  const counts = useMemo(() => {
    const next = new Map<string, number>()
    for (const filter of ROLE_FILTERS) next.set(filter.id, 0)
    for (const staff of comparison?.sharedStaff ?? []) {
      for (const category of staff.roleCategories) {
        next.set(category, (next.get(category) ?? 0) + 1)
      }
    }
    if ((comparison?.sharedStudios.length ?? 0) > 0) {
      next.set('studio', comparison?.sharedStudios.length ?? 0)
    }
    return next
  }, [comparison])

  return (
    <section className="filter-section">
      <div className="section-title">
        <h3>Filters</h3>
        <button type="button" onClick={onReset}>Reset</button>
      </div>
      <div className="filter-list">
        {ROLE_FILTERS.map((filter) => {
          const active = activeFilters.includes(filter.id)
          return (
            <button key={filter.id} type="button" className="filter-row" onClick={() => onToggle(filter.id)}>
              <SlidersHorizontal size={15} style={{ color: filter.color }} />
              <span>{filter.label}</span>
              <span className={`switch ${active ? 'on' : ''}`} />
              <small>{counts.get(filter.id) ?? 0}</small>
            </button>
          )
        })}
      </div>
      <button type="button" className={`hide-toggle ${hideUnselectedNodeTypes ? 'active' : ''}`} onClick={onHideToggle}>
        <EyeOff size={18} /> Hide unselected node types
      </button>
    </section>
  )
}

export default App
