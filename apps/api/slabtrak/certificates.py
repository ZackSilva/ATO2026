"""Transient certificate proposals from documented grader APIs; never save collection data."""

import json
import re
from typing import Annotated, Literal
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from slabtrak.config import Settings

PSA_ENDPOINT = "https://api.psacard.com/publicapi/cert/GetByCertNumber/"
MAX_RESPONSE_BYTES = 64 * 1024
VERIFICATION_URLS = {
    "PSA": "https://www.psacard.com/cert/",
    "BGS": "https://www.beckett.com/",
    "SGC": "https://www.gosgc.com/cert-code-lookup",
    "CGC": "https://www.cgccards.com/certlookup/",
    "TAG": "https://taggrading.com/pages/cert-search",
}
PSA_SPORTS = {"BASKETBALL CARDS": "Basketball", "FOOTBALL CARDS": "Football"}
NOTICE = (
    "PSA-reported certificate details; review the physical label and card before applying. "
    "Brand is proposed as set name and Variety as parallel; manufacturer is unknown. "
    "Review year, grade qualifiers, autograph, memorabilia and serial/print-run details manually. "
    "This lookup does not establish ownership, physical authenticity or value, and does not "
    "link a catalog card or save a collection record."
)
Grader = Literal["PSA", "BGS", "SGC", "CGC", "TAG"]


class CertificateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    grader: Grader
    certification: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9-]+$")

    @field_validator("grader", mode="before")
    @classmethod
    def canonical_grader(cls, value):
        return value.strip().upper() if isinstance(value, str) else value

    @model_validator(mode="after")
    def psa_number(self):
        if self.grader == "PSA" and not re.fullmatch(r"[0-9]{6,12}", self.certification):
            raise ValueError("PSA certification numbers must contain 6 to 12 digits.")
        return self


class CertificateDraft(BaseModel):
    subject: str
    year: int | None
    sport: str = ""
    manufacturer: str = ""
    set_name: str
    card_number: str
    parallel: str
    condition: Literal["graded"] = "graded"
    grader: Literal["PSA"] = "PSA"
    grade: str
    certification: str


class CertificateOutput(BaseModel):
    state: Literal["found", "not_found", "unavailable"]
    grader: Grader
    certification: str
    draft: CertificateDraft | None = None
    verification_url: str
    notice: str


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        # Never forward the bearer credential to a redirect destination.
        return None


def fetch_psa_payload(token: str, certification: str) -> dict:
    # Defense in depth: this function never accepts a URL or an arbitrary path.
    if not re.fullmatch(r"[0-9]{6,12}", certification):
        raise HTTPException(422, "Invalid PSA certification number.")
    request = Request(
        PSA_ENDPOINT + certification,
        headers={"Authorization": f"bearer {token}", "Accept": "application/json"},
    )
    try:
        with build_opener(NoRedirects()).open(request, timeout=10) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as error:
        if error.code == 429:
            raise HTTPException(429, "PSA lookup limit reached. Try again later.") from None
        if error.code == 401:
            raise HTTPException(
                502, "PSA rejected the server token. Check its account access."
            ) from None
        if error.code == 403:
            raise HTTPException(
                502,
                "PSA API access requires an approved account. Check your PSA Public API access.",
            ) from None
        raise HTTPException(502, "PSA lookup is temporarily unavailable.") from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise HTTPException(503, "PSA could not be reached. Try again later.") from None
    if len(body) > MAX_RESPONSE_BYTES:
        raise HTTPException(502, "PSA returned an oversized response.")
    try:
        payload = json.loads(body)
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise HTTPException(502, "PSA returned an invalid response.") from None
    if not isinstance(payload, dict):
        raise HTTPException(502, "PSA returned an invalid response.")
    return payload


def text_field(record: dict, key: str, maximum: int) -> str:
    value = record.get(key)
    if value is None:
        return ""
    if (
        not isinstance(value, str)
        or len(value.strip()) > maximum
        or any(ord(char) < 32 or ord(char) == 127 for char in value)
    ):
        raise HTTPException(502, "PSA returned an invalid card response.")
    return value.strip()


def psa_proposal(payload: dict, data: CertificateInput) -> CertificateOutput:
    result = {
        "grader": data.grader,
        "certification": data.certification,
        "verification_url": VERIFICATION_URLS["PSA"] + data.certification,
    }
    # PSA's older documentation describes these flags; its current Swagger omits them.
    # If provided, they must agree with the card record, rather than masking an error.
    if "IsValidRequest" in payload and payload["IsValidRequest"] is not True:
        raise HTTPException(502, "PSA rejected the certificate lookup request.")
    if payload.get("ServerMessage") == "No data found" and not payload.get("PSACert"):
        return CertificateOutput(
            **result, state="not_found", notice="PSA returned no card for this certificate."
        )
    if "ServerMessage" in payload and payload["ServerMessage"] != "Request successful":
        raise HTTPException(502, "PSA could not complete the certificate lookup.")
    record = payload.get("PSACert")
    if not isinstance(record, dict) or record.get("CertNumber") != data.certification:
        raise HTTPException(502, "PSA returned an invalid or mismatched card response.")
    subject = text_field(record, "Subject", 200)
    if not subject:
        raise HTTPException(502, "PSA returned an incomplete card response.")
    year_text = text_field(record, "Year", 20)
    year = int(year_text) if re.fullmatch(r"[0-9]{4}", year_text) else None
    if year is not None and not 1800 <= year <= 2200:
        year = None
    draft = CertificateDraft(
        subject=subject,
        year=year,
        sport=PSA_SPORTS.get(text_field(record, "Category", 100).upper(), ""),
        set_name=text_field(record, "Brand", 150),
        card_number=text_field(record, "CardNumber", 50),
        parallel=text_field(record, "Variety", 150),
        grade=text_field(record, "CardGrade", 20),
        certification=data.certification,
    )
    status = text_field(record, "ItemStatus", 200)
    grade_description = text_field(record, "GradeDescription", 100)
    notice = NOTICE
    if grade_description:
        notice += f" PSA grade description: {grade_description}."
    if status:
        notice += f" PSA item status: {status}."
    return CertificateOutput(**result, state="found", draft=draft, notice=notice)


def certificates_router(settings: Settings, authenticated, mutation) -> APIRouter:
    router = APIRouter()

    @router.get("/api/certificates/status")
    def status(identity: Annotated[tuple, Depends(authenticated)]):
        return {
            "graders": [
                {
                    "grader": grader,
                    "supported": grader == "PSA",
                    "configured": grader == "PSA" and bool(settings.psa_api_token),
                    "verification_url": url,
                }
                for grader, url in VERIFICATION_URLS.items()
            ]
        }

    @router.post("/api/certificates/lookup", response_model=CertificateOutput)
    def lookup(data: CertificateInput, identity: Annotated[tuple, Depends(mutation)]):
        if data.grader != "PSA" or not settings.psa_api_token:
            notice = (
                "Configure PSA_API_TOKEN on the server to look up PSA certificates. "
                if data.grader == "PSA"
                else f"Automated {data.grader} lookup is not supported. "
            )
            return CertificateOutput(
                state="unavailable",
                grader=data.grader,
                certification=data.certification,
                verification_url=VERIFICATION_URLS[data.grader],
                notice=notice + "Use the grader's official site and enter the card manually.",
            )
        payload = fetch_psa_payload(settings.psa_api_token.get_secret_value(), data.certification)
        return psa_proposal(payload, data)

    return router
