"""Documented PSA contract fixtures; no real certificates or provider requests."""

import io
import json
from urllib.error import HTTPError, URLError

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from slabtrak import certificates
from slabtrak.certificates import CertificateInput, fetch_psa_payload, psa_proposal
from slabtrak.config import Settings
from slabtrak.models import CardDefinition, OwnedCopy
from tests.test_inventory import access

TEST_TOKEN = "test-psa-token-never-returned"
CERTIFICATION = "00000001"


def payload(**changes):
    # Field names come from PublicPSACert in PSA's official public Swagger schema.
    return {
        "PSACert": {
            "CertNumber": CERTIFICATION,
            "Subject": "Example Player",
            "Year": "2020",
            "Category": "BASKETBALL CARDS",
            "Brand": "Example Chrome",
            "CardNumber": "42",
            "Variety": "REFRACTOR",
            "CardGrade": "9",
            "GradeDescription": "MINT 9",
            **changes,
        }
    }


@pytest.fixture(autouse=True)
def configured_token(monkeypatch):
    monkeypatch.setenv("PSA_API_TOKEN", TEST_TOKEN)


def test_lookup_authenticated_csrf_transient_and_token_private(client, app, monkeypatch):
    calls = []

    def provider(token, certification):
        calls.append((token, certification))
        return payload()

    monkeypatch.setattr(certificates, "fetch_psa_payload", provider)
    assert client.get("/api/certificates/status").status_code == 401
    body = {"grader": "PSA", "certification": CERTIFICATION}
    assert client.post("/api/certificates/lookup", json=body).status_code == 401
    access(client)
    status = client.get("/api/certificates/status")
    assert status.json()["graders"][0] == {
        "grader": "PSA",
        "supported": True,
        "configured": True,
        "verification_url": "https://www.psacard.com/cert/",
    }
    csrf = client.headers.pop("x-csrf-token")
    assert client.post("/api/certificates/lookup", json=body).status_code == 403
    client.headers["x-csrf-token"] = csrf
    assert (
        client.post(
            "/api/certificates/lookup", json=body, headers={"Origin": "https://evil.test"}
        ).status_code
        == 403
    )
    response = client.post("/api/certificates/lookup", json=body)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert TEST_TOKEN not in response.text + status.text
    assert calls == [(TEST_TOKEN, CERTIFICATION)]
    result = response.json()
    assert result["state"] == "found"
    assert result["draft"] == {
        "subject": "Example Player",
        "year": 2020,
        "sport": "Basketball",
        "manufacturer": "",
        "set_name": "Example Chrome",
        "card_number": "42",
        "parallel": "REFRACTOR",
        "condition": "graded",
        "grader": "PSA",
        "grade": "9",
        "certification": CERTIFICATION,
    }
    assert result["verification_url"] == "https://www.psacard.com/cert/00000001"
    assert "memorabilia" in result["notice"]
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(OwnedCopy)) == 0
        assert db.scalar(select(func.count()).select_from(CardDefinition)) == 0


@pytest.mark.parametrize("grader", ["PSA", "BGS", "SGC", "CGC", "TAG"])
def test_unconfigured_and_unsupported_return_manual_fallback(grader, monkeypatch):
    settings = Settings(database_url="postgresql+psycopg://unused", psa_api_token=" ")
    app = FastAPI()
    app.include_router(certificates.certificates_router(settings, lambda: (), lambda: ()))
    monkeypatch.setattr(
        certificates, "fetch_psa_payload", lambda *_: pytest.fail("No provider request expected")
    )
    with TestClient(app) as client:
        assert all(
            not item["configured"]
            for item in client.get("/api/certificates/status").json()["graders"]
        )
        response = client.post(
            "/api/certificates/lookup", json={"grader": grader, "certification": CERTIFICATION}
        )
    assert response.status_code == 200
    assert response.json()["state"] == "unavailable"
    assert response.json()["draft"] is None
    assert response.json()["verification_url"].startswith("https://")


@pytest.mark.parametrize(
    "body",
    [
        {"grader": "unknown", "certification": CERTIFICATION},
        {"grader": "PSA", "certification": "abc12345"},
        {"grader": "PSA", "certification": "123"},
        {"grader": "PSA", "certification": "1" * 13},
        {"grader": "PSA", "certification": "12345678/../../"},
        {"grader": "PSA", "certification": "12345678\nhello"},
        {"grader": "BGS", "certification": "x" * 101},
        {"grader": "PSA", "certification": CERTIFICATION, "api_token": TEST_TOKEN},
    ],
)
def test_invalid_lookup_cannot_reach_provider(client, monkeypatch, body):
    access(client)
    monkeypatch.setattr(
        certificates, "fetch_psa_payload", lambda *_: pytest.fail("No provider request expected")
    )
    assert client.post("/api/certificates/lookup", json=body).status_code == 422


def test_schema_and_legacy_response_contracts_and_year_ranges():
    data = CertificateInput(grader=" psa ", certification=CERTIFICATION)
    record = payload(Year="2020-21", ItemStatus="Review label")
    result = psa_proposal(record, data)
    assert result.draft.year is None
    assert "Review label" in result.notice
    record.update(IsValidRequest=True, ServerMessage="Request successful")
    assert psa_proposal(record, data).state == "found"
    assert (
        psa_proposal({"IsValidRequest": True, "ServerMessage": "No data found"}, data).state
        == "not_found"
    )


@pytest.mark.parametrize(
    ("category", "sport"),
    [
        ("BASKETBALL CARDS", "Basketball"),
        ("FOOTBALL CARDS", "Football"),
        (" basketball cards ", "Basketball"),
        ("BASEBALL CARDS", ""),
        ("BASKETBALL AUTOGRAPHS", ""),
        ("", ""),
        (None, ""),
    ],
)
def test_only_recognized_exact_category_labels_propose_sport(category, sport):
    result = psa_proposal(
        payload(Category=category),
        CertificateInput(grader="PSA", certification=CERTIFICATION),
    )
    assert result.draft.sport == sport
    assert result.draft.manufacturer == ""


@pytest.mark.parametrize(
    "record",
    [
        {},
        {"DNACert": {"CertNumber": CERTIFICATION}},
        {"IsValidRequest": False, "ServerMessage": "Invalid CertNo"},
        {**payload(), "ServerMessage": "Private upstream error"},
        {**payload(), "IsValidRequest": "true"},
        payload(CertNumber="99999999"),
        payload(CertNumber=1),
        payload(Subject=None),
        payload(Subject="x" * 201),
        payload(Subject="bad\nvalue"),
        payload(Brand={"name": "Invalid"}),
        payload(CardGrade="x" * 21),
    ],
)
def test_invalid_error_or_mismatched_records_cannot_produce_draft(record):
    with pytest.raises(HTTPException) as error:
        psa_proposal(record, CertificateInput(grader="PSA", certification=CERTIFICATION))
    assert error.value.status_code == 502
    assert "Private upstream error" not in str(error.value.detail)


def test_transport_fixed_https_host_credential_header_timeout_and_size_bound(monkeypatch):
    calls = []
    response = io.BytesIO(json.dumps(payload()).encode())

    class Opener:
        def open(self, request, timeout):
            calls.append((request, timeout))
            return response

    def opener(handler):
        assert isinstance(handler, certificates.NoRedirects)
        assert handler.redirect_request(None, None, 302, "", {}, "https://evil.test") is None
        return Opener()

    monkeypatch.setattr(certificates, "build_opener", opener)
    assert fetch_psa_payload(TEST_TOKEN, CERTIFICATION) == payload()
    request, timeout = calls[0]
    assert request.full_url == certificates.PSA_ENDPOINT + CERTIFICATION
    assert request.get_header("Authorization") == f"bearer {TEST_TOKEN}"
    assert timeout == 10
    with pytest.raises(HTTPException):
        fetch_psa_payload(TEST_TOKEN, "https://evil.test")
    assert len(calls) == 1


@pytest.mark.parametrize(
    ("failure", "status"),
    [
        (HTTPError("https://private.test", 401, "private", {}, None), 502),
        (HTTPError("https://private.test", 403, "private", {}, None), 502),
        (HTTPError("https://private.test", 429, "private", {}, None), 429),
        (HTTPError("https://private.test", 302, "private", {}, None), 502),
        (HTTPError("https://private.test", 500, "private", {}, None), 502),
        (URLError("private"), 503),
        (TimeoutError("private"), 503),
    ],
)
def test_transport_failures_are_sanitized(monkeypatch, failure, status):
    class Opener:
        def open(self, *args, **kwargs):
            raise failure

    monkeypatch.setattr(certificates, "build_opener", lambda *_: Opener())
    with pytest.raises(HTTPException) as error:
        fetch_psa_payload(TEST_TOKEN, CERTIFICATION)
    assert error.value.status_code == status
    assert "private" not in str(error.value.detail)
    assert TEST_TOKEN not in str(error.value.detail)


def test_access_approval_rejection_is_distinct_from_bad_token_and_hides_body(monkeypatch):
    class Opener:
        def open(self, *args, **kwargs):
            raise HTTPError(
                "https://api.psacard.com/private",
                403,
                "Forbidden",
                {},
                io.BytesIO(b'{"Message":"Access to this API is limited to approved customers."}'),
            )

    monkeypatch.setattr(certificates, "build_opener", lambda *_: Opener())
    with pytest.raises(HTTPException) as error:
        fetch_psa_payload(TEST_TOKEN, CERTIFICATION)
    assert error.value.status_code == 502
    assert error.value.detail == (
        "PSA API access requires an approved account. Check your PSA Public API access."
    )
    assert "Message" not in error.value.detail
    assert "limited to approved customers" not in error.value.detail
    assert TEST_TOKEN not in error.value.detail


@pytest.mark.parametrize(
    "body", [b"[]", b"null", b"not json", b"\xff", b"x" * (certificates.MAX_RESPONSE_BYTES + 1)]
)
def test_invalid_or_oversized_transport_body(monkeypatch, body):
    class Opener:
        def open(self, *args, **kwargs):
            return io.BytesIO(body)

    monkeypatch.setattr(certificates, "build_opener", lambda *_: Opener())
    with pytest.raises(HTTPException) as error:
        fetch_psa_payload(TEST_TOKEN, CERTIFICATION)
    assert error.value.status_code == 502
