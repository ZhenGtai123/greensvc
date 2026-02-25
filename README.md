# GreenSVC - Urban Greenspace Analysis Platform

Automated urban greenspace performance analysis: upload site photos, run AI-powered segmentation, calculate environmental indicators, and generate design strategies.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React + Chakra UI)  :5173                │
│  Pages: Projects → Vision → Indicators → Reports    │
└────────────────────┬────────────────────────────────┘
                     │ HTTP (Axios)
┌────────────────────▼────────────────────────────────┐
│  Backend (FastAPI)  :8080                           │
│  /api/projects  /api/vision  /api/metrics           │
│  /api/indicators  /api/analysis  /api/config        │
└──────┬──────────────┬───────────────────────────────┘
       │              │ HTTP
       │   ┌──────────▼──────────┐
       │   │ Vision API  :8000   │  (AI_City_View, 独立部署)
       │   │ Semantic segmentation│
       │   └─────────────────────┘
       │
  ┌────▼──────┐  ┌────────────┐
  │ LLM API   │  │ Redis      │  (optional)
  │ Gemini/   │  │ + Celery   │
  │ OpenAI/.. │  └────────────┘
  └───────────┘
```

## Pipeline Stages

| Stage | Description | Component |
|-------|-------------|-----------|
| 1 | **Indicator Recommendation** — LLM selects relevant indicators from knowledge base | `RecommendationService` |
| 2 | **Vision Analysis** — Semantic segmentation + FMB layer masks | Vision API → `VisionModelClient` |
| 2.5 | **Metrics Calculation** — Per-image indicator values from semantic maps, aggregated by zone + layer (full/foreground/middleground/background) | `MetricsCalculator` → `MetricsAggregator` |
| 3 | **Zone Analysis** — Z-score diagnostics across zones | `ZoneAnalyzer` |
| 4 | **Design Strategies** — LLM-generated intervention strategies | `DesignEngine` |

## Tech Stack

**Backend:** FastAPI, Pydantic v2, Multi-LLM (Gemini/OpenAI/Anthropic/DeepSeek), Pillow, NumPy, OpenCV

**Frontend:** React 19, TypeScript, Vite 7, Chakra UI v2, TanStack Query v5, Zustand v5, React Router v7

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **LLM API key** — 至少一个: Google (Gemini) / OpenAI / Anthropic / DeepSeek
- **Vision API** — [AI_City_View](../AI_City_View) 独立部署，需要 NVIDIA GPU

## 部署

GreenSVC 和 AI_City_View 是两个独立服务，分开部署。

### 首次安装

```bash
# ---- Backend ----
cd packages/backend
python -m venv venv
venv\Scripts\activate            # Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env             # 编辑 .env，检查 API Key 配置

# ---- Frontend ----
cd packages/frontend
npm install
```

### 日常启动（两个终端）

```bash
# 终端 1 — Backend
cd packages/backend
venv\Scripts\activate
python -m app.main               # http://localhost:8080

# 终端 2 — Frontend
cd packages/frontend
npm run dev                      # http://localhost:5173
```

> Vision API (AI_City_View) 需要单独启动，见 [AI_City_View README](../AI_City_View/README.md)。
> 如果 Vision API 未运行，其他功能（项目管理、指标推荐、报告计算）仍可正常使用。

### 生产部署

```bash
# Backend — 多 worker
uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers 4

# Frontend — 构建静态文件，用 nginx 托管
cd packages/frontend
npm run build                    # 输出到 dist/
```

<details>
<summary>Nginx 反向代理配置</summary>

```nginx
server {
    listen 80;
    server_name greensvc.example.com;

    location / {
        root /var/www/greensvc/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 50M;
        proxy_read_timeout 600s;
    }

    location /health {
        proxy_pass http://127.0.0.1:8080;
    }
}
```
</details>

## Environment Variables

配置文件: `packages/backend/.env`（参考 `.env.example`）

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `gemini` | LLM 提供商: `gemini` / `openai` / `anthropic` / `deepseek` |
| `GOOGLE_API_KEY` | | Google Gemini API key |
| `OPENAI_API_KEY` | | OpenAI API key |
| `ANTHROPIC_API_KEY` | | Anthropic API key |
| `DEEPSEEK_API_KEY` | | DeepSeek API key |
| `VISION_API_URL` | `http://127.0.0.1:8000` | Vision API 地址 |
| `PORT` | `8080` | 后端端口 |
| `DEBUG` | `false` | 开发模式自动重载 |

Frontend 可选: `VITE_API_URL`（默认 `http://localhost:8080`）

## Data Directory

```
packages/backend/
├── data/
│   ├── A_indicators.xlsx            # 指标定义库
│   ├── Semantic_configuration.json  # 语义类别→颜色映射
│   ├── metrics_code/                # 计算器 Python 文件 (每个指标一个)
│   └── knowledge_base/              # 知识库 JSON (LLM 推荐用)
├── temp/
│   ├── uploads/{project_id}/        # 上传的项目图片
│   └── masks/{project_id}/{image_id}/  # Vision 分割掩膜
└── outputs/
```

## Usage Workflow

1. **创建项目** — 设置名称、位置、气候区、性能维度、空间分区
2. **上传图片** — 上传现场照片，分配到空间分区
3. **视觉分析** — 通过 Vision API 进行语义分割，掩膜自动保存到项目
4. **指标推荐** — LLM 根据项目上下文推荐相关指标
5. **运行管线** — 完整分析: 指标计算 → 多层聚合 → Z-score 诊断 → 设计策略
6. **查看报告** — 在 Reports 页面选择项目，浏览结果，导出 JSON

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/projects` | 创建项目 |
| `POST` | `/api/projects/{id}/images` | 上传图片 |
| `POST` | `/api/vision/analyze/project-image` | 分析项目图片 + 保存掩膜 |
| `POST` | `/api/indicators/recommend` | 获取指标推荐 |
| `POST` | `/api/analysis/project-pipeline` | 运行完整分析管线 |
| `GET` | `/api/config/llm-providers` | 列出 LLM 提供商 |
| `PUT` | `/api/config/llm-provider?provider=openai` | 运行时切换 LLM |

完整 API 文档: **http://localhost:8080/docs**

## Known Limitations

- **内存存储** — 后端重启后项目数据丢失（暂未接数据库）
- **认证未启用** — Auth 路由存在但未强制
- **Vision API 独立** — 需要单独部署，需要 GPU

## License

MIT
