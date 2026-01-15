# GreenSVC

Urban greenspace visual analysis platform with AI-powered indicator recommendations.

## Architecture

This is a monorepo containing:

- **Backend**: FastAPI REST API with Celery for async tasks
- **Frontend**: React + TypeScript + Chakra UI

## Tech Stack

### Backend
- FastAPI (REST API)
- Celery + Redis (async tasks)
- PostgreSQL (database)
- SQLAlchemy 2.0 (ORM)
- Pydantic (validation)
- JWT Authentication

### Frontend
- React 18 + TypeScript
- Vite (build tool)
- Chakra UI v2 (components)
- TanStack Query (data fetching)
- Zustand (state management)
- React Router v6 (routing)

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### Local Development

1. **Clone and setup backend:**
```bash
cd packages/backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys
```

2. **Setup frontend:**
```bash
cd packages/frontend
npm install
```

3. **Start services:**
```bash
# Terminal 1: Backend
cd packages/backend
uvicorn app.main:app --reload

# Terminal 2: Celery worker
cd packages/backend
celery -A app.core.celery_app worker --loglevel=info

# Terminal 3: Frontend
cd packages/frontend
npm run dev
```

4. **Access:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8080
- API Docs: http://localhost:8080/docs

### Docker Development

```bash
# Start all services
docker-compose up -d

# Or with hot reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Project Structure

```
greensvc/
├── packages/
│   ├── backend/
│   │   ├── app/
│   │   │   ├── api/routes/      # API endpoints
│   │   │   ├── core/            # Config, database, celery
│   │   │   ├── db/              # SQLAlchemy models
│   │   │   ├── models/          # Pydantic schemas
│   │   │   ├── services/        # Business logic
│   │   │   └── tasks/           # Celery tasks
│   │   ├── data/                # Knowledge base, metrics code
│   │   └── Dockerfile
│   └── frontend/
│       ├── src/
│       │   ├── api/             # API client
│       │   ├── hooks/           # React Query hooks
│       │   ├── pages/           # Page components
│       │   ├── store/           # Zustand store
│       │   └── types/           # TypeScript types
│       └── Dockerfile
├── docker-compose.yml
└── docker-compose.dev.yml
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user
- `POST /api/auth/refresh` - Refresh token

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/{id}` - Get project
- `PUT /api/projects/{id}` - Update project
- `DELETE /api/projects/{id}` - Delete project

### Vision Analysis
- `POST /api/vision/analyze` - Analyze single image
- `POST /api/vision/analyze-batch` - Batch analysis (async)
- `GET /api/vision/semantic-config` - Get semantic classes

### Indicators
- `POST /api/indicators/recommend` - AI-powered recommendations
- `GET /api/indicators/knowledge-base` - Knowledge base summary

### Metrics
- `GET /api/metrics` - List calculators
- `POST /api/metrics/upload` - Upload calculator
- `POST /api/metrics/calculate` - Calculate indicator
- `POST /api/metrics/calculate-batch` - Batch calculation

### Tasks
- `GET /api/tasks/{task_id}` - Get task status

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_API_KEY` | Google Gemini API key | - |
| `VISION_API_URL` | Vision analysis API URL | http://127.0.0.1:8000 |
| `DATABASE_URL` | PostgreSQL connection | postgresql://postgres:postgres@localhost:5432/greensvc |
| `REDIS_HOST` | Redis host | localhost |
| `SECRET_KEY` | JWT secret key | (change in production) |

## Features

### Vision Analysis
- Upload images for semantic segmentation
- Configure semantic classes with countability and openness
- View class distribution statistics

### Indicator Recommendation
- Select performance dimensions (Aesthetics, Behavior, Comfort, etc.)
- AI-powered recommendations using Gemini
- Evidence-based matching from knowledge base

### Metrics Calculation
- Upload custom calculator scripts
- Batch process images
- Export results as JSON

### Settings
- System status monitoring
- API connection testing
- Knowledge base statistics

## License

MIT
