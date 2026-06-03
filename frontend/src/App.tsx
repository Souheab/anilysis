import { useCallback, useMemo, useState } from 'react'
import {
  ExternalLink,
  GitCompareArrows,
  Loader2,
  Network,
  Search,
  SlidersHorizontal,
  X,
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
import { GraphView } from './GraphView'

const ROLE_FILTERS = [
  { id: 'direction', label: 'Direction' },
  { id: 'writing', label: 'Writing' },
  { id: 'design', label: 'Design' },
  { id: 'music', label: 'Music' },
  { id: 'animation', label: 'Animation' },
  { id: 'production', label: 'Production' },
  { id: 'studio', label: 'Studio' },
  { id: 'other', label: 'Other' },
]

function titleFor(anime: AnimeSearchResult) {
  return anime.titleEnglish || anime.titleRomaji
}

function filtersForApi(activeFilters: string[]) {
  return activeFilters.length === ROLE_FILTERS.length ? [] : activeFilters
}

function App() {
  const [sourceAnime, setSourceAnime] = useState<AnimeSearchResult | null>(null)
  const [targetAnime, setTargetAnime] = useState<AnimeSearchResult | null>(null)
  const [activeFilters, setActiveFilters] = useState(() => ROLE_FILTERS.map((filter) => filter.id))
  const [comparison, setComparison] = useState<CompareResponse | null>(null)
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  const [isLoadingNode, setIsLoadingNode] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apiFilters = useMemo(() => filtersForApi(activeFilters), [activeFilters])
  const canCompare = Boolean(sourceAnime && targetAnime && sourceAnime.id !== targetAnime.id)

  const runComparison = useCallback(async () => {
    if (!sourceAnime || !targetAnime || sourceAnime.id === targetAnime.id) {
      return
    }
    setIsComparing(true)
    setError(null)
    try {
      const [nextComparison, nextGraph] = await Promise.all([
        compareAnime(sourceAnime.id, targetAnime.id, apiFilters),
        fetchGraph(sourceAnime.id, targetAnime.id, apiFilters, 2),
      ])
      setComparison(nextComparison)
      setGraph(nextGraph)
      setNodeDetail(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Comparison failed')
    } finally {
      setIsComparing(false)
    }
  }, [apiFilters, sourceAnime, targetAnime])

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
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Six Degrees of Anime</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950 md:text-4xl">
              Creative connection finder
            </h1>
          </div>
          <button
            type="button"
            onClick={runComparison}
            disabled={!canCompare || isComparing}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isComparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompareArrows className="h-4 w-4" />}
            Compare
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-5 xl:grid-cols-[360px_minmax(0,1fr)_320px]">
        <aside className="space-y-5">
          <section className="border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <Search className="h-4 w-4 text-teal-700" />
              <h2 className="text-base font-semibold">Anime Pair</h2>
            </div>
            <div className="space-y-4">
              <AnimeSearchBox label="Source anime" selected={sourceAnime} onSelect={setSourceAnime} />
              <AnimeSearchBox label="Target anime" selected={targetAnime} onSelect={setTargetAnime} />
            </div>
          </section>

          <section className="border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-amber-700" />
              <h2 className="text-base font-semibold">Role Filters</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_FILTERS.map((filter) => {
                const active = activeFilters.includes(filter.id)
                return (
                  <button
                    type="button"
                    key={filter.id}
                    onClick={() => toggleFilter(filter.id)}
                    className={`h-9 rounded-md border px-3 text-sm font-medium transition ${
                      active
                        ? 'border-teal-700 bg-teal-50 text-teal-800'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {filter.label}
                  </button>
                )
              })}
            </div>
          </section>

          {error ? <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        </aside>

        <section className="space-y-5">
          <ComparisonSummary comparison={comparison} loading={isComparing} />

          <section className="border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-teal-700" />
                <h2 className="text-base font-semibold">Connection Graph</h2>
              </div>
              {graph ? <span className="text-xs text-slate-500">{graph.nodes.length} nodes</span> : null}
            </div>
            <GraphView graph={graph} onNodeSelect={selectNode} />
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <SharedStaffList items={comparison?.sharedStaff ?? []} onSelect={(staff) => selectNode(`staff:${staff.staffId}`)} />
            <SharedStudioList items={comparison?.sharedStudios ?? []} onSelect={(studioId) => selectNode(`studio:${studioId}`)} />
          </section>
        </section>

        <DetailPanel detail={nodeDetail} loading={isLoadingNode} onClose={() => setNodeDetail(null)} />
      </div>
    </main>
  )
}

interface AnimeSearchBoxProps {
  label: string
  selected: AnimeSearchResult | null
  onSelect: (anime: AnimeSearchResult) => void
}

function AnimeSearchBox({ label, selected, onSelect }: AnimeSearchBoxProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AnimeSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runSearch = async (nextQuery: string) => {
    setQuery(nextQuery)
    if (nextQuery.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      setResults(await searchAnime(nextQuery.trim()))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(event) => void runSearch(event.target.value)}
          placeholder="Search AniList titles"
          className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
        />
      </div>
      {selected ? (
        <div className="mt-3 flex gap-3 border border-slate-200 bg-slate-50 p-2">
          {selected.coverImageUrl ? (
            <img src={selected.coverImageUrl} alt="" className="h-16 w-12 object-cover" />
          ) : (
            <div className="h-16 w-12 bg-slate-200" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{titleFor(selected)}</p>
            <p className="text-xs text-slate-500">
              {[selected.year, selected.format].filter(Boolean).join(' • ') || 'Cached after comparison'}
            </p>
          </div>
        </div>
      ) : null}
      {loading ? <p className="mt-2 text-xs text-slate-500">Searching...</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {results.length > 0 ? (
        <div className="mt-2 max-h-72 overflow-auto border border-slate-200 bg-white">
          {results.map((anime) => (
            <button
              key={anime.id}
              type="button"
              onClick={() => {
                onSelect(anime)
                setResults([])
                setQuery(titleFor(anime))
              }}
              className="flex w-full gap-3 border-b border-slate-100 p-2 text-left transition last:border-b-0 hover:bg-slate-50"
            >
              {anime.coverImageUrl ? (
                <img src={anime.coverImageUrl} alt="" className="h-14 w-10 object-cover" />
              ) : (
                <div className="h-14 w-10 bg-slate-200" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{titleFor(anime)}</span>
                <span className="block text-xs text-slate-500">
                  {[anime.year, anime.format].filter(Boolean).join(' • ')}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ComparisonSummary({ comparison, loading }: { comparison: CompareResponse | null; loading: boolean }) {
  if (loading) {
    return (
      <section className="grid min-h-40 place-items-center border border-slate-200 bg-white text-sm text-slate-500">
        <Loader2 className="mb-2 h-5 w-5 animate-spin text-teal-700" />
        Fetching staff, studios, graph paths, and score.
      </section>
    )
  }

  if (!comparison) {
    return (
      <section className="border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-500">Search two anime to reveal shared staff, studios, and the shortest cached path.</p>
      </section>
    )
  }

  const pathText = comparison.shortestPath.map((node) => node.label).join(' → ')
  const scoreRows = [
    ['Shared staff', comparison.scoreBreakdown.sharedStaff],
    ['Shared studios', comparison.scoreBreakdown.sharedStudios],
    ['Popularity bonus', comparison.scoreBreakdown.popularityBonus],
    ['Path bonus', comparison.scoreBreakdown.pathBonus],
  ]

  return (
    <section className="border border-slate-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Connection Score</p>
          <p className="mt-2 text-5xl font-semibold text-teal-700">{Math.round(comparison.score)}</p>
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">
            {titleFor(comparison.sourceAnime)} to {titleFor(comparison.targetAnime)}
          </h2>
          <p className="text-sm text-slate-600">
            {comparison.sharedStaff.length} shared staff and {comparison.sharedStudios.length} shared studios found in the local cache.
          </p>
          <p className="text-sm font-medium text-slate-800">{pathText || 'No cached creative path found.'}</p>
          <div className="grid gap-2 sm:grid-cols-4">
            {scoreRows.map(([label, value]) => (
              <div key={label} className="border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function SharedStaffList({ items, onSelect }: { items: SharedStaff[]; onSelect: (staff: SharedStaff) => void }) {
  return (
    <section className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold">Shared Staff</h2>
      </div>
      <div className="max-h-96 overflow-auto">
        {items.length === 0 ? <p className="p-4 text-sm text-slate-500">No shared staff under the active filters.</p> : null}
        {items.map((staff) => (
          <button
            key={staff.staffId}
            type="button"
            onClick={() => onSelect(staff)}
            className="flex w-full gap-3 border-b border-slate-100 p-3 text-left transition last:border-b-0 hover:bg-slate-50"
          >
            {staff.imageUrl ? <img src={staff.imageUrl} alt="" className="h-12 w-12 object-cover" /> : <div className="h-12 w-12 bg-slate-200" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{staff.name}</span>
              <span className="block truncate text-xs text-slate-500">{staff.sourceRoles.join(', ')}</span>
              <span className="block truncate text-xs text-slate-500">{staff.targetRoles.join(', ')}</span>
            </span>
            <span className="text-sm font-semibold text-teal-700">{staff.weight}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function SharedStudioList({ items, onSelect }: { items: CompareResponse['sharedStudios']; onSelect: (studioId: number) => void }) {
  return (
    <section className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold">Shared Studios</h2>
      </div>
      <div className="max-h-96 overflow-auto">
        {items.length === 0 ? <p className="p-4 text-sm text-slate-500">No shared studios under the active filters.</p> : null}
        {items.map((studio) => (
          <button
            key={studio.studioId}
            type="button"
            onClick={() => onSelect(studio.studioId)}
            className="flex w-full items-center justify-between border-b border-slate-100 p-3 text-left transition last:border-b-0 hover:bg-slate-50"
          >
            <span>
              <span className="block text-sm font-semibold">{studio.name}</span>
              <span className="block text-xs text-slate-500">
                {studio.sourceIsMain || studio.targetIsMain ? 'Main studio overlap' : 'Supporting studio overlap'}
              </span>
            </span>
            <span className="text-sm font-semibold text-amber-700">{studio.weight}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function DetailPanel({ detail, loading, onClose }: { detail: NodeDetail | null; loading: boolean; onClose: () => void }) {
  return (
    <aside className="min-h-[280px] border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold">Node Details</h2>
        {detail ? (
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {loading ? (
        <div className="grid min-h-52 place-items-center text-sm text-slate-500">
          <Loader2 className="mb-2 h-5 w-5 animate-spin text-teal-700" />
          Loading details.
        </div>
      ) : null}
      {!loading && !detail ? <p className="p-4 text-sm text-slate-500">Click a graph node or list item to inspect cached details.</p> : null}
      {!loading && detail ? (
        <div className="space-y-4 p-4">
          {detail.imageUrl ? <img src={detail.imageUrl} alt="" className="h-44 w-full object-cover" /> : null}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{detail.type}</p>
            <h3 className="mt-1 text-lg font-semibold">{detail.label}</h3>
          </div>
          {detail.siteUrl ? (
            <a href={detail.siteUrl} target="_blank" className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700">
              AniList
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
          <Metadata metadata={detail.metadata} />
          {detail.relatedAnime.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-semibold">Related cached anime</p>
              <div className="space-y-2">
                {detail.relatedAnime.slice(0, 8).map((anime) => (
                  <p key={anime.id} className="truncate border border-slate-200 bg-slate-50 px-2 py-1 text-sm">
                    {titleFor(anime)}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}

function Metadata({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined && value !== '')
  if (entries.length === 0) {
    return null
  }
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      {entries.slice(0, 8).map(([key, value]) => (
        <div key={key} className="border border-slate-200 bg-slate-50 p-2">
          <dt className="text-xs capitalize text-slate-500">{key.replace(/([A-Z])/g, ' $1')}</dt>
          <dd className="truncate font-medium">{String(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

export default App
