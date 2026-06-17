import time

import pytest

from app.anilist import ANILIST_ENDPOINT, AniListClient, AniListError


def anilist_client(**kwargs):
    return AniListClient(min_request_interval=0, **kwargs)


@pytest.mark.asyncio
async def test_search_anime_normalizes_results(httpx_mock):
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Page": {
                    "media": [
                        {
                            "id": 1,
                            "title": {"romaji": "Cowboy Bebop", "english": "Cowboy Bebop", "native": "カウボーイビバップ"},
                            "coverImage": {"large": "cover.jpg", "medium": "cover-small.jpg"},
                            "startDate": {"year": 1998},
                            "format": "TV",
                        }
                    ]
                }
            }
        },
    )

    results = await anilist_client().search_anime("bebop")

    assert results == [
        {
            "id": 1,
            "titleRomaji": "Cowboy Bebop",
            "titleEnglish": "Cowboy Bebop",
            "titleNative": "カウボーイビバップ",
            "coverImageUrl": "cover.jpg",
            "bannerImageUrl": None,
            "year": 1998,
            "format": "TV",
            "episodes": None,
            "status": None,
            "description": None,
            "siteUrl": None,
            "averageScore": None,
            "popularity": None,
            "favourites": None,
        }
    ]


@pytest.mark.asyncio
async def test_anilist_retries_transient_error(httpx_mock):
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=500)
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Page": {
                    "media": [
                        {
                            "id": 2,
                            "title": {"romaji": "Monster", "english": None, "native": None},
                            "coverImage": {},
                            "startDate": {},
                            "format": "TV",
                        }
                    ]
                }
            }
        },
    )

    results = await anilist_client().search_anime("monster")

    assert results[0]["id"] == 2


@pytest.mark.asyncio
async def test_anilist_reports_transient_status_after_retries(httpx_mock):
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=429, text="Too Many Requests")
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=429, text="Too Many Requests")
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=429, text="Too Many Requests")

    with pytest.raises(AniListError) as exc_info:
        await anilist_client(transient_retry_delay=0, error_retry_delay=0).search_anime("busy")

    message = str(exc_info.value)
    assert "AniList request failed: AniList rate limited: HTTP 429" in message
    assert "None" not in message


@pytest.mark.asyncio
async def test_anilist_reports_non_json_response(httpx_mock):
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=403, text="Forbidden")
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=403, text="Forbidden")
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=403, text="Forbidden")

    with pytest.raises(AniListError) as exc_info:
        await anilist_client(transient_retry_delay=0, error_retry_delay=0).search_anime("blocked")

    assert "AniList returned a non-JSON response: HTTP 403: Forbidden" in str(exc_info.value)


@pytest.mark.asyncio
async def test_fetch_studios_normalizes_non_paginated_connection(httpx_mock):
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Media": {
                    "studios": {
                        "edges": [
                            {
                                "isMain": True,
                                "node": {
                                    "id": 11,
                                    "name": "Bones",
                                    "siteUrl": "https://anilist.co/studio/11",
                                },
                            }
                        ]
                    }
                }
            }
        },
    )

    results = await anilist_client().fetch_studios(1)

    assert results == [
        {
            "id": 11,
            "name": "Bones",
            "siteUrl": "https://anilist.co/studio/11",
            "favourites": None,
            "isMain": True,
        }
    ]


@pytest.mark.asyncio
async def test_fetch_voice_actors_normalizes_japanese_cast_and_pagination(httpx_mock):
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Media": {
                    "characters": {
                        "pageInfo": {"hasNextPage": True},
                        "edges": [
                            {
                                "node": {
                                    "id": 1,
                                    "name": {"full": "Spike Spiegel", "native": None},
                                    "image": {"large": "spike.jpg", "medium": "spike-small.jpg"},
                                },
                                "voiceActors": [
                                    {
                                        "id": 22,
                                        "name": {"full": "Kouichi Yamadera", "native": "山寺宏一"},
                                        "image": {"large": "actor.jpg", "medium": None},
                                        "siteUrl": "https://anilist.co/staff/22",
                                        "favourites": 9000,
                                    }
                                ],
                            }
                        ],
                    }
                }
            }
        },
    )
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Media": {
                    "characters": {
                        "pageInfo": {"hasNextPage": False},
                        "edges": [
                            {
                                "node": {"id": 2, "name": {"full": None, "native": None}, "image": {}},
                                "voiceActors": [
                                    {
                                        "id": 23,
                                        "name": {"full": None, "native": None},
                                        "image": {},
                                        "siteUrl": None,
                                        "favourites": None,
                                    },
                                    {"name": {"full": "Missing Id"}},
                                ],
                            }
                        ],
                    }
                }
            }
        },
    )

    results = await anilist_client().fetch_voice_actors(1)

    assert results == [
        {
            "id": 22,
            "nameFull": "Kouichi Yamadera",
            "nameNative": "山寺宏一",
            "imageUrl": "actor.jpg",
            "siteUrl": "https://anilist.co/staff/22",
            "favourites": 9000,
            "characterName": "Spike Spiegel",
            "characterImageUrl": "spike.jpg",
        },
        {
            "id": 23,
            "nameFull": "Unknown voice actor",
            "nameNative": None,
            "imageUrl": None,
            "siteUrl": None,
            "favourites": None,
            "characterName": "Unknown character",
            "characterImageUrl": None,
        },
    ]


@pytest.mark.asyncio
async def test_fetch_popular_staff_filters_by_primary_occupation(httpx_mock):
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Page": {
                    "pageInfo": {"hasNextPage": True},
                    "staff": [
                        {
                            "id": 1,
                            "name": {"full": "Popular Voice", "native": None},
                            "image": {},
                            "siteUrl": None,
                            "favourites": 20000,
                            "primaryOccupations": ["Voice Actor"],
                        },
                        {
                            "id": 2,
                            "name": {"full": "Popular Director", "native": "監督"},
                            "image": {"large": "director.jpg", "medium": None},
                            "siteUrl": "https://anilist.co/staff/2",
                            "favourites": 12000,
                            "primaryOccupations": ["Director", "Writer"],
                        },
                    ],
                }
            }
        },
    )
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Page": {
                    "pageInfo": {"hasNextPage": False},
                    "staff": [
                        {
                            "id": 3,
                            "name": {"full": None, "native": None},
                            "image": {"large": None, "medium": "assistant.jpg"},
                            "siteUrl": None,
                            "favourites": None,
                            "primaryOccupations": ["Assistant Director"],
                        },
                    ],
                }
            }
        },
    )

    results = await anilist_client().fetch_popular_staff(kind="Director", limit=2)

    assert results == [
        {
            "id": 2,
            "nameFull": "Popular Director",
            "nameNative": "監督",
            "imageUrl": "director.jpg",
            "siteUrl": "https://anilist.co/staff/2",
            "favourites": 12000,
            "primaryOccupations": ["Director", "Writer"],
        },
        {
            "id": 3,
            "nameFull": "Unknown staff",
            "nameNative": None,
            "imageUrl": "assistant.jpg",
            "siteUrl": None,
            "favourites": None,
            "primaryOccupations": ["Assistant Director"],
        },
    ]


@pytest.mark.asyncio
async def test_fetch_popular_staff_can_include_all_occupations(httpx_mock):
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Page": {
                    "pageInfo": {"hasNextPage": False},
                    "staff": [
                        {
                            "id": 1,
                            "name": {"full": "Popular Voice", "native": None},
                            "image": {},
                            "siteUrl": None,
                            "favourites": 20000,
                            "primaryOccupations": ["Voice Actor"],
                        },
                        {
                            "id": 2,
                            "name": {"full": "Popular Director", "native": None},
                            "image": {},
                            "siteUrl": None,
                            "favourites": 12000,
                            "primaryOccupations": ["Director"],
                        },
                    ],
                }
            }
        },
    )

    results = await anilist_client().fetch_popular_staff(kind="All Staff", limit=2)

    assert [staff["nameFull"] for staff in results] == ["Popular Voice", "Popular Director"]


@pytest.mark.asyncio
async def test_fetch_popular_staff_matches_composer_music_occupation(httpx_mock):
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Page": {
                    "pageInfo": {"hasNextPage": False},
                    "staff": [
                        {
                            "id": 1,
                            "name": {"full": "Music Person", "native": None},
                            "image": {},
                            "siteUrl": None,
                            "favourites": 20000,
                            "primaryOccupations": ["Music"],
                        },
                        {
                            "id": 2,
                            "name": {"full": "Popular Director", "native": None},
                            "image": {},
                            "siteUrl": None,
                            "favourites": 12000,
                            "primaryOccupations": ["Director"],
                        },
                    ],
                }
            }
        },
    )

    results = await anilist_client().fetch_popular_staff(kind="Composer", limit=2)

    assert [staff["nameFull"] for staff in results] == ["Music Person"]


@pytest.mark.asyncio
async def test_fetch_staff_directed_anime_filters_dedupes_and_sorts_by_popularity(httpx_mock):
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Staff": {
                    "staffMedia": {
                        "pageInfo": {"hasNextPage": False},
                        "edges": [
                            {
                                "staffRole": "Script",
                                "node": {
                                    "id": 1,
                                    "title": {"romaji": "Written Anime", "english": None, "native": None},
                                    "coverImage": {},
                                    "startDate": {},
                                    "format": "TV",
                                    "popularity": 500,
                                },
                            },
                            {
                                "staffRole": "Episode Director",
                                "node": {
                                    "id": 2,
                                    "title": {"romaji": "Less Popular Directed", "english": None, "native": None},
                                    "coverImage": {"large": "less.jpg", "medium": None},
                                    "startDate": {"year": 2001},
                                    "format": "MOVIE",
                                    "popularity": 100,
                                },
                            },
                            {
                                "staffRole": "Director",
                                "node": {
                                    "id": 3,
                                    "title": {"romaji": "Popular Directed", "english": "Popular", "native": None},
                                    "coverImage": {"large": "popular.jpg", "medium": None},
                                    "startDate": {"year": 2002},
                                    "format": "TV",
                                    "popularity": 1000,
                                },
                            },
                            {
                                "staffRole": "Chief Director",
                                "node": {
                                    "id": 3,
                                    "title": {"romaji": "Popular Directed", "english": "Popular", "native": None},
                                    "coverImage": {"large": "popular.jpg", "medium": None},
                                    "startDate": {"year": 2002},
                                    "format": "TV",
                                    "popularity": 1000,
                                },
                            },
                        ],
                    }
                }
            }
        },
    )

    results = await anilist_client().fetch_staff_directed_anime(staff_id=10)

    assert [anime["id"] for anime in results] == [3, 2]
    assert results[0]["roles"] == ["Director", "Chief Director"]
    assert results[0]["popularity"] == 1000
    assert results[1]["roles"] == ["Episode Director"]


@pytest.mark.asyncio
async def test_anilist_raises_for_graphql_errors(httpx_mock):
    httpx_mock.add_response(url=ANILIST_ENDPOINT, json={"errors": [{"message": "bad"}]})
    httpx_mock.add_response(url=ANILIST_ENDPOINT, json={"errors": [{"message": "bad"}]})
    httpx_mock.add_response(url=ANILIST_ENDPOINT, json={"errors": [{"message": "bad"}]})

    with pytest.raises(AniListError):
        await anilist_client().search_anime("bad")


@pytest.mark.asyncio
async def test_anilist_throttles_consecutive_graphql_requests(httpx_mock):
    httpx_mock.add_response(url=ANILIST_ENDPOINT, json={"data": {"Page": {"media": []}}})
    httpx_mock.add_response(url=ANILIST_ENDPOINT, json={"data": {"Page": {"media": []}}})
    client = AniListClient(min_request_interval=0.01)

    start = time.monotonic()
    await client.search_anime("first")
    await client.search_anime("second")

    assert time.monotonic() - start >= 0.01


@pytest.mark.asyncio
async def test_anilist_honors_retry_after_on_rate_limit(httpx_mock):
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=429, headers={"Retry-After": "0.01"}, text="Too Many Requests")
    httpx_mock.add_response(url=ANILIST_ENDPOINT, json={"data": {"Page": {"media": []}}})
    client = AniListClient(transient_retry_delay=0, error_retry_delay=0, min_request_interval=0)

    start = time.monotonic()
    results = await client.search_anime("retry")

    assert results == []
    assert time.monotonic() - start >= 0.01
