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
  updatedAt?: string | null
}

export interface SharedStaff {
  staffId: number
  name: string
  imageUrl?: string | null
  favourites?: number | null
  sourceRoles: string[]
  targetRoles: string[]
  roleCategories: string[]
  weight: number
}

export interface SharedStudio {
  studioId: number
  name: string
  sourceIsMain: boolean
  targetIsMain: boolean
  weight: number
}

export interface ScoreBreakdown {
  sharedStaff: number
  sharedStudios: number
  popularityBonus: number
  pathBonus: number
}

export interface PathNode {
  id: string
  type: 'anime' | 'staff' | 'studio'
  label: string
}

export interface CompareResponse {
  sourceAnime: AnimeDetail
  targetAnime: AnimeDetail
  sharedStaff: SharedStaff[]
  sharedStudios: SharedStudio[]
  score: number
  scoreBreakdown: ScoreBreakdown
  shortestPath: PathNode[]
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

export interface NodeDetail {
  id: number
  type: 'anime' | 'staff' | 'studio'
  label: string
  imageUrl?: string | null
  siteUrl?: string | null
  metadata: Record<string, unknown>
  relatedAnime: AnimeSearchResult[]
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

export function compareAnime(sourceAnimeId: number, targetAnimeId: number, roleFilters: string[]) {
  return request<CompareResponse>('/api/compare', {
    method: 'POST',
    body: JSON.stringify({ sourceAnimeId, targetAnimeId, roleFilters }),
  })
}

export function fetchGraph(sourceAnimeId: number, targetAnimeId: number, roleFilters: string[], maxDepth = 2) {
  return request<GraphResponse>('/api/graph', {
    method: 'POST',
    body: JSON.stringify({ sourceAnimeId, targetAnimeId, roleFilters, maxDepth }),
  })
}

export function fetchNodeDetail(type: string, id: number) {
  return request<NodeDetail>(`/api/nodes/${type}/${id}`)
}
