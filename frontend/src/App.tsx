import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightLeft,
  Building2,
  ChevronDown,
  CircleDotDashed,
  Cuboid,
  Eye,
  EyeOff,
  Film,
  Flame,
  Focus,
  Info,
  Loader2,
  Mic2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Moon,
  Sun,
  Users,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'

import './App.css'
import {
  compareAnime,
  compareEntities,
  DEFAULT_STAFF_POPULARITY_FILTERS,
  fetchGraph,
  fetchAnimeProfile,
  fetchEntitySummary,
  fetchNodeDetail,
  fetchPopularStaff,
  fetchStaffDirectedAnime,
  searchAll,
  searchAnime,
  searchEntities,
  type AnimeSearchResult,
  type AnimeProfileResponse,
  type ComparisonMetricRow,
  type CompareResponse,
  type EntityCompareResponse,
  type EntitySearchResult,
  type EntitySummary,
  type EntityType,
  type GraphResponse,
  type NodeDetail,
  type PopularStaffAnime,
  type PopularStaff,
  type ProfileAnimeEntry,
  type ProfileDistributionRow,
  type ProfileScoreComparison,
  type ProfileScoreDeltaRow,
  type ProfileTasteAnalysisRow,
  type RelatedAnimeSummary,
  type ScoreBreakdown,
  type SharedStaff,
  type SharedVoiceActor,
} from './api'
import { GraphView, type GraphLayout, type GraphViewHandle } from './GraphView'

const ROLE_FILTERS = [
  { id: 'direction', label: 'Director', color: '#b580ff' },
  { id: 'writing', label: 'Writer', color: '#ffd400' },
  { id: 'music', label: 'Composer', color: '#2aa8ff' },
  { id: 'design', label: 'Character Design', color: '#26d9d1' },
  { id: 'animation', label: 'Animation Director', color: '#4bd66d' },
  { id: 'production', label: 'Production', color: '#ff8a3d' },
  { id: 'other', label: 'Other', color: '#94a3b8' },
]

const NODE_TYPE_FILTERS = [
  { id: 'anime', label: 'Anime', color: '#1688ff', icon: Film },
  { id: 'staff', label: 'Staff', color: '#ff8a3d', icon: Users },
  { id: 'voiceActor', label: 'Voice Actors', color: '#d946ef', icon: Mic2 },
  { id: 'studio', label: 'Studio', color: '#65c56f', icon: Building2 },
] as const

const FILTER_SECTION_STORAGE_KEY = 'animeanalysis.filterSections.v1'
const RECENT_COMPARISONS_STORAGE_KEY = 'animeanalysis.recentComparisons.v1'
const SETTINGS_STORAGE_KEY = 'animeanalysis.settings.v1'
const THEME_STORAGE_KEY = 'animeanalysis.theme.v1'
const RECENT_COMPARISON_LIMIT = 10
const MIN_ANALYSIS_ANIME = 1
const MAX_COMPARE_ANIME = 6
const POPULAR_STAFF_LIMIT = 50
const POPULAR_STAFF_KINDS = [
  {
    value: 'All Staff',
    label: 'All Staff',
    pluralLabel: 'All Staff',
    role: '',
    description: 'Top AniList staff sorted by favorites across every listed occupation.',
    detailEmpty: 'No anime credits found from AniList staff roles.',
  },
  {
    value: 'Non-Voice Staff',
    label: 'Non-Voice Staff',
    pluralLabel: 'Non-Voice Staff',
    role: '',
    description: 'Top AniList staff sorted by favorites, excluding voice actor occupations.',
    detailEmpty: 'No anime credits found from AniList staff roles.',
  },
  {
    value: 'Director',
    label: 'Director',
    pluralLabel: 'Directors',
    role: 'Director',
    description: 'Top AniList staff filtered to director occupations.',
    detailEmpty: 'No directed anime found from AniList staff roles.',
  },
  {
    value: 'Voice Actor',
    label: 'Voice Actor',
    pluralLabel: 'Voice Actors',
    role: 'Voice Actor',
    description: 'Top AniList staff filtered to voice actor occupations.',
    detailEmpty: 'No voice acting anime credits found from AniList staff roles.',
  },
  {
    value: 'Composer',
    label: 'Composer',
    pluralLabel: 'Composers',
    role: 'Music',
    description: 'Top AniList staff filtered to composer and music occupations.',
    detailEmpty: 'No music anime credits found from AniList staff roles.',
  },
] as const
const ALL_ROLE_IDS = ROLE_FILTERS.map((filter) => filter.id)
const DEFAULT_NODE_TYPES = { anime: true, staff: true, voiceActor: true, studio: true }
type ThemePreference = 'light' | 'dark' | null
type ThemeMode = Exclude<ThemePreference, null>
const VOICE_ACTOR_NODE_TYPES = { ...DEFAULT_NODE_TYPES, staff: false }
const DEFAULT_SHOW_ONLY_MAIN_STUDIO_EDGES = true
const DEFAULT_EDGE_FILTER_REGEX = ''
const DEFAULT_WHEEL_SENSITIVITY = 0.16
const DEFAULT_GRAPH_SPACING = 1.35
const DEFAULT_GRAPH_LAYOUT: GraphLayout = 'fcose'
const SCORE_CURVE_SCALE = 140
const GRAPH_LAYOUT_OPTIONS: { label: string; value: GraphLayout }[] = [
  { label: 'fCoSE', value: 'fcose' },
  { label: 'Cola', value: 'cola' },
  { label: 'Breadthfirst', value: 'breadthfirst' },
]
const MIN_WHEEL_SENSITIVITY = 0.04
const MAX_WHEEL_SENSITIVITY = 1
const MIN_GRAPH_SPACING = 0.8
const MAX_GRAPH_SPACING = 2.2
const STAFF_LIMIT_OPTIONS = [
  { label: 'Top 10', value: 10 },
  { label: 'Top 20', value: 20 },
  { label: 'Top 40', value: 40 },
  { label: 'Top 80', value: 80 },
  { label: 'All staff', value: null },
]
const FILTER_TEMPLATES = [
  { id: 'default', label: 'Default', nodeTypes: DEFAULT_NODE_TYPES },
  { id: 'voiceActors', label: 'Voice Actors', nodeTypes: VOICE_ACTOR_NODE_TYPES },
] as const

type NodeTypeId = (typeof NODE_TYPE_FILTERS)[number]['id']
type VisibleNodeTypes = Record<NodeTypeId, boolean>
type FilterTemplateId = (typeof FILTER_TEMPLATES)[number]['id']
type FilterSectionId = 'roles' | 'nodes' | 'edges' | 'favourites' | 'graph'
type FilterSectionState = Record<FilterSectionId, boolean>
type ResizePanel = 'left' | 'right'
type AnalysisToolId = 'relationships' | 'search' | 'popularStaff' | 'entityCompare' | 'profile'
type PopularStaffKind = (typeof POPULAR_STAFF_KINDS)[number]['value']
type AnalysisToolDefinition = {
  id: AnalysisToolId
  label: string
  shortLabel: string
  icon: LucideIcon
}
type RecentComparison = {
  anime: AnimeSearchResult[]
  comparedAt: string
}
type GraphEdge = GraphResponse['edges'][number]

const ANALYSIS_TOOLS: AnalysisToolDefinition[] = [
  {
    id: 'relationships',
    label: 'Relationship Visualizer',
    shortLabel: 'Relations',
    icon: Network,
  },
  {
    id: 'search',
    label: 'Information Search',
    shortLabel: 'Search',
    icon: Search,
  },
  {
    id: 'popularStaff',
    label: 'Popular Staff',
    shortLabel: 'Staff',
    icon: Users,
  },
  {
    id: 'entityCompare',
    label: 'Compare Entities',
    shortLabel: 'Compare',
    icon: ArrowRightLeft,
  },
  {
    id: 'profile',
    label: 'Profile Explorer',
    shortLabel: 'Profile',
    icon: Users,
  },
]

const ENTITY_TYPE_OPTIONS: { value: EntityType; label: string; icon: LucideIcon }[] = [
  { value: 'anime', label: 'Anime', icon: Film },
  { value: 'studio', label: 'Studio', icon: Building2 },
  { value: 'staff', label: 'Staff', icon: Users },
  { value: 'voiceActor', label: 'Voice Actor', icon: Mic2 },
]

const DEFAULT_LEFT_PANEL_WIDTH = 420
const DEFAULT_RIGHT_PANEL_WIDTH = 390
const MIN_PANEL_WIDTH = 300
const MAX_PANEL_WIDTH = 640

function titleFor(anime: AnimeSearchResult) {
  return anime.titleEnglish || anime.titleRomaji
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
  return Object.values(staff.rolesByAnime).flat()[0] || staff.roleCategories[0] || 'Role'
}

function primaryCharacter(actor: SharedVoiceActor) {
  return Object.values(actor.charactersByAnime).flat()[0] || 'Voice'
}

function staffOccupations(staff: PopularStaff | null) {
  return staff?.primaryOccupations?.length ? staff.primaryOccupations.join(' / ') : 'Staff'
}

function popularStaffKindOption(kind: PopularStaffKind) {
  return POPULAR_STAFF_KINDS.find((option) => option.value === kind) ?? POPULAR_STAFF_KINDS[0]
}

function nodeTypeLabel(type: NodeDetail['type']) {
  if (type === 'voiceActor') return 'Voice Actor'
  return type
}

function entityTypeLabel(type: EntityType) {
  return ENTITY_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? 'Entity'
}

function relatedAnimeTitle(anime: AnimeSearchResult) {
  return anime.titleEnglish || anime.titleRomaji
}

function renderEntityIcon(type: EntityType, size: number) {
  if (type === 'anime') return <Film size={size} />
  if (type === 'studio') return <Building2 size={size} />
  if (type === 'staff') return <Users size={size} />
  return <Mic2 size={size} />
}

function nodeTypesMatch(left: VisibleNodeTypes, right: VisibleNodeTypes) {
  return NODE_TYPE_FILTERS.every((filter) => left[filter.id] === right[filter.id])
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

function currentSystemTheme(): ThemeMode {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

function initialThemePreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(saved) ? saved : null
  } catch {
    return null
  }
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
    Array.isArray(comparison.anime) &&
    comparison.anime.length >= MIN_ANALYSIS_ANIME &&
    comparison.anime.length <= MAX_COMPARE_ANIME &&
    comparison.anime.every(isAnimeSearchResult) &&
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

function clampWheelSensitivity(value: number) {
  return Math.min(MAX_WHEEL_SENSITIVITY, Math.max(MIN_WHEEL_SENSITIVITY, value))
}

function clampGraphSpacing(value: number) {
  return Math.min(MAX_GRAPH_SPACING, Math.max(MIN_GRAPH_SPACING, value))
}

function initialWheelSensitivity() {
  if (typeof window === 'undefined') {
    return DEFAULT_WHEEL_SENSITIVITY
  }
  try {
    const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!saved) {
      return DEFAULT_WHEEL_SENSITIVITY
    }
    const parsed = JSON.parse(saved) as Partial<Record<string, unknown>>
    return typeof parsed.wheelSensitivity === 'number'
      ? clampWheelSensitivity(parsed.wheelSensitivity)
      : DEFAULT_WHEEL_SENSITIVITY
  } catch {
    return DEFAULT_WHEEL_SENSITIVITY
  }
}

function isGraphLayout(value: unknown): value is GraphLayout {
  return value === 'fcose' || value === 'cola' || value === 'breadthfirst'
}

function initialGraphLayout() {
  if (typeof window === 'undefined') {
    return DEFAULT_GRAPH_LAYOUT
  }
  try {
    const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!saved) {
      return DEFAULT_GRAPH_LAYOUT
    }
    const parsed = JSON.parse(saved) as Partial<Record<string, unknown>>
    return isGraphLayout(parsed.graphLayout) ? parsed.graphLayout : DEFAULT_GRAPH_LAYOUT
  } catch {
    return DEFAULT_GRAPH_LAYOUT
  }
}

function initialGraphSpacing() {
  if (typeof window === 'undefined') {
    return DEFAULT_GRAPH_SPACING
  }
  try {
    const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!saved) {
      return DEFAULT_GRAPH_SPACING
    }
    const parsed = JSON.parse(saved) as Partial<Record<string, unknown>>
    return typeof parsed.graphSpacing === 'number'
      ? clampGraphSpacing(parsed.graphSpacing)
      : DEFAULT_GRAPH_SPACING
  } catch {
    return DEFAULT_GRAPH_SPACING
  }
}

function comparisonKey(anime: AnimeSearchResult[]) {
  return anime.map((item) => item.id).sort((left, right) => left - right).join(':')
}

function addRecentComparison(
  current: RecentComparison[],
  anime: AnimeSearchResult[],
): RecentComparison[] {
  const key = comparisonKey(anime)
  return [
    { anime, comparedAt: new Date().toISOString() },
    ...current.filter((item) => comparisonKey(item.anime) !== key),
  ].slice(0, RECENT_COMPARISON_LIMIT)
}

function selectedAnimeNodeIds(selectedAnime: AnimeSearchResult[]) {
  return selectedAnime.map((anime) => `anime:${anime.id}`)
}

function selectedAnimeLabel(selectedAnime: AnimeSearchResult[]) {
  if (selectedAnime.length <= 3) {
    return selectedAnime.map(titleFor).join(' / ')
  }
  return `${selectedAnime.slice(0, 3).map(titleFor).join(' / ')} +${selectedAnime.length - 3}`
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

function isSupportingStudioEdge(edge: GraphResponse['edges'][number]) {
  return edge.data.type === 'studio' && edge.data.label === 'Studio'
}

function stringListDataValue(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function stringDataValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function staffEdgeCategories(edge: GraphResponse['edges'][number]) {
  return stringListDataValue(edge.data.roleCategories).filter((category) => category !== 'studio')
}

function staffNodeRoleCategories(graph: GraphResponse | null) {
  const categoriesByNodeId = new Map<string, Set<string>>()
  for (const edge of graph?.edges ?? []) {
    if (edge.data.type !== 'staff') {
      continue
    }
    const categories = staffEdgeCategories(edge)
    if (categories.length === 0) {
      continue
    }
    for (const endpoint of [edge.data.source, edge.data.target]) {
      if (typeof endpoint !== 'string' || !endpoint.startsWith('staff:')) {
        continue
      }
      const existing = categoriesByNodeId.get(endpoint) ?? new Set<string>()
      for (const category of categories) {
        existing.add(category)
      }
      categoriesByNodeId.set(endpoint, existing)
    }
  }
  return categoriesByNodeId
}

function primaryStaffRoleCategory(categories: Set<string> | undefined) {
  if (!categories) {
    return null
  }
  return ROLE_FILTERS.find((filter) => categories.has(filter.id))?.id ?? null
}

function applyMinimumShowEdgeFilter(
  nodes: GraphResponse['nodes'],
  edges: GraphResponse['edges'],
  selectedAnime: AnimeSearchResult[],
) {
  const nodesById = new Map(nodes.map((node) => [String(node.data.id), node]))
  const showNeighborsByNodeId = new Map<string, Set<string>>()

  for (const edge of edges) {
    const sourceId = String(edge.data.source ?? '')
    const targetId = String(edge.data.target ?? '')
    const source = nodesById.get(sourceId)
    const target = nodesById.get(targetId)
    if (!source || !target) {
      continue
    }

    if (source.data.type === 'anime' && target.data.type !== 'anime') {
      const neighbors = showNeighborsByNodeId.get(targetId) ?? new Set<string>()
      neighbors.add(sourceId)
      showNeighborsByNodeId.set(targetId, neighbors)
    } else if (target.data.type === 'anime' && source.data.type !== 'anime') {
      const neighbors = showNeighborsByNodeId.get(sourceId) ?? new Set<string>()
      neighbors.add(targetId)
      showNeighborsByNodeId.set(sourceId, neighbors)
    }
  }

  const connectorNodeIds = new Set(
    Array.from(showNeighborsByNodeId.entries())
      .filter(([, showNodeIds]) => showNodeIds.size >= 2)
      .map(([nodeId]) => nodeId),
  )
  const comparisonNodeIds = new Set(selectedAnimeNodeIds(selectedAnime))
  const connectedShowNodeIds = new Set<string>()

  for (const edge of edges) {
    const sourceId = String(edge.data.source ?? '')
    const targetId = String(edge.data.target ?? '')
    if (connectorNodeIds.has(sourceId) && nodesById.get(targetId)?.data.type === 'anime') {
      connectedShowNodeIds.add(targetId)
    } else if (connectorNodeIds.has(targetId) && nodesById.get(sourceId)?.data.type === 'anime') {
      connectedShowNodeIds.add(sourceId)
    }
  }

  const filteredNodes = nodes.filter((node) => {
    const nodeId = String(node.data.id)
    if (node.data.type === 'anime') {
      return comparisonNodeIds.has(nodeId) || connectedShowNodeIds.has(nodeId)
    }
    return connectorNodeIds.has(nodeId)
  })
  const visibleNodeIds = new Set(filteredNodes.map((node) => String(node.data.id)))

  return {
    nodes: filteredNodes,
    edges: edges.filter((edge) => visibleNodeIds.has(String(edge.data.source)) && visibleNodeIds.has(String(edge.data.target))),
  }
}

function filterGraph(
  graph: GraphResponse | null,
  visibleNodeTypes: VisibleNodeTypes,
  activeRoleFilters: string[],
  hideIsolatedNodes: boolean,
  showOnlySharedComparisonNodes: boolean,
  showOnlyNodesWithMultipleShowEdges: boolean,
  showOnlyMainStudioEdges: boolean,
  highlightAllPaths: boolean,
  edgeFilterRegex: string,
  selectedAnime: AnimeSearchResult[],
): GraphResponse | null {
  if (!graph) {
    return null
  }

  const typeVisible = (type: unknown) => {
    if (type !== 'anime' && type !== 'staff' && type !== 'studio' && type !== 'voiceActor') {
      return true
    }
    return visibleNodeTypes[type]
  }
  const activeStaffRoles = new Set(activeRoleFilters)
  const roleCategoriesByStaffNodeId = staffNodeRoleCategories(graph)

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
    if (showOnlyMainStudioEdges && isSupportingStudioEdge(edge)) {
      return false
    }
    if (edge.data.type === 'staff') {
      const categories = staffEdgeCategories(edge)
      if (!categories.some((category) => activeStaffRoles.has(category))) {
        return false
      }
    }
    return !edgeFilter || !edgeFilterTargets(edge).some((value) => edgeFilter.test(value))
  })

  const connectedStaffIds = new Set<string>()
  for (const edge of edges) {
    for (const endpoint of [edge.data.source, edge.data.target]) {
      if (typeof endpoint === 'string' && endpoint.startsWith('staff:')) {
        connectedStaffIds.add(endpoint)
      }
    }
  }
  nodes = nodes.filter((node) => {
    const nodeId = String(node.data.id)
    if (node.data.type !== 'staff') {
      return true
    }
    const primaryCategory = primaryStaffRoleCategory(roleCategoriesByStaffNodeId.get(nodeId))
    return Boolean(primaryCategory && activeStaffRoles.has(primaryCategory) && connectedStaffIds.has(nodeId))
  })
  visibleNodeIds = new Set(nodes.map((node) => String(node.data.id)))
  edges = edges.filter((edge) => visibleNodeIds.has(String(edge.data.source)) && visibleNodeIds.has(String(edge.data.target)))

  if (showOnlyNodesWithMultipleShowEdges) {
    const filtered = applyMinimumShowEdgeFilter(nodes, edges, selectedAnime)
    nodes = filtered.nodes
    edges = filtered.edges
    visibleNodeIds = new Set(nodes.map((node) => String(node.data.id)))
  }

  if (showOnlySharedComparisonNodes && selectedAnime.length >= MIN_ANALYSIS_ANIME) {
    const comparisonNodeIds = new Set(selectedAnimeNodeIds(selectedAnime))
    const comparisonNeighbors = new Map<string, Set<string>>()

    for (const edge of edges) {
      const source = String(edge.data.source ?? '')
      const target = String(edge.data.target ?? '')

      if (comparisonNodeIds.has(source) && !comparisonNodeIds.has(target)) {
        const neighbors = comparisonNeighbors.get(target) ?? new Set<string>()
        neighbors.add(source)
        comparisonNeighbors.set(target, neighbors)
      } else if (comparisonNodeIds.has(target) && !comparisonNodeIds.has(source)) {
        const neighbors = comparisonNeighbors.get(source) ?? new Set<string>()
        neighbors.add(target)
        comparisonNeighbors.set(source, neighbors)
      }
    }

    nodes = nodes.filter((node) => {
      const nodeId = String(node.data.id)
      if (comparisonNodeIds.has(nodeId)) {
        return true
      }
      const neighbors = comparisonNeighbors.get(nodeId)
      return Boolean(neighbors && Array.from(comparisonNodeIds).every((comparisonNodeId) => neighbors.has(comparisonNodeId)))
    })
    visibleNodeIds = new Set(nodes.map((node) => String(node.data.id)))
    edges = edges.filter((edge) => visibleNodeIds.has(String(edge.data.source)) && visibleNodeIds.has(String(edge.data.target)))
  }

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

  const allPathHighlights =
    highlightAllPaths && selectedAnime.length >= 2
      ? connectedHighlights(edges, selectedAnimeNodeIds(selectedAnime))
      : null
  const highlightedPath = allPathHighlights
    ? nodes.map((node) => String(node.data.id)).filter((nodeId) => allPathHighlights.nodeIds.has(nodeId))
    : graph.highlightedPath.filter((nodeId) => visibleNodeIds.has(nodeId))

  return {
    nodes: nodes.map((node) => ({
      ...node,
      classes: allPathHighlights?.nodeIds.has(String(node.data.id)) ? addClassName(node.classes, 'highlighted') : node.classes,
    })),
    edges: edges.map((edge) => ({
      ...edge,
      classes: allPathHighlights?.edgeIds.has(String(edge.data.id)) ? addClassName(edge.classes, 'highlighted') : edge.classes,
    })),
    highlightedPath,
  }
}

function connectedHighlights(edges: GraphResponse['edges'], selectedNodeIds: string[]) {
  const adjacency = new Map<string, Set<string>>()
  for (const edge of edges) {
    const source = typeof edge.data.source === 'string' ? edge.data.source : ''
    const target = typeof edge.data.target === 'string' ? edge.data.target : ''
    if (!source || !target) {
      continue
    }
    const sourceNeighbors = adjacency.get(source) ?? new Set<string>()
    const targetNeighbors = adjacency.get(target) ?? new Set<string>()
    sourceNeighbors.add(target)
    targetNeighbors.add(source)
    adjacency.set(source, sourceNeighbors)
    adjacency.set(target, targetNeighbors)
  }

  if (selectedNodeIds.length === 0) {
    return { nodeIds: new Set<string>(), edgeIds: new Set<string>() }
  }

  const nodeIds = new Set<string>()
  const queue = [selectedNodeIds[0]]
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index]
    if (nodeIds.has(nodeId)) {
      continue
    }
    nodeIds.add(nodeId)
    for (const neighborId of adjacency.get(nodeId) ?? []) {
      queue.push(neighborId)
    }
  }

  if (!selectedNodeIds.every((nodeId) => nodeIds.has(nodeId))) {
    return { nodeIds: new Set<string>(), edgeIds: new Set<string>() }
  }

  const edgeIds = new Set<string>()
  for (const edge of edges) {
    const source = typeof edge.data.source === 'string' ? edge.data.source : ''
    const target = typeof edge.data.target === 'string' ? edge.data.target : ''
    if (nodeIds.has(source) && nodeIds.has(target)) {
      edgeIds.add(String(edge.data.id))
    }
  }
  return { nodeIds, edgeIds }
}

function addClassName(classes: string, className: string) {
  const classNames = new Set(classes.split(/\s+/).filter(Boolean))
  classNames.add(className)
  return Array.from(classNames).join(' ')
}

function clampPanelWidth(value: number) {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, value))
}

function numericDataValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function connectionScoreFromPoints(points: number) {
  if (points <= 0) {
    return 0
  }
  return Math.min(100, 100 * (1 - Math.exp(-points / SCORE_CURVE_SCALE)))
}

function formatScoreValue(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function scoreBreakdownItems(breakdown: ScoreBreakdown) {
  return [
    { label: 'Shared Staff', value: breakdown.sharedStaff },
    { label: 'Shared Studios', value: breakdown.sharedStudios },
    { label: 'Voice Actors', value: breakdown.sharedVoiceActors },
    { label: 'Popularity', value: breakdown.popularityBonus },
    { label: 'Shortest Path', value: breakdown.pathBonus },
  ]
}

function visibleGraphScore(
  graph: GraphResponse | null,
  selectedAnime: AnimeSearchResult[],
) {
  if (!graph || selectedAnime.length < 2) {
    return null
  }

  const comparisonNodeIds = selectedAnimeNodeIds(selectedAnime)
  const nodesById = new Map(graph.nodes.map((node) => [String(node.data.id), node]))
  if (!comparisonNodeIds.every((nodeId) => nodesById.has(nodeId))) {
    return null
  }

  const comparisonNodeIdSet = new Set(comparisonNodeIds)
  const connectorEdges = new Map<string, Map<string, number>>()
  for (const edge of graph.edges) {
    const source = String(edge.data.source ?? '')
    const target = String(edge.data.target ?? '')
    const weight = numericDataValue(edge.data.weight)

    if (comparisonNodeIdSet.has(source) && !comparisonNodeIdSet.has(target)) {
      const weights = connectorEdges.get(target) ?? new Map<string, number>()
      weights.set(source, weight)
      connectorEdges.set(target, weights)
    } else if (comparisonNodeIdSet.has(target) && !comparisonNodeIdSet.has(source)) {
      const weights = connectorEdges.get(source) ?? new Map<string, number>()
      weights.set(target, weight)
      connectorEdges.set(source, weights)
    }
  }

  let staffPoints = 0
  let studioPoints = 0
  let voiceActorPoints = 0
  let popularityPoints = 0

  for (const [nodeId, weightsByAnime] of connectorEdges) {
    if (!comparisonNodeIds.every((comparisonNodeId) => weightsByAnime.has(comparisonNodeId))) {
      continue
    }
    const node = nodesById.get(nodeId)
    if (!node) {
      continue
    }

    const weights = Array.from(weightsByAnime.values())
    const connectorWeight = weights.reduce((total, weight) => total + weight, 0)
    const favourites = numericDataValue(node.data.favourites)
    if (node.data.type === 'staff') {
      staffPoints += connectorWeight * 5
      popularityPoints += Math.min(favourites, 30_000) / 5_000
    } else if (node.data.type === 'studio') {
      studioPoints += connectorWeight * 4
    } else if (node.data.type === 'voiceActor') {
      voiceActorPoints += connectorWeight * 3
      popularityPoints += Math.min(favourites, 30_000) / 5_000
    }
  }

  return connectionScoreFromPoints(staffPoints + studioPoints + voiceActorPoints + popularityPoints)
}

function App() {
  const graphRef = useRef<GraphViewHandle | null>(null)
  const [activeToolId, setActiveToolId] = useState<AnalysisToolId>('relationships')
  const [selectedAnime, setSelectedAnime] = useState<AnimeSearchResult[]>([])
  const [activeSlotIndex, setActiveSlotIndex] = useState(0)
  const [activeFilters, setActiveFilters] = useState(() => ALL_ROLE_IDS)
  const [roleFiltersEnabled, setRoleFiltersEnabled] = useState(true)
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<VisibleNodeTypes>(DEFAULT_NODE_TYPES)
  const [nodeTypeFiltersEnabled, setNodeTypeFiltersEnabled] = useState(true)
  const [showOnlyMainStudioEdges, setShowOnlyMainStudioEdges] = useState(DEFAULT_SHOW_ONLY_MAIN_STUDIO_EDGES)
  const [edgeFilterRegex, setEdgeFilterRegex] = useState(DEFAULT_EDGE_FILTER_REGEX)
  const [staffMinFavourites, setStaffMinFavourites] = useState(DEFAULT_STAFF_POPULARITY_FILTERS.staffMinFavourites)
  const [staffLimit, setStaffLimit] = useState<number | null>(DEFAULT_STAFF_POPULARITY_FILTERS.staffLimit)
  const [showEdgeLabels, setShowEdgeLabels] = useState(true)
  const [hideIsolatedNodes, setHideIsolatedNodes] = useState(true)
  const [showOnlySharedComparisonNodes, setShowOnlySharedComparisonNodes] = useState(false)
  const [showOnlyNodesWithMultipleShowEdges, setShowOnlyNodesWithMultipleShowEdges] = useState(false)
  const [highlightAllPaths, setHighlightAllPaths] = useState(false)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [leftPanelWidth, setLeftPanelWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH)
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH)
  const [showGraphLegend, setShowGraphLegend] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [themePreference, setThemePreference] = useState<ThemePreference>(initialThemePreference)
  const [systemTheme, setSystemTheme] = useState<ThemeMode>(currentSystemTheme)
  const [wheelSensitivity, setWheelSensitivity] = useState(initialWheelSensitivity)
  const [graphLayout, setGraphLayout] = useState<GraphLayout>(initialGraphLayout)
  const [graphSpacing, setGraphSpacing] = useState(initialGraphSpacing)
  const [filterSections, setFilterSections] = useState<FilterSectionState>(initialFilterSections)
  const [recentComparisons, setRecentComparisons] = useState<RecentComparison[]>(initialRecentComparisons)
  const [recentComparisonsOpen, setRecentComparisonsOpen] = useState(false)
  const [popularStaffKind, setPopularStaffKind] = useState<PopularStaffKind>('Director')
  const [popularStaff, setPopularStaff] = useState<PopularStaff[]>([])
  const [selectedPopularStaff, setSelectedPopularStaff] = useState<PopularStaff | null>(null)
  const [popularStaffAnime, setPopularStaffAnime] = useState<PopularStaffAnime[]>([])
  const [popularStaffAnimeLoading, setPopularStaffAnimeLoading] = useState(false)
  const [popularStaffAnimeError, setPopularStaffAnimeError] = useState<string | null>(null)
  const [popularStaffLoading, setPopularStaffLoading] = useState(false)
  const [popularStaffError, setPopularStaffError] = useState<string | null>(null)
  const [entityCompareType, setEntityCompareType] = useState<EntityType>('anime')
  const [selectedEntities, setSelectedEntities] = useState<[EntitySearchResult | null, EntitySearchResult | null]>([null, null])
  const [activeEntitySlot, setActiveEntitySlot] = useState<0 | 1>(0)
  const [entityComparison, setEntityComparison] = useState<EntityCompareResponse | null>(null)
  const [entityCompareLoading, setEntityCompareLoading] = useState(false)
  const [entityCompareError, setEntityCompareError] = useState<string | null>(null)
  const [profileUsername, setProfileUsername] = useState('')
  const [submittedProfileUsername, setSubmittedProfileUsername] = useState('')
  const [animeProfile, setAnimeProfile] = useState<AnimeProfileResponse | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [comparison, setComparison] = useState<CompareResponse | null>(null)
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  const [isLoadingNode, setIsLoadingNode] = useState(false)
  const [analysisFailed, setAnalysisFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveActiveFilters = roleFiltersEnabled ? activeFilters : ALL_ROLE_IDS
  const effectiveVisibleNodeTypes = nodeTypeFiltersEnabled ? visibleNodeTypes : DEFAULT_NODE_TYPES
  const popularityFilters = useMemo(() => ({ staffMinFavourites, staffLimit }), [staffLimit, staffMinFavourites])
  const effectiveTheme = themePreference ?? systemTheme
  const displayGraph = useMemo(
    () =>
      filterGraph(
        graph,
        effectiveVisibleNodeTypes,
        effectiveActiveFilters,
        hideIsolatedNodes,
        showOnlySharedComparisonNodes,
        showOnlyNodesWithMultipleShowEdges,
        showOnlyMainStudioEdges,
        highlightAllPaths,
        edgeFilterRegex,
        selectedAnime,
      ),
    [
      edgeFilterRegex,
      effectiveActiveFilters,
      effectiveVisibleNodeTypes,
      graph,
      hideIsolatedNodes,
      highlightAllPaths,
      showOnlyMainStudioEdges,
      showOnlySharedComparisonNodes,
      showOnlyNodesWithMultipleShowEdges,
      selectedAnime,
    ],
  )
  const canAnalyze = selectedAnime.length >= MIN_ANALYSIS_ANIME
  const atSelectionLimit = selectedAnime.length >= MAX_COMPARE_ANIME
  const activeTool = ANALYSIS_TOOLS.find((tool) => tool.id === activeToolId) ?? ANALYSIS_TOOLS[0]
  const isRelationshipTool = activeTool.id === 'relationships'
  const isGeneralSearchTool = activeTool.id === 'search'
  const isPopularStaffTool = activeTool.id === 'popularStaff'
  const isEntityCompareTool = activeTool.id === 'entityCompare'
  const isProfileTool = activeTool.id === 'profile'
  const staffDetailsCollapsed = isPopularStaffTool && !selectedPopularStaff
  const effectiveRightPanelCollapsed = rightPanelCollapsed || staffDetailsCollapsed || isGeneralSearchTool || isEntityCompareTool || isProfileTool
  const selectedEdge = useMemo(
    () => displayGraph?.edges.find((edge) => edge.data.id === selectedEdgeId) ?? null,
    [displayGraph, selectedEdgeId],
  )
  const toggleTheme = () => {
    const nextTheme: ThemeMode = effectiveTheme === 'dark' ? 'light' : 'dark'
    setThemePreference(nextTheme)
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    const updateSystemTheme = () => setSystemTheme(mediaQuery.matches ? 'light' : 'dark')
    updateSystemTheme()
    mediaQuery.addEventListener('change', updateSystemTheme)
    return () => mediaQuery.removeEventListener('change', updateSystemTheme)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(FILTER_SECTION_STORAGE_KEY, JSON.stringify(filterSections))
  }, [filterSections])

  useEffect(() => {
    window.localStorage.setItem(RECENT_COMPARISONS_STORAGE_KEY, JSON.stringify(recentComparisons))
  }, [recentComparisons])

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ graphLayout, graphSpacing, wheelSensitivity }))
  }, [graphLayout, graphSpacing, wheelSensitivity])

  useEffect(() => {
    if (!isPopularStaffTool) {
      return
    }
    const controller = new AbortController()
    window.queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setPopularStaffLoading(true)
        setPopularStaffError(null)
      }
    })
    void fetchPopularStaff(popularStaffKind, POPULAR_STAFF_LIMIT, controller.signal)
      .then((items) => {
        setPopularStaff(items)
        setSelectedPopularStaff((current) => current && items.some((item) => item.id === current.id) ? current : null)
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return
        setPopularStaffError(requestError instanceof Error ? requestError.message : 'Could not load popular staff')
      })
      .finally(() => {
        if (!controller.signal.aborted) setPopularStaffLoading(false)
      })
    return () => controller.abort()
  }, [isPopularStaffTool, popularStaffKind])

  useEffect(() => {
    if (!isPopularStaffTool || !selectedPopularStaff) {
      let cancelled = false
      window.queueMicrotask(() => {
        if (!cancelled) {
          setPopularStaffAnime([])
          setPopularStaffAnimeLoading(false)
          setPopularStaffAnimeError(null)
        }
      })
      return () => {
        cancelled = true
      }
    }
    const controller = new AbortController()
    window.queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setPopularStaffAnime([])
        setPopularStaffAnimeLoading(true)
        setPopularStaffAnimeError(null)
      }
    })
    void fetchStaffDirectedAnime(selectedPopularStaff.id, popularStaffKindOption(popularStaffKind).role, 12, controller.signal)
      .then(setPopularStaffAnime)
      .catch((requestError) => {
        if (controller.signal.aborted) return
        setPopularStaffAnimeError(requestError instanceof Error ? requestError.message : 'Could not load anime credits')
      })
      .finally(() => {
        if (!controller.signal.aborted) setPopularStaffAnimeLoading(false)
      })
    return () => controller.abort()
  }, [isPopularStaffTool, popularStaffKind, selectedPopularStaff])

  useEffect(() => {
    if (!isEntityCompareTool || !selectedEntities[0] || !selectedEntities[1]) {
      return
    }
    const left = selectedEntities[0]
    const right = selectedEntities[1]
    let cancelled = false
    window.queueMicrotask(() => {
      if (!cancelled) {
        setEntityCompareLoading(true)
        setEntityCompareError(null)
      }
    })
    void compareEntities(entityCompareType, left.id, right.id)
      .then((nextComparison) => {
        if (cancelled) return
        setEntityComparison(nextComparison)
      })
      .catch((requestError) => {
        if (cancelled) return
        setEntityComparison(null)
        setEntityCompareError(requestError instanceof Error ? requestError.message : 'Comparison failed')
      })
      .finally(() => {
        if (!cancelled) {
          setEntityCompareLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [entityCompareType, isEntityCompareTool, selectedEntities])

  useEffect(() => {
    if (!isProfileTool || !submittedProfileUsername) {
      return
    }
    const controller = new AbortController()
    window.queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setProfileLoading(true)
        setProfileError(null)
      }
    })
    void fetchAnimeProfile(submittedProfileUsername, controller.signal)
      .then((nextProfile) => {
        setAnimeProfile(nextProfile)
        setProfileUsername(nextProfile.user.name)
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return
        setAnimeProfile(null)
        setProfileError(requestError instanceof Error ? requestError.message : 'Could not load AniList profile')
      })
      .finally(() => {
        if (!controller.signal.aborted) setProfileLoading(false)
      })
    return () => controller.abort()
  }, [isProfileTool, submittedProfileUsername])

  useEffect(() => {
    if (!selectedNodeId || !displayGraph) {
      return
    }
    if (!displayGraph.nodes.some((node) => node.data.id === selectedNodeId)) {
      let cancelled = false
      window.queueMicrotask(() => {
        if (!cancelled) {
          setSelectedNodeId(null)
          setSelectedEdgeId(null)
          setNodeDetail(null)
        }
      })
      return () => {
        cancelled = true
      }
    }
  }, [displayGraph, selectedNodeId])

  useEffect(() => {
    if (!selectedEdgeId || !displayGraph) {
      return
    }
    if (!displayGraph.edges.some((edge) => edge.data.id === selectedEdgeId)) {
      let cancelled = false
      window.queueMicrotask(() => {
        if (!cancelled) {
          setSelectedEdgeId(null)
        }
      })
      return () => {
        cancelled = true
      }
    }
  }, [displayGraph, selectedEdgeId])

  const runAnalysis = useCallback(() => {
    if (selectedAnime.length < MIN_ANALYSIS_ANIME) {
      return undefined
    }
    const animeIds = selectedAnime.map((anime) => anime.id)

    let cancelled = false
    window.queueMicrotask(() => {
      if (!cancelled) {
        setIsComparing(true)
        setAnalysisFailed(false)
        setError(null)
      }
    })
    void Promise.all([
      compareAnime(animeIds, [], popularityFilters),
      fetchGraph(animeIds, [], 2, popularityFilters),
    ])
      .then(([nextComparison, nextGraph]) => {
        if (cancelled) return
        setComparison(nextComparison)
        setGraph(nextGraph)
        setNodeDetail(null)
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
        setAnalysisFailed(false)
        setRecentComparisons((current) => addRecentComparison(current, selectedAnime))
      })
      .catch((requestError) => {
        if (cancelled) return
        setAnalysisFailed(true)
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
  }, [popularityFilters, selectedAnime])

  useEffect(() => runAnalysis(), [runAnalysis])

  const clearComparisonState = useCallback(() => {
    setComparison(null)
    setGraph(null)
    setNodeDetail(null)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setAnalysisFailed(false)
  }, [])

  const assignEntity = useCallback((entity: EntitySearchResult, slotIndex = activeEntitySlot) => {
    setEntityCompareError(null)
    setSelectedEntities((current) => {
      const otherIndex = slotIndex === 0 ? 1 : 0
      if (current[otherIndex]?.id === entity.id) {
        setEntityCompareError(`That ${entityTypeLabel(entityCompareType).toLowerCase()} is already selected.`)
        return current
      }
      const next: [EntitySearchResult | null, EntitySearchResult | null] = [...current]
      next[slotIndex] = entity
      setActiveEntitySlot(slotIndex === 0 ? 1 : 0)
      setEntityComparison(null)
      return next
    })
  }, [activeEntitySlot, entityCompareType])

  const clearEntitySlot = (slotIndex: 0 | 1) => {
    setSelectedEntities((current) => {
      const next: [EntitySearchResult | null, EntitySearchResult | null] = [...current]
      next[slotIndex] = null
      return next
    })
    setActiveEntitySlot(slotIndex)
    setEntityComparison(null)
    setEntityCompareError(null)
  }

  const changeEntityCompareType = (nextType: EntityType) => {
    setEntityCompareType(nextType)
    setSelectedEntities([null, null])
    setActiveEntitySlot(0)
    setEntityComparison(null)
    setEntityCompareError(null)
    setEntityCompareLoading(false)
  }

  const submitProfileUsername = (username = profileUsername) => {
    const trimmed = username.trim()
    if (trimmed.length < 2) {
      setProfileError('Enter at least two characters.')
      return
    }
    setProfileError(null)
    setSubmittedProfileUsername(trimmed)
  }

  const assignAnime = useCallback(
    (anime: AnimeSearchResult, slotIndex = activeSlotIndex) => {
      setError(null)
      setSelectedAnime((current) => {
        if (current.some((item, index) => item.id === anime.id && index !== slotIndex)) {
          setError('That anime is already selected.')
          return current
        }
        if (slotIndex >= MAX_COMPARE_ANIME) {
          setError(`You can analyze up to ${MAX_COMPARE_ANIME} anime.`)
          return current
        }
        clearComparisonState()
        const next = [...current]
        if (slotIndex < next.length) {
          next[slotIndex] = anime
        } else if (next.length < MAX_COMPARE_ANIME) {
          next.push(anime)
        } else {
          setError(`You can analyze up to ${MAX_COMPARE_ANIME} anime.`)
          return current
        }
        setActiveSlotIndex(Math.min(next.length, MAX_COMPARE_ANIME - 1))
        return next
      })
    },
    [activeSlotIndex, clearComparisonState],
  )

  const clearAnimeSlot = (slotIndex: number) => {
    setSelectedAnime((current) => current.filter((_, index) => index !== slotIndex))
    setActiveSlotIndex((current) => Math.max(0, Math.min(current, selectedAnime.length - 2)))
    clearComparisonState()
  }

  const restoreRecentComparison = (recentComparison: RecentComparison) => {
    setError(null)
    clearComparisonState()
    setSelectedAnime(recentComparison.anime)
    setActiveSlotIndex(Math.min(recentComparison.anime.length, MAX_COMPARE_ANIME - 1))
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
    setRoleFiltersEnabled(active)
  }

  const toggleNodeType = (nodeType: NodeTypeId) => {
    setVisibleNodeTypes((current) => ({ ...current, [nodeType]: !current[nodeType] }))
  }

  const setAllNodeTypes = (active: boolean) => {
    setNodeTypeFiltersEnabled(active)
  }

  const setShowOnlyMainStudioEdgesFilter = (active: boolean) => {
    setShowOnlyMainStudioEdges(active)
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
    setShowOnlySharedComparisonNodes(active)
  }

  const startPanelResize = (panel: ResizePanel, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = panel === 'left' ? leftPanelWidth : rightPanelWidth

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      const nextWidth = panel === 'left' ? startWidth + delta : startWidth - delta
      if (panel === 'left') {
        setLeftPanelWidth(clampPanelWidth(nextWidth))
      } else {
        setRightPanelWidth(clampPanelWidth(nextWidth))
      }
      graphRef.current?.fit()
    }

    const handlePointerUp = () => {
      document.body.classList.remove('panel-resizing')
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      graphRef.current?.fit()
    }

    document.body.classList.add('panel-resizing')
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const setEdgeTypeFiltersActive = (active: boolean) => {
    setShowOnlyMainStudioEdges(active)
    if (!active) {
      setEdgeFilterRegex('')
    }
  }

  const applyFilterTemplate = (templateId: FilterTemplateId = 'default') => {
    const template = FILTER_TEMPLATES.find((item) => item.id === templateId) ?? FILTER_TEMPLATES[0]
    setActiveFilters(ALL_ROLE_IDS)
    setRoleFiltersEnabled(true)
    setVisibleNodeTypes({ ...template.nodeTypes })
    setNodeTypeFiltersEnabled(true)
    setShowOnlyMainStudioEdges(DEFAULT_SHOW_ONLY_MAIN_STUDIO_EDGES)
    setEdgeFilterRegex(DEFAULT_EDGE_FILTER_REGEX)
    setStaffMinFavourites(DEFAULT_STAFF_POPULARITY_FILTERS.staffMinFavourites)
    setStaffLimit(DEFAULT_STAFF_POPULARITY_FILTERS.staffLimit)
    setShowOnlySharedComparisonNodes(false)
    setShowOnlyNodesWithMultipleShowEdges(false)
  }

  const resetFilters = () => {
    applyFilterTemplate('default')
  }

  const selectNode = useCallback(async (nodeId: string) => {
    const [type, rawId] = nodeId.split(':')
    const id = Number(rawId)
    if (!type || !Number.isFinite(id)) {
      return
    }
    const apiType = type === 'voice_actor' ? 'voiceActor' : type
    setSelectedNodeId(nodeId)
    setSelectedEdgeId(null)
    setIsLoadingNode(true)
    setError(null)
    try {
      setNodeDetail(await fetchNodeDetail(apiType, id))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load node details')
    } finally {
      setIsLoadingNode(false)
    }
  }, [])

  const selectEdge = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId)
    setSelectedNodeId(null)
    setNodeDetail(null)
    setIsLoadingNode(false)
  }, [])

  const analysisButtonIcon = isComparing ? (
    <Loader2 className="spin" size={17} />
  ) : analysisFailed || comparison || graph ? (
    <RotateCcw size={17} />
  ) : (
    <Network size={17} />
  )
  const analysisButtonText = isComparing
    ? 'Analyzing...'
    : analysisFailed
      ? 'Retry analysis'
      : comparison || graph
        ? 'Rerun analysis'
        : 'Run analysis'

  return (
    <main className="app-shell" data-theme={themePreference ?? undefined}>
      <header className="topbar">
        <h1>Anime Analysis</h1>
        {isGeneralSearchTool ? (
          <div className="topbar-context">
            <Search size={18} />
            <span>Search anime, staff, studios, and voice actors</span>
          </div>
        ) : isEntityCompareTool ? (
          <div className="topbar-context">
            <ArrowRightLeft size={18} />
            <span>Compare {entityTypeLabel(entityCompareType).toLowerCase()} metrics</span>
          </div>
        ) : isProfileTool ? (
          <ProfileSearchBar
            username={profileUsername}
            loading={profileLoading}
            onUsernameChange={setProfileUsername}
            onSubmit={submitProfileUsername}
          />
        ) : (
          <CommandSearch
            activeSlotIndex={activeSlotIndex}
            onSelect={assignAnime}
          />
        )}
        <div className="topbar-actions">
          <button
            type="button"
            className="theme-button"
            title={`Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label={`Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={toggleTheme}
          >
            {effectiveTheme === 'dark' ? <Moon size={19} /> : <Sun size={19} />}
          </button>
          <button type="button" className="settings-button" title="Settings" aria-label="Open settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={19} />
          </button>
        </div>
      </header>

      <div
        className={`workspace ${isGeneralSearchTool ? 'general-search-workspace' : ''} ${isPopularStaffTool ? 'popular-staff-workspace' : ''} ${isEntityCompareTool ? 'entity-compare-workspace' : ''} ${isProfileTool ? 'profile-workspace' : ''} ${leftPanelCollapsed ? 'left-collapsed' : ''} ${effectiveRightPanelCollapsed ? 'right-collapsed' : ''}`}
        style={
          {
            '--left-panel-width': `${leftPanelWidth}px`,
            '--right-panel-width': `${rightPanelWidth}px`,
          } as CSSProperties
        }
      >
        <ToolRail activeToolId={activeTool.id} onSelect={setActiveToolId} />

        {!isProfileTool ? (
        <aside className={`left-panel panel ${leftPanelCollapsed || isGeneralSearchTool || isPopularStaffTool ? 'collapsed' : ''}`}>
          {isRelationshipTool ? (
            <>
              <PanelHeader title="Analyze Anime" />
              <div className="anime-slots">
                {selectedAnime.length === 0 ? <p className="muted">Add at least one anime to begin analysis</p> : null}
                {Array.from({ length: selectedAnime.length === 0 ? 1 : selectedAnime.length + (atSelectionLimit ? 0 : 1) }).map((_, index) => (
                  <AnimeSlot
                    key={selectedAnime[index]?.id ?? `empty-${index}`}
                    slot={index + 1}
                    anime={selectedAnime[index] ?? null}
                    active={activeSlotIndex === index}
                    onPick={() => setActiveSlotIndex(index)}
                    onClear={() => clearAnimeSlot(index)}
                  />
                ))}
              </div>

              <button
                type="button"
                className="analysis-button"
                disabled={!canAnalyze || isComparing}
                onClick={() => {
                  void runAnalysis()
                }}
              >
                {analysisButtonIcon}
                {analysisButtonText}
              </button>

              {error ? (
                <div className="inline-error">
                  <strong>Error occurred:</strong>
                  <span>{error}</span>
                </div>
              ) : null}

              <RecentComparisons
                items={recentComparisons}
                open={recentComparisonsOpen}
                onToggle={() => setRecentComparisonsOpen((current) => !current)}
                onSelect={restoreRecentComparison}
              />
              <ConnectionScore
                comparison={comparison}
                graph={displayGraph}
                selectedAnime={selectedAnime}
                loading={isComparing}
                canAnalyze={canAnalyze}
              />
              <TopSharedStaff items={comparison?.sharedStaff ?? []} onSelect={(staff) => void selectNode(`staff:${staff.staffId}`)} />
              <TopSharedVoiceActors items={comparison?.sharedVoiceActors ?? []} onSelect={(actor) => void selectNode(`voice_actor:${actor.voiceActorId}`)} />
            </>
          ) : isEntityCompareTool ? (
            <EntityCompareControls
              type={entityCompareType}
              activeSlot={activeEntitySlot}
              selectedEntities={selectedEntities}
              loading={entityCompareLoading}
              error={entityCompareError}
              onTypeChange={changeEntityCompareType}
              onActiveSlotChange={setActiveEntitySlot}
              onSelect={assignEntity}
              onClear={clearEntitySlot}
            />
          ) : null}
          <button
            type="button"
            className="panel-resize-handle left"
            aria-label="Resize left panel"
            onPointerDown={(event) => startPanelResize('left', event)}
          />
        </aside>
        ) : null}

        {isRelationshipTool ? (
          <section className="graph-panel">
            <GraphToolbar
              loading={isComparing}
              nodeCount={displayGraph?.nodes.length ?? 0}
              leftPanelCollapsed={leftPanelCollapsed}
              rightPanelCollapsed={effectiveRightPanelCollapsed}
              showLegend={showGraphLegend}
              onToggleLeftPanel={() => setLeftPanelCollapsed((current) => !current)}
              onToggleRightPanel={() => setRightPanelCollapsed((current) => !current)}
              onToggleLegend={() => setShowGraphLegend((current) => !current)}
              onZoomIn={() => graphRef.current?.zoomIn()}
              onZoomOut={() => graphRef.current?.zoomOut()}
              onReset={() => graphRef.current?.reset()}
            />
            <GraphView
              ref={graphRef}
              graph={displayGraph}
              graphLayout={graphLayout}
              graphSpacing={graphSpacing}
              theme={effectiveTheme}
              showEdgeLabels={showEdgeLabels}
              wheelSensitivity={wheelSensitivity}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              onNodeSelect={selectNode}
              onEdgeSelect={selectEdge}
            />
            {showGraphLegend ? <GraphLegend /> : null}
          </section>
        ) : isGeneralSearchTool ? (
          <GeneralSearchPanel />
        ) : isPopularStaffTool ? (
          <PopularStaffPreview
            kind={popularStaffKind}
            items={popularStaff}
            selectedStaff={selectedPopularStaff}
            loading={popularStaffLoading}
            error={popularStaffError}
            onKindChange={setPopularStaffKind}
            onSelect={(staff) => {
              setSelectedPopularStaff(staff)
              setRightPanelCollapsed(false)
            }}
          />
        ) : isEntityCompareTool ? (
          <EntityCompareResults
            type={entityCompareType}
            selectedEntities={selectedEntities}
            comparison={entityComparison}
            loading={entityCompareLoading}
            error={entityCompareError}
          />
        ) : isProfileTool ? (
          <ProfileDashboard
            profile={animeProfile}
            loading={profileLoading}
            error={profileError}
            hasSubmitted={Boolean(submittedProfileUsername)}
          />
        ) : null}

        {!isProfileTool ? (
        <aside className={`right-panel panel ${effectiveRightPanelCollapsed ? 'collapsed' : ''}`}>
          <button
            type="button"
            className="panel-resize-handle right"
            aria-label="Resize right panel"
            onPointerDown={(event) => startPanelResize('right', event)}
          />
          {isRelationshipTool ? (
            <>
              <DetailPanel detail={nodeDetail} edge={selectedEdge} graph={displayGraph} loading={isLoadingNode} onClose={() => {
                setNodeDetail(null)
                setSelectedNodeId(null)
                setSelectedEdgeId(null)
              }} />
              <RoleFilters
                open={filtersOpen}
                activeFilters={activeFilters}
                roleFiltersEnabled={roleFiltersEnabled}
                graph={displayGraph}
                visibleNodeTypes={visibleNodeTypes}
                nodeTypeFiltersEnabled={nodeTypeFiltersEnabled}
                showOnlyMainStudioEdges={showOnlyMainStudioEdges}
                edgeFilterRegex={edgeFilterRegex}
                staffMinFavourites={staffMinFavourites}
                staffLimit={staffLimit}
                showEdgeLabels={showEdgeLabels}
                hideIsolatedNodes={hideIsolatedNodes}
                showOnlySharedComparisonNodes={showOnlySharedComparisonNodes}
                showOnlyNodesWithMultipleShowEdges={showOnlyNodesWithMultipleShowEdges}
                highlightAllPaths={highlightAllPaths}
                sectionState={filterSections}
                onToggleOpen={() => setFiltersOpen((current) => !current)}
                onApplyTemplate={applyFilterTemplate}
                onToggle={toggleFilter}
                onSetAllRoles={setAllRoleFilters}
                onToggleNodeType={toggleNodeType}
                onSetAllNodeTypes={setAllNodeTypes}
                onShowOnlyMainStudioEdgesChange={setShowOnlyMainStudioEdgesFilter}
                onEdgeFilterRegexChange={setEdgeFilterRegex}
                onMinFavouritesChange={setStaffMinFavourites}
                onStaffLimitChange={setStaffLimit}
                onSetPopularityFiltersActive={setPopularityFiltersActive}
                onSetEdgeTypeFiltersActive={setEdgeTypeFiltersActive}
                onShowEdgeLabelsChange={setShowEdgeLabels}
                onHideIsolatedNodesChange={setHideIsolatedNodes}
                onShowOnlySharedComparisonNodesChange={setShowOnlySharedComparisonNodes}
                onShowOnlyNodesWithMultipleShowEdgesChange={setShowOnlyNodesWithMultipleShowEdges}
                onHighlightAllPathsChange={setHighlightAllPaths}
                onSetGraphSettingsActive={setGraphSettingsActive}
                onToggleSection={setFilterSectionOpen}
                onReset={resetFilters}
              />
            </>
          ) : isPopularStaffTool ? (
            <PopularStaffDetails
              staff={selectedPopularStaff}
              kind={popularStaffKind}
              directedAnime={popularStaffAnime}
              loadingAnime={popularStaffAnimeLoading}
              animeError={popularStaffAnimeError}
              onClose={() => setSelectedPopularStaff(null)}
            />
          ) : null}
        </aside>
        ) : null}
      </div>
      <SettingsModal
        open={settingsOpen}
        graphLayout={graphLayout}
        graphSpacing={graphSpacing}
        wheelSensitivity={wheelSensitivity}
        onGraphLayoutChange={setGraphLayout}
        onGraphSpacingChange={setGraphSpacing}
        onWheelSensitivityChange={setWheelSensitivity}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  )
}

function ToolRail({
  activeToolId,
  onSelect,
}: {
  activeToolId: AnalysisToolId
  onSelect: (toolId: AnalysisToolId) => void
}) {
  return (
    <nav className="tool-rail" aria-label="Analysis tools">
      {ANALYSIS_TOOLS.map((tool) => {
        const Icon = tool.icon
        const active = tool.id === activeToolId
        return (
          <button
            key={tool.id}
            type="button"
            className={`tool-rail-button ${active ? 'active' : ''}`}
            aria-pressed={active}
            title={tool.label}
            onClick={() => onSelect(tool.id)}
          >
            <Icon size={20} />
            <span>{tool.shortLabel}</span>
          </button>
        )
      })}
    </nav>
  )
}

type GeneralSearchFilter = EntityType | 'all'

function GeneralSearchPanel() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<GeneralSearchFilter>('all')
  const [results, setResults] = useState<EntitySearchResult[]>([])
  const [selectedEntity, setSelectedEntity] = useState<EntitySearchResult | null>(null)
  const [entityDetail, setEntityDetail] = useState<EntitySummary | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      let cancelled = false
      window.queueMicrotask(() => {
        if (!cancelled) {
          setResults([])
          setError(null)
          setLoading(false)
        }
      })
      return () => {
        cancelled = true
      }
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      const request = filter === 'all'
        ? searchAll(trimmed, 8, controller.signal)
        : searchEntities(filter, trimmed, controller.signal)
      void request
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
  }, [filter, query])

  useEffect(() => {
    if (!selectedEntity) {
      let cancelled = false
      window.queueMicrotask(() => {
        if (!cancelled) {
          setEntityDetail(null)
          setDetailError(null)
          setDetailLoading(false)
        }
      })
      return () => {
        cancelled = true
      }
    }
    const controller = new AbortController()
    window.queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setDetailLoading(true)
        setDetailError(null)
      }
    })
    void fetchEntitySummary(selectedEntity.type, selectedEntity.id, controller.signal)
      .then(setEntityDetail)
      .catch((requestError) => {
        if (controller.signal.aborted) return
        setEntityDetail(null)
        setDetailError(requestError instanceof Error ? requestError.message : 'Could not load details')
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })
    return () => controller.abort()
  }, [selectedEntity])

  const visibleResults = filter === 'all' ? results : results.filter((result) => result.type === filter)
  const submitSearch = () => {
    const firstResult = visibleResults[0]
    if (!firstResult) {
      return
    }
    setSelectedEntity(firstResult)
    setQuery(firstResult.label)
    setShowSuggestions(false)
  }

  return (
    <section className="graph-panel general-search-panel">
      <div className="general-search-header">
        <span className="filter-icon blue"><Search size={18} /></span>
        <div>
          <h2>Information Search</h2>
          <p>Search AniList records for titles, creators, studios, and Japanese voice cast.</p>
        </div>
      </div>

      <form
        className="general-search-toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          submitSearch()
        }}
      >
        <div className="general-search-combobox">
          <label className="general-search-box">
            <Search size={18} />
            <input
              value={query}
              onFocus={() => setShowSuggestions(true)}
              onChange={(event) => {
                setQuery(event.target.value)
                setShowSuggestions(true)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  submitSearch()
                } else if (event.key === 'Escape') {
                  setShowSuggestions(false)
                }
              }}
              placeholder="Search anime, staff, studios..."
            />
            <button type="submit" disabled={!visibleResults.length || loading}>
              {loading ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
            </button>
          </label>
          {showSuggestions && query.trim().length >= 2 ? (
            <div className="general-search-suggestions">
              {loading ? <p className="command-state"><Loader2 className="spin" size={16} /> Searching AniList...</p> : null}
              {error ? <p className="command-state error-text">{error}</p> : null}
              {!loading && !error && visibleResults.length === 0 ? <p className="command-state">No AniList records found.</p> : null}
              {!loading && !error ? (
                <div className="command-results">
                  {visibleResults.map((entity) => (
                    <button
                      key={`${entity.type}-${entity.id}`}
                      type="button"
                      className="general-suggestion-row"
                      onClick={() => {
                        setSelectedEntity(entity)
                        setQuery(entity.label)
                        setShowSuggestions(false)
                      }}
                    >
                      <EntityAvatar entity={entity} type={entity.type} />
                      <span className="result-main">
                        <span>{entity.label}</span>
                        <small>{entity.subtitle || searchEntityFallback(entity.type)} • {entityTypeLabel(entity.type)}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="entity-type-tabs general-search-tabs" role="tablist" aria-label="Search categories">
          <button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            <Search size={15} />
            <span>All</span>
          </button>
          {ENTITY_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon
            const active = filter === option.value
            return (
              <button key={option.value} type="button" className={active ? 'active' : ''} aria-pressed={active} onClick={() => setFilter(option.value)}>
                <Icon size={15} />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      </form>

      {!selectedEntity && query.trim().length < 2 ? (
        <div className="general-search-empty">
          <Search size={28} />
          <span>Search and select a result to inspect it here.</span>
        </div>
      ) : null}
      {selectedEntity ? (
        <GeneralSearchDetail entity={selectedEntity} detail={entityDetail} loading={detailLoading} error={detailError} />
      ) : null}
    </section>
  )
}

function GeneralSearchDetail({
  entity,
  detail,
  loading,
  error,
}: {
  entity: EntitySearchResult
  detail: EntitySummary | null
  loading: boolean
  error: string | null
}) {
  const metadata = detail?.metadata ?? {}
  const description = typeof metadata.description === 'string' ? stripHtml(metadata.description) : ''
  const metrics = detail ? entityDetailMetrics(detail) : []
  return (
    <div className="general-search-detail">
      <section className={`general-search-hero ${entity.type}`}>
        <EntityAvatar entity={detail ? { ...entity, imageUrl: detail.imageUrl, siteUrl: detail.siteUrl } : entity} type={entity.type} />
        <div>
          <span>{entityTypeLabel(entity.type)}</span>
          <h3>{detail?.label ?? entity.label}</h3>
          <p>{detail?.subtitle || entity.subtitle || searchEntityFallback(entity.type)}</p>
          {detail?.siteUrl ? <small>{detail.siteUrl}</small> : null}
        </div>
      </section>
      {loading ? <div className="popular-staff-state"><Loader2 className="spin" size={20} /> Loading details...</div> : null}
      {!loading && error ? <div className="popular-staff-state error-text">{error}</div> : null}
      {detail && !loading ? (
        <>
          <section className="profile-metrics">
            {metrics.map((metric) => (
              <article key={metric.label} className="profile-metric">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </section>
          {description ? (
            <section className="profile-card">
              <div className="section-title compact">
                <h4>Description</h4>
              </div>
              <p className="about-text">{description}</p>
            </section>
          ) : null}
          <section className="profile-card">
            <div className="section-title compact">
              <h4>{detail.type === 'anime' ? 'Anime Record' : 'Related Anime'}</h4>
            </div>
            <div className="related-anime-grid overlap">
              {detail.relatedAnime.slice(0, 12).map((anime) => <RelatedAnimeCard key={anime.id} anime={anime} compact />)}
              {detail.relatedAnime.length === 0 ? <p className="muted">No related anime loaded.</p> : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}

function entityDetailMetrics(detail: EntitySummary) {
  const metadata = detail.metadata
  if (detail.type === 'anime') {
    return [
      { label: 'Score', value: metadata.averageScore ? `${metadata.averageScore}%` : '--' },
      { label: 'Popularity', value: compactNumber(typeof metadata.popularity === 'number' ? metadata.popularity : null) },
      { label: 'Favourites', value: compactNumber(detail.favourites) },
      { label: 'Credits', value: `${metadata.staffCount ?? 0} staff` },
    ]
  }
  return [
    { label: 'Favourites', value: compactNumber(detail.favourites) },
    { label: 'Anime Credits', value: detail.relatedAnime.length.toLocaleString() },
    { label: 'Avg Score', value: averageRelatedValue(detail.relatedAnime, 'averageScore') },
    { label: 'Top Popularity', value: compactNumber(Math.max(...detail.relatedAnime.map((anime) => anime.popularity ?? 0), 0)) },
  ]
}

function averageRelatedValue(items: RelatedAnimeSummary[], key: 'averageScore') {
  const values = items.map((item) => item[key]).filter((value): value is number => typeof value === 'number')
  if (!values.length) {
    return '--'
  }
  return `${Math.round(values.reduce((total, value) => total + value, 0) / values.length)}%`
}

function searchEntityFallback(type: EntityType) {
  if (type === 'anime') return 'Anime'
  if (type === 'studio') return 'Studio'
  if (type === 'staff') return 'Staff'
  return 'Voice Actor'
}

function ProfileSearchBar({
  username,
  loading,
  onUsernameChange,
  onSubmit,
}: {
  username: string
  loading: boolean
  onUsernameChange: (username: string) => void
  onSubmit: () => void
}) {
  return (
    <form
      className="profile-search-bar"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <Search size={18} />
      <input
        value={username}
        onChange={(event) => onUsernameChange(event.target.value)}
        placeholder="Enter AniList username..."
      />
      <button type="submit" disabled={loading} aria-label="Search profile">
        {loading ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
      </button>
    </form>
  )
}

function ProfileDashboard({
  profile,
  loading,
  error,
  hasSubmitted,
}: {
  profile: AnimeProfileResponse | null
  loading: boolean
  error: string | null
  hasSubmitted: boolean
}) {
  return (
    <section className="graph-panel profile-panel">
      {!hasSubmitted && !profile ? (
        <div className="profile-empty">
          <Users size={28} />
          <span>Enter a public AniList username to explore anime-list taste signals.</span>
        </div>
      ) : null}
      {loading ? <div className="popular-staff-state"><Loader2 className="spin" size={20} /> Loading AniList profile...</div> : null}
      {!loading && error && !profile ? <div className="popular-staff-state error-text">{error}</div> : null}
      {profile && !loading ? (
        <div className="profile-dashboard">
          <ProfileHero profile={profile} />
          <ProfileMetricGrid profile={profile} />
          <ProfileScoreComparisonCard comparison={profile.scoreComparison} />
          <div className="profile-grid two">
            <ProfileDistribution title="Status" rows={profile.statusDistribution} />
            <ProfileDistribution title="Formats" rows={profile.formatDistribution} />
          </div>
          <div className="profile-grid two">
            <ProfileTasteAnalyzer title="Genre Taste" rows={profile.genreTaste} />
            <ProfileTasteAnalyzer title="Tag Taste" rows={profile.tagTaste} />
          </div>
          <div className="profile-grid two">
            <ProfileTasteAnalyzer title="Studio Taste" rows={profile.studioTaste} />
            <ProfileTasteAnalyzer title="Staff Affinity" rows={profile.staffAffinity} />
          </div>
          <div className="profile-grid two">
            <ProfileDistribution title="Release Decades" rows={profile.yearDistribution} />
            <ProfileScoreHistogram rows={profile.scoreDistribution} />
          </div>
          <ProfileAnimeSection title="Highest Rated" items={profile.highestRated} />
          <ProfileAnimeSection title="Lowest Rated Completed" items={profile.lowestRatedCompleted} />
          <ProfileAnimeSection title="Longest Watched" items={profile.longestWatched} />
          <ProfileAnimeSection title="Recently Updated" items={profile.recentlyUpdated} showUpdated />
        </div>
      ) : null}
    </section>
  )
}

function ProfileHero({ profile }: { profile: AnimeProfileResponse }) {
  return (
    <header className="profile-hero">
      {profile.user.bannerImageUrl ? <img className="profile-banner" src={profile.user.bannerImageUrl} alt="" /> : null}
      <div className="profile-hero-content">
        {profile.user.avatarImageUrl ? <img src={profile.user.avatarImageUrl} alt="" /> : <span className="profile-avatar"><Users size={25} /></span>}
        <span>
          <h2>{profile.user.name}</h2>
          <small>{profile.summary.totalEntries.toLocaleString()} anime in public AniList lists</small>
        </span>
        {profile.user.siteUrl ? (
          <a className="staff-profile-link" href={profile.user.siteUrl} target="_blank" rel="noreferrer">
            Open AniList profile
          </a>
        ) : null}
      </div>
    </header>
  )
}

function ProfileMetricGrid({ profile }: { profile: AnimeProfileResponse }) {
  const metrics = [
    { label: 'Total Anime', value: profile.summary.totalEntries.toLocaleString() },
    { label: 'Completed', value: profile.summary.completedCount.toLocaleString() },
    { label: 'Mean Score', value: formatProfileScore(profile.summary.meanScore) },
    { label: 'Episodes Watched', value: profile.summary.watchedEpisodes.toLocaleString() },
  ]
  return (
    <section className="profile-metrics">
      {metrics.map((metric) => (
        <article key={metric.label} className="profile-metric">
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </article>
      ))}
    </section>
  )
}

function ProfileDistribution({ title, rows }: { title: string; rows: ProfileDistributionRow[] }) {
  return (
    <section className="profile-card">
      <div className="section-title compact">
        <h4>{title}</h4>
      </div>
      <div className="profile-bars">
        {rows.slice(0, 8).map((row) => (
          <div key={row.label} className="profile-bar-row">
            <span>{row.label}</span>
            <div className="profile-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(3, row.percentage)}%` }} />
            </div>
            <strong>{row.count.toLocaleString()}</strong>
          </div>
        ))}
        {rows.length === 0 ? <p className="muted">No data available.</p> : null}
      </div>
    </section>
  )
}

function ProfileScoreHistogram({ rows }: { rows: ProfileDistributionRow[] }) {
  const sortedRows = [...rows].sort((a, b) => scoreBucketValue(b.label) - scoreBucketValue(a.label))
  const maxCount = Math.max(...sortedRows.map((row) => row.count), 0)

  return (
    <section className="profile-card profile-score-card">
      <div className="section-title compact">
        <h4>Score Distribution</h4>
      </div>
      <div className="profile-score-histogram" aria-label="Score distribution histogram">
        {sortedRows.map((row) => (
          <div key={row.label} className="profile-score-row" title={`${row.count.toLocaleString()} anime`}>
            <span>{scoreBucketLabel(row.label)}</span>
            <div className="profile-score-track">
              <i style={{ '--score-width': `${maxCount ? Math.max(1.5, (row.count / maxCount) * 100) : 0}%` } as CSSProperties} />
            </div>
            <strong>{row.count.toLocaleString()}</strong>
          </div>
        ))}
        {rows.length === 0 ? <p className="muted">No scored anime available.</p> : null}
      </div>
    </section>
  )
}

function ProfileScoreComparisonCard({ comparison }: { comparison: ProfileScoreComparison }) {
  return (
    <section className="profile-card profile-score-comparison">
      <div className="section-title compact">
        <h4>Score vs Community</h4>
      </div>
      <div className="profile-comparison-metrics">
        <span>
          <small>User mean</small>
          <strong>{formatProfileScore(comparison.meanUserScore)}</strong>
        </span>
        <span>
          <small>Community mean</small>
          <strong>{formatProfileScore(comparison.meanCommunityScore)}</strong>
        </span>
        <span>
          <small>Average delta</small>
          <strong className={deltaClassName(comparison.meanDelta)}>{formatDelta(comparison.meanDelta)}</strong>
        </span>
      </div>
      <div className="profile-score-buckets">
        {comparison.buckets.map((bucket) => (
          <span key={bucket.label}>
            <strong>{bucket.count.toLocaleString()}</strong>
            <small>{bucket.label}</small>
            <em>{formatDelta(bucket.meanDelta)}</em>
          </span>
        ))}
      </div>
      <div className="profile-grid two compact-gap">
        <ProfileDeltaList title="You liked more" rows={comparison.overRated} />
        <ProfileDeltaList title="You liked less" rows={comparison.underRated} />
      </div>
    </section>
  )
}

function ProfileDeltaList({ title, rows }: { title: string; rows: ProfileScoreDeltaRow[] }) {
  return (
    <div className="profile-delta-list">
      <h5>{title}</h5>
      {rows.slice(0, 4).map((row) => (
        <div key={`${title}-${row.id}`} className="profile-delta-row">
          <span>
            <strong>{titleFor(row)}</strong>
            <small>{formatProfileScore(row.score)} vs {formatProfileScore(row.normalizedCommunityScore)}</small>
          </span>
          <em className={deltaClassName(row.scoreDelta)}>{formatDelta(row.scoreDelta)}</em>
        </div>
      ))}
      {rows.length === 0 ? <p className="muted">No comparable scores.</p> : null}
    </div>
  )
}

function ProfileTasteAnalyzer({ title, rows }: { title: string; rows: ProfileTasteAnalysisRow[] }) {
  return (
    <section className="profile-card">
      <div className="section-title compact">
        <h4>{title}</h4>
      </div>
      <div className="profile-taste-list">
        {rows.map((row) => (
          <div key={row.label} className="profile-taste-row">
            <span>
              <strong>{row.label}</strong>
              <small>
                {row.count.toLocaleString()} anime
                {row.completedCount ? ` / ${row.completedCount.toLocaleString()} completed` : ''}
              </small>
              {row.roleSummary ? <small>{row.roleSummary}</small> : null}
              {row.representativeAnime.length ? <small>{row.representativeAnime.map(titleFor).join(', ')}</small> : null}
            </span>
            <span className="profile-taste-scores">
              <em>{formatProfileScore(row.meanScore)}</em>
              <small>vs {formatProfileScore(row.meanCommunityScore)}</small>
              <b className={deltaClassName(row.meanDelta)}>{formatDelta(row.meanDelta)}</b>
            </span>
          </div>
        ))}
        {rows.length === 0 ? <p className="muted">No data available.</p> : null}
      </div>
    </section>
  )
}

function ProfileAnimeSection({
  title,
  items,
  showUpdated = false,
}: {
  title: string
  items: ProfileAnimeEntry[]
  showUpdated?: boolean
}) {
  return (
    <section className="profile-card">
      <div className="section-title compact">
        <h4>{title}</h4>
      </div>
      <div className="profile-anime-grid">
        {items.map((anime) => (
          <article key={`${title}-${anime.id}`} className="profile-anime-card">
            <AnimeThumb anime={anime} />
            <span>
              <strong>{titleFor(anime)}</strong>
              <small>{profileAnimeMeta(anime, showUpdated)}</small>
              <em>{profileAnimeSignals(anime)}</em>
            </span>
          </article>
        ))}
        {items.length === 0 ? <p className="muted">No anime found for this slice.</p> : null}
      </div>
    </section>
  )
}

function formatProfileScore(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '--'
}

function formatDelta(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  const formatted = Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 })
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : '0'
}

function deltaClassName(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return 'neutral'
  return value > 0 ? 'positive' : 'negative'
}

function scoreBucketValue(label: string) {
  const [start = label] = label.split('-')
  const value = Number(start)
  return Number.isFinite(value) ? value : 0
}

function scoreBucketLabel(label: string) {
  const value = scoreBucketValue(label)
  return value > 0 && value <= 10 ? String(value) : label
}

function profileAnimeMeta(anime: ProfileAnimeEntry, showUpdated: boolean) {
  const updated = showUpdated && anime.updatedAt ? new Date(anime.updatedAt * 1000).toLocaleDateString() : null
  return [
    formatMeta(anime),
    anime.score ? `${formatProfileScore(anime.score)} user score` : null,
    anime.progress ? `${anime.progress} watched` : null,
    updated ? `Updated ${updated}` : null,
  ].filter(Boolean).join(' • ')
}

function profileAnimeSignals(anime: ProfileAnimeEntry) {
  return [
    anime.genres.slice(0, 2).join(', '),
    anime.studios[0],
  ].filter(Boolean).join(' / ')
}

function EntityCompareControls({
  type,
  activeSlot,
  selectedEntities,
  loading,
  error,
  onTypeChange,
  onActiveSlotChange,
  onSelect,
  onClear,
}: {
  type: EntityType
  activeSlot: 0 | 1
  selectedEntities: [EntitySearchResult | null, EntitySearchResult | null]
  loading: boolean
  error: string | null
  onTypeChange: (type: EntityType) => void
  onActiveSlotChange: (slot: 0 | 1) => void
  onSelect: (entity: EntitySearchResult, slotIndex?: 0 | 1) => void
  onClear: (slotIndex: 0 | 1) => void
}) {
  return (
    <>
      <PanelHeader title="Compare" />
      <div className="entity-compare-controls">
        <div className="entity-type-tabs" role="tablist" aria-label="Entity type">
          {ENTITY_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon
            const active = option.value === type
            return (
              <button
                key={option.value}
                type="button"
                className={active ? 'active' : ''}
                aria-pressed={active}
                onClick={() => onTypeChange(option.value)}
              >
                <Icon size={15} />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>

        <div className="entity-slots">
          {[0, 1].map((slotIndex) => (
            <EntitySlot
              key={slotIndex}
              slot={(slotIndex + 1) as 1 | 2}
              entity={selectedEntities[slotIndex]}
              active={activeSlot === slotIndex}
              type={type}
              onPick={() => onActiveSlotChange(slotIndex as 0 | 1)}
              onClear={() => onClear(slotIndex as 0 | 1)}
            />
          ))}
        </div>

        <EntitySearchBox key={type} type={type} activeSlot={activeSlot} onSelect={onSelect} />

        {loading ? <div className="loading-row"><Loader2 className="spin" size={16} /> Comparing entities...</div> : null}
        {error ? (
          <div className="inline-error">
            <strong>Error occurred:</strong>
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </>
  )
}

function EntitySlot({
  slot,
  entity,
  active,
  type,
  onPick,
  onClear,
}: {
  slot: 1 | 2
  entity: EntitySearchResult | null
  active: boolean
  type: EntityType
  onPick: () => void
  onClear: () => void
}) {
  return (
    <button type="button" className={`entity-slot ${active ? 'active' : ''}`} onClick={onPick}>
      <span className="slot-number">{slot}</span>
      <EntityAvatar entity={entity} type={type} />
      <span className="slot-copy">
        <strong>{entity?.label ?? `Add ${entityTypeLabel(type)}`}</strong>
        <small>{entity?.subtitle || (active ? 'Search will fill this side' : 'Select this side')}</small>
      </span>
      {entity ? (
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

function EntitySearchBox({
  type,
  activeSlot,
  onSelect,
}: {
  type: EntityType
  activeSlot: 0 | 1
  onSelect: (entity: EntitySearchResult, slotIndex?: 0 | 1) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EntitySearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void searchEntities(type, query.trim(), controller.signal)
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
  }, [query, type])

  const updateQuery = (value: string) => {
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      setError(null)
      setLoading(false)
    }
  }

  const choose = (entity: EntitySearchResult) => {
    onSelect(entity, activeSlot)
    setQuery(entity.label)
    setResults([])
  }

  return (
    <section className="entity-search-card">
      <label className="entity-search-box">
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0]) {
              choose(results[0])
            }
          }}
          placeholder={`Search ${entityTypeLabel(type).toLowerCase()}...`}
        />
      </label>
      {loading ? <p className="command-state"><Loader2 className="spin" size={16} /> Searching AniList...</p> : null}
      {error ? <p className="command-state error-text">{error}</p> : null}
      {!loading && !error && query.trim().length < 2 ? <p className="command-state">Type at least two characters.</p> : null}
      <div className="entity-search-results">
        {results.map((entity) => (
          <button key={`${entity.type}-${entity.id}`} type="button" className="entity-result-row" onClick={() => choose(entity)}>
            <EntityAvatar entity={entity} type={type} />
            <span>
              <strong>{entity.label}</strong>
              <small>{entity.subtitle || entityTypeLabel(type)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function EntityAvatar({ entity, type }: { entity: EntitySearchResult | null; type: EntityType }) {
  const fallbackType = entity?.type ?? type
  if (entity?.imageUrl) {
    return <img className="entity-avatar" src={entity.imageUrl} alt="" />
  }
  return <span className={`entity-avatar fallback ${fallbackType}`}>{renderEntityIcon(fallbackType, 19)}</span>
}

function EntityCompareResults({
  type,
  selectedEntities,
  comparison,
  loading,
  error,
}: {
  type: EntityType
  selectedEntities: [EntitySearchResult | null, EntitySearchResult | null]
  comparison: EntityCompareResponse | null
  loading: boolean
  error: string | null
}) {
  const hasSelection = selectedEntities[0] && selectedEntities[1]
  return (
    <section className="graph-panel entity-compare-panel">
      <div className="entity-compare-header">
        <span className="filter-icon blue"><ArrowRightLeft size={18} /></span>
        <div>
          <h2>{entityTypeLabel(type)} Comparison</h2>
          <p>{hasSelection ? `${selectedEntities[0]?.label} vs ${selectedEntities[1]?.label}` : `Select two ${entityTypeLabel(type).toLowerCase()} entries.`}</p>
        </div>
      </div>

      {!hasSelection ? (
        <div className="entity-compare-empty">
          <CircleDotDashed size={26} />
          <span>Choose both sides to compare metrics.</span>
        </div>
      ) : null}
      {hasSelection && loading ? <div className="popular-staff-state"><Loader2 className="spin" size={20} /> Loading comparison...</div> : null}
      {hasSelection && error ? <div className="popular-staff-state error-text">{error}</div> : null}
      {comparison && !loading ? (
        <div className="entity-comparison-layout">
          <EntitySummaryHeader comparison={comparison} />
          <ComparisonMetricsTable metrics={comparison.metrics} leftLabel={comparison.left.label} rightLabel={comparison.right.label} />
          <RelatedAnimeOverlap comparison={comparison} />
          {comparison.notes.length ? (
            <div className="entity-notes">
              {comparison.notes.map((note) => <p key={note}>{note}</p>)}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function EntitySummaryHeader({ comparison }: { comparison: EntityCompareResponse }) {
  return (
    <div className="entity-summary-pair">
      {[comparison.left, comparison.right].map((entity, index) => {
        return (
          <article key={`${entity.type}-${entity.id}`} className={`entity-summary-card ${index === 0 ? 'left' : 'right'}`}>
            {entity.imageUrl ? <img src={entity.imageUrl} alt="" /> : <span className={`entity-avatar fallback ${entity.type}`}>{renderEntityIcon(entity.type, 24)}</span>}
            <div>
              <h3>{entity.label}</h3>
              <small>{entity.subtitle || entityTypeLabel(entity.type)}</small>
              <span><Flame size={14} /> {compactNumber(entity.favourites)} favourites</span>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ComparisonMetricsTable({
  metrics,
  leftLabel,
  rightLabel,
}: {
  metrics: ComparisonMetricRow[]
  leftLabel: string
  rightLabel: string
}) {
  return (
    <section className="comparison-table" aria-label="Comparison metrics">
      <div className="comparison-row header">
        <span>Metric</span>
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
        <span>Signal</span>
      </div>
      {metrics.map((metric) => (
        <div key={metric.key} className="comparison-row">
          <strong>{metric.label}</strong>
          <span className={metric.winner === 'left' ? 'winner' : ''}>{metric.leftValue}</span>
          <span className={metric.winner === 'right' ? 'winner' : ''}>{metric.rightValue}</span>
          <ComparisonSignal metric={metric} />
        </div>
      ))}
    </section>
  )
}

function ComparisonSignal({ metric }: { metric: ComparisonMetricRow }) {
  if (metric.winner === 'neutral') {
    return <span className="signal neutral">Context</span>
  }
  if (metric.winner === 'tie') {
    return <span className="signal tie">Tie</span>
  }
  return <span className="signal winner">{metric.winner === 'left' ? 'Left' : 'Right'}</span>
}

function RelatedAnimeOverlap({ comparison }: { comparison: EntityCompareResponse }) {
  const leftRelated = comparison.left.relatedAnime.slice(0, 6)
  const rightRelated = comparison.right.relatedAnime.slice(0, 6)
  return (
    <section className="entity-related-section">
      <div className="section-title compact">
        <h4>{comparison.type === 'anime' ? 'Selected Anime' : 'Shared Anime'}</h4>
      </div>
      {comparison.overlap.length ? (
        <div className="related-anime-grid overlap">
          {comparison.overlap.slice(0, 8).map((anime) => <RelatedAnimeCard key={anime.id} anime={anime} />)}
        </div>
      ) : (
        <p className="muted">No shared anime found in the fetched AniList credits.</p>
      )}
      {comparison.type !== 'anime' ? (
        <div className="related-columns">
          <RelatedAnimeColumn title={comparison.left.label} items={leftRelated} />
          <RelatedAnimeColumn title={comparison.right.label} items={rightRelated} />
        </div>
      ) : null}
    </section>
  )
}

function RelatedAnimeColumn({ title, items }: { title: string; items: RelatedAnimeSummary[] }) {
  return (
    <div className="related-column">
      <h4>{title}</h4>
      <div className="directed-anime-list">
        {items.map((anime) => <RelatedAnimeCard key={anime.id} anime={anime} compact />)}
        {items.length === 0 ? <p className="muted">No related anime loaded.</p> : null}
      </div>
    </div>
  )
}

function RelatedAnimeCard({ anime, compact = false }: { anime: RelatedAnimeSummary; compact?: boolean }) {
  return (
    <article className={`related-anime-card ${compact ? 'compact' : ''}`}>
      <AnimeThumb anime={anime} />
      <span>
        <strong>{relatedAnimeTitle(anime)}</strong>
        <small>{[formatMeta(anime), anime.averageScore ? `${anime.averageScore}% score` : null, anime.popularity ? `${compactNumber(anime.popularity)} popularity` : null].filter(Boolean).join(' • ')}</small>
        {anime.roles.length ? <em>{anime.roles.slice(0, 3).join(', ')}</em> : null}
      </span>
    </article>
  )
}

function PopularStaffPreview({
  kind,
  items,
  selectedStaff,
  loading,
  error,
  onKindChange,
  onSelect,
}: {
  kind: PopularStaffKind
  items: PopularStaff[]
  selectedStaff: PopularStaff | null
  loading: boolean
  error: string | null
  onKindChange: (kind: PopularStaffKind) => void
  onSelect: (staff: PopularStaff) => void
}) {
  const selectedKind = popularStaffKindOption(kind)
  return (
    <section className="graph-panel popular-staff-panel">
      <div className="popular-staff-header">
        <span className="filter-icon blue"><Users size={18} /></span>
        <div>
          <h2>Popular {selectedKind.pluralLabel}</h2>
          <p>{selectedKind.description}</p>
        </div>
        <label className="staff-kind-control compact">
          <span>Staff kind</span>
          <select value={kind} onChange={(event) => onKindChange(event.target.value as PopularStaffKind)}>
            {POPULAR_STAFF_KINDS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      {loading ? <div className="popular-staff-state"><Loader2 className="spin" size={20} /> Loading AniList staff...</div> : null}
      {!loading && error ? <div className="popular-staff-state error-text">{error}</div> : null}
      {!loading && !error ? (
        <div className="popular-staff-list" aria-label={`Top ${POPULAR_STAFF_LIMIT} popular ${selectedKind.pluralLabel}`}>
          {items.map((staff, index) => (
            <button
              key={staff.id}
              type="button"
              className={`popular-staff-card popular-staff-row ${selectedStaff?.id === staff.id ? 'active' : ''}`}
              onClick={() => onSelect(staff)}
            >
              <span className="popular-staff-rank">{index + 1}</span>
              {staff.imageUrl ? <img src={staff.imageUrl} alt="" /> : <span className="popular-staff-avatar"><Users size={22} /></span>}
              <span className="popular-staff-copy">
                <strong>{staff.nameFull}</strong>
                <small>{staffOccupations(staff)}</small>
              </span>
              <span className="popular-staff-heat"><Flame size={14} /> {compactNumber(staff.favourites)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function PopularStaffDetails({
  staff,
  kind,
  directedAnime,
  loadingAnime,
  animeError,
  onClose,
}: {
  staff: PopularStaff | null
  kind: PopularStaffKind
  directedAnime: PopularStaffAnime[]
  loadingAnime: boolean
  animeError: string | null
  onClose: () => void
}) {
  const selectedKind = popularStaffKindOption(kind)
  return (
    <section className="detail-section popular-staff-detail">
      <div className="panel-header">
        <h2>Staff Details</h2>
        {staff ? <button type="button" className="icon-close" aria-label="Close staff details" onClick={onClose}><X size={18} /></button> : null}
      </div>
      {!staff ? <div className="detail-empty">Select a {selectedKind.label.toLowerCase()} to inspect their AniList profile signal.</div> : null}
      {staff ? (
        <div className="detail-content">
          <div className="node-identity">
            {staff.imageUrl ? <img src={staff.imageUrl} alt="" /> : <span className="node-avatar staff"><Users size={22} /></span>}
            <span>
              <h3>{staff.nameFull}</h3>
              <small>{selectedKind.label}</small>
            </span>
          </div>
          {staff.nameNative ? (
            <div>
              <h4>Native Name</h4>
              <p className="about-text">{staff.nameNative}</p>
            </div>
          ) : null}
          <div>
            <h4>Popularity</h4>
            <p className="popularity"><Flame size={16} /> {compactNumber(staff.favourites)} <small>AniList favorites</small></p>
          </div>
          <div>
            <h4>Occupations</h4>
            <div className="pill-row">
              {staff.primaryOccupations.map((occupation) => <span key={occupation} className="role-pill">{occupation}</span>)}
            </div>
          </div>
          <div>
            <h4>Anime Credits</h4>
            {loadingAnime ? <div className="loading-row"><Loader2 className="spin" size={16} /> Loading anime credits...</div> : null}
            {!loadingAnime && animeError ? <p className="error-text">{animeError}</p> : null}
            {!loadingAnime && !animeError ? (
              <div className="directed-anime-list">
                {directedAnime.map((anime) => (
                  <div key={anime.id} className="directed-anime-row">
                    <AnimeThumb anime={anime} />
                    <span>
                      <strong>{titleFor(anime)}</strong>
                      <small>{[formatMeta(anime), `${compactNumber(anime.popularity)} popularity`].filter(Boolean).join(' • ')}</small>
                    </span>
                    <small>{anime.roles.slice(0, 2).join(', ')}</small>
                  </div>
                ))}
                {directedAnime.length === 0 ? <p className="muted">{selectedKind.detailEmpty}</p> : null}
              </div>
            ) : null}
          </div>
          {staff.siteUrl ? (
            <a className="staff-profile-link" href={staff.siteUrl} target="_blank" rel="noreferrer">
              Open AniList profile
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function SettingsModal({
  open,
  graphLayout,
  graphSpacing,
  wheelSensitivity,
  onGraphLayoutChange,
  onGraphSpacingChange,
  onWheelSensitivityChange,
  onClose,
}: {
  open: boolean
  graphLayout: GraphLayout
  graphSpacing: number
  wheelSensitivity: number
  onGraphLayoutChange: (value: GraphLayout) => void
  onGraphSpacingChange: (value: number) => void
  onWheelSensitivityChange: (value: number) => void
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-header">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="icon-close" aria-label="Close settings" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <label className="settings-slider">
          <span>
            <strong>Scroll wheel sensitivity</strong>
            <small>{wheelSensitivity.toFixed(2)}</small>
          </span>
          <input
            type="range"
            min={MIN_WHEEL_SENSITIVITY}
            max={MAX_WHEEL_SENSITIVITY}
            step="0.01"
            value={wheelSensitivity}
            onChange={(event) => onWheelSensitivityChange(clampWheelSensitivity(Number(event.target.value)))}
          />
        </label>
        <label className="settings-field">
          <span>
            <strong>Graph layout</strong>
          </span>
          <select value={graphLayout} onChange={(event) => onGraphLayoutChange(event.target.value as GraphLayout)}>
            {GRAPH_LAYOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-slider">
          <span>
            <strong>Graph spacing</strong>
            <small>{graphSpacing.toFixed(2)}x</small>
          </span>
          <input
            type="range"
            min={MIN_GRAPH_SPACING}
            max={MAX_GRAPH_SPACING}
            step="0.05"
            value={graphSpacing}
            onChange={(event) => onGraphSpacingChange(clampGraphSpacing(Number(event.target.value)))}
          />
        </label>
      </section>
    </div>
  )
}

function CommandSearch({
  activeSlotIndex,
  onSelect,
}: {
  activeSlotIndex: number
  onSelect: (anime: AnimeSearchResult, slotIndex?: number) => void
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

  const choose = (anime: AnimeSearchResult, slotIndex = activeSlotIndex) => {
    onSelect(anime, slotIndex)
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
          placeholder="Search anime..."
        />
      </div>
      {open ? (
        <div className="command-popover">
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
  disabled = false,
  onPick,
  onClear,
}: {
  slot: number
  anime: AnimeSearchResult | null
  active: boolean
  disabled?: boolean
  onPick: () => void
  onClear: () => void
}) {
  return (
    <button type="button" className={`anime-slot ${active ? 'active' : ''}`} onClick={onPick} disabled={disabled}>
      <span className="slot-number">{slot}</span>
      {anime ? <AnimeThumb anime={anime} /> : <span className="empty-thumb"><Plus size={20} /></span>}
      <span className="slot-copy">
        <strong>{anime ? titleFor(anime) : 'Add anime'}</strong>
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
              key={`${comparisonKey(item.anime)}-${item.comparedAt}`}
              type="button"
              className="recent-row"
              onClick={() => onSelect(item)}
            >
              <span className="recent-pair">
                <strong>{selectedAnimeLabel(item.anime)}</strong>
                <ArrowRightLeft size={13} />
                <strong>{item.anime.length} anime</strong>
              </span>
              <small>{item.anime.map(formatMeta).join(' / ')}</small>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ConnectionScore({
  comparison,
  graph,
  selectedAnime,
  loading,
  canAnalyze,
}: {
  comparison: CompareResponse | null
  graph: GraphResponse | null
  selectedAnime: AnimeSearchResult[]
  loading: boolean
  canAnalyze: boolean
}) {
  const realScore = Math.round(comparison?.score ?? 0)
  const graphScore = visibleGraphScore(graph, selectedAnime)
  const breakdownItems = comparison ? scoreBreakdownItems(comparison.scoreBreakdown) : []
  const rawScoreTotal = breakdownItems.reduce((total, item) => total + item.value, 0)
  const maxBreakdownValue = Math.max(1, ...breakdownItems.map((item) => item.value))
  const tooltipText = 'Real score uses the full comparison result. Visible graph score is recalculated from the graph currently on screen after filters.'
  return (
    <section className="score-card">
      <div className="score-title">
        <span>Connection Score</span>
        <span className="score-info" tabIndex={0} aria-label={tooltipText}>
          <Info size={15} aria-hidden="true" />
          <span className="score-tooltip" role="tooltip">{tooltipText}</span>
        </span>
      </div>
      {loading ? (
        <div className="loading-row"><Loader2 className="spin" size={18} /> Analyzing creative DNA...</div>
      ) : (
        <>
          {comparison ? (
            <div className="score-grid">
              <div className="score-row">
                <span>Real Score</span>
                <strong>{`${realScore}%`}</strong>
              </div>
              <div className="score-row">
                <span>Visible Graph Score</span>
                <strong>{graphScore === null ? '--' : `${Math.round(graphScore)}%`}</strong>
              </div>
              <details className="score-breakdown">
                <summary>
                  <span>Points Breakdown</span>
                  <ChevronDown size={15} aria-hidden="true" />
                </summary>
                <div className="score-breakdown-body" aria-label="Score breakdown">
                  {breakdownItems.map((item) => (
                    <div className="score-breakdown-row" key={item.label}>
                      <span>{item.label}</span>
                      <div className="score-breakdown-meter" aria-hidden="true">
                        <span style={{ width: `${Math.max(2, (item.value / maxBreakdownValue) * 100)}%` }} />
                      </div>
                      <strong>{formatScoreValue(item.value)}</strong>
                    </div>
                  ))}
                  <div className="score-breakdown-total">
                    <span>Raw Points</span>
                    <strong>{formatScoreValue(rawScoreTotal)}</strong>
                  </div>
                </div>
              </details>
            </div>
          ) : null}
          {!comparison ? <p>{canAnalyze ? 'Analysis will run automatically.' : 'Add at least one anime to begin analysis.'}</p> : null}
        </>
      )}
    </section>
  )
}

function TopSharedStaff({ items, onSelect }: { items: SharedStaff[]; onSelect: (staff: SharedStaff) => void }) {
  const itemsKey = useMemo(() => items.map((item) => item.staffId).join(':'), [items])
  const [expandedState, setExpandedState] = useState({ itemsKey: '', expanded: false })
  const expanded = expandedState.itemsKey === itemsKey ? expandedState.expanded : false
  const visibleItems = expanded ? items : items.slice(0, 5)
  const hasFullList = items.length > 5

  return (
    <section className="staff-card">
      <div className="section-title">
        <h3>Top Shared Staff</h3>
        <ArrowRightLeft size={16} />
      </div>
      <div className="staff-list">
        {items.length === 0 ? <p className="muted">No shared staff under the active filters.</p> : null}
        {visibleItems.map((staff, index) => (
          <button key={staff.staffId} type="button" className="staff-row" onClick={() => onSelect(staff)}>
            <span className="rank">{index + 1}</span>
            <span className="staff-name">{staff.name}</span>
            <span className="role-pill">{primaryRole(staff)}</span>
            <span className="heat"><Flame size={14} /> {compactNumber(staff.favourites)}</span>
          </button>
        ))}
      </div>
      {hasFullList ? (
        <button
          type="button"
          className="full-list-button"
          onClick={() =>
            setExpandedState((current) => ({
              itemsKey,
              expanded: current.itemsKey === itemsKey ? !current.expanded : true,
            }))
          }
          aria-expanded={expanded}
        >
          {expanded ? 'Show top shared staff' : `View full shared staff list (${items.length})`}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  )
}

function TopSharedVoiceActors({ items, onSelect }: { items: SharedVoiceActor[]; onSelect: (actor: SharedVoiceActor) => void }) {
  return (
    <section className="staff-card">
      <div className="section-title">
        <h3>Top Shared Voice Actors</h3>
        <Mic2 size={16} />
      </div>
      <div className="staff-list">
        {items.length === 0 ? <p className="muted">No shared voice actors are cached for this pair.</p> : null}
        {items.slice(0, 5).map((actor, index) => (
          <button key={actor.voiceActorId} type="button" className="staff-row" onClick={() => onSelect(actor)}>
            <span className="rank voice-rank">{index + 1}</span>
            <span className="staff-name">{actor.name}</span>
            <span className="role-pill voice-pill">{primaryCharacter(actor)}</span>
            <span className="heat"><Flame size={14} /> {compactNumber(actor.favourites)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function GraphToolbar({
  loading,
  nodeCount,
  leftPanelCollapsed,
  rightPanelCollapsed,
  showLegend,
  onToggleLeftPanel,
  onToggleRightPanel,
  onToggleLegend,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  loading: boolean
  nodeCount: number
  leftPanelCollapsed: boolean
  rightPanelCollapsed: boolean
  showLegend: boolean
  onToggleLeftPanel: () => void
  onToggleRightPanel: () => void
  onToggleLegend: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}) {
  return (
    <div className="graph-toolbar">
      <div className="tool-cluster">
        <button
          type="button"
          className="tool-button"
          title={leftPanelCollapsed ? 'Show left panel' : 'Collapse left panel'}
          aria-pressed={leftPanelCollapsed}
          onClick={onToggleLeftPanel}
        >
          {leftPanelCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <button
          type="button"
          className="tool-button"
          title={rightPanelCollapsed ? 'Show right panel' : 'Collapse right panel'}
          aria-pressed={rightPanelCollapsed}
          onClick={onToggleRightPanel}
        >
          {rightPanelCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
        </button>
      </div>
      <div className="tool-cluster">
        <button type="button" className="tool-button" title="Zoom in" onClick={onZoomIn}><ZoomIn size={18} /></button>
        <button type="button" className="tool-button" title="Zoom out" onClick={onZoomOut}><ZoomOut size={18} /></button>
        <button
          type="button"
          className={`tool-button ${showLegend ? 'active' : ''}`}
          title={showLegend ? 'Hide legend' : 'Show legend'}
          aria-pressed={showLegend}
          onClick={onToggleLegend}
        >
          {showLegend ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
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
      <span><i className="legend-voice-actor" /> Voice Actor</span>
      <span><i className="legend-studio" /> Studio</span>
      <span><i className="legend-line primary" /> Primary Role</span>
      <span><i className="legend-line dashed" /> Studio / Affiliation</span>
      <span><i className="legend-line shortest" /> Shortest Path</span>
    </div>
  )
}

function DetailPanel({
  detail,
  edge,
  graph,
  loading,
  onClose,
}: {
  detail: NodeDetail | null
  edge: GraphEdge | null
  graph: GraphResponse | null
  loading: boolean
  onClose: () => void
}) {
  const hasSelection = Boolean(detail || edge)
  return (
    <section className="detail-section">
      <div className="panel-header">
        <h2>{edge ? 'Edge Details' : 'Node Details'}</h2>
        {hasSelection ? <button type="button" className="icon-close" onClick={onClose}><X size={18} /></button> : null}
      </div>
      {loading ? <div className="detail-empty"><Loader2 className="spin" size={18} /> Loading details.</div> : null}
      {!loading && !detail && !edge ? <div className="detail-empty">Select a graph node or edge to inspect its roles and connected anime.</div> : null}
      {!loading && edge ? <EdgeDetailContent edge={edge} graph={graph} /> : null}
      {!loading && !edge && detail ? <NodeDetailContent detail={detail} /> : null}
    </section>
  )
}

function EdgeDetailContent({ edge, graph }: { edge: GraphEdge; graph: GraphResponse | null }) {
  const nodesById = useMemo(() => new Map((graph?.nodes ?? []).map((node) => [String(node.data.id), node])), [graph])
  const sourceId = stringDataValue(edge.data.source)
  const targetId = stringDataValue(edge.data.target)
  const source = nodesById.get(sourceId)
  const target = nodesById.get(targetId)
  const roles = stringListDataValue(edge.data.roles)
  const label = stringDataValue(edge.data.label) || roles[0] || 'Connection'
  const type = stringDataValue(edge.data.type)
  return (
    <div className="detail-content">
      <div className="node-identity">
        <span className="node-avatar studio"><Network size={22} /></span>
        <span>
          <h3>{label}</h3>
          <small>{edgeTypeLabel(type)}</small>
        </span>
      </div>
      <div>
        <h4>Connection</h4>
        <p className="about-text">{nodeLabel(source, sourceId)} to {nodeLabel(target, targetId)}</p>
      </div>
      <div>
        <h4>{type === 'voice_actor' ? 'Characters' : 'Roles'}</h4>
        <div className="pill-row">
          {roles.map((role) => <span key={role} className={`role-pill ${type === 'voice_actor' ? 'voice-pill' : ''}`}>{role}</span>)}
          {roles.length === 0 ? <p className="muted">No roles are stored for this connection.</p> : null}
        </div>
      </div>
    </div>
  )
}

function nodeLabel(node: GraphResponse['nodes'][number] | undefined, fallback: string) {
  return stringDataValue(node?.data.label) || fallback
}

function edgeTypeLabel(type: string) {
  if (type === 'voice_actor') return 'Voice Actor Connection'
  if (type === 'studio') return 'Studio Connection'
  if (type === 'staff') return 'Staff Connection'
  return 'Connection'
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
          <small>{nodeTypeLabel(detail.type)}</small>
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
              <small>{anime.roles?.length ? anime.roles.join(', ') : anime.format ?? ''}</small>
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
  if (type === 'voiceActor') return <Mic2 size={22} />
  return <Users size={22} />
}

function RoleFilters({
  open,
  activeFilters,
  roleFiltersEnabled,
  graph,
  visibleNodeTypes,
  nodeTypeFiltersEnabled,
  showOnlyMainStudioEdges,
  edgeFilterRegex,
  staffMinFavourites,
  staffLimit,
  showEdgeLabels,
  hideIsolatedNodes,
  showOnlySharedComparisonNodes,
  showOnlyNodesWithMultipleShowEdges,
  highlightAllPaths,
  sectionState,
  onToggleOpen,
  onToggle,
  onSetAllRoles,
  onToggleNodeType,
  onSetAllNodeTypes,
  onShowOnlyMainStudioEdgesChange,
  onEdgeFilterRegexChange,
  onMinFavouritesChange,
  onStaffLimitChange,
  onSetEdgeTypeFiltersActive,
  onSetPopularityFiltersActive,
  onShowEdgeLabelsChange,
  onHideIsolatedNodesChange,
  onShowOnlySharedComparisonNodesChange,
  onShowOnlyNodesWithMultipleShowEdgesChange,
  onHighlightAllPathsChange,
  onSetGraphSettingsActive,
  onToggleSection,
  onApplyTemplate,
  onReset,
}: {
  open: boolean
  activeFilters: string[]
  roleFiltersEnabled: boolean
  graph: GraphResponse | null
  visibleNodeTypes: VisibleNodeTypes
  nodeTypeFiltersEnabled: boolean
  showOnlyMainStudioEdges: boolean
  edgeFilterRegex: string
  staffMinFavourites: number
  staffLimit: number | null
  showEdgeLabels: boolean
  hideIsolatedNodes: boolean
  showOnlySharedComparisonNodes: boolean
  showOnlyNodesWithMultipleShowEdges: boolean
  highlightAllPaths: boolean
  sectionState: FilterSectionState
  onToggleOpen: () => void
  onToggle: (id: string) => void
  onSetAllRoles: (active: boolean) => void
  onToggleNodeType: (id: NodeTypeId) => void
  onSetAllNodeTypes: (active: boolean) => void
  onShowOnlyMainStudioEdgesChange: (value: boolean) => void
  onEdgeFilterRegexChange: (value: string) => void
  onMinFavouritesChange: (value: number) => void
  onStaffLimitChange: (value: number | null) => void
  onSetEdgeTypeFiltersActive: (active: boolean) => void
  onSetPopularityFiltersActive: (active: boolean) => void
  onShowEdgeLabelsChange: (value: boolean) => void
  onHideIsolatedNodesChange: (value: boolean) => void
  onShowOnlySharedComparisonNodesChange: (value: boolean) => void
  onShowOnlyNodesWithMultipleShowEdgesChange: (value: boolean) => void
  onHighlightAllPathsChange: (value: boolean) => void
  onSetGraphSettingsActive: (active: boolean) => void
  onToggleSection: (section: FilterSectionId) => void
  onApplyTemplate: (templateId: FilterTemplateId) => void
  onReset: () => void
}) {
  const counts = useMemo(() => {
    const next = new Map<string, number>()
    for (const filter of ROLE_FILTERS) next.set(filter.id, 0)
    const categoriesByStaffNodeId = staffNodeRoleCategories(graph)
    for (const node of graph?.nodes ?? []) {
      if (node.data.type !== 'staff') {
        continue
      }
      const category = primaryStaffRoleCategory(categoriesByStaffNodeId.get(String(node.data.id)))
      if (category) {
        next.set(category, (next.get(category) ?? 0) + 1)
      }
    }
    return next
  }, [graph])
  const nodeCounts = useMemo(() => {
    const next = new Map<NodeTypeId, number>([
      ['anime', 0],
      ['staff', 0],
      ['voiceActor', 0],
      ['studio', 0],
    ])
    for (const node of graph?.nodes ?? []) {
      const type = node.data.type
      if (type === 'anime' || type === 'staff' || type === 'studio' || type === 'voiceActor') {
        next.set(type, (next.get(type) ?? 0) + 1)
      }
    }
    return next
  }, [graph])
  const rolesActive = roleFiltersEnabled
  const nodeTypesActive = nodeTypeFiltersEnabled
  const regexEdgeFilterActive = edgeFilterRegex.trim().length > 0
  const edgeTypeFiltersActive = showOnlyMainStudioEdges || regexEdgeFilterActive
  const edgeFilterRegexInvalid = regexEdgeFilterActive && !compileEdgeFilterRegex(edgeFilterRegex)
  const staffPopularityActive = staffMinFavourites > 0 || staffLimit !== null
  const graphSettingsActive = showEdgeLabels || hideIsolatedNodes || showOnlySharedComparisonNodes
  const selectedTemplateId: FilterTemplateId =
    nodeTypeFiltersEnabled && nodeTypesMatch(visibleNodeTypes, VOICE_ACTOR_NODE_TYPES) ? 'voiceActors' : 'default'

  return (
    <section className={`filter-section ${open ? 'open' : ''}`}>
      <div className="filter-section-title">
        <button type="button" className="filter-section-toggle" onClick={onToggleOpen} aria-expanded={open}>
          <h3>Filters</h3>
          <ChevronDown size={16} />
        </button>
        <button type="button" className="filter-reset" onClick={onReset}><RotateCcw size={13} /> Reset</button>
      </div>
      {open ? (
        <>
          <label className="filter-template-control" htmlFor="filter-template">
            <span>Filter template</span>
            <select
              id="filter-template"
              value={selectedTemplateId}
              onChange={(event) => onApplyTemplate(event.target.value as FilterTemplateId)}
            >
              {FILTER_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>{template.label}</option>
              ))}
            </select>
          </label>

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
        <div className={`filter-list ${rolesActive ? '' : 'disabled'}`}>
          {ROLE_FILTERS.map((filter) => {
            const active = activeFilters.includes(filter.id)
            return (
              <button
                key={filter.id}
                type="button"
                className="filter-row"
                onClick={() => onToggle(filter.id)}
                disabled={!rolesActive}
              >
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
        <div className={`filter-list ${nodeTypesActive ? '' : 'disabled'}`}>
          {NODE_TYPE_FILTERS.map((filter) => {
            const Icon = filter.icon
            const active = visibleNodeTypes[filter.id]
            return (
              <button
                key={filter.id}
                type="button"
                className="filter-row"
                onClick={() => onToggleNodeType(filter.id)}
                disabled={!nodeTypesActive}
              >
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
        subtitle="Show main studios or hide regex matches"
        icon={<CircleDotDashed size={18} />}
        iconTone="green"
        open={sectionState.edges}
        active={edgeTypeFiltersActive}
        onToggleOpen={onToggleSection}
        onToggleActive={() => onSetEdgeTypeFiltersActive(!edgeTypeFiltersActive)}
      >
        <div className="edge-filter-controls">
          <div className="filter-list">
            <button
              type="button"
              className="filter-row graph-setting-row"
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

          <label className="regex-control" htmlFor="edge-filter-regex">
            <span>Filtered edge regex</span>
            <input
              id="edge-filter-regex"
              type="text"
              value={edgeFilterRegex}
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
          <button
            type="button"
            className="filter-row graph-setting-row"
            onClick={() => onShowOnlySharedComparisonNodesChange(!showOnlySharedComparisonNodes)}
          >
            <ArrowRightLeft size={14} />
            <span>
              <strong>Connected to all selected anime</strong>
              <em>Only show nodes linked to every compared anime</em>
            </span>
            <span className={`switch ${showOnlySharedComparisonNodes ? 'on' : ''}`} aria-hidden="true" />
          </button>
        </div>
          </FilterAccordionSection>
        </>
      ) : null}

      <section className="misc-section" aria-labelledby="misc-options-title">
        <div className="filter-section-title">
          <h3 id="misc-options-title">Miscellaneous Options</h3>
        </div>
        <div className="filter-card misc-options-card open">
          <div className="filter-card-body">
            <div className="filter-list">
              <button type="button" className="filter-row graph-setting-row" onClick={() => onHighlightAllPathsChange(!highlightAllPaths)}>
                <Focus size={14} />
                <span>
                  <strong>Highlight all paths</strong>
                  <em>Highlight every visible connection instead of only the shortest path</em>
                </span>
                <span className={`switch ${highlightAllPaths ? 'on' : ''}`} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="filter-row graph-setting-row"
                onClick={() => onShowOnlyNodesWithMultipleShowEdgesChange(!showOnlyNodesWithMultipleShowEdges)}
              >
                <ArrowRightLeft size={14} />
                <span>
                  <strong>At least 2 show edges</strong>
                  <em>Only show connector nodes linked to 2 or more anime</em>
                </span>
                <span className={`switch ${showOnlyNodesWithMultipleShowEdges ? 'on' : ''}`} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </section>
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
