import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightLeft,
  Building2,
  ChevronDown,
  CircleDotDashed,
  Cuboid,
  Film,
  Flame,
  Focus,
  Hand,
  Info,
  Loader2,
  Maximize2,
  MousePointer2,
  Network,
  Plus,
  RotateCcw,
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
  DEFAULT_STAFF_POPULARITY_FILTERS,
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

const NODE_TYPE_FILTERS = [
  { id: 'anime', label: 'Anime', color: '#1688ff', icon: Film },
  { id: 'staff', label: 'Staff', color: '#ff8a3d', icon: Users },
  { id: 'studio', label: 'Studio', color: '#65c56f', icon: Building2 },
] as const

const FILTER_SECTION_STORAGE_KEY = 'anime-six-degrees.filterSections.v1'
const RECENT_COMPARISONS_STORAGE_KEY = 'anime-six-degrees.recentComparisons.v1'
const RECENT_COMPARISON_LIMIT = 10
const ALL_ROLE_IDS = ROLE_FILTERS.map((filter) => filter.id)
const NO_ROLE_FILTERS_SENTINEL = '__none__'
const DEFAULT_NODE_TYPES = { anime: true, staff: true, studio: true }
const MAIN_STUDIO_EDGE_FILTER_REGEX = '^Studio$'
const DEFAULT_SHOW_ONLY_MAIN_STUDIO_EDGES = true
const DEFAULT_EDGE_FILTER_REGEX = regexFromEdgeTypeToggles(DEFAULT_SHOW_ONLY_MAIN_STUDIO_EDGES)
const STAFF_LIMIT_OPTIONS = [
  { label: 'Top 10', value: 10 },
  { label: 'Top 20', value: 20 },
  { label: 'Top 40', value: 40 },
  { label: 'Top 80', value: 80 },
  { label: 'All staff', value: null },
]

type NodeTypeId = (typeof NODE_TYPE_FILTERS)[number]['id']
type VisibleNodeTypes = Record<NodeTypeId, boolean>
type FilterSectionId = 'roles' | 'nodes' | 'edges' | 'favourites' | 'graph'
type FilterSectionState = Record<FilterSectionId, boolean>
type RecentComparison = {
  sourceAnime: AnimeSearchResult
  targetAnime: AnimeSearchResult
  comparedAt: string
}

function titleFor(anime: AnimeSearchResult) {
  return anime.titleEnglish || anime.titleRomaji
}

function filtersForApi(activeFilters: string[]) {
  if (activeFilters.length === ROLE_FILTERS.length) {
    return []
  }
  return activeFilters.length === 0 ? [NO_ROLE_FILTERS_SENTINEL] : activeFilters
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

function initialFilterSections(): FilterSectionState {
  const fallback = { roles: false, nodes: false, edges: false, favourites: false, graph: false }
  if (typeof window === 'undefined') {
    return fallback
  }
  try {
    const saved = window.localStorage.getItem(FILTER_SECTION_STORAGE_KEY)
    if (!saved) {
      return fallback
    }
    const parsed = JSON.parse(saved) as Partial<Record<FilterSectionId, unknown>>
    return {
      roles: parsed.roles === true,
      nodes: parsed.nodes === true,
      edges: parsed.edges === true,
      favourites: parsed.favourites === true,
      graph: parsed.graph === true,
    }
  } catch {
    return fallback
  }
}

function isAnimeSearchResult(value: unknown): value is AnimeSearchResult {
  if (!value || typeof value !== 'object') {
    return false
  }
  const anime = value as Partial<AnimeSearchResult>
  return typeof anime.id === 'number' && typeof anime.titleRomaji === 'string'
}

function isRecentComparison(value: unknown): value is RecentComparison {
  if (!value || typeof value !== 'object') {
    return false
  }
  const comparison = value as Partial<RecentComparison>
  return (
    isAnimeSearchResult(comparison.sourceAnime) &&
    isAnimeSearchResult(comparison.targetAnime) &&
    typeof comparison.comparedAt === 'string'
  )
}

function initialRecentComparisons(): RecentComparison[] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const saved = window.localStorage.getItem(RECENT_COMPARISONS_STORAGE_KEY)
    if (!saved) {
      return []
    }
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed.filter(isRecentComparison).slice(0, RECENT_COMPARISON_LIMIT) : []
  } catch {
    return []
  }
}

function comparisonKey(sourceAnime: AnimeSearchResult, targetAnime: AnimeSearchResult) {
  return `${sourceAnime.id}:${targetAnime.id}`
}

function addRecentComparison(
  current: RecentComparison[],
  sourceAnime: AnimeSearchResult,
  targetAnime: AnimeSearchResult,
): RecentComparison[] {
  const key = comparisonKey(sourceAnime, targetAnime)
  return [
    { sourceAnime, targetAnime, comparedAt: new Date().toISOString() },
    ...current.filter((item) => comparisonKey(item.sourceAnime, item.targetAnime) !== key),
  ].slice(0, RECENT_COMPARISON_LIMIT)
}

function regexFromEdgeTypeToggles(showOnlyMainStudio: boolean) {
  return showOnlyMainStudio ? MAIN_STUDIO_EDGE_FILTER_REGEX : ''
}

function compileEdgeFilterRegex(pattern: string) {
  const trimmed = pattern.trim()
  if (!trimmed) {
    return null
  }
  try {
    return new RegExp(trimmed, 'i')
  } catch {
    return null
  }
}

function edgeFilterTargets(edge: GraphResponse['edges'][number]) {
  const values: string[] = []
  const addValue = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      values.push(value)
    } else if (Array.isArray(value)) {
      for (const item of value) {
        addValue(item)
      }
    }
  }

  addValue(edge.data.label)
  addValue(edge.data.type)
  addValue(edge.data.roles)
  addValue(edge.data.roleCategories)
  addValue(edge.classes)
  return values
}

function filterGraph(
  graph: GraphResponse | null,
  visibleNodeTypes: VisibleNodeTypes,
  hideIsolatedNodes: boolean,
  edgeFilterRegex: string,
): GraphResponse | null {
  if (!graph) {
    return null
  }

  const typeVisible = (type: unknown) => {
    if (type !== 'anime' && type !== 'staff' && type !== 'studio') {
      return true
    }
    return visibleNodeTypes[type]
  }

  let nodes = graph.nodes.filter((node) => typeVisible(node.data.type))
  let visibleNodeIds = new Set(nodes.map((node) => String(node.data.id)))
  const edgeFilter = compileEdgeFilterRegex(edgeFilterRegex)
  let edges = graph.edges.filter((edge) => {
    const source = edge.data.source
    const target = edge.data.target
    const visible = typeof source === 'string' && typeof target === 'string' && visibleNodeIds.has(source) && visibleNodeIds.has(target)
    if (!visible) {
      return false
    }
    return !edgeFilter || !edgeFilterTargets(edge).some((value) => edgeFilter.test(value))
  })

  if (hideIsolatedNodes) {
    const connectedNodeIds = new Set<string>()
    for (const edge of edges) {
      connectedNodeIds.add(String(edge.data.source))
      connectedNodeIds.add(String(edge.data.target))
    }
    nodes = nodes.filter((node) => connectedNodeIds.has(String(node.data.id)))
    visibleNodeIds = new Set(nodes.map((node) => String(node.data.id)))
    edges = edges.filter((edge) => visibleNodeIds.has(String(edge.data.source)) && visibleNodeIds.has(String(edge.data.target)))
  }

  return {
    nodes,
    edges,
    highlightedPath: graph.highlightedPath.filter((nodeId) => visibleNodeIds.has(nodeId)),
  }
}

function App() {
  const graphRef = useRef<GraphViewHandle | null>(null)
  const [sourceAnime, setSourceAnime] = useState<AnimeSearchResult | null>(null)
  const [targetAnime, setTargetAnime] = useState<AnimeSearchResult | null>(null)
  const [activeSlot, setActiveSlot] = useState<1 | 2>(1)
  const [activeFilters, setActiveFilters] = useState(() => ALL_ROLE_IDS)
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<VisibleNodeTypes>(DEFAULT_NODE_TYPES)
  const [showOnlyMainStudioEdges, setShowOnlyMainStudioEdges] = useState(DEFAULT_SHOW_ONLY_MAIN_STUDIO_EDGES)
  const [editEdgeFilterRegex, setEditEdgeFilterRegex] = useState(false)
  const [edgeFilterRegex, setEdgeFilterRegex] = useState(DEFAULT_EDGE_FILTER_REGEX)
  const [staffMinFavourites, setStaffMinFavourites] = useState(DEFAULT_STAFF_POPULARITY_FILTERS.staffMinFavourites)
  const [staffLimit, setStaffLimit] = useState<number | null>(DEFAULT_STAFF_POPULARITY_FILTERS.staffLimit)
  const [showEdgeLabels, setShowEdgeLabels] = useState(true)
  const [hideIsolatedNodes, setHideIsolatedNodes] = useState(true)
  const [filterSections, setFilterSections] = useState<FilterSectionState>(initialFilterSections)
  const [recentComparisons, setRecentComparisons] = useState<RecentComparison[]>(initialRecentComparisons)
  const [recentComparisonsOpen, setRecentComparisonsOpen] = useState(false)
  const [comparison, setComparison] = useState<CompareResponse | null>(null)
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  const [isLoadingNode, setIsLoadingNode] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apiFilters = useMemo(() => filtersForApi(activeFilters), [activeFilters])
  const popularityFilters = useMemo(() => ({ staffMinFavourites, staffLimit }), [staffLimit, staffMinFavourites])
  const displayGraph = useMemo(
    () => filterGraph(graph, visibleNodeTypes, hideIsolatedNodes, edgeFilterRegex),
    [edgeFilterRegex, graph, hideIsolatedNodes, visibleNodeTypes],
  )
  const canCompare = Boolean(sourceAnime && targetAnime && sourceAnime.id !== targetAnime.id)
  const duplicateSelection = Boolean(sourceAnime && targetAnime && sourceAnime.id === targetAnime.id)

  useEffect(() => {
    window.localStorage.setItem(FILTER_SECTION_STORAGE_KEY, JSON.stringify(filterSections))
  }, [filterSections])

  useEffect(() => {
    window.localStorage.setItem(RECENT_COMPARISONS_STORAGE_KEY, JSON.stringify(recentComparisons))
  }, [recentComparisons])

  useEffect(() => {
    if (!selectedNodeId || !displayGraph) {
      return
    }
    if (!displayGraph.nodes.some((node) => node.data.id === selectedNodeId)) {
      let cancelled = false
      window.queueMicrotask(() => {
        if (!cancelled) {
          setSelectedNodeId(null)
          setNodeDetail(null)
        }
      })
      return () => {
        cancelled = true
      }
    }
  }, [displayGraph, selectedNodeId])

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
      compareAnime(sourceAnime.id, targetAnime.id, apiFilters, popularityFilters),
      fetchGraph(sourceAnime.id, targetAnime.id, apiFilters, 2, popularityFilters),
    ])
      .then(([nextComparison, nextGraph]) => {
        if (cancelled) return
        setComparison(nextComparison)
        setGraph(nextGraph)
        setNodeDetail(null)
        setSelectedNodeId(null)
        setRecentComparisons((current) => addRecentComparison(current, sourceAnime, targetAnime))
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
  }, [apiFilters, popularityFilters, sourceAnime, targetAnime])

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

  const restoreRecentComparison = (recentComparison: RecentComparison) => {
    setError(null)
    clearComparisonState()
    setSourceAnime(recentComparison.sourceAnime)
    setTargetAnime(recentComparison.targetAnime)
  }

  const toggleFilter = (filterId: string) => {
    setActiveFilters((current) => {
      if (current.includes(filterId)) {
        return current.filter((item) => item !== filterId)
      }
      return [...current, filterId]
    })
  }

  const setAllRoleFilters = (active: boolean) => {
    setActiveFilters(active ? ALL_ROLE_IDS : [])
  }

  const toggleNodeType = (nodeType: NodeTypeId) => {
    setVisibleNodeTypes((current) => ({ ...current, [nodeType]: !current[nodeType] }))
  }

  const setAllNodeTypes = (active: boolean) => {
    setVisibleNodeTypes({ anime: active, staff: active, studio: active })
  }

  const setShowOnlyMainStudioEdgesFilter = (active: boolean) => {
    setShowOnlyMainStudioEdges(active)
    setEdgeFilterRegex(regexFromEdgeTypeToggles(active))
  }

  const setEditEdgeFilterRegexActive = (active: boolean) => {
    setEditEdgeFilterRegex(active)
    if (!active) {
      setEdgeFilterRegex(regexFromEdgeTypeToggles(showOnlyMainStudioEdges))
    }
  }

  const setFilterSectionOpen = (section: FilterSectionId) => {
    setFilterSections((current) => ({ ...current, [section]: !current[section] }))
  }

  const setPopularityFiltersActive = (active: boolean) => {
    if (active) {
      setStaffMinFavourites(DEFAULT_STAFF_POPULARITY_FILTERS.staffMinFavourites)
      setStaffLimit(DEFAULT_STAFF_POPULARITY_FILTERS.staffLimit)
    } else {
      setStaffMinFavourites(0)
      setStaffLimit(null)
    }
  }

  const setGraphSettingsActive = (active: boolean) => {
    setShowEdgeLabels(active)
    setHideIsolatedNodes(active)
  }

  const setEdgeTypeFiltersActive = (active: boolean) => {
    setShowOnlyMainStudioEdges(active)
    setEdgeFilterRegex(active ? DEFAULT_EDGE_FILTER_REGEX : '')
  }

  const resetFilters = () => {
    setActiveFilters(ALL_ROLE_IDS)
    setShowOnlyMainStudioEdges(DEFAULT_SHOW_ONLY_MAIN_STUDIO_EDGES)
    setEditEdgeFilterRegex(false)
    setEdgeFilterRegex(DEFAULT_EDGE_FILTER_REGEX)
    setStaffMinFavourites(DEFAULT_STAFF_POPULARITY_FILTERS.staffMinFavourites)
    setStaffLimit(DEFAULT_STAFF_POPULARITY_FILTERS.staffLimit)
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

          <RecentComparisons
            items={recentComparisons}
            open={recentComparisonsOpen}
            onToggle={() => setRecentComparisonsOpen((current) => !current)}
            onSelect={restoreRecentComparison}
          />
          <ConnectionScore comparison={comparison} loading={isComparing} canCompare={canCompare} />
          <TopSharedStaff items={comparison?.sharedStaff ?? []} onSelect={(staff) => void selectNode(`staff:${staff.staffId}`)} />
        </aside>

        <section className="graph-panel">
          <GraphToolbar
            loading={isComparing}
            nodeCount={displayGraph?.nodes.length ?? 0}
            onZoomIn={() => graphRef.current?.zoomIn()}
            onZoomOut={() => graphRef.current?.zoomOut()}
            onFit={() => graphRef.current?.fit()}
            onReset={() => graphRef.current?.reset()}
          />
          <GraphView
            ref={graphRef}
            graph={displayGraph}
            showEdgeLabels={showEdgeLabels}
            selectedNodeId={selectedNodeId}
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
            graph={graph}
            visibleNodeTypes={visibleNodeTypes}
            showOnlyMainStudioEdges={showOnlyMainStudioEdges}
            editEdgeFilterRegex={editEdgeFilterRegex}
            edgeFilterRegex={edgeFilterRegex}
            staffMinFavourites={staffMinFavourites}
            staffLimit={staffLimit}
            showEdgeLabels={showEdgeLabels}
            hideIsolatedNodes={hideIsolatedNodes}
            sectionState={filterSections}
            onToggle={toggleFilter}
            onSetAllRoles={setAllRoleFilters}
            onToggleNodeType={toggleNodeType}
            onSetAllNodeTypes={setAllNodeTypes}
            onShowOnlyMainStudioEdgesChange={setShowOnlyMainStudioEdgesFilter}
            onEditEdgeFilterRegexChange={setEditEdgeFilterRegexActive}
            onEdgeFilterRegexChange={setEdgeFilterRegex}
            onMinFavouritesChange={setStaffMinFavourites}
            onStaffLimitChange={setStaffLimit}
            onSetPopularityFiltersActive={setPopularityFiltersActive}
            onSetEdgeTypeFiltersActive={setEdgeTypeFiltersActive}
            onShowEdgeLabelsChange={setShowEdgeLabels}
            onHideIsolatedNodesChange={setHideIsolatedNodes}
            onSetGraphSettingsActive={setGraphSettingsActive}
            onToggleSection={setFilterSectionOpen}
            onReset={resetFilters}
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

function RecentComparisons({
  items,
  open,
  onToggle,
  onSelect,
}: {
  items: RecentComparison[]
  open: boolean
  onToggle: () => void
  onSelect: (comparison: RecentComparison) => void
}) {
  return (
    <section className={`recent-card ${open ? 'open' : ''}`}>
      <button type="button" className="recent-card-header" onClick={onToggle} aria-expanded={open}>
        <span>
          <strong>Recent Comparisons</strong>
          <small>{items.length > 0 ? `${items.length} saved` : 'No comparisons yet'}</small>
        </span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="recent-card-body">
          {items.length === 0 ? <p className="muted">Completed comparisons will appear here.</p> : null}
          {items.map((item) => (
            <button
              key={`${item.sourceAnime.id}-${item.targetAnime.id}-${item.comparedAt}`}
              type="button"
              className="recent-row"
              onClick={() => onSelect(item)}
            >
              <span className="recent-pair">
                <strong>{titleFor(item.sourceAnime)}</strong>
                <ArrowRightLeft size={13} />
                <strong>{titleFor(item.targetAnime)}</strong>
              </span>
              <small>{formatMeta(item.sourceAnime)} / {formatMeta(item.targetAnime)}</small>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ConnectionScore({ comparison, loading, canCompare }: { comparison: CompareResponse | null; loading: boolean; canCompare: boolean }) {
  const score = Math.round(comparison?.score ?? 0)
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
  graph,
  visibleNodeTypes,
  showOnlyMainStudioEdges,
  editEdgeFilterRegex,
  edgeFilterRegex,
  staffMinFavourites,
  staffLimit,
  showEdgeLabels,
  hideIsolatedNodes,
  sectionState,
  onToggle,
  onSetAllRoles,
  onToggleNodeType,
  onSetAllNodeTypes,
  onShowOnlyMainStudioEdgesChange,
  onEditEdgeFilterRegexChange,
  onEdgeFilterRegexChange,
  onMinFavouritesChange,
  onStaffLimitChange,
  onSetEdgeTypeFiltersActive,
  onSetPopularityFiltersActive,
  onShowEdgeLabelsChange,
  onHideIsolatedNodesChange,
  onSetGraphSettingsActive,
  onToggleSection,
  onReset,
}: {
  activeFilters: string[]
  comparison: CompareResponse | null
  graph: GraphResponse | null
  visibleNodeTypes: VisibleNodeTypes
  showOnlyMainStudioEdges: boolean
  editEdgeFilterRegex: boolean
  edgeFilterRegex: string
  staffMinFavourites: number
  staffLimit: number | null
  showEdgeLabels: boolean
  hideIsolatedNodes: boolean
  sectionState: FilterSectionState
  onToggle: (id: string) => void
  onSetAllRoles: (active: boolean) => void
  onToggleNodeType: (id: NodeTypeId) => void
  onSetAllNodeTypes: (active: boolean) => void
  onShowOnlyMainStudioEdgesChange: (value: boolean) => void
  onEditEdgeFilterRegexChange: (value: boolean) => void
  onEdgeFilterRegexChange: (value: string) => void
  onMinFavouritesChange: (value: number) => void
  onStaffLimitChange: (value: number | null) => void
  onSetEdgeTypeFiltersActive: (active: boolean) => void
  onSetPopularityFiltersActive: (active: boolean) => void
  onShowEdgeLabelsChange: (value: boolean) => void
  onHideIsolatedNodesChange: (value: boolean) => void
  onSetGraphSettingsActive: (active: boolean) => void
  onToggleSection: (section: FilterSectionId) => void
  onReset: () => void
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
  const nodeCounts = useMemo(() => {
    const next = new Map<NodeTypeId, number>([
      ['anime', 0],
      ['staff', 0],
      ['studio', 0],
    ])
    for (const node of graph?.nodes ?? []) {
      const type = node.data.type
      if (type === 'anime' || type === 'staff' || type === 'studio') {
        next.set(type, (next.get(type) ?? 0) + 1)
      }
    }
    return next
  }, [graph])
  const rolesActive = activeFilters.length > 0
  const nodeTypesActive = Object.values(visibleNodeTypes).some(Boolean)
  const edgeTypeFiltersActive = edgeFilterRegex.trim().length > 0
  const edgeFilterRegexInvalid = edgeTypeFiltersActive && !compileEdgeFilterRegex(edgeFilterRegex)
  const staffPopularityActive = staffMinFavourites > 0 || staffLimit !== null
  const graphSettingsActive = showEdgeLabels || hideIsolatedNodes

  return (
    <section className="filter-section">
      <div className="filter-section-title">
        <h3>Filters</h3>
        <button type="button" className="filter-reset" onClick={onReset}><RotateCcw size={13} /> Reset</button>
      </div>

      <FilterAccordionSection
        id="roles"
        title="Filter by Staff Role"
        subtitle="Show staff with selected roles"
        icon={<SlidersHorizontal size={18} />}
        iconTone="purple"
        open={sectionState.roles}
        active={rolesActive}
        onToggleOpen={onToggleSection}
        onToggleActive={() => onSetAllRoles(!rolesActive)}
      >
        <div className="filter-list">
          {ROLE_FILTERS.map((filter) => {
            const active = activeFilters.includes(filter.id)
            return (
              <button key={filter.id} type="button" className="filter-row" onClick={() => onToggle(filter.id)}>
                <SlidersHorizontal size={14} style={{ color: filter.color }} />
                <span>{filter.label}</span>
                <span className={`switch ${active ? 'on' : ''}`} aria-hidden="true" />
                <small>{counts.get(filter.id) ?? 0}</small>
              </button>
            )
          })}
        </div>
      </FilterAccordionSection>

      <FilterAccordionSection
        id="nodes"
        title="Filter by Node Types"
        subtitle="Choose which types of nodes to display"
        icon={<Cuboid size={18} />}
        iconTone="blue"
        open={sectionState.nodes}
        active={nodeTypesActive}
        onToggleOpen={onToggleSection}
        onToggleActive={() => onSetAllNodeTypes(!nodeTypesActive)}
      >
        <div className="filter-list">
          {NODE_TYPE_FILTERS.map((filter) => {
            const Icon = filter.icon
            const active = visibleNodeTypes[filter.id]
            return (
              <button key={filter.id} type="button" className="filter-row" onClick={() => onToggleNodeType(filter.id)}>
                <Icon size={14} style={{ color: filter.color }} />
                <span>{filter.label}</span>
                <span className={`switch ${active ? 'on' : ''}`} aria-hidden="true" />
                <small>{nodeCounts.get(filter.id) ?? 0}</small>
              </button>
            )
          })}
        </div>
      </FilterAccordionSection>

      <FilterAccordionSection
        id="edges"
        title="Filter by Edge Type"
        subtitle="Hide edges that match a regex"
        icon={<CircleDotDashed size={18} />}
        iconTone="green"
        open={sectionState.edges}
        active={edgeTypeFiltersActive}
        onToggleOpen={onToggleSection}
        onToggleActive={() => onSetEdgeTypeFiltersActive(!edgeTypeFiltersActive)}
      >
        <div className="edge-filter-controls">
          <div className={`filter-list ${editEdgeFilterRegex ? 'disabled' : ''}`}>
            <button
              type="button"
              className="filter-row graph-setting-row"
              disabled={editEdgeFilterRegex}
              onClick={() => onShowOnlyMainStudioEdgesChange(!showOnlyMainStudioEdges)}
            >
              <Building2 size={14} />
              <span>
                <strong>Show only main studio</strong>
                <em>Filters out studio edges labeled Studio</em>
              </span>
              <span className={`switch ${showOnlyMainStudioEdges ? 'on' : ''}`} aria-hidden="true" />
            </button>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={editEdgeFilterRegex}
              onChange={(event) => onEditEdgeFilterRegexChange(event.target.checked)}
            />
            <span>Edit regex directly</span>
          </label>

          <label className="regex-control" htmlFor="edge-filter-regex">
            <span>Filtered edge regex</span>
            <input
              id="edge-filter-regex"
              type="text"
              value={edgeFilterRegex}
              readOnly={!editEdgeFilterRegex}
              disabled={!editEdgeFilterRegex}
              placeholder="No edge filter"
              onChange={(event) => onEdgeFilterRegexChange(event.target.value)}
            />
          </label>
          {edgeFilterRegexInvalid ? <p className="filter-warning">Invalid regex. No edge type regex filter is applied.</p> : null}
        </div>
      </FilterAccordionSection>

      <FilterAccordionSection
        id="favourites"
        title="Filter by Staff Favourites"
        subtitle="Filter staff by popularity"
        icon={<Flame size={18} />}
        iconTone="orange"
        open={sectionState.favourites}
        active={staffPopularityActive}
        onToggleOpen={onToggleSection}
        onToggleActive={() => onSetPopularityFiltersActive(!staffPopularityActive)}
      >
        <div className="popularity-controls">
          <div className="popularity-control">
            <div className="control-heading">
              <label htmlFor="staff-min-favourites">Minimum favourites</label>
              <span>{staffMinFavourites.toLocaleString()}</span>
            </div>
            <div className="range-control">
              <span>0</span>
              <input
                type="range"
                min={0}
                max={5000}
                step={100}
                value={Math.min(staffMinFavourites, 5000)}
                onChange={(event) => onMinFavouritesChange(Number(event.target.value))}
              />
              <span>5,000</span>
            </div>
            <div className="number-input">
              <Flame size={15} />
              <input
                id="staff-min-favourites"
                type="number"
                min={0}
                step={100}
                value={staffMinFavourites}
                onChange={(event) => onMinFavouritesChange(Math.max(0, Number(event.target.value) || 0))}
              />
            </div>
          </div>
          <div className="popularity-control">
            <label htmlFor="staff-limit">Maximum staff nodes</label>
            <select
              id="staff-limit"
              value={staffLimit ?? 'all'}
              onChange={(event) => onStaffLimitChange(event.target.value === 'all' ? null : Number(event.target.value))}
            >
              {STAFF_LIMIT_OPTIONS.map((option) => (
                <option key={option.label} value={option.value ?? 'all'}>{option.label}</option>
              ))}
            </select>
            <p>Show only the most popular staff nodes in the graph.</p>
          </div>
        </div>
      </FilterAccordionSection>

      <FilterAccordionSection
        id="graph"
        title="Filter by Graph Settings"
        subtitle="Control graph density and visibility"
        icon={<Network size={18} />}
        iconTone="green"
        open={sectionState.graph}
        active={graphSettingsActive}
        onToggleOpen={onToggleSection}
        onToggleActive={() => onSetGraphSettingsActive(!graphSettingsActive)}
      >
        <div className="filter-list">
          <button type="button" className="filter-row graph-setting-row" onClick={() => onShowEdgeLabelsChange(!showEdgeLabels)}>
            <CircleDotDashed size={14} />
            <span>
              <strong>Show edge labels</strong>
              <em>Display role labels on edges</em>
            </span>
            <span className={`switch ${showEdgeLabels ? 'on' : ''}`} aria-hidden="true" />
          </button>
          <button type="button" className="filter-row graph-setting-row" onClick={() => onHideIsolatedNodesChange(!hideIsolatedNodes)}>
            <Network size={14} />
            <span>
              <strong>Hide isolated nodes</strong>
              <em>Hide nodes that have no connections</em>
            </span>
            <span className={`switch ${hideIsolatedNodes ? 'on' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </FilterAccordionSection>
    </section>
  )
}

function FilterAccordionSection({
  id,
  title,
  subtitle,
  icon,
  iconTone,
  open,
  active,
  onToggleOpen,
  onToggleActive,
  children,
}: {
  id: FilterSectionId
  title: string
  subtitle: string
  icon: ReactNode
  iconTone: 'purple' | 'blue' | 'orange' | 'green'
  open: boolean
  active: boolean
  onToggleOpen: (section: FilterSectionId) => void
  onToggleActive: () => void
  children: ReactNode
}) {
  return (
    <div className={`filter-card ${open ? 'open' : ''}`}>
      <div className="filter-card-header">
        <button type="button" className="filter-card-title" onClick={() => onToggleOpen(id)} aria-expanded={open}>
          <span className={`filter-icon ${iconTone}`}>{icon}</span>
          <span>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </span>
        </button>
        <button
          type="button"
          className={`switch-button ${active ? 'on' : ''}`}
          onClick={onToggleActive}
          aria-pressed={active}
          aria-label={`${active ? 'Disable' : 'Enable'} ${title}`}
        >
          <span className={`switch ${active ? 'on' : ''}`} aria-hidden="true" />
        </button>
        <button type="button" className="filter-collapse" onClick={() => onToggleOpen(id)} aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}>
          <ChevronDown size={16} />
        </button>
      </div>
      {open ? <div className="filter-card-body">{children}</div> : null}
    </div>
  )
}

export default App
