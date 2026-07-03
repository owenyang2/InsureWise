#!/usr/bin/env bash
set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

echo ""
echo "=============================="
echo "  InsureWise — Local Setup"
echo "=============================="
echo ""

# ------------------------------------------------------------------
# 1. Check prerequisites
# ------------------------------------------------------------------
info "Checking prerequisites..."

# Node.js
if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Install v20.19+ or v22.12+ from https://nodejs.org or via nvm."
  exit 1
fi
NODE_VERSION=$(node -v | sed 's/v//')
info "  Node.js $NODE_VERSION ✓"

# pnpm
if command -v pnpm &>/dev/null; then
  PNPM_CMD="pnpm"
elif npx pnpm --version &>/dev/null 2>&1; then
  PNPM_CMD="npx pnpm"
  warn "  pnpm not found globally — using 'npx pnpm'. Install globally with: npm install -g pnpm"
else
  error "pnpm is not installed. Run: npm install -g pnpm"
  exit 1
fi
info "  pnpm ✓ (using: $PNPM_CMD)"

# PostgreSQL
if ! command -v psql &>/dev/null; then
  if command -v docker &>/dev/null; then
    warn "  psql not found — use Docker Postgres (see README) or: sudo apt install postgresql"
    warn "  Example: docker run --name insurewise-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16"
  else
    error "PostgreSQL client (psql) is not installed. Install Postgres, use Docker, or see README."
    exit 1
  fi
else
  info "  PostgreSQL ✓"
fi

# Python
PYTHON_CMD=""
if command -v python3 &>/dev/null; then
  PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
  PYTHON_CMD="python"
fi
if [ -z "$PYTHON_CMD" ]; then
  warn "  Python not found — Moorcheh Knowledge Assistant will not work. Install Python 3.10+."
else
  info "  Python ✓ ($($PYTHON_CMD --version))"
fi

echo ""

# ------------------------------------------------------------------
# 2. Install Node dependencies
# ------------------------------------------------------------------
info "Installing Node dependencies..."
CI=true $PNPM_CMD install --no-frozen-lockfile
echo ""

# ------------------------------------------------------------------
# 3. Set up .env file
# ------------------------------------------------------------------
ENV_FILE="artifacts/api-server/.env"

if [ -f "$ENV_FILE" ]; then
  info ".env file already exists at $ENV_FILE — skipping creation."
else
  if [ -f "artifacts/api-server/.env.example" ]; then
    info "Creating $ENV_FILE from .env.example..."
    cp artifacts/api-server/.env.example "$ENV_FILE"
    DB_USER=$(whoami)
    if [[ "$OSTYPE" != "darwin"* ]]; then
      sed -i "s|postgresql://YOUR_USERNAME@|postgresql://$DB_USER@|" "$ENV_FILE" 2>/dev/null || true
    else
      sed -i '' "s|postgresql://YOUR_USERNAME@|postgresql://$DB_USER@|" "$ENV_FILE" 2>/dev/null || true
    fi
    info ".env created from template (DATABASE_URL username: '$DB_USER')."
  else
  DB_USER=$(whoami)
  info "Creating $ENV_FILE..."
  cat > "$ENV_FILE" <<EOF
PORT=3001

# Local Postgres — auto-detected username: $DB_USER
DATABASE_URL=postgresql://$DB_USER@localhost:5432/insurewise

# Default AI: hackathon HF endpoint (best-effort; may be unavailable)
OPENAI_API_KEY=test
OPENAI_BASE_URL=https://vjioo4r1vyvcozuj.us-east-2.aws.endpoints.huggingface.cloud/v1
AI_MODEL=openai/gpt-oss-120b

# Recommended — your own OpenAI key:
# OPENAI_API_KEY=sk-your-key-here
# OPENAI_BASE_URL=https://api.openai.com/v1
# AI_MODEL=gpt-4o-mini

# Optional — Moorcheh "Ask Expert" only: https://console.moorcheh.ai/api-keys
MOORCHEH_API_KEY=
EOF
  info ".env created with DATABASE_URL using username '$DB_USER'."
  fi
fi
echo ""

# ------------------------------------------------------------------
# 4. Create database (if it doesn't exist)
# ------------------------------------------------------------------
info "Setting up PostgreSQL database..."
if command -v psql &>/dev/null; then
if psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw insurewise; then
  info "  Database 'insurewise' already exists — skipping."
else
  info "  Creating database 'insurewise'..."
  if createdb insurewise 2>/dev/null; then
    info "  Database created ✓"
  else
    warn "  Could not create database. You may need to run manually:"
    warn "    sudo -u postgres createuser --superuser \$(whoami)"
    warn "    createdb insurewise"
    warn "  Or use Docker Postgres — see README."
  fi
fi
else
  warn "  Skipping createdb (no psql). Ensure DATABASE_URL points at an existing 'insurewise' database."
fi
echo ""

# ------------------------------------------------------------------
# 5. Push database schema
# ------------------------------------------------------------------
info "Pushing database schema..."
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
$PNPM_CMD --filter @workspace/db run push
echo ""

# ------------------------------------------------------------------
# 6. Install Python dependencies (if Python is available)
# ------------------------------------------------------------------
if [ -n "$PYTHON_CMD" ]; then
  info "Installing Python dependencies (virtualenv)..."
  if [ ! -d .venv ]; then
    $PYTHON_CMD -m venv .venv || warn "Could not create .venv — install python3-venv if needed."
  fi
  if [ -x .venv/bin/pip ]; then
    .venv/bin/pip install -r artifacts/api-server/src/python-workers/requirements.txt --quiet || \
      warn "Could not install Python deps. Run: source .venv/bin/activate && pip install -r artifacts/api-server/src/python-workers/requirements.txt"
  else
    warn "No .venv pip — on Ubuntu/Debian run: sudo apt install python3-venv"
    warn "Then: python3 -m venv .venv && source .venv/bin/activate && pip install -r artifacts/api-server/src/python-workers/requirements.txt"
  fi
  echo ""
fi

# ------------------------------------------------------------------
# Done!
# ------------------------------------------------------------------
echo ""
echo "=============================="
echo "  Setup complete!"
echo "=============================="
echo ""
info "To start the app, run:"
echo ""
echo "    pnpm dev"
echo ""
info "Then open http://localhost:5173"
echo ""
info "Optional: seed the Moorcheh knowledge base (requires MOORCHEH_API_KEY in .env):"
echo "    source .venv/bin/activate && python scripts/seed-moorcheh.py"
echo ""
