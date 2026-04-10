"""Critical API regression tests for auth, connections, transactions, dashboard, and reports."""

import os
import uuid

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


def api_url(path: str) -> str:
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is missing")
    return f"{BASE_URL}/api{path}"


@pytest.fixture(scope="session")
def demo_credentials() -> dict[str, str]:
    # Demo credentials from /app/memory/test_credentials.md
    return {
        "email": "demo@aurafinance.app",
        "password": "Demo123!",
    }


@pytest.fixture
def api_client() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def auth_token(api_client: requests.Session, demo_credentials: dict[str, str]) -> str:
    response = api_client.post(api_url("/auth/login"), json=demo_credentials, timeout=30)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data.get("token"), str) and data["token"]
    assert data["user"]["email"] == demo_credentials["email"]
    return data["token"]


@pytest.fixture
def authenticated_client(api_client: requests.Session, auth_token: str) -> requests.Session:
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


# Authentication feature coverage
def test_register_and_login_flow(api_client: requests.Session) -> None:
    email = f"test_{uuid.uuid4().hex[:10]}@example.com"
    register_payload = {
        "email": email,
        "password": "StrongPass123!",
        "full_name": "TEST Register User",
    }
    register_response = api_client.post(api_url("/auth/register"), json=register_payload, timeout=30)
    assert register_response.status_code == 200
    registered = register_response.json()
    assert registered["user"]["email"] == email
    assert registered["user"]["full_name"] == "TEST Register User"

    login_response = api_client.post(
        api_url("/auth/login"),
        json={"email": email, "password": "StrongPass123!"},
        timeout=30,
    )
    assert login_response.status_code == 200
    logged_in = login_response.json()
    assert logged_in["user"]["email"] == email
    assert isinstance(logged_in.get("token"), str) and logged_in["token"]


def test_google_oauth_config_and_start_behavior(api_client: requests.Session) -> None:
    config_response = api_client.get(api_url("/auth/google-config"), timeout=30)
    assert config_response.status_code == 200
    config_data = config_response.json()
    assert config_data["enabled"] is False
    assert config_data["client_id_present"] is False

    start_response = api_client.get(api_url("/auth/google/start"), timeout=30)
    assert start_response.status_code == 400
    detail = start_response.json().get("detail", "")
    assert "Google OAuth is not configured" in detail


def test_protected_route_auth_me_requires_token(api_client: requests.Session) -> None:
    response = api_client.get(api_url("/auth/me"), timeout=30)
    assert response.status_code == 403
    detail = response.json().get("detail", "")
    assert detail == "Not authenticated"


def test_protected_route_auth_me_with_token(authenticated_client: requests.Session) -> None:
    response = authenticated_client.get(api_url("/auth/me"), timeout=30)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "demo@aurafinance.app"
    assert "password_hash" not in data


# Connections and Plaid feature coverage
def test_manual_account_creation_and_listing(authenticated_client: requests.Session) -> None:
    account_name = f"TEST Wallet {uuid.uuid4().hex[:6]}"
    payload = {
        "provider": "venmo",
        "account_name": account_name,
        "account_type": "wallet",
        "current_balance": 321.45,
    }
    create_response = authenticated_client.post(api_url("/connections/manual"), json=payload, timeout=30)
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["account_name"] == account_name
    assert created["provider"] == "venmo"
    assert created["current_balance"] == 321.45

    list_response = authenticated_client.get(api_url("/connections/accounts"), timeout=30)
    assert list_response.status_code == 200
    accounts = list_response.json().get("accounts", [])
    matched = [acc for acc in accounts if acc.get("id") == created["id"]]
    assert len(matched) == 1
    assert matched[0]["account_name"] == account_name


def test_plaid_link_token_behavior_when_credentials_missing(authenticated_client: requests.Session) -> None:
    response = authenticated_client.post(api_url("/connections/plaid/link-token"), timeout=30)
    assert response.status_code == 400
    detail = response.json().get("detail", "")
    assert "Plaid is not configured yet" in detail


# Transactions and dashboard feature coverage
def test_manual_transaction_creation_and_filtered_listing(authenticated_client: requests.Session) -> None:
    description = f"TEST Groceries {uuid.uuid4().hex[:6]}"
    payload = {
        "provider": "venmo",
        "account_id": None,
        "amount": 42.5,
        "direction": "expense",
        "category": "Food",
        "description": description,
        "transaction_date": "2026-02-10",
    }
    create_response = authenticated_client.post(api_url("/transactions/manual"), json=payload, timeout=30)
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["description"] == description
    assert created["category"] == "food"
    assert created["amount"] == 42.5

    list_response = authenticated_client.get(
        api_url("/transactions"),
        params={"search": description, "category": "food", "limit": 25, "page": 1},
        timeout=30,
    )
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed["pagination"]["total"] >= 1
    ids = [tx["id"] for tx in listed["transactions"]]
    assert created["id"] in ids


def test_dashboard_summary_payload(authenticated_client: requests.Session) -> None:
    response = authenticated_client.get(api_url("/dashboard/summary"), timeout=30)
    assert response.status_code == 200
    data = response.json()
    metrics = data["metrics"]
    assert isinstance(metrics["total_balance"], (int, float))
    assert isinstance(metrics["transaction_count"], int)
    assert isinstance(data["monthly_cashflow"], list)
    if data["monthly_cashflow"]:
        first = data["monthly_cashflow"][0]
        assert "month" in first and "income" in first and "expenses" in first


# Report generation, history, and PDF coverage
def test_report_generation_history_and_pdf(authenticated_client: requests.Session) -> None:
    title = f"TEST Report {uuid.uuid4().hex[:6]}"
    payload = {
        "title": title,
        "filters": {
            "provider": "venmo",
            "category": "food",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
        },
        "prompt": "Summarize spending patterns and suggest two savings ideas.",
    }
    create_response = authenticated_client.post(api_url("/reports/generate"), json=payload, timeout=45)
    assert create_response.status_code == 200
    report = create_response.json()
    assert report["title"] == title
    assert report["filters"]["provider"] == "venmo"
    assert "Financial Snapshot" in report["content"]

    report_id = report["id"]
    get_response = authenticated_client.get(api_url(f"/reports/{report_id}"), timeout=30)
    assert get_response.status_code == 200
    fetched = get_response.json()
    assert fetched["id"] == report_id
    assert fetched["title"] == title

    history_response = authenticated_client.get(api_url("/reports"), timeout=30)
    assert history_response.status_code == 200
    reports = history_response.json().get("reports", [])
    report_ids = [item["id"] for item in reports]
    assert report_id in report_ids

    pdf_response = authenticated_client.get(api_url(f"/reports/{report_id}/pdf"), timeout=30)
    assert pdf_response.status_code == 200
    assert "application/pdf" in pdf_response.headers.get("content-type", "")
    assert len(pdf_response.content) > 100