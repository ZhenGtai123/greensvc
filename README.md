# SceneRx — Urban Greenspace Analysis Platform

Automated urban greenspace performance analysis: upload site photos, run AI-powered segmentation, calculate environmental indicators, and generate design strategies.

This repository accompanies the paper *(citation pending)* and bundles the full reproducibility pipeline: web frontend, API backend, and the [AI_City_View](../AI_City_View) computer-vision service (semantic segmentation + metric depth estimation).

---

## Quick Start (Docker)

### 1. Prerequisites

| Required | Why |
|---|---|
| **Docker Engine 24+** with `docker compose` (or Docker Desktop on Windows / Mac) | runs the containers |
| **NVIDIA GPU**, driver ≥ 525, ≥ 8 GB VRAM | needed by the Vision API container |
| **NVIDIA Container Toolkit** ([install guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)) | lets Docker access the GPU |
| **LLM API key** — at least one of Google Gemini / OpenAI / Anthropic / DeepSeek | drives recommendation + design strategy stages |

| Model | Min VRAM | Notes |
|---|---|---|
| `DA3METRIC-LARGE` *(default)* | **8 GB** | canonical depth + focal-length conversion to meters |
| `DA3NESTED-GIANT-LARGE-1.1` | **16 GB** | native metric depth + built-in sky detection |

> **Windows users:** Docker Desktop must use the WSL2 backend, and the NVIDIA Container Toolkit must be installed *inside* WSL2 (not Windows). Verify with `docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi`.

### 2. Clone both repositories side-by-side

```bash
mkdir scenerx-workspace && cd scenerx-workspace
git clone <ai-city-view-url> AI_City_View
git clone <scenerx-url> scenerx
cd scenerx
```

Resulting layout:

```
scenerx-workspace/
├── AI_City_View/        # vision API + pipeline code
└── scenerx/             # platform + docker-compose.yml  ← run from here
```

### 3. Configure secrets

```bash
cp .env.example .env
# Open .env and at minimum fill in: GOOGLE_API_KEY=...   (or another LLM key)
```

### 4. Launch

```bash
docker-compose up -d
docker-compose logs -f vision-api   # follow vision-api startup (Ctrl+C to detach)
```

**Realistic first-run time: 15–25 minutes**, breakdown:

| Step | Duration |
|---|---|
| Pull / build all images | 10–15 min (downloads PyTorch CUDA wheel ~2 GB) |
| Vision API model download | 5–10 min (OneFormer + DA3, total ~5 GB, cached in `hf_cache` volume) |
| Subsequent restarts | <30 s (everything cached) |

### 5. Verify it's up

```bash
curl http://localhost:8000/health   # vision-api: should report depth_model + GPU info
curl http://localhost:8080/health   # backend
```

Then open the UI: **http://localhost:3000**

### Switching the depth model

```bash
# Edit .env → VISION_DEPTH_MODEL=DA3NESTED-GIANT-LARGE-1.1
docker-compose restart vision-api
```

### Without a local GPU

Point the backend to a remote Vision API and skip the local container:

```bash
# In .env:
VISION_API_URL=http://your-vision-host:8000
docker-compose up -d --scale vision-api=0
```

A Colab notebook (`AI_City_View/vision_api_colab.ipynb`) and a Hugging Face Space scaffold (`hf_space/`) are provided as alternative hosts.

### Sample inputs

Drop test images into `samples/` to try the pipeline without your own data — see [`samples/README.md`](./samples/README.md) for format requirements (PNG/JPG, 360° panorama or single view).

> Manual (non-Docker) setup is documented in **[Manual Setup](#manual-setup)** below.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React + Chakra UI)                       │
│    Docker: :3000   |   Dev (npm run dev): :5173     │
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
       │   │ Vision API  :8000   │  (AI_City_View, separate service)
       │   │ Semantic + depth    │
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

## Manual Setup

Use this if you'd rather skip Docker. Requirements:

- **Python 3.11+**
- **Node.js 18+**
- **LLM API key** — at least one of: Google (Gemini) / OpenAI / Anthropic / DeepSeek
- **Vision API** — [AI_City_View](../AI_City_View) deployed separately (requires NVIDIA GPU)

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

#### Windows 端口冲突

如果 backend 启动时报 `[WinError 10013]`，说明端口被 Windows Hyper-V / WSL2
动态保留了（这些保留每次重启会变化）。Backend 启动脚本会自动检测并打印两个
修复方案：

```powershell
# 方案 1（一次性）：换个端口跑这一次
$env:PORT="8500"; python -m app.main

# 方案 2（推荐 · 永久）：把 8080 从 Hyper-V 抓取池里抠出来
# 管理员 PowerShell，运行一次即可，store=persistent 保证重启保留
netsh int ipv4 add excludedportrange protocol=tcp startport=8080 numberofports=1 store=persistent
```

查看当前所有保留段：`netsh interface ipv4 show excludedportrange protocol=tcp`

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
    server_name scenerx.example.com;

    location / {
        root /var/www/scenerx/dist;
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

- **In-memory storage** — projects are lost on backend restart (database integration pending).
- **Auth not enforced** — auth routes exist but `AUTH_ENABLED=false` by default.
- **Vision API separate** — runs as its own container/service; requires a GPU when self-hosted.

## Citation

If you use SceneRx in academic work, please cite:

```bibtex
@misc{scenerx2026,
  title  = {SceneRx: An AI-Augmented Pipeline for Urban Greenspace Performance Diagnosis},
  author = {{Authors pending}},
  year   = {2026},
  note   = {Paper in preparation. Code: https://github.com/<org>/scenerx}
}
```

The vision module relies on:

- **OneFormer** — Jain et al., *OneFormer: One Transformer to Rule Universal Image Segmentation*, CVPR 2023.
- **Depth Anything V3** — ByteDance Seed et al., *Depth Anything 3: Recovering the Visual Space from Any Views*, 2025.

## License

Released under the **MIT License** — see [LICENSE](./LICENSE).
