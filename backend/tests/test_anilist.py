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
async def test_search_staff_normalizes_results(httpx_mock):
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Page": {
                    "staff": [
                        {
                            "id": 9,
                            "name": {"full": "Sayo Yamamoto", "native": "山本沙代"},
                            "image": {"large": "staff.jpg", "medium": None},
                            "siteUrl": "https://anilist.co/staff/9",
                            "favourites": 1000,
                            "primaryOccupations": ["Director"],
                        }
                    ]
                }
            }
        },
    )

    results = await anilist_client().search_staff("sayo")

    assert results == [
        {
            "id": 9,
            "nameFull": "Sayo Yamamoto",
            "nameNative": "山本沙代",
            "imageUrl": "staff.jpg",
            "siteUrl": "https://anilist.co/staff/9",
            "favourites": 1000,
            "primaryOccupations": ["Director"],
        }
    ]


@pytest.mark.asyncio
async def test_search_studios_normalizes_results(httpx_mock):
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Page": {
                    "studios": [
                        {
                            "id": 11,
                            "name": "Bones",
                            "siteUrl": "https://anilist.co/studio/11",
                            "favourites": 5000,
                            "isAnimationStudio": True,
                        }
                    ]
                }
            }
        },
    )

    results = await anilist_client().search_studios("bones")

    assert results == [
        {
            "id": 11,
            "name": "Bones",
            "siteUrl": "https://anilist.co/studio/11",
            "favourites": 5000,
            "isAnimationStudio": True,
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
async def test_fetch_studio_entity_normalizes_related_anime(httpx_mock):
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Studio": {
                    "id": 11,
                    "name": "Bones",
                    "siteUrl": "https://anilist.co/studio/11",
                    "favourites": 5000,
                    "isAnimationStudio": True,
                    "media": {
                        "pageInfo": {"hasNextPage": False},
                        "edges": [
                            {
                                "isMain": True,
                                "node": {
                                    "id": 1,
                                    "title": {"romaji": "Mob Psycho 100", "english": None, "native": None},
                                    "coverImage": {"large": "mob.jpg", "medium": None},
                                    "bannerImage": None,
                                    "startDate": {"year": 2016},
                                    "format": "TV",
                                    "episodes": 12,
                                    "status": "FINISHED",
                                    "description": None,
                                    "siteUrl": None,
                                    "averageScore": 86,
                                    "popularity": 20000,
                                    "favourites": 4000,
                                },
                            }
                        ],
                    },
                }
            }
        },
    )

    result = await anilist_client().fetch_studio_entity(11)

    assert result["name"] == "Bones"
    assert result["relatedAnime"][0]["titleRomaji"] == "Mob Psycho 100"
    assert result["relatedAnime"][0]["roles"] == ["Main studio"]
    assert result["relatedAnime"][0]["isMain"] is True


@pytest.mark.asyncio
async def test_fetch_staff_entity_uses_character_media_for_voice_actor(httpx_mock):
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "Staff": {
                    "id": 22,
                    "name": {"full": "Kouichi Yamadera", "native": None},
                    "image": {"large": "actor.jpg", "medium": None},
                    "siteUrl": "https://anilist.co/staff/22",
                    "favourites": 9000,
                    "primaryOccupations": ["Voice Actor"],
                    "staffMedia": {"pageInfo": {"hasNextPage": False}, "edges": []},
                    "characterMedia": {
                        "pageInfo": {"hasNextPage": False},
                        "edges": [
                            {
                                "characterRole": "MAIN",
                                "characters": [{"id": 1, "name": {"full": "Spike Spiegel", "native": None}}],
                                "node": {
                                    "id": 1,
                                    "title": {"romaji": "Cowboy Bebop", "english": None, "native": None},
                                    "coverImage": {},
                                    "bannerImage": None,
                                    "startDate": {"year": 1998},
                                    "format": "TV",
                                    "episodes": 26,
                                    "status": "FINISHED",
                                    "description": None,
                                    "siteUrl": None,
                                    "averageScore": 86,
                                    "popularity": 30000,
                                    "favourites": 7000,
                                },
                            }
                        ],
                    },
                }
            }
        },
    )

    result = await anilist_client().fetch_staff_entity(22, voice_actor=True)

    assert result["nameFull"] == "Kouichi Yamadera"
    assert result["relatedAnime"][0]["roles"] == ["Spike Spiegel"]


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
async def test_fetch_popular_staff_can_exclude_voice_actor_occupations(httpx_mock):
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
                        {
                            "id": 3,
                            "name": {"full": "Writer Actor", "native": None},
                            "image": {},
                            "siteUrl": None,
                            "favourites": 9000,
                            "primaryOccupations": ["Script", "Actor"],
                        },
                    ],
                }
            }
        },
    )

    results = await anilist_client().fetch_popular_staff(kind="Non-Voice Staff", limit=3)

    assert [staff["nameFull"] for staff in results] == ["Popular Director", "Writer Actor"]


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
async def test_fetch_user_anime_profile_normalizes_entries(httpx_mock):
    httpx_mock.add_response(
        url=ANILIST_ENDPOINT,
        json={
            "data": {
                "User": {
                    "id": 7,
                    "name": "taste_user",
                    "avatar": {"large": "avatar.jpg", "medium": None},
                    "bannerImage": "banner.jpg",
                    "siteUrl": "https://anilist.co/user/taste_user",
                },
                "MediaListCollection": {
                    "lists": [
                        {
                            "status": "COMPLETED",
                            "entries": [
                                {
                                    "id": 100,
                                    "status": "COMPLETED",
                                    "score": 92,
                                    "progress": 26,
                                    "updatedAt": 1710000000,
                                    "media": {
                                        "id": 1,
                                        "title": {"romaji": "Space Show", "english": None, "native": None},
                                        "coverImage": {"large": "cover.jpg", "medium": None},
                                        "bannerImage": None,
                                        "startDate": {"year": 1998},
                                        "format": "TV",
                                        "episodes": 26,
                                        "status": "FINISHED",
                                        "siteUrl": "https://anilist.co/anime/1",
                                        "averageScore": 88,
                                        "popularity": 10000,
                                        "favourites": 1000,
                                        "genres": ["Action", "Sci-Fi"],
                                        "tags": [{"name": "Space", "rank": 92}, {"name": "Spoiler", "rank": 20}],
                                        "studios": {"edges": [{"isMain": True, "node": {"id": 9, "name": "Bones"}}]},
                                        "staff": {
                                            "edges": [
                                                {
                                                    "role": "Director",
                                                    "node": {
                                                        "id": 20,
                                                        "name": {"full": "Creative Lead"},
                                                        "image": {"large": "staff.jpg", "medium": None},
                                                        "siteUrl": "https://anilist.co/staff/20",
                                                    },
                                                },
                                                {
                                                    "role": "Producer",
                                                    "node": {
                                                        "id": 21,
                                                        "name": {"full": "Business Lead"},
                                                        "image": {},
                                                        "siteUrl": None,
                                                    },
                                                },
                                            ]
                                        },
                                    },
                                },
                                {
                                    "id": 100,
                                    "status": "COMPLETED",
                                    "score": 92,
                                    "progress": 26,
                                    "updatedAt": 1710000000,
                                    "media": {
                                        "id": 1,
                                        "title": {"romaji": "Duplicate", "english": None, "native": None},
                                        "coverImage": {},
                                        "startDate": {},
                                        "format": "TV",
                                    },
                                },
                            ],
                        }
                    ]
                },
            }
        },
    )

    profile = await anilist_client().fetch_user_anime_profile("taste_user")

    assert profile["user"]["name"] == "taste_user"
    assert len(profile["entries"]) == 1
    assert profile["entries"][0]["titleRomaji"] == "Space Show"
    assert profile["entries"][0]["tags"] == ["Space"]
    assert profile["entries"][0]["studios"] == ["Bones"]
    assert profile["entries"][0]["staff"] == [
        {
            "id": 20,
            "name": "Creative Lead",
            "imageUrl": "staff.jpg",
            "siteUrl": "https://anilist.co/staff/20",
            "roles": ["Director"],
        }
    ]


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
