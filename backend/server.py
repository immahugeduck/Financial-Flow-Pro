from datetime import date, datetime, timedelta, timezone
import io
import logging
import os
from pathlib import Path
from typing import Any, Literal, Optional
from urllib.parse import urlencode
import uuid

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
import requests
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Environment
mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]
jwt_secret = os.environ["JWT_SECRET"]
jwt_algorithm = os.environ.get("JWT_ALGORITHM", "HS256")
token_expiry_minutes = int(os.environ.get("TOKEN_EXPIRY_MINUTES", "1440"))
google_client_id = os.environ.get("GOOGLE_CLIENT_ID")
google_client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
gemini_api_key = os.environ.get("GEMINI_API_KEY")
gemini_model = os.environ.get("GEMINI_MODEL")

# Services
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]
app = FastAPI(title="Financial Flow API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()
password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=token_expiry_minutes),
    }
    return jwt.encode(payload, jwt_secret, algorithm=jwt_algorithm)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict[str, Any]:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, jwt_secret, algorithms=[jwt_algorithm])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError as error:
        raise HTTPException(status_code=401, detail="Invalid token") from error

    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return user_doc


def plaid_base_url() -> str:
    plaid_env = os.environ.get("PLAID_ENV", "sandbox").strip().lower()
    if plaid_env == "production":
        return "https://production.plaid.com"
    if plaid_env == "development":
        return "https://development.plaid.com"
    return "https://sandbox.plaid.com"


def require_plaid_credentials() -> tuple[str, str]:
    plaid_client_id = os.environ.get("PLAID_CLIENT_ID")
    plaid_secret = os.environ.get("PLAID_SECRET")
    if not plaid_client_id or not plaid_secret:
        raise HTTPException(
            status_code=400,
            detail="Plaid is not configured yet. Add PLAID_CLIENT_ID and PLAID_SECRET in backend/.env.",
        )
    return plaid_client_id, plaid_secret


def derive_provider(text: str) -> str:
    text_lower = text.lower()
    if "venmo" in text_lower:
        return "venmo"
    if "cash" in text_lower:
        return "cashapp"
    if "chime" in text_lower:
        return "chime"
    if "paypal" in text_lower:
        return "paypal"
    return "bank"


def is_plaid_configured() -> bool:
    return bool(os.environ.get("PLAID_CLIENT_ID") and os.environ.get("PLAID_SECRET"))


def build_pdf_bytes(title: str, content: str) -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    text_obj = pdf.beginText(48, height - 56)
    text_obj.setFont("Helvetica-Bold", 14)
    text_obj.textLine(title)
    text_obj.setFont("Helvetica", 10)
    text_obj.textLine("")

    max_chars = 100
    for line in content.splitlines():
        safe = line if line.strip() else " "
        while len(safe) > max_chars:
            text_obj.textLine(safe[:max_chars])
            safe = safe[max_chars:]
            if text_obj.getY() <= 56:
                pdf.drawText(text_obj)
                pdf.showPage()
                text_obj = pdf.beginText(48, height - 56)
                text_obj.setFont("Helvetica", 10)
        text_obj.textLine(safe)
        if text_obj.getY() <= 56:
            pdf.drawText(text_obj)
            pdf.showPage()
            text_obj = pdf.beginText(48, height - 56)
            text_obj.setFont("Helvetica", 10)

    pdf.drawText(text_obj)
    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()


def summarize_transactions(transactions: list[dict[str, Any]]) -> dict[str, Any]:
    income = round(sum(tx["amount"] for tx in transactions if tx["direction"] == "income"), 2)
    expenses = round(
        sum(tx["amount"] for tx in transactions if tx["direction"] == "expense"),
        2,
    )
    by_category: dict[str, float] = {}
    for tx in transactions:
        category = tx.get("category") or "uncategorized"
        by_category[category] = by_category.get(category, 0.0) + tx["amount"]

    sorted_categories = sorted(by_category.items(), key=lambda item: item[1], reverse=True)
    return {
        "income": income,
        "expenses": expenses,
        "net": round(income - expenses, 2),
        "top_categories": sorted_categories[:5],
        "transaction_count": len(transactions),
    }


def clamp_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def score_label(score: int) -> str:
    if score >= 80:
        return "Excellent"
    if score >= 65:
        return "Strong"
    if score >= 50:
        return "Stable"
    if score >= 35:
        return "Needs Attention"
    return "Critical"


def week_range_strings() -> dict[str, str]:
    today = date.today()
    current_start = today - timedelta(days=today.weekday())
    current_end = current_start + timedelta(days=6)
    previous_start = current_start - timedelta(days=7)
    previous_end = current_start - timedelta(days=1)
    return {
        "current_start": current_start.isoformat(),
        "current_end": current_end.isoformat(),
        "previous_start": previous_start.isoformat(),
        "previous_end": previous_end.isoformat(),
    }


def transactions_summary_window(transactions: list[dict[str, Any]]) -> dict[str, Any]:
    income = round(
        sum(float(tx.get("amount", 0.0)) for tx in transactions if tx.get("direction") == "income"),
        2,
    )
    expenses = round(
        sum(float(tx.get("amount", 0.0)) for tx in transactions if tx.get("direction") == "expense"),
        2,
    )
    net = round(income - expenses, 2)
    income_cost_ratio = round(income / expenses, 2) if expenses > 0 else (99.0 if income > 0 else 0.0)
    savings_rate = round(net / income, 3) if income > 0 else 0.0

    category_totals: dict[str, float] = {}
    for tx in transactions:
        category = (tx.get("category") or "uncategorized").lower()
        category_totals[category] = category_totals.get(category, 0.0) + float(tx.get("amount", 0.0))

    top_categories = sorted(category_totals.items(), key=lambda item: item[1], reverse=True)[:5]
    return {
        "income": income,
        "expenses": expenses,
        "net": net,
        "income_cost_ratio": income_cost_ratio,
        "savings_rate": savings_rate,
        "transaction_count": len(transactions),
        "top_categories": [{"category": name, "amount": round(value, 2)} for name, value in top_categories],
    }


def compute_weekly_financial_health(
    current_summary: dict[str, Any],
    previous_summary: dict[str, Any],
) -> dict[str, Any]:
    score = 50.0
    score_breakdown: list[dict[str, Any]] = []
    why_changed: list[str] = []

    savings_rate = float(current_summary["savings_rate"])
    savings_impact = max(-18.0, min(18.0, savings_rate * 40.0))
    score += savings_impact
    score_breakdown.append(
        {
            "factor": "Savings Rate",
            "impact": round(savings_impact, 1),
            "detail": f"Current savings rate: {round(savings_rate * 100, 1)}%",
        }
    )

    income_cost_ratio = float(current_summary["income_cost_ratio"])
    ratio_impact = 0.0
    if income_cost_ratio >= 1.5:
        ratio_impact = 16.0
    elif income_cost_ratio >= 1.2:
        ratio_impact = 10.0
    elif income_cost_ratio >= 1.0:
        ratio_impact = 4.0
    elif income_cost_ratio >= 0.8:
        ratio_impact = -6.0
    else:
        ratio_impact = -14.0
    score += ratio_impact
    score_breakdown.append(
        {
            "factor": "Income-to-Cost Ratio",
            "impact": ratio_impact,
            "detail": f"Income-to-cost ratio: {income_cost_ratio}",
        }
    )

    previous_expenses = float(previous_summary["expenses"])
    current_expenses = float(current_summary["expenses"])
    expense_change_pct = 0.0
    expense_change_basis = "standard"
    expense_change_display = 0.0
    if previous_expenses > 0:
        expense_change_pct = ((current_expenses - previous_expenses) / previous_expenses) * 100
        expense_change_display = round(max(-250.0, min(250.0, expense_change_pct)), 1)
    elif current_expenses > 0:
        expense_change_pct = 250.0
        expense_change_display = 250.0
        expense_change_basis = "new_expense_from_zero"

    expense_trend_impact = 0.0
    if expense_change_basis == "new_expense_from_zero":
        expense_trend_impact = -12.0
        why_changed.append("Spending appeared this week after a zero-expense prior week.")
    elif expense_change_pct <= -10:
        expense_trend_impact = 12.0
        why_changed.append("Spending dropped significantly versus last week.")
    elif expense_change_pct < 0:
        expense_trend_impact = 6.0
        why_changed.append("Spending is slightly down compared to last week.")
    elif expense_change_pct >= 15:
        expense_trend_impact = -12.0
        why_changed.append("Spending jumped sharply compared to last week.")
    elif expense_change_pct > 0:
        expense_trend_impact = -6.0
        why_changed.append("Spending is up week-over-week.")

    score += expense_trend_impact
    score_breakdown.append(
        {
            "factor": "Expense Trend",
            "impact": expense_trend_impact,
            "detail": f"Expense change vs previous week: {expense_change_display}%",
        }
    )

    net_change = float(current_summary["net"]) - float(previous_summary["net"])
    net_impact = 0.0
    if net_change >= 100:
        net_impact = 8.0
    elif net_change > 0:
        net_impact = 4.0
    elif net_change <= -100:
        net_impact = -8.0
    elif net_change < 0:
        net_impact = -4.0

    score += net_impact
    score_breakdown.append(
        {
            "factor": "Net Cash Momentum",
            "impact": net_impact,
            "detail": f"Net cash change vs previous week: ${round(net_change, 2)}",
        }
    )

    final_score = clamp_score(score)
    return {
        "score": final_score,
        "label": score_label(final_score),
        "score_breakdown": score_breakdown,
        "why_changed": why_changed,
        "comparison": {
            "expense_change_pct": expense_change_display,
            "expense_change_basis": expense_change_basis,
            "net_change": round(net_change, 2),
            "income_cost_ratio_change": round(
                float(current_summary["income_cost_ratio"]) - float(previous_summary["income_cost_ratio"]),
                2,
            ),
        },
    }


def build_default_actions(current_summary: dict[str, Any], comparison: dict[str, Any]) -> list[str]:
    actions: list[str] = []
    top_categories = current_summary.get("top_categories", [])
    if top_categories:
        largest = top_categories[0]
        actions.append(
            f"Set a weekly cap for {largest['category']} at 90% of current spend (${round(largest['amount'] * 0.9, 2)})."
        )

    if float(current_summary.get("income_cost_ratio", 0)) < 1.0:
        actions.append("Prioritize reducing variable expenses this week until income-to-cost ratio rises above 1.0.")

    if float(comparison.get("expense_change_pct", 0)) > 0:
        actions.append("Freeze discretionary purchases for 3 days and review recurring charges.")

    if float(current_summary.get("savings_rate", 0)) < 0.1:
        actions.append("Auto-transfer at least 10% of incoming funds to savings at each deposit.")

    if not actions:
        actions.append("Maintain current spending pattern and increase savings transfer by 2% this week.")

    return actions[:3]


async def generate_ai_advisor_analysis(
    score_data: dict[str, Any],
    current_summary: dict[str, Any],
    previous_summary: dict[str, Any],
    actions: list[str],
    custom_prompt: str,
) -> str:
    if not gemini_api_key or not gemini_model:
        return ""

    try:
        from google import genai

        client_gemini = genai.Client(api_key=gemini_api_key)
        prompt = (
            "You are a specialized financial advisor AI. Return concise markdown with exactly these sections:\n"
            "1) Weekly Financial Health Score\n"
            "2) Why it changed vs previous week\n"
            "3) Action plan for next 7 days\n"
            "Use bullets and numbers. Be practical and non-judgmental.\n"
            f"Current week summary: {current_summary}\n"
            f"Previous week summary: {previous_summary}\n"
            f"Computed score data: {score_data}\n"
            f"Baseline actions: {actions}\n"
            f"User custom focus (optional): {custom_prompt or 'None'}"
        )

        response = client_gemini.models.generate_content(
            model=gemini_model,
            contents=prompt,
        )
        return response.text or ""
    except Exception as error:  # pragma: no cover - external API fallback
        logger.warning("Advisor AI generation failed: %s", error)
        return ""


def advisor_pdf_content(review_data: dict[str, Any]) -> str:
    score = review_data.get("score", 0)
    label = review_data.get("label", "N/A")
    week_window = review_data.get("week_window", {})
    current = review_data.get("current_week", {})
    previous = review_data.get("previous_week", {})
    comparison = review_data.get("comparison", {})
    breakdown = review_data.get("score_breakdown", [])
    why_changed = review_data.get("why_changed", [])
    action_steps = review_data.get("action_steps", [])
    advisor_analysis = review_data.get("advisor_analysis", "")

    lines = [
        "Financial Flow Weekly Advisor Report",
        f"Generated: {now_iso()}",
        "",
        "## Weekly Financial Health Score",
        f"- Score: {score}/100 ({label})",
        f"- Week Window: {week_window.get('current_start')} to {week_window.get('current_end')}",
        "",
        "## Current Week Metrics",
        f"- Income: ${current.get('income', 0)}",
        f"- Expenses: ${current.get('expenses', 0)}",
        f"- Net Cash: ${current.get('net', 0)}",
        f"- Income/Cost Ratio: {current.get('income_cost_ratio', 0)}",
        f"- Savings Rate: {round(float(current.get('savings_rate', 0)) * 100, 1)}%",
        "",
        "## Previous Week Metrics",
        f"- Income: ${previous.get('income', 0)}",
        f"- Expenses: ${previous.get('expenses', 0)}",
        f"- Net Cash: ${previous.get('net', 0)}",
        "",
        "## Week-over-Week Changes",
        f"- Expense Change: {comparison.get('expense_change_pct', 0)}%",
        f"- Net Change: ${comparison.get('net_change', 0)}",
        f"- Income/Cost Ratio Change: {comparison.get('income_cost_ratio_change', 0)}",
        "",
        "## Score Breakdown",
    ]

    for item in breakdown:
        lines.append(f"- {item.get('factor')}: impact {item.get('impact')} ({item.get('detail')})")

    lines += ["", "## Why The Score Changed"]
    if why_changed:
        lines.extend([f"- {item}" for item in why_changed])
    else:
        lines.append("- No major week-over-week change detected.")

    lines += ["", "## Action Plan"]
    lines.extend([f"- {item}" for item in action_steps])

    if advisor_analysis:
        lines += ["", "## AI Advisor Notes", advisor_analysis]

    return "\n".join(lines)


async def generate_ai_section(
    prompt: str,
    summary: dict[str, Any],
    sample_transactions: list[dict[str, Any]],
) -> str:
    if not gemini_api_key or not gemini_model or not prompt.strip():
        return ""

    try:
        from google import genai

        client_gemini = genai.Client(api_key=gemini_api_key)
        prompt_payload = (
            "You are a financial analyst. Keep response concise and practical. "
            "Use markdown with short headings and bullet points.\n"
            f"User instruction: {prompt}\n"
            f"Financial summary: {summary}\n"
            f"Transaction samples: {sample_transactions[:12]}"
        )

        candidate_models = [gemini_model, "gemini-2.5-flash", "gemini-1.5-flash"]
        tried = set()
        for model_name in candidate_models:
            if not model_name or model_name in tried:
                continue
            tried.add(model_name)
            try:
                response = client_gemini.models.generate_content(
                    model=model_name,
                    contents=prompt_payload,
                )
                if response.text:
                    return response.text
            except Exception as model_error:  # pragma: no cover - external API fallback
                logger.warning("Gemini model %s failed: %s", model_name, model_error)

        return ""
    except Exception as error:  # pragma: no cover - external API fallback
        logger.warning("Gemini generation failed: %s", error)
        return ""


def report_body(
    summary: dict[str, Any],
    filters: dict[str, Any],
    ai_section: str,
    created_at: str,
) -> str:
    category_lines = "\n".join(
        [f"- {name}: ${round(value, 2)}" for name, value in summary["top_categories"]]
    ) or "- No categories available"

    lines = [
        f"Financial Flow report generated at: {created_at}",
        "",
        "## Financial Snapshot",
        f"- Total Income: ${summary['income']}",
        f"- Total Expenses: ${summary['expenses']}",
        f"- Net Cash: ${summary['net']}",
        f"- Transactions analyzed: {summary['transaction_count']}",
        "",
        "## Top Categories",
        category_lines,
        "",
        "## Filters Used",
        f"- Provider: {filters.get('provider') or 'All'}",
        f"- Category: {filters.get('category') or 'All'}",
        f"- Start Date: {filters.get('start_date') or 'Not set'}",
        f"- End Date: {filters.get('end_date') or 'Not set'}",
    ]
    if ai_section:
        lines += ["", "## AI Custom Insights", ai_section]
    return "\n".join(lines)


def parse_date_safe(value: str) -> date:
    return date.fromisoformat(value)


def google_oauth_enabled() -> bool:
    return bool(google_client_id and google_client_secret)


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=100)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginInput(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=100)
    google_id: str = Field(min_length=3, max_length=150)


class AuthResponse(BaseModel):
    token: str
    user: dict[str, Any]


class ManualAccountCreate(BaseModel):
    provider: Literal["venmo", "cashapp", "chime", "paypal", "bank"]
    account_name: str = Field(min_length=2, max_length=80)
    account_type: Literal["checking", "savings", "wallet", "credit", "other"]
    current_balance: float


class PlaidExchangeInput(BaseModel):
    public_token: str
    institution_name: Optional[str] = None


class ManualTransactionCreate(BaseModel):
    provider: Literal["venmo", "cashapp", "chime", "paypal", "bank"]
    account_id: Optional[str] = None
    amount: float = Field(gt=0)
    direction: Literal["income", "expense"]
    category: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=2, max_length=140)
    transaction_date: str


class ReportFilters(BaseModel):
    provider: Optional[str] = None
    category: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class GenerateReportInput(BaseModel):
    title: str = Field(min_length=3, max_length=100)
    filters: ReportFilters = Field(default_factory=ReportFilters)
    prompt: str = Field(default="", max_length=3000)


class AdvisorReviewInput(BaseModel):
    custom_prompt: str = Field(default="", max_length=1200)


class AdvisorPdfInput(BaseModel):
    review_data: dict[str, Any]


@api_router.get("/")
async def root() -> dict[str, str]:
    return {"message": "Financial Flow API is running"}


@api_router.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy", "timestamp": now_iso()}


@api_router.get("/auth/google-config")
async def auth_google_config() -> dict[str, Any]:
    return {
        "enabled": google_oauth_enabled(),
        "client_id_present": bool(google_client_id),
    }


@api_router.post("/auth/register", response_model=AuthResponse)
async def auth_register(payload: UserRegister) -> AuthResponse:
    existing = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": payload.email.lower(),
        "full_name": payload.full_name.strip(),
        "password_hash": password_context.hash(payload.password),
        "google_id": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.users.insert_one(dict(user_doc))

    safe_user = {k: v for k, v in user_doc.items() if k != "password_hash"}
    token = create_token(user_id, payload.email.lower())
    return AuthResponse(token=token, user=safe_user)


@api_router.post("/auth/login", response_model=AuthResponse)
async def auth_login(payload: UserLogin) -> AuthResponse:
    user_doc = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user_doc or not user_doc.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not password_context.verify(payload.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await db.users.update_one(
        {"id": user_doc["id"]},
        {"$set": {"updated_at": now_iso()}},
    )
    token = create_token(user_doc["id"], user_doc["email"])
    safe_user = {k: v for k, v in user_doc.items() if k != "password_hash"}
    return AuthResponse(token=token, user=safe_user)


@api_router.post("/auth/google-login", response_model=AuthResponse)
async def auth_google_login(payload: GoogleLoginInput) -> AuthResponse:
    user_doc = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if user_doc:
        await db.users.update_one(
            {"id": user_doc["id"]},
            {
                "$set": {
                    "google_id": payload.google_id,
                    "full_name": payload.full_name.strip(),
                    "updated_at": now_iso(),
                }
            },
        )
        user_doc["google_id"] = payload.google_id
        user_doc["full_name"] = payload.full_name.strip()
        user_doc["updated_at"] = now_iso()
    else:
        user_doc = {
            "id": str(uuid.uuid4()),
            "email": payload.email.lower(),
            "full_name": payload.full_name.strip(),
            "password_hash": None,
            "google_id": payload.google_id,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.users.insert_one(dict(user_doc))

    token = create_token(user_doc["id"], user_doc["email"])
    safe_user = {k: v for k, v in user_doc.items() if k != "password_hash"}
    return AuthResponse(token=token, user=safe_user)


@api_router.get("/auth/google/start")
async def auth_google_start(request: Request) -> RedirectResponse:
    if not google_oauth_enabled():
        raise HTTPException(
            status_code=400,
            detail="Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )

    origin = str(request.base_url).rstrip("/")
    redirect_uri = f"{origin}/api/auth/google/callback"
    query = urlencode(
        {
            "client_id": google_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "prompt": "select_account",
        }
    )
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{query}")


@api_router.get("/auth/google/callback")
async def auth_google_callback(request: Request, code: str = Query(...)) -> RedirectResponse:
    if not google_oauth_enabled():
        raise HTTPException(status_code=400, detail="Google OAuth is not configured")

    origin = str(request.base_url).rstrip("/")
    redirect_uri = f"{origin}/api/auth/google/callback"

    token_response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": google_client_id,
            "client_secret": google_client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    if token_response.status_code >= 400:
        raise HTTPException(status_code=400, detail="Failed to exchange Google OAuth code")

    access_token_google = token_response.json().get("access_token")
    userinfo_response = requests.get(
        "https://openidconnect.googleapis.com/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token_google}"},
        timeout=30,
    )
    if userinfo_response.status_code >= 400:
        raise HTTPException(status_code=400, detail="Failed to fetch Google profile")

    profile = userinfo_response.json()
    email = profile.get("email")
    sub = profile.get("sub")
    name = profile.get("name") or "Google User"
    if not email or not sub:
        raise HTTPException(status_code=400, detail="Google profile missing required fields")

    user_doc = await db.users.find_one({"email": email.lower()}, {"_id": 0})
    if user_doc:
        await db.users.update_one(
            {"id": user_doc["id"]},
            {
                "$set": {
                    "google_id": sub,
                    "full_name": name,
                    "updated_at": now_iso(),
                }
            },
        )
    else:
        user_doc = {
            "id": str(uuid.uuid4()),
            "email": email.lower(),
            "full_name": name,
            "password_hash": None,
            "google_id": sub,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.users.insert_one(dict(user_doc))

    token = create_token(user_doc["id"], email.lower())
    return RedirectResponse(f"{origin}/auth/google-callback?token={token}")


@api_router.get("/auth/me")
async def auth_me(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {k: v for k, v in current_user.items() if k != "password_hash"}


@api_router.post("/connections/manual")
async def create_manual_connection(
    payload: ManualAccountCreate,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    account = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "provider": payload.provider,
        "account_name": payload.account_name.strip(),
        "account_type": payload.account_type,
        "current_balance": round(payload.current_balance, 2),
        "source": "manual",
        "status": "connected",
        "last_synced_at": now_iso(),
        "created_at": now_iso(),
    }
    await db.accounts.insert_one(dict(account))
    return account


@api_router.get("/connections/accounts")
async def list_accounts(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    accounts = await db.accounts.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(200)
    accounts_sorted = sorted(accounts, key=lambda acc: acc.get("created_at", ""), reverse=True)
    return {"accounts": accounts_sorted}


@api_router.post("/connections/plaid/link-token")
async def plaid_link_token(
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    plaid_client_id, plaid_secret = require_plaid_credentials()
    origin = str(request.base_url).rstrip("/")

    payload = {
        "client_id": plaid_client_id,
        "secret": plaid_secret,
        "client_name": "Financial Flow",
        "country_codes": ["US"],
        "language": "en",
        "products": ["transactions", "auth", "identity"],
        "user": {"client_user_id": current_user["id"]},
        "webhook": f"{origin}/api/webhooks/plaid",
    }
    response = requests.post(
        f"{plaid_base_url()}/link/token/create",
        json=payload,
        timeout=30,
    )
    if response.status_code >= 400:
        logger.warning("Plaid link token failed: %s", response.text)
        raise HTTPException(status_code=400, detail="Unable to create Plaid link token")

    body = response.json()
    return {
        "link_token": body.get("link_token"),
        "expiration": body.get("expiration"),
        "request_id": body.get("request_id"),
    }


async def sync_plaid_item(
    current_user: dict[str, Any], item: dict[str, Any]
) -> dict[str, Any]:
    plaid_client_id, plaid_secret = require_plaid_credentials()
    access_token = item["access_token"]

    accounts_response = requests.post(
        f"{plaid_base_url()}/accounts/get",
        json={
            "client_id": plaid_client_id,
            "secret": plaid_secret,
            "access_token": access_token,
        },
        timeout=30,
    )
    if accounts_response.status_code >= 400:
        raise HTTPException(status_code=400, detail="Failed to sync Plaid accounts")
    account_body = accounts_response.json()

    saved_accounts = 0
    account_provider = derive_provider(item.get("institution_name") or "")
    for account in account_body.get("accounts", []):
        account_doc = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "provider": account_provider,
            "account_name": account.get("name", "Linked Account"),
            "account_type": account.get("subtype") or account.get("type") or "other",
            "current_balance": round(float(account.get("balances", {}).get("current") or 0.0), 2),
            "source": "plaid",
            "status": "connected",
            "external_account_id": account.get("account_id"),
            "plaid_item_id": item.get("item_id"),
            "last_synced_at": now_iso(),
            "created_at": now_iso(),
        }
        await db.accounts.update_one(
            {
                "user_id": current_user["id"],
                "external_account_id": account.get("account_id"),
            },
            {
                "$set": {
                    "provider": account_doc["provider"],
                    "account_name": account_doc["account_name"],
                    "account_type": account_doc["account_type"],
                    "current_balance": account_doc["current_balance"],
                    "source": account_doc["source"],
                    "status": account_doc["status"],
                    "plaid_item_id": account_doc["plaid_item_id"],
                    "last_synced_at": account_doc["last_synced_at"],
                },
                "$setOnInsert": {
                    "id": account_doc["id"],
                    "user_id": account_doc["user_id"],
                    "external_account_id": account_doc["external_account_id"],
                    "created_at": account_doc["created_at"],
                },
            },
            upsert=True,
        )
        saved_accounts += 1

    end_date = date.today()
    start_date = end_date - timedelta(days=90)
    transactions_response = requests.post(
        f"{plaid_base_url()}/transactions/get",
        json={
            "client_id": plaid_client_id,
            "secret": plaid_secret,
            "access_token": access_token,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        },
        timeout=30,
    )
    saved_transactions = 0
    transactions_pending = False
    pending_reason = None
    if transactions_response.status_code < 400:
        transaction_body = transactions_response.json()
        for tx in transaction_body.get("transactions", []):
            raw_amount = float(tx.get("amount") or 0.0)
            direction = "expense" if raw_amount >= 0 else "income"
            amount = round(abs(raw_amount), 2)

            category_info = tx.get("personal_finance_category") or {}
            category = category_info.get("primary") or "uncategorized"
            account_provider = derive_provider(item.get("institution_name") or tx.get("name", ""))

            tx_doc = {
                "id": str(uuid.uuid4()),
                "user_id": current_user["id"],
                "provider": account_provider,
                "account_id": tx.get("account_id"),
                "external_transaction_id": tx.get("transaction_id"),
                "amount": amount,
                "direction": direction,
                "category": category.lower(),
                "description": tx.get("merchant_name") or tx.get("name") or "Transaction",
                "transaction_date": tx.get("authorized_date") or tx.get("date"),
                "source": "plaid",
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }

            await db.transactions.update_one(
                {
                    "user_id": current_user["id"],
                    "external_transaction_id": tx_doc["external_transaction_id"],
                },
                {
                    "$set": {
                        "provider": tx_doc["provider"],
                        "account_id": tx_doc["account_id"],
                        "amount": tx_doc["amount"],
                        "direction": tx_doc["direction"],
                        "category": tx_doc["category"],
                        "description": tx_doc["description"],
                        "transaction_date": tx_doc["transaction_date"],
                        "source": tx_doc["source"],
                        "updated_at": tx_doc["updated_at"],
                    },
                    "$setOnInsert": {
                        "id": tx_doc["id"],
                        "user_id": tx_doc["user_id"],
                        "external_transaction_id": tx_doc["external_transaction_id"],
                        "created_at": tx_doc["created_at"],
                    },
                },
                upsert=True,
            )
            saved_transactions += 1
    else:
        error_payload = {}
        try:
            error_payload = transactions_response.json()
        except Exception:
            pass
        plaid_error_code = error_payload.get("error_code")
        if plaid_error_code in {"PRODUCT_NOT_READY", "NO_TRANSACTIONS_AVAILABLE"}:
            logger.info("Plaid transactions not ready yet for item %s", item.get("item_id"))
            transactions_pending = True
            pending_reason = plaid_error_code
        else:
            raise HTTPException(status_code=400, detail="Failed to sync Plaid transactions")

    await db.plaid_items.update_one(
        {"id": item["id"]},
        {"$set": {"last_synced_at": now_iso()}},
    )

    return {
        "saved_accounts": saved_accounts,
        "saved_transactions": saved_transactions,
        "transactions_pending": transactions_pending,
        "pending_reason": pending_reason,
    }


@api_router.get("/connections/plaid/items")
async def plaid_items_list(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    items = await db.plaid_items.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(100)
    items_sorted = sorted(items, key=lambda item: item.get("created_at", ""), reverse=True)

    sanitized_items: list[dict[str, Any]] = []
    for item in items_sorted:
        account_count = await db.accounts.count_documents(
            {"user_id": current_user["id"], "plaid_item_id": item.get("item_id")}
        )
        sanitized_items.append(
            {
                "id": item.get("id"),
                "item_id": item.get("item_id"),
                "institution_name": item.get("institution_name"),
                "created_at": item.get("created_at"),
                "last_synced_at": item.get("last_synced_at"),
                "account_count": account_count,
            }
        )

    return {"items": sanitized_items, "configured": is_plaid_configured()}


@api_router.post("/connections/plaid/exchange")
async def plaid_exchange_public_token(
    payload: PlaidExchangeInput,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    plaid_client_id, plaid_secret = require_plaid_credentials()
    response = requests.post(
        f"{plaid_base_url()}/item/public_token/exchange",
        json={
            "client_id": plaid_client_id,
            "secret": plaid_secret,
            "public_token": payload.public_token,
        },
        timeout=30,
    )
    if response.status_code >= 400:
        logger.warning("Plaid exchange failed: %s", response.text)
        raise HTTPException(status_code=400, detail="Unable to exchange public token")

    body = response.json()
    item_doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "item_id": body.get("item_id"),
        "access_token": body.get("access_token"),
        "institution_name": payload.institution_name or "Plaid Institution",
        "created_at": now_iso(),
        "last_synced_at": None,
    }
    await db.plaid_items.update_one(
        {"user_id": current_user["id"], "item_id": item_doc["item_id"]},
        {
            "$set": {
                "access_token": item_doc["access_token"],
                "institution_name": item_doc["institution_name"],
            },
            "$setOnInsert": {
                "id": item_doc["id"],
                "user_id": item_doc["user_id"],
                "item_id": item_doc["item_id"],
                "created_at": item_doc["created_at"],
            },
        },
        upsert=True,
    )

    stored_item = await db.plaid_items.find_one(
        {"user_id": current_user["id"], "item_id": item_doc["item_id"]},
        {"_id": 0},
    )
    sync_result = await sync_plaid_item(current_user, stored_item)
    return {
        "item_id": item_doc["item_id"],
        "plaid_connection_id": stored_item.get("id"),
        "institution_name": item_doc["institution_name"],
        "sync": sync_result,
    }


@api_router.post("/connections/plaid/sync-item/{item_id}")
async def plaid_sync_item(
    item_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    item = await db.plaid_items.find_one(
        {"user_id": current_user["id"], "item_id": item_id},
        {"_id": 0},
    )
    if not item:
        raise HTTPException(status_code=404, detail="Plaid item not found")

    sync_result = await sync_plaid_item(current_user, item)
    return {
        "item_id": item_id,
        "institution_name": item.get("institution_name"),
        "sync": sync_result,
    }


@api_router.delete("/connections/plaid/item/{item_id}")
async def plaid_unlink_item(
    item_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    item = await db.plaid_items.find_one(
        {"user_id": current_user["id"], "item_id": item_id},
        {"_id": 0},
    )
    if not item:
        raise HTTPException(status_code=404, detail="Plaid item not found")

    linked_accounts = await db.accounts.find(
        {"user_id": current_user["id"], "plaid_item_id": item_id},
        {"_id": 0, "external_account_id": 1},
    ).to_list(500)
    external_ids = [acc.get("external_account_id") for acc in linked_accounts if acc.get("external_account_id")]

    deleted_accounts = await db.accounts.delete_many(
        {"user_id": current_user["id"], "plaid_item_id": item_id}
    )

    transaction_query: dict[str, Any] = {
        "user_id": current_user["id"],
        "source": "plaid",
        "account_id": {"$in": external_ids if external_ids else ["__none__"]},
    }
    deleted_transactions = await db.transactions.delete_many(transaction_query)

    deleted_item = await db.plaid_items.delete_one(
        {"user_id": current_user["id"], "item_id": item_id}
    )

    return {
        "removed": bool(deleted_item.deleted_count),
        "deleted_accounts": deleted_accounts.deleted_count,
        "deleted_transactions": deleted_transactions.deleted_count,
    }


@api_router.post("/connections/plaid/sync")
async def plaid_sync_all(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    items = await db.plaid_items.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(100)
    if not items:
        raise HTTPException(status_code=404, detail="No Plaid connections found")

    total_accounts = 0
    total_transactions = 0
    pending_items = 0
    for item in items:
        result = await sync_plaid_item(current_user, item)
        total_accounts += result["saved_accounts"]
        total_transactions += result["saved_transactions"]
        if result.get("transactions_pending"):
            pending_items += 1

    return {
        "synced_items": len(items),
        "saved_accounts": total_accounts,
        "saved_transactions": total_transactions,
        "pending_items": pending_items,
    }


@api_router.get("/connections/providers")
async def provider_status(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    providers = ["venmo", "cashapp", "chime", "paypal", "bank"]
    accounts = await db.accounts.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(500)

    data: list[dict[str, Any]] = []
    for provider in providers:
        subset = [acc for acc in accounts if acc.get("provider") == provider]
        total_balance = round(sum(float(acc.get("current_balance") or 0) for acc in subset), 2)
        data.append(
            {
                "provider": provider,
                "connected": len(subset) > 0,
                "account_count": len(subset),
                "total_balance": total_balance,
            }
        )

    plaid_connections = await db.plaid_items.count_documents({"user_id": current_user["id"]})
    return {
        "providers": data,
        "plaid_connections": plaid_connections,
        "plaid_configured": is_plaid_configured(),
    }


@api_router.post("/transactions/manual")
async def create_manual_transaction(
    payload: ManualTransactionCreate,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        parse_date_safe(payload.transaction_date)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="transaction_date must be YYYY-MM-DD") from error

    tx_doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "provider": payload.provider,
        "account_id": payload.account_id,
        "external_transaction_id": None,
        "amount": round(payload.amount, 2),
        "direction": payload.direction,
        "category": payload.category.strip().lower(),
        "description": payload.description.strip(),
        "transaction_date": payload.transaction_date,
        "source": "manual",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.transactions.insert_one(dict(tx_doc))
    return tx_doc


@api_router.get("/transactions")
async def list_transactions(
    provider: Optional[str] = None,
    category: Optional[str] = None,
    direction: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    query: dict[str, Any] = {"user_id": current_user["id"]}
    if provider:
        query["provider"] = provider
    if category:
        query["category"] = category.lower()
    if direction:
        query["direction"] = direction
    if start_date or end_date:
        date_filters: dict[str, Any] = {}
        if start_date:
            date_filters["$gte"] = start_date
        if end_date:
            date_filters["$lte"] = end_date
        query["transaction_date"] = date_filters
    if search:
        query["description"] = {"$regex": search, "$options": "i"}

    skip_count = (page - 1) * limit
    cursor = (
        db.transactions.find(query, {"_id": 0})
        .sort("transaction_date", -1)
        .skip(skip_count)
        .limit(limit)
    )
    transactions = await cursor.to_list(limit)
    total_count = await db.transactions.count_documents(query)

    return {
        "transactions": transactions,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total_count,
            "pages": (total_count + limit - 1) // limit,
        },
    }


@api_router.get("/dashboard/summary")
async def dashboard_summary(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    accounts = await db.accounts.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(500)
    transactions = (
        await db.transactions.find({"user_id": current_user["id"]}, {"_id": 0})
        .sort("transaction_date", -1)
        .to_list(1000)
    )

    total_balance = round(sum(float(acc.get("current_balance") or 0) for acc in accounts), 2)
    income = round(
        sum(tx["amount"] for tx in transactions if tx.get("direction") == "income"),
        2,
    )
    expenses = round(
        sum(tx["amount"] for tx in transactions if tx.get("direction") == "expense"),
        2,
    )

    monthly_index: dict[str, dict[str, Any]] = {}
    for tx in transactions:
        tx_date = tx.get("transaction_date")
        if not tx_date:
            continue
        month_key = tx_date[:7]
        if month_key not in monthly_index:
            monthly_index[month_key] = {"month": month_key, "income": 0.0, "expenses": 0.0}
        if tx.get("direction") == "income":
            monthly_index[month_key]["income"] += tx.get("amount", 0.0)
        else:
            monthly_index[month_key]["expenses"] += tx.get("amount", 0.0)

    monthly_data = [
        {
            "month": month,
            "income": round(values["income"], 2),
            "expenses": round(values["expenses"], 2),
        }
        for month, values in sorted(monthly_index.items())[-6:]
    ]

    return {
        "metrics": {
            "total_balance": total_balance,
            "income": income,
            "expenses": expenses,
            "net": round(income - expenses, 2),
            "account_count": len(accounts),
            "transaction_count": len(transactions),
        },
        "monthly_cashflow": monthly_data,
        "recent_transactions": transactions[:8],
    }


@api_router.post("/advisor/weekly-review")
async def advisor_weekly_review(
    payload: AdvisorReviewInput,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    week_window = week_range_strings()
    transactions = await db.transactions.find(
        {
            "user_id": current_user["id"],
            "transaction_date": {
                "$gte": week_window["previous_start"],
                "$lte": week_window["current_end"],
            },
        },
        {"_id": 0},
    ).to_list(3000)

    current_transactions = [
        tx
        for tx in transactions
        if week_window["current_start"] <= (tx.get("transaction_date") or "") <= week_window["current_end"]
    ]
    previous_transactions = [
        tx
        for tx in transactions
        if week_window["previous_start"] <= (tx.get("transaction_date") or "") <= week_window["previous_end"]
    ]

    current_summary = transactions_summary_window(current_transactions)
    previous_summary = transactions_summary_window(previous_transactions)
    score_data = compute_weekly_financial_health(current_summary, previous_summary)
    action_steps = build_default_actions(current_summary, score_data["comparison"])
    advisor_analysis = await generate_ai_advisor_analysis(
        score_data,
        current_summary,
        previous_summary,
        action_steps,
        payload.custom_prompt,
    )

    return {
        "week_window": week_window,
        "score": score_data["score"],
        "label": score_data["label"],
        "current_week": current_summary,
        "previous_week": previous_summary,
        "comparison": score_data["comparison"],
        "score_breakdown": score_data["score_breakdown"],
        "why_changed": score_data["why_changed"],
        "action_steps": action_steps,
        "advisor_analysis": advisor_analysis,
        "custom_prompt": payload.custom_prompt,
    }


@api_router.post("/advisor/weekly-review/pdf")
async def advisor_weekly_review_pdf(
    payload: AdvisorPdfInput,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> StreamingResponse:
    review_data = payload.review_data or {}
    pdf_title = (
        f"Financial Flow Weekly Advisor Score {review_data.get('score', 0)}"
    )
    pdf_content = advisor_pdf_content(review_data)
    pdf_bytes = build_pdf_bytes(pdf_title, pdf_content)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=financial-flow-weekly-advisor.pdf"},
    )


@api_router.post("/reports/generate")
async def generate_report(
    payload: GenerateReportInput,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    query: dict[str, Any] = {"user_id": current_user["id"]}
    if payload.filters.provider:
        query["provider"] = payload.filters.provider
    if payload.filters.category:
        query["category"] = payload.filters.category.lower()
    if payload.filters.start_date or payload.filters.end_date:
        date_filters: dict[str, Any] = {}
        if payload.filters.start_date:
            date_filters["$gte"] = payload.filters.start_date
        if payload.filters.end_date:
            date_filters["$lte"] = payload.filters.end_date
        query["transaction_date"] = date_filters

    transactions = await db.transactions.find(query, {"_id": 0}).to_list(2000)
    summary = summarize_transactions(transactions)
    ai_section = await generate_ai_section(payload.prompt, summary, transactions)
    report_content = report_body(summary, payload.filters.model_dump(), ai_section, now_iso())

    report_doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "title": payload.title,
        "content": report_content,
        "prompt": payload.prompt,
        "filters": payload.filters.model_dump(),
        "summary": summary,
        "ai_enabled": bool(ai_section),
        "created_at": now_iso(),
    }
    await db.reports.insert_one(dict(report_doc))
    return report_doc


@api_router.get("/reports")
async def list_reports(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    reports = (
        await db.reports.find({"user_id": current_user["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(100)
    )
    return {"reports": reports}


@api_router.get("/reports/{report_id}")
async def get_report(
    report_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    report = await db.reports.find_one(
        {"id": report_id, "user_id": current_user["id"]},
        {"_id": 0},
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@api_router.get("/reports/{report_id}/pdf")
async def download_report_pdf(
    report_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> StreamingResponse:
    report = await db.reports.find_one(
        {"id": report_id, "user_id": current_user["id"]},
        {"_id": 0},
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    pdf_bytes = build_pdf_bytes(report["title"], report["content"])
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={report_id}.pdf"},
    )


@api_router.post("/webhooks/plaid")
async def plaid_webhook() -> dict[str, str]:
    return {"status": "received"}


@app.on_event("startup")
async def startup_seed_demo() -> None:
    demo_email = "demo@aurafinance.app"
    existing = await db.users.find_one({"email": demo_email}, {"_id": 0})
    if not existing:
        demo_user = {
            "id": str(uuid.uuid4()),
            "email": demo_email,
            "full_name": "Financial Flow Demo",
            "password_hash": password_context.hash("Demo123!"),
            "google_id": None,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.users.insert_one(dict(demo_user))
        logger.info("Seeded demo account: %s", demo_email)
    elif existing.get("full_name") in {"Demo User", "Financial Flow Demo User"}:
        await db.users.update_one(
            {"id": existing["id"]},
            {"$set": {"full_name": "Financial Flow Demo", "updated_at": now_iso()}},
        )


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)