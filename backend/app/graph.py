from __future__ import annotations

from collections import defaultdict, deque
from typing import Any

from fastapi import HTTPException
import networkx as nx
from sqlmodel import Session, select

from app.cache import anime_to_detail, included_staff_roles
from app.models import Anime, AnimeStaffRole, AnimeStudio, AnimeVoiceActorRole, Staff, Studio, VoiceActor
from app.schemas import (
    AnimeSearchResult,
    ConnectionCounts,
    CompareResponse,
    CytoscapeElement,
    GraphResponse,
    NodeDetail,
    NodeTopRole,
    PathNode,
    RelatedConnection,
    ScoreBreakdown,
    SharedStaff,
    SharedStudio,
    SharedVoiceActor,
)
from app.scoring import normalize_role_filters, path_bonus, popularity_multiplier, role_is_included, score_role


class GraphService:
    def compare(
        self,
        session: Session,
        anime_ids: list[int],
        role_filters: list[str] | None,
        staff_min_favourites: int = 0,
        staff_limit: int | None = 40,
    ) -> CompareResponse:
        anime = [self._get_anime(session, anime_id) for anime_id in anime_ids]
        allowed_staff_ids = self._allowed_staff_ids(session, staff_min_favourites, staff_limit)
        shared_staff = self._shared_staff(session, anime_ids, role_filters, allowed_staff_ids)
        shared_studios = self._shared_studios(session, anime_ids, role_filters)
        shared_voice_actors = self._shared_voice_actors(session, anime_ids)
        graph = self._build_graph(session, role_filters, allowed_staff_ids, anime_ids=set(anime_ids))
        path = self._selected_shortest_path_nodes(graph, anime_ids)
        breakdown = self._score_breakdown(shared_staff, shared_studios, shared_voice_actors, len(path))
        score = min(100.0, sum(breakdown.model_dump().values()))
        return CompareResponse(
            anime=[anime_to_detail(item) for item in anime],
            sharedStaff=shared_staff,
            sharedStudios=shared_studios,
            sharedVoiceActors=shared_voice_actors,
            score=round(score, 2),
            scoreBreakdown=breakdown,
            shortestPath=[self._path_node(graph, node_id) for node_id in path],
        )

    def cytoscape_graph(
        self,
        session: Session,
        anime_ids: list[int],
        role_filters: list[str] | None,
        max_depth: int,
        staff_min_favourites: int = 0,
        staff_limit: int | None = 40,
    ) -> GraphResponse:
        allowed_staff_ids = self._allowed_staff_ids(session, staff_min_favourites, staff_limit)
        graph = self._build_graph(session, role_filters, allowed_staff_ids, anime_ids=set(anime_ids))
        selected_nodes = [f"anime:{anime_id}" for anime_id in anime_ids]
        existing_selected_nodes = [node_id for node_id in selected_nodes if node_id in graph]
        if not existing_selected_nodes:
            return GraphResponse(nodes=[], edges=[], highlightedPath=[])

        shortest_path = self._selected_shortest_path_nodes(graph, anime_ids)
        visible_nodes = set(shortest_path) | set(existing_selected_nodes)
        for node_id in existing_selected_nodes:
            visible_nodes |= self._bounded_neighbors(graph, node_id, max_depth)

        if len(visible_nodes) > 140:
            required = set(shortest_path) | set(existing_selected_nodes)
            ranked = sorted(
                (node for node in visible_nodes if node not in required),
                key=lambda node: graph.degree(node),
                reverse=True,
            )
            visible_nodes = required | set(ranked[: 140 - len(required)])

        highlighted_nodes = set(shortest_path)
        highlighted_edges = self._selected_shortest_path_edge_ids(graph, anime_ids)

        nodes = [
            CytoscapeElement(data=self._cy_node(graph, node_id), classes="highlighted" if node_id in highlighted_nodes else "")
            for node_id in sorted(visible_nodes)
        ]
        edges: list[CytoscapeElement] = []
        for source, target, data in graph.edges(data=True):
            if source not in visible_nodes or target not in visible_nodes:
                continue
            edge_id = data["id"]
            edges.append(
                CytoscapeElement(
                    data={**data, "source": source, "target": target},
                    classes="highlighted" if edge_id in highlighted_edges else "",
                )
            )
        return GraphResponse(nodes=nodes, edges=edges, highlightedPath=shortest_path)

    def node_detail(self, session: Session, node_type: str, node_id: int) -> NodeDetail:
        if node_type == "anime":
            anime = self._get_anime(session, node_id)
            staff_roles = session.exec(select(AnimeStaffRole).where(AnimeStaffRole.anime_id == node_id)).all()
            studio_roles = session.exec(select(AnimeStudio).where(AnimeStudio.anime_id == node_id)).all()
            voice_actor_roles = session.exec(select(AnimeVoiceActorRole).where(AnimeVoiceActorRole.anime_id == node_id)).all()
            return NodeDetail(
                id=anime.id,
                type="anime",
                label=anime.title_english or anime.title_romaji,
                imageUrl=anime.cover_image_url,
                siteUrl=anime.site_url,
                description=anime.description,
                favourites=anime.favourites,
                metadata=anime_to_detail(anime).model_dump(mode="json"),
                topRoles=self._top_staff_roles(staff_roles),
                connectionCounts=ConnectionCounts(
                    staff=len({role.staff_id for role in staff_roles}),
                    studios=len({role.studio_id for role in studio_roles}),
                    voiceActors=len({role.voice_actor_id for role in voice_actor_roles}),
                    roles=len(staff_roles) + len(studio_roles) + len(voice_actor_roles),
                ),
            )
        if node_type == "staff":
            staff = session.get(Staff, node_id)
            if not staff:
                raise HTTPException(status_code=404, detail=f"Staff {node_id} is not cached")
            staff_roles = session.exec(select(AnimeStaffRole).where(AnimeStaffRole.staff_id == node_id)).all()
            related_connections = self._staff_related_connections(session, staff_roles)
            return NodeDetail(
                id=staff.id,
                type="staff",
                label=staff.name_full,
                imageUrl=staff.image_url,
                siteUrl=staff.site_url,
                favourites=staff.favourites,
                metadata={"nameNative": staff.name_native, "favourites": staff.favourites},
                relatedAnime=[self._connection_to_search_result(item) for item in related_connections],
                topRoles=self._top_staff_roles(staff_roles),
                relatedConnections=related_connections,
                connectionCounts=ConnectionCounts(
                    anime=len(related_connections),
                    roles=len(staff_roles),
                ),
            )
        if node_type == "studio":
            studio = session.get(Studio, node_id)
            if not studio:
                raise HTTPException(status_code=404, detail=f"Studio {node_id} is not cached")
            studio_roles = session.exec(select(AnimeStudio).where(AnimeStudio.studio_id == node_id)).all()
            related_connections = self._studio_related_connections(session, studio_roles)
            return NodeDetail(
                id=studio.id,
                type="studio",
                label=studio.name,
                siteUrl=studio.site_url,
                favourites=studio.favourites,
                metadata={"favourites": studio.favourites},
                relatedAnime=[self._connection_to_search_result(item) for item in related_connections],
                topRoles=self._top_studio_roles(studio_roles),
                relatedConnections=related_connections,
                connectionCounts=ConnectionCounts(
                    anime=len(related_connections),
                    studios=1,
                    roles=len(studio_roles),
                ),
            )
        if node_type == "voiceActor":
            voice_actor = session.get(VoiceActor, node_id)
            if not voice_actor:
                raise HTTPException(status_code=404, detail=f"Voice actor {node_id} is not cached")
            voice_roles = session.exec(select(AnimeVoiceActorRole).where(AnimeVoiceActorRole.voice_actor_id == node_id)).all()
            related_connections = self._voice_actor_related_connections(session, voice_roles)
            return NodeDetail(
                id=voice_actor.id,
                type="voiceActor",
                label=voice_actor.name_full,
                imageUrl=voice_actor.image_url,
                siteUrl=voice_actor.site_url,
                favourites=voice_actor.favourites,
                metadata={"nameNative": voice_actor.name_native, "favourites": voice_actor.favourites},
                relatedAnime=[self._connection_to_search_result(item) for item in related_connections],
                topRoles=self._top_voice_actor_roles(voice_roles),
                relatedConnections=related_connections,
                connectionCounts=ConnectionCounts(
                    anime=len(related_connections),
                    voiceActors=1,
                    roles=len(voice_roles),
                ),
            )
        raise HTTPException(status_code=400, detail="Node type must be anime, staff, studio, or voiceActor")

    def _build_graph(
        self,
        session: Session,
        role_filters: list[str] | None,
        allowed_staff_ids: set[int] | None = None,
        anime_ids: set[int] | None = None,
    ) -> nx.Graph:
        graph = nx.Graph()
        scoped_anime_ids = list(anime_ids) if anime_ids is not None else None
        anime_query = select(Anime)
        if scoped_anime_ids is not None:
            anime_query = anime_query.where(Anime.id.in_(scoped_anime_ids))
        for anime in session.exec(anime_query).all():
            graph.add_node(
                f"anime:{anime.id}",
                type="anime",
                label=anime.title_english or anime.title_romaji,
                imageUrl=anime.cover_image_url,
                year=anime.year,
            )
        for staff in session.exec(select(Staff)).all():
            if allowed_staff_ids is not None and staff.id not in allowed_staff_ids:
                continue
            graph.add_node(
                f"staff:{staff.id}",
                type="staff",
                label=staff.name_full,
                imageUrl=staff.image_url,
                favourites=staff.favourites,
            )
        for studio in session.exec(select(Studio)).all():
            graph.add_node(f"studio:{studio.id}", type="studio", label=studio.name)
        for voice_actor in session.exec(select(VoiceActor)).all():
            graph.add_node(
                f"voice_actor:{voice_actor.id}",
                type="voiceActor",
                label=voice_actor.name_full,
                imageUrl=voice_actor.image_url,
                favourites=voice_actor.favourites,
            )

        staff_role_query = select(AnimeStaffRole)
        if scoped_anime_ids is not None:
            staff_role_query = staff_role_query.where(AnimeStaffRole.anime_id.in_(scoped_anime_ids))
        for rel in session.exec(staff_role_query).all():
            if not role_is_included(rel.role_category, rel.role, role_filters):
                continue
            if allowed_staff_ids is not None and rel.staff_id not in allowed_staff_ids:
                continue
            anime_node = f"anime:{rel.anime_id}"
            staff_node = f"staff:{rel.staff_id}"
            if anime_node not in graph or staff_node not in graph:
                continue
            edge_id = self._edge_id(anime_node, staff_node)
            distance = max(0.2, 6.0 - rel.weight)
            if graph.has_edge(anime_node, staff_node):
                edge = graph.edges[anime_node, staff_node]
                edge["roles"] = self._append_unique(edge["roles"], rel.role)
                edge["roleCategories"] = self._append_unique(edge["roleCategories"], rel.role_category)
                edge["label"] = self._staff_edge_label(edge["roles"])
                edge["weight"] = max(edge["weight"], rel.weight)
                edge["distance"] = min(edge["distance"], distance)
            else:
                roles = [rel.role]
                graph.add_edge(
                    anime_node,
                    staff_node,
                    id=edge_id,
                    label=self._staff_edge_label(roles),
                    type="staff",
                    roles=roles,
                    roleCategories=[rel.role_category],
                    weight=rel.weight,
                    distance=distance,
                )
        normalized_filters = normalize_role_filters(role_filters)
        studio_query = select(AnimeStudio)
        if scoped_anime_ids is not None:
            studio_query = studio_query.where(AnimeStudio.anime_id.in_(scoped_anime_ids))
        for rel in session.exec(studio_query).all():
            if normalized_filters and "studio" not in normalized_filters:
                continue
            anime_node = f"anime:{rel.anime_id}"
            studio_node = f"studio:{rel.studio_id}"
            if anime_node not in graph or studio_node not in graph:
                continue
            label = "Main studio" if rel.is_main else "Studio"
            graph.add_edge(
                anime_node,
                studio_node,
                id=self._edge_id(anime_node, studio_node),
                label=label,
                type="studio",
                roles=[label],
                roleCategories=["studio"],
                weight=rel.weight,
                distance=max(0.3, 5.5 - rel.weight),
            )
        voice_actor_query = select(AnimeVoiceActorRole)
        if scoped_anime_ids is not None:
            voice_actor_query = voice_actor_query.where(AnimeVoiceActorRole.anime_id.in_(scoped_anime_ids))
        for rel in session.exec(voice_actor_query).all():
            anime_node = f"anime:{rel.anime_id}"
            voice_actor_node = f"voice_actor:{rel.voice_actor_id}"
            if anime_node not in graph or voice_actor_node not in graph:
                continue
            edge_id = self._edge_id(anime_node, voice_actor_node)
            distance = max(0.4, 6.0 - rel.weight)
            if graph.has_edge(anime_node, voice_actor_node):
                edge = graph.edges[anime_node, voice_actor_node]
                edge["label"] = f"{edge['label']}, {rel.character_name}"
                edge["roles"].append(rel.character_name)
                edge["weight"] = max(edge["weight"], rel.weight)
                edge["distance"] = min(edge["distance"], distance)
            else:
                graph.add_edge(
                    anime_node,
                    voice_actor_node,
                    id=edge_id,
                    label=rel.character_name,
                    type="voice_actor",
                    roles=[rel.character_name],
                    roleCategories=[rel.role_category],
                    weight=rel.weight,
                    distance=distance,
                )
        return graph

    def _shared_staff(
        self,
        session: Session,
        anime_ids: list[int],
        role_filters: list[str] | None,
        allowed_staff_ids: set[int] | None = None,
    ) -> list[SharedStaff]:
        roles_by_anime = {
            anime_id: self._roles_by_staff(included_staff_roles(session, anime_id, role_filters))
            for anime_id in anime_ids
        }
        shared_ids = self._shared_connection_ids(roles_by_anime)
        if allowed_staff_ids is not None:
            shared_ids &= allowed_staff_ids
        staff_by_id = {staff.id: staff for staff in session.exec(select(Staff).where(Staff.id.in_(shared_ids))).all()} if shared_ids else {}
        results: list[SharedStaff] = []
        for staff_id in shared_ids:
            staff = staff_by_id[staff_id]
            roles_for_staff_by_anime = {
                anime_id: roles_by_anime[anime_id][staff_id]
                for anime_id in anime_ids
            }
            all_roles = [role for roles in roles_for_staff_by_anime.values() for role in roles]
            categories = sorted({role.role_category for role in all_roles})
            weight = sum(max(role.weight for role in roles) for roles in roles_for_staff_by_anime.values())
            weight *= popularity_multiplier(staff.favourites)
            results.append(
                SharedStaff(
                    staffId=staff_id,
                    name=staff.name_full,
                    imageUrl=staff.image_url,
                    favourites=staff.favourites,
                    rolesByAnime={
                        anime_id: sorted({role.role for role in roles})
                        for anime_id, roles in roles_for_staff_by_anime.items()
                    },
                    roleCategories=categories,
                    weight=round(weight, 2),
                )
            )
        return sorted(results, key=lambda item: item.weight, reverse=True)

    def _allowed_staff_ids(self, session: Session, min_favourites: int, limit: int | None) -> set[int] | None:
        staff = sorted(
            session.exec(select(Staff)).all(),
            key=lambda item: (item.favourites or 0, item.name_full),
            reverse=True,
        )
        filtered = [item for item in staff if (item.favourites or 0) >= max(0, min_favourites)]
        if limit is not None:
            filtered = filtered[:limit]
        return {item.id for item in filtered}

    def _shared_studios(
        self,
        session: Session,
        anime_ids: list[int],
        role_filters: list[str] | None,
    ) -> list[SharedStudio]:
        normalized_filters = normalize_role_filters(role_filters)
        if normalized_filters and "studio" not in normalized_filters:
            return []
        studios_by_anime = {
            anime_id: {
                rel.studio_id: rel
                for rel in session.exec(select(AnimeStudio).where(AnimeStudio.anime_id == anime_id)).all()
            }
            for anime_id in anime_ids
        }
        shared_ids = self._shared_connection_ids(studios_by_anime)
        studios = {studio.id: studio for studio in session.exec(select(Studio).where(Studio.id.in_(shared_ids))).all()} if shared_ids else {}
        results = [
            SharedStudio(
                studioId=studio_id,
                name=studios[studio_id].name,
                isMainByAnime={
                    anime_id: studios_by_anime[anime_id][studio_id].is_main
                    for anime_id in anime_ids
                },
                weight=round(sum(studios_by_anime[anime_id][studio_id].weight for anime_id in anime_ids), 2),
            )
            for studio_id in shared_ids
        ]
        return sorted(results, key=lambda item: item.weight, reverse=True)

    def _shared_voice_actors(self, session: Session, anime_ids: list[int]) -> list[SharedVoiceActor]:
        roles_by_anime = {
            anime_id: self._roles_by_voice_actor(session.exec(select(AnimeVoiceActorRole).where(AnimeVoiceActorRole.anime_id == anime_id)).all())
            for anime_id in anime_ids
        }
        shared_ids = self._shared_connection_ids(roles_by_anime)
        actors = {actor.id: actor for actor in session.exec(select(VoiceActor).where(VoiceActor.id.in_(shared_ids))).all()} if shared_ids else {}
        results: list[SharedVoiceActor] = []
        for actor_id in shared_ids:
            actor = actors[actor_id]
            roles_for_actor_by_anime = {
                anime_id: roles_by_anime[anime_id][actor_id]
                for anime_id in anime_ids
            }
            all_roles = [role for roles in roles_for_actor_by_anime.values() for role in roles]
            weight = sum(max(role.weight for role in roles) for roles in roles_for_actor_by_anime.values())
            weight *= popularity_multiplier(actor.favourites)
            results.append(
                SharedVoiceActor(
                    voiceActorId=actor_id,
                    name=actor.name_full,
                    imageUrl=actor.image_url,
                    favourites=actor.favourites,
                    charactersByAnime={
                        anime_id: sorted({role.character_name for role in roles})
                        for anime_id, roles in roles_for_actor_by_anime.items()
                    },
                    roleCategories=sorted({role.role_category for role in all_roles}),
                    weight=round(weight, 2),
                )
            )
        return sorted(results, key=lambda item: item.weight, reverse=True)

    def _shared_connection_ids(self, grouped_by_anime: dict[int, dict[int, Any]]) -> set[int]:
        grouped_values = list(grouped_by_anime.values())
        if not grouped_values:
            return set()
        shared_ids = set(grouped_values[0])
        for grouped in grouped_values[1:]:
            shared_ids &= set(grouped)
        return shared_ids

    def _roles_by_staff(self, roles: list[AnimeStaffRole]) -> dict[int, list[AnimeStaffRole]]:
        grouped: dict[int, list[AnimeStaffRole]] = defaultdict(list)
        for role in roles:
            grouped[role.staff_id].append(role)
        return grouped

    def _roles_by_voice_actor(self, roles: list[AnimeVoiceActorRole]) -> dict[int, list[AnimeVoiceActorRole]]:
        grouped: dict[int, list[AnimeVoiceActorRole]] = defaultdict(list)
        for role in roles:
            grouped[role.voice_actor_id].append(role)
        return grouped

    def _score_breakdown(
        self,
        shared_staff: list[SharedStaff],
        shared_studios: list[SharedStudio],
        shared_voice_actors: list[SharedVoiceActor],
        path_length: int,
    ) -> ScoreBreakdown:
        staff_points = sum(item.weight * 5 for item in shared_staff)
        studio_points = sum(item.weight * 4 for item in shared_studios)
        voice_actor_points = sum(item.weight * 3 for item in shared_voice_actors)
        popularity_points = sum(min(item.favourites or 0, 30_000) / 5_000 for item in [*shared_staff, *shared_voice_actors])
        return ScoreBreakdown(
            sharedStaff=round(staff_points, 2),
            sharedStudios=round(studio_points, 2),
            sharedVoiceActors=round(voice_actor_points, 2),
            popularityBonus=round(popularity_points, 2),
            pathBonus=round(path_bonus(path_length), 2),
        )

    def _shortest_path(self, graph: nx.Graph, source: str, target: str) -> list[str]:
        try:
            return nx.shortest_path(graph, source=source, target=target, weight="distance")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

    def _selected_shortest_paths(self, graph: nx.Graph, anime_ids: list[int]) -> list[list[str]]:
        selected_nodes = [f"anime:{anime_id}" for anime_id in anime_ids]
        paths: list[list[str]] = []
        for index in range(len(selected_nodes) - 1):
            path = self._shortest_path(graph, selected_nodes[index], selected_nodes[index + 1])
            if path:
                paths.append(path)
        return paths

    def _selected_shortest_path_nodes(self, graph: nx.Graph, anime_ids: list[int]) -> list[str]:
        ordered_nodes: list[str] = []
        seen: set[str] = set()
        for path in self._selected_shortest_paths(graph, anime_ids):
            for node_id in path:
                if node_id not in seen:
                    ordered_nodes.append(node_id)
                    seen.add(node_id)
        return ordered_nodes

    def _selected_shortest_path_edge_ids(self, graph: nx.Graph, anime_ids: list[int]) -> set[str]:
        edge_ids: set[str] = set()
        for path in self._selected_shortest_paths(graph, anime_ids):
            for index in range(len(path) - 1):
                if graph.has_edge(path[index], path[index + 1]):
                    edge_ids.add(graph.edges[path[index], path[index + 1]]["id"])
        return edge_ids

    def _bounded_neighbors(self, graph: nx.Graph, start: str, max_depth: int) -> set[str]:
        visited = {start}
        queue = deque([(start, 0)])
        while queue:
            node, depth = queue.popleft()
            if depth >= max(1, max_depth):
                continue
            neighbors = sorted(graph.neighbors(node), key=lambda item: graph.edges[node, item].get("weight", 0), reverse=True)
            for neighbor in neighbors[:60]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, depth + 1))
        return visited

    def _cy_node(self, graph: nx.Graph, node_id: str) -> dict[str, Any]:
        data = dict(graph.nodes[node_id])
        data["id"] = node_id
        return data

    def _path_node(self, graph: nx.Graph, node_id: str) -> PathNode:
        data = graph.nodes[node_id]
        return PathNode(id=node_id, type=data["type"], label=data["label"])

    def _edge_id(self, source: str, target: str) -> str:
        first, second = sorted([source, target])
        return f"{first}--{second}"

    def _get_anime(self, session: Session, anime_id: int) -> Anime:
        anime = session.get(Anime, anime_id)
        if not anime:
            raise HTTPException(status_code=404, detail=f"Anime {anime_id} is not cached")
        return anime

    def _anime_for_staff(self, session: Session, staff_id: int) -> list[AnimeSearchResult]:
        anime_ids = [rel.anime_id for rel in session.exec(select(AnimeStaffRole).where(AnimeStaffRole.staff_id == staff_id)).all()]
        return self._anime_results(session, anime_ids)

    def _anime_for_studio(self, session: Session, studio_id: int) -> list[AnimeSearchResult]:
        anime_ids = [rel.anime_id for rel in session.exec(select(AnimeStudio).where(AnimeStudio.studio_id == studio_id)).all()]
        return self._anime_results(session, anime_ids)

    def _anime_for_voice_actor(self, session: Session, voice_actor_id: int) -> list[AnimeSearchResult]:
        anime_ids = [rel.anime_id for rel in session.exec(select(AnimeVoiceActorRole).where(AnimeVoiceActorRole.voice_actor_id == voice_actor_id)).all()]
        return self._anime_results(session, anime_ids)

    def _anime_results(self, session: Session, anime_ids: list[int]) -> list[AnimeSearchResult]:
        if not anime_ids:
            return []
        anime = session.exec(select(Anime).where(Anime.id.in_(set(anime_ids)))).all()
        return [
            AnimeSearchResult(
                id=item.id,
                titleRomaji=item.title_romaji,
                titleEnglish=item.title_english,
                titleNative=item.title_native,
                coverImageUrl=item.cover_image_url,
                year=item.year,
                format=item.format,
            )
            for item in anime
        ]

    def _staff_related_connections(self, session: Session, roles: list[AnimeStaffRole]) -> list[RelatedConnection]:
        grouped: dict[int, list[AnimeStaffRole]] = defaultdict(list)
        for role in roles:
            grouped[role.anime_id].append(role)
        anime_by_id = {anime.id: anime for anime in self._anime_records(session, list(grouped))}
        connections: list[RelatedConnection] = []
        for anime_id, anime_roles in grouped.items():
            anime = anime_by_id.get(anime_id)
            if not anime:
                continue
            connections.append(
                RelatedConnection(
                    **self._anime_result_payload(anime),
                    roles=sorted({role.role for role in anime_roles}),
                    roleCategories=sorted({role.role_category for role in anime_roles}),
                )
            )
        return sorted(connections, key=lambda item: (item.year or 0, item.titleEnglish or item.titleRomaji), reverse=True)

    def _studio_related_connections(self, session: Session, roles: list[AnimeStudio]) -> list[RelatedConnection]:
        grouped = {role.anime_id: role for role in roles}
        anime_by_id = {anime.id: anime for anime in self._anime_records(session, list(grouped))}
        connections: list[RelatedConnection] = []
        for anime_id, studio_role in grouped.items():
            anime = anime_by_id.get(anime_id)
            if not anime:
                continue
            role_label = "Main studio" if studio_role.is_main else "Studio"
            connections.append(
                RelatedConnection(
                    **self._anime_result_payload(anime),
                    roles=[role_label],
                    roleCategories=["studio"],
                    isMain=studio_role.is_main,
                )
            )
        return sorted(connections, key=lambda item: (item.year or 0, item.titleEnglish or item.titleRomaji), reverse=True)

    def _voice_actor_related_connections(self, session: Session, roles: list[AnimeVoiceActorRole]) -> list[RelatedConnection]:
        grouped: dict[int, list[AnimeVoiceActorRole]] = defaultdict(list)
        for role in roles:
            grouped[role.anime_id].append(role)
        anime_by_id = {anime.id: anime for anime in self._anime_records(session, list(grouped))}
        connections: list[RelatedConnection] = []
        for anime_id, voice_roles in grouped.items():
            anime = anime_by_id.get(anime_id)
            if not anime:
                continue
            connections.append(
                RelatedConnection(
                    **self._anime_result_payload(anime),
                    roles=sorted({role.character_name for role in voice_roles}),
                    roleCategories=["voice_actor"],
                )
            )
        return sorted(connections, key=lambda item: (item.year or 0, item.titleEnglish or item.titleRomaji), reverse=True)

    def _anime_records(self, session: Session, anime_ids: list[int]) -> list[Anime]:
        if not anime_ids:
            return []
        return session.exec(select(Anime).where(Anime.id.in_(set(anime_ids)))).all()

    def _anime_result_payload(self, anime: Anime) -> dict[str, Any]:
        return {
            "id": anime.id,
            "titleRomaji": anime.title_romaji,
            "titleEnglish": anime.title_english,
            "titleNative": anime.title_native,
            "coverImageUrl": anime.cover_image_url,
            "year": anime.year,
            "format": anime.format,
        }

    def _append_unique(self, values: list[str], value: str) -> list[str]:
        if value in values:
            return values
        return [*values, value]

    def _rank_staff_roles(self, roles: list[str]) -> list[str]:
        return sorted(set(roles), key=lambda role: (-score_role(role).weight, role.lower()))

    def _staff_edge_label(self, roles: list[str]) -> str:
        ranked_roles = self._rank_staff_roles(roles)
        if not ranked_roles:
            return "Staff"
        if len(ranked_roles) == 1:
            return ranked_roles[0]
        return f"{ranked_roles[0]} +{len(ranked_roles) - 1}"

    def _connection_to_search_result(self, connection: RelatedConnection) -> AnimeSearchResult:
        return AnimeSearchResult(
            id=connection.id,
            titleRomaji=connection.titleRomaji,
            titleEnglish=connection.titleEnglish,
            titleNative=connection.titleNative,
            coverImageUrl=connection.coverImageUrl,
            year=connection.year,
            format=connection.format,
        )

    def _top_staff_roles(self, roles: list[AnimeStaffRole]) -> list[NodeTopRole]:
        counts: dict[tuple[str, str], int] = defaultdict(int)
        for role in roles:
            counts[(role.role, role.role_category)] += 1
        ranked = sorted(counts.items(), key=lambda item: (item[1], item[0][0]), reverse=True)
        return [NodeTopRole(label=label, category=category, count=count) for (label, category), count in ranked[:6]]

    def _top_studio_roles(self, roles: list[AnimeStudio]) -> list[NodeTopRole]:
        main_count = sum(1 for role in roles if role.is_main)
        supporting_count = len(roles) - main_count
        top_roles: list[NodeTopRole] = []
        if main_count:
            top_roles.append(NodeTopRole(label="Main studio", category="studio", count=main_count))
        if supporting_count:
            top_roles.append(NodeTopRole(label="Studio", category="studio", count=supporting_count))
        return top_roles

    def _top_voice_actor_roles(self, roles: list[AnimeVoiceActorRole]) -> list[NodeTopRole]:
        counts: dict[str, int] = defaultdict(int)
        for role in roles:
            counts[role.character_name] += 1
        ranked = sorted(counts.items(), key=lambda item: (item[1], item[0]), reverse=True)
        return [NodeTopRole(label=label, category="voice_actor", count=count) for label, count in ranked[:6]]
