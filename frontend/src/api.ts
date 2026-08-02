export interface AnimeSearchResult {
  id: number
  titleRomaji: string
  titleEnglish?: string | null
  titleNative?: string | null
  coverImageUrl?: string | null
  year?: number | null
  format?: string | null
}

export interface AnimeDetail extends AnimeSearchResult {
  bannerImageUrl?: string | null
  episodes?: number | null
  status?: string | null
  description?: string | null
  siteUrl?: string | null
  averageScore?: number | null
  popularity?: number | null
  favourites?: number | null
  staffFetchedAt?: string | null
  studiosFetchedAt?: string | null
  voiceCastFetchedAt?: string | null
  updatedAt?: string | null
}

export interface PopularStaff {
  id: number
  nameFull: string
  nameNative?: string | null
  imageUrl?: string | null
  siteUrl?: string | null
  favourites?: number | null
  primaryOccupations: string[]
}

export interface PopularStaffAnime extends AnimeSearchResult {
  popularity?: number | null
  roles: string[]
}

export interface SharedStaff {
  staffId: number
  name: string
  imageUrl?: string | null
  favourites?: number | null
  rolesByAnime: Record<number, string[]>
  roleCategories: string[]
  weight: number
}

export interface SharedStudio {
  studioId: number
  name: string
  isMainByAnime: Record<number, boolean>
  weight: number
}

export interface SharedVoiceActor {
  voiceActorId: number
  name: string
  imageUrl?: string | null
  favourites?: number | null
  charactersByAnime: Record<number, string[]>
  roleCategories: string[]
  weight: number
}

export type VoiceCastLanguage =
  | 'JAPANESE'
  | 'ENGLISH'
  | 'KOREAN'
  | 'ITALIAN'
  | 'SPANISH'
  | 'PORTUGUESE'
  | 'FRENCH'
  | 'GERMAN'
  | 'HEBREW'
  | 'HUNGARIAN'

export interface VoiceCharacterCredit {
  name: string
  imageUrl?: string | null
}

export interface SharedVoiceCastMember {
  voiceActorId: number
  name: string
  imageUrl?: string | null
  siteUrl?: string | null
  charactersByAnime: Record<number, VoiceCharacterCredit[]>
}

export interface VoiceCastCompareResponse {
  animeIds: number[]
  language: VoiceCastLanguage
  sharedVoiceActors: SharedVoiceCastMember[]
}

export interface ScoreBreakdown {
  sharedStaff: number
  sharedStudios: number
  sharedVoiceActors: number
  popularityBonus: number
  pathBonus: number
}

export interface PathNode {
  id: string
  type: 'anime' | 'staff' | 'studio' | 'voiceActor'
  label: string
}

export interface CompareResponse {
  anime: AnimeDetail[]
  sharedStaff: SharedStaff[]
  sharedStudios: SharedStudio[]
  sharedVoiceActors: SharedVoiceActor[]
  score: number
  scoreBreakdown: ScoreBreakdown
  shortestPath: PathNode[]
}

export interface StaffPopularityFilters {
  staffMinFavourites: number
  staffLimit: number | null
}

export const DEFAULT_STAFF_POPULARITY_FILTERS: StaffPopularityFilters = {
  staffMinFavourites: 0,
  staffLimit: 40,
}

export interface CytoscapeElement {
  data: Record<string, unknown>
  classes: string
}

export interface GraphResponse {
  nodes: CytoscapeElement[]
  edges: CytoscapeElement[]
  highlightedPath: string[]
}

export interface NodeTopRole {
  label: string
  category?: string | null
  count: number
}

export interface RelatedConnection extends AnimeSearchResult {
  roles: string[]
  roleCategories: string[]
  isMain?: boolean | null
}

export interface ConnectionCounts {
  anime: number
  staff: number
  studios: number
  voiceActors: number
  roles: number
}

export interface NodeDetail {
  id: number
  type: 'anime' | 'staff' | 'studio' | 'voiceActor'
  label: string
  imageUrl?: string | null
  siteUrl?: string | null
  description?: string | null
  favourites?: number | null
  metadata: Record<string, unknown>
  relatedAnime: AnimeSearchResult[]
  topRoles: NodeTopRole[]
  relatedConnections: RelatedConnection[]
  connectionCounts: ConnectionCounts
}

export type EntityType = 'anime' | 'staff' | 'studio' | 'voiceActor'

export interface EntitySearchResult {
  id: number
  type: EntityType
  label: string
  subtitle?: string | null
  imageUrl?: string | null
  siteUrl?: string | null
}

export interface RelatedAnimeSummary extends AnimeSearchResult {
  averageScore?: number | null
  popularity?: number | null
  favourites?: number | null
  roles: string[]
  isMain?: boolean | null
}

export interface EntitySummary {
  id: number
  type: EntityType
  label: string
  subtitle?: string | null
  imageUrl?: string | null
  siteUrl?: string | null
  favourites?: number | null
  metadata: Record<string, unknown>
  relatedAnime: RelatedAnimeSummary[]
}

export interface ComparisonMetricRow {
  key: string
  label: string
  leftValue: string
  rightValue: string
  leftRaw?: number | string | null
  rightRaw?: number | string | null
  winner: 'left' | 'right' | 'tie' | 'neutral'
  higherIsBetter?: boolean | null
}

export interface EntityCompareResponse {
  type: EntityType
  left: EntitySummary
  right: EntitySummary
  metrics: ComparisonMetricRow[]
  overlap: RelatedAnimeSummary[]
  notes: string[]
}

export interface ProfileUserSummary {
  id: number
  name: string
  avatarImageUrl?: string | null
  bannerImageUrl?: string | null
  siteUrl?: string | null
}

export interface ProfileListSummary {
  totalEntries: number
  completedCount: number
  watchedEpisodes: number
  meanScore?: number | null
  statusCounts: Record<string, number>
}

export interface ProfileDistributionRow {
  label: string
  count: number
  percentage: number
}

export interface ProfileTasteRow {
  label: string
  count: number
  meanScore?: number | null
}

export interface ProfileStaffCredit {
  id: number
  name: string
  imageUrl?: string | null
  siteUrl?: string | null
  roles: string[]
}

export interface ProfileScoreDeltaRow extends AnimeSearchResult {
  score?: number | null
  averageScore?: number | null
  normalizedCommunityScore?: number | null
  scoreDelta?: number | null
  siteUrl?: string | null
}

export interface ProfileScoreBucket {
  label: string
  count: number
  meanDelta?: number | null
}

export interface ProfileScoreComparison {
  meanUserScore?: number | null
  meanCommunityScore?: number | null
  meanDelta?: number | null
  overRated: ProfileScoreDeltaRow[]
  underRated: ProfileScoreDeltaRow[]
  buckets: ProfileScoreBucket[]
}

export interface ProfileTasteAnalysisRow {
  label: string
  count: number
  completedCount: number
  meanScore?: number | null
  meanCommunityScore?: number | null
  meanDelta?: number | null
  roleSummary?: string | null
  representativeAnime: AnimeSearchResult[]
}

export interface ProfileAnimeEntry extends AnimeSearchResult {
  listStatus: string
  score?: number | null
  progress?: number | null
  episodes?: number | null
  averageScore?: number | null
  popularity?: number | null
  favourites?: number | null
  siteUrl?: string | null
  genres: string[]
  tags: string[]
  studios: string[]
  staff: ProfileStaffCredit[]
  updatedAt?: number | null
}

export interface AnimeProfileResponse {
  user: ProfileUserSummary
  summary: ProfileListSummary
  statusDistribution: ProfileDistributionRow[]
  formatDistribution: ProfileDistributionRow[]
  yearDistribution: ProfileDistributionRow[]
  scoreDistribution: ProfileDistributionRow[]
  topGenres: ProfileTasteRow[]
  topTags: ProfileTasteRow[]
  topStudios: ProfileTasteRow[]
  scoreComparison: ProfileScoreComparison
  genreTaste: ProfileTasteAnalysisRow[]
  tagTaste: ProfileTasteAnalysisRow[]
  studioTaste: ProfileTasteAnalysisRow[]
  staffAffinity: ProfileTasteAnalysisRow[]
  highestRated: ProfileAnimeEntry[]
  lowestRatedCompleted: ProfileAnimeEntry[]
  longestWatched: ProfileAnimeEntry[]
  recentlyUpdated: ProfileAnimeEntry[]
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? `Request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function searchAnime(query: string, signal?: AbortSignal) {
  return request<AnimeSearchResult[]>(`/api/search/anime?q=${encodeURIComponent(query)}`, { signal })
}

export function searchEntities(type: EntityType, query: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ type, q: query })
  return request<EntitySearchResult[]>(`/api/search/entities?${params.toString()}`, { signal })
}

export function searchAll(query: string, limit = 8, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return request<EntitySearchResult[]>(`/api/search/all?${params.toString()}`, { signal })
}

export function fetchPopularStaff(kind = 'Director', limit = 50, signal?: AbortSignal) {
  const params = new URLSearchParams({ kind, limit: String(limit) })
  return request<PopularStaff[]>(`/api/staff/popular?${params.toString()}`, { signal })
}

export function fetchStaffDirectedAnime(staffId: number, role = 'Director', limit = 12, signal?: AbortSignal) {
  const params = new URLSearchParams({ role, limit: String(limit) })
  return request<PopularStaffAnime[]>(`/api/staff/${staffId}/directed-anime?${params.toString()}`, { signal })
}

export function fetchAnimeProfile(username: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ username })
  return request<AnimeProfileResponse>(`/api/profile/anime?${params.toString()}`, { signal })
}

export function compareVoiceCast(animeIds: [number, number], language: VoiceCastLanguage, signal?: AbortSignal) {
  return request<VoiceCastCompareResponse>('/api/voice-cast/compare', {
    method: 'POST',
    body: JSON.stringify({ animeIds, language }),
    signal,
  })
}

export async function streamAnalysis(
  animeIds: number[],
  roleFilters: string[],
  maxDepth: number,
  popularityFilters: StaffPopularityFilters = DEFAULT_STAFF_POPULARITY_FILTERS,
  handlers: { onComparison: (value: CompareResponse) => void; onGraph: (value: GraphResponse) => void },
  signal?: AbortSignal,
) {
  const response = await fetch(`${API_BASE_URL}/api/analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ animeIds, roleFilters, maxDepth, ...popularityFilters }),
    signal,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? `Request failed with ${response.status}`)
  }
  if (!response.body) throw new Error('Analysis stream is unavailable')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let completed = false
  while (true) {
    const { value, done } = await reader.read()
    buffer += value ?? ''
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as { type: string; data?: unknown; detail?: string }
      if (event.type === 'comparison') handlers.onComparison(event.data as CompareResponse)
      else if (event.type === 'graph') handlers.onGraph(event.data as GraphResponse)
      else if (event.type === 'complete') completed = true
      else if (event.type === 'error') throw new Error(event.detail ?? 'Analysis failed')
    }
    if (done) break
  }
  if (!completed) throw new Error('Analysis stream ended unexpectedly')
}

export function compareEntities(type: EntityType, leftId: number, rightId: number) {
  return request<EntityCompareResponse>('/api/entities/compare', {
    method: 'POST',
    body: JSON.stringify({ type, leftId, rightId }),
  })
}

export function fetchEntitySummary(type: EntityType, id: number, signal?: AbortSignal) {
  return request<EntitySummary>(`/api/entities/${type}/${id}`, { signal })
}

export function fetchNodeDetail(type: string, id: number) {
  return request<NodeDetail>(`/api/nodes/${type}/${id}`)
}
