import pytest

from app.anilist import ANILIST_ENDPOINT, AniListClient, AniListError


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

    results = await AniListClient().search_anime("bebop")

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

    results = await AniListClient().search_anime("monster")

    assert results[0]["id"] == 2


@pytest.mark.asyncio
async def test_anilist_reports_transient_status_after_retries(httpx_mock):
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=429, text="Too Many Requests")
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=429, text="Too Many Requests")
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=429, text="Too Many Requests")

    with pytest.raises(AniListError) as exc_info:
        await AniListClient(transient_retry_delay=0, error_retry_delay=0).search_anime("busy")

    message = str(exc_info.value)
    assert "AniList request failed: AniList rate limited: HTTP 429" in message
    assert "None" not in message


@pytest.mark.asyncio
async def test_anilist_reports_non_json_response(httpx_mock):
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=403, text="Forbidden")
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=403, text="Forbidden")
    httpx_mock.add_response(url=ANILIST_ENDPOINT, status_code=403, text="Forbidden")

    with pytest.raises(AniListError) as exc_info:
        await AniListClient(transient_retry_delay=0, error_retry_delay=0).search_anime("blocked")

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

    results = await AniListClient().fetch_studios(1)

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

    results = await AniListClient().fetch_voice_actors(1)

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
async def test_anilist_raises_for_graphql_errors(httpx_mock):
    httpx_mock.add_response(url=ANILIST_ENDPOINT, json={"errors": [{"message": "bad"}]})
    httpx_mock.add_response(url=ANILIST_ENDPOINT, json={"errors": [{"message": "bad"}]})
    httpx_mock.add_response(url=ANILIST_ENDPOINT, json={"errors": [{"message": "bad"}]})

    with pytest.raises(AniListError):
        await AniListClient().search_anime("bad")
