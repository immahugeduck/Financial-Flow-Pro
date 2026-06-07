"""Advisor weekly review + Plaid item endpoint regression tests."""

from datetime import date, timedelta
import os
import uuid

import pytest
import requests


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")


def api_url(path: str) -> str:
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is missing")
    return f"{BASE_URL}/api{path}"


@pytest.fixture
def api_client() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def authenticated_client(api_client: requests.Session) -> requests.Session:
    # Auth module: login and token setup
    response = api_client.post(
        api_url("/auth/login"),
        json={"email": "demo@aurafinance.app", "password": "Demo123!"},
        timeout=30,
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data.get("token"), str) and data["token"]
    api_client.headers.update({"Authorization": f"Bearer {data['token']}"})
    return api_client


def _week_dates() -> tuple[str, str]:
    today = date.today()
    current_start = today - timedelta(days=today.weekday())
    previous_start = current_start - timedelta(days=7)
    return current_start.isoformat(), previous_start.isoformat()


def test_advisor_weekly_review_contains_required_fields(authenticated_client: requests.Session) -> None:
    # Transactions module: seed one current-week + one previous-week transaction
    current_date, previous_date = _week_dates()
    tx_id = uuid.uuid4().hex[:6]
    current_payload = {
        "provider": "bank",
        "account_id": None,
        "amount": 180.75,
        "direction": "income",
        "category": "income",
        "description": f"TEST_weekly_income_{tx_id}",
        "transaction_date": current_date,
    }
    previous_payload = {
        "provider": "bank",
        "account_id": None,
        "amount": 95.25,
        "direction": "expense",
        "category": "groceries",
        "description": f"TEST_weekly_expense_{tx_id}",
        "transaction_date": previous_date,
    }
    assert authenticated_client.post(api_url("/transactions/manual"), json=current_payload, timeout=30).status_code == 200
    assert authenticated_client.post(api_url("/transactions/manual"), json=previous_payload, timeout=30).status_code == 200

    custom_prompt = "Focus on reducing recurring subscriptions while maintaining emergency savings."
    response = authenticated_client.post(
        api_url("/advisor/weekly-review"),
        json={"custom_prompt": custom_prompt},
        timeout=60,
    )
    assert response.status_code == 200
    data = response.json()

    assert isinstance(data.get("score"), int)
    assert 0 <= data["score"] <= 100
    assert isinstance(data.get("why_changed"), list)
    assert isinstance(data.get("action_steps"), list)
    assert len(data["action_steps"]) >= 1
    assert isinstance(data.get("advisor_analysis"), str)
    assert data.get("custom_prompt") == custom_prompt


def test_advisor_weekly_review_pdf_download(authenticated_client: requests.Session) -> None:
    # Advisor module: review generation + PDF export flow
    review_response = authenticated_client.post(
        api_url("/advisor/weekly-review"),
        json={"custom_prompt": "Give practical weekly action items."},
        timeout=60,
    )
    assert review_response.status_code == 200
    review_data = review_response.json()
    assert isinstance(review_data.get("score_breakdown"), list)

    pdf_response = authenticated_client.post(
        api_url("/advisor/weekly-review/pdf"),
        json={"review_data": review_data},
        timeout=60,
    )
    assert pdf_response.status_code == 200
    assert "application/pdf" in pdf_response.headers.get("content-type", "")
    assert len(pdf_response.content) > 100


def test_plaid_items_list_endpoint_shape(authenticated_client: requests.Session) -> None:
    # Plaid module: linked institutions list response contract
    response = authenticated_client.get(api_url("/connections/plaid/items"), timeout=30)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data.get("configured"), bool)
    assert isinstance(data.get("items"), list)
    if data["items"]:
        first = data["items"][0]
        assert isinstance(first.get("item_id"), str)
        assert "institution_name" in first
        assert "account_count" in first


def test_plaid_sync_item_and_unlink_not_found_behavior(authenticated_client: requests.Session) -> None:
    # Plaid module: per-item sync/unlink endpoint error handling
    unknown_item_id = f"missing-{uuid.uuid4().hex[:8]}"

    sync_response = authenticated_client.post(
        api_url(f"/connections/plaid/sync-item/{unknown_item_id}"),
        timeout=30,
    )
    assert sync_response.status_code == 404
    assert "Plaid item not found" in sync_response.json().get("detail", "")

    unlink_response = authenticated_client.delete(
        api_url(f"/connections/plaid/item/{unknown_item_id}"),
        timeout=30,
    )
    assert unlink_response.status_code == 404
    assert "Plaid item not found" in unlink_response.json().get("detail", "")
