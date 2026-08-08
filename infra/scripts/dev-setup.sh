#!/bin/bash
# =============================================================================
# Bahi Khata Pro - Local Development Setup Script
# =============================================================================

set -e

echo "🚀 Bahi Khata Pro - Development Setup"
echo "======================================"

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# 1. Check prerequisites
echo ""
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js >= 20"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js version must be >= 20. Current: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v)"

if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker is not installed. You'll need to set up PostgreSQL and Redis manually."
else
    echo "✅ Docker $(docker --version | cut -d' ' -f3)"
fi

# 2. Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# 3. Setup environment
if [ ! -f .env ]; then
    echo ""
    echo "🔧 Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ .env file created. Please update secrets for production."
else
    echo "✅ .env file already exists"
fi

# 4. Start infrastructure (if Docker is available)
if command -v docker &> /dev/null; then
    echo ""
    echo "🐳 Starting infrastructure services (PostgreSQL + Redis)..."
    docker-compose -f infra/docker/docker-compose.yml up -d postgres redis
    echo "⏳ Waiting for PostgreSQL to be ready..."
    sleep 5
fi

# 5. Generate Prisma client
echo ""
echo "🔧 Generating Prisma client..."
cd packages/shared
npx prisma generate
cd "$PROJECT_ROOT"

# 6. Run database migrations
echo ""
echo "📊 Running database migrations..."
cd packages/shared
npx prisma migrate dev --name init 2>/dev/null || npx prisma db push
cd "$PROJECT_ROOT"

# 7. Seed database
echo ""
echo "🌱 Seeding database..."
cd packages/shared
npx prisma db seed 2>/dev/null || echo "⚠️  Seed skipped (may already be seeded)"
cd "$PROJECT_ROOT"

# 8. Build shared package
echo ""
echo "🔨 Building shared package..."
cd packages/shared
npm run build
cd "$PROJECT_ROOT"

echo ""
echo "======================================"
echo "✅ Setup complete!"
echo ""
echo "To start all services in dev mode:"
echo "  npm run dev:all"
echo ""
echo "Or start individual services:"
echo "  npm run dev:gateway     # API Gateway (port 3000)"
echo "  npm run dev:auth        # Auth Service (port 3001)"
echo "  npm run dev:business    # Business Service (port 3002)"
echo "  npm run dev:purchase    # Purchase Service (port 3003)"
echo "  npm run dev:sales       # Sales Service (port 3004)"
echo "  npm run dev:inventory   # Inventory Service (port 3005)"
echo "  npm run dev:ledger      # Ledger Service (port 3006)"
echo "  npm run dev:frontend    # Frontend (port 5173)"
echo ""
echo "To open Prisma Studio:"
echo "  npm run db:studio"
echo "======================================"
