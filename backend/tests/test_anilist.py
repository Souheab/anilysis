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
async def test_anilist_raises_for_graphql_errors(httpx_mock):
    httpx_mock.add_response(url=ANILIST_ENDPOINT, json={"errors": [{"message": "bad"}]})
    httpx_mock.add_response(url=ANILIST_ENDPOINT, json={"errors": [{"message": "bad"}]})
    httpx_mock.add_response(url=ANILIST_ENDPOINT, json={"errors": [{"message": "bad"}]})

    with pytest.raises(AniListError):
        await AniListClient().search_anime("bad")
