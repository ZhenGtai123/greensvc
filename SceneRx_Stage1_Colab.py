# ═══════════════════════════════════════════════════════════════════════════════
# SceneRx-AI Stage 1 — SVCs → P Evidence-Based Indicator Matching
# Two-Agent Architecture (google-genai SDK + gemini-3.1-pro-preview)
#
#   Agent 1 (Evidence Assessor):  per-indicator assessment cards
#   Agent 2 (Ranker & Selector):  rank, select top 5–8, output final JSON
#
# Transferability is PRE-COMPUTED in Python — never delegated to LLM.
# ═══════════════════════════════════════════════════════════════════════════════

# %% [markdown]
# # SceneRx-AI Stage 1 — SVCs → P Evidence-Based Indicator Matching
#
# **Model**: `gemini-3.1-pro-preview` via `google-genai` SDK
#
# **Architecture**: Two-agent pipeline
# - Agent 1 — Evidence Assessor (per-indicator strength cards)
# - Agent 2 — Ranker & Selector (final recommendation JSON)
#
# **Key design**: Transferability matching is computed deterministically in
# Python, not by the LLM.

# %% [markdown]
# ## 0. Install & Imports

# %%
# !pip install -q google-genai

import json
import os
import time
from pathlib import Path
from collections import defaultdict, Counter
from datetime import datetime

from google import genai
from google.genai import types

print("✅ google-genai SDK imported")

# %% [markdown]
# ## 1. Configuration

# %%
CONFIG = {
    "evidence_path":      "/content/drive/MyDrive/SceneRx-AI-paper/KnowledgeBase/SVCs_P_Evidence.json",
    "encoding_dict_path": "/content/drive/MyDrive/SceneRx-AI-paper/KnowledgeBase/Encoding_Dictionary.json",
    "context_path":       "/content/drive/MyDrive/SceneRx-AI-paper/KnowledgeBase/Transferability_Context.json",
    "user_query_path":    "/content/drive/MyDrive/SceneRx-AI-paper/UserQueries/scenerx_query_WestLake_ThermalComfort.json",
    "output_path":        "/content/drive/MyDrive/SceneRx-AI-paper/Outputs",

    "model_name":         "gemini-3.1-pro-preview",
    "temperature":        0.2,
    "max_output_tokens":  32768,
    "thinking_level":     "high",

    "max_evidence":       60,
    "max_context":        30,
    "max_codebook_chars": 40000,
}

print(f"⚙️  Model: {CONFIG['model_name']}")
print(f"⚙️  Thinking: {CONFIG['thinking_level']}")
print(f"⚙️  Max context: {CONFIG['max_context']}")

# %% [markdown]
# ## 2. API Key & Client

# %%
try:
    from google.colab import userdata
    GOOGLE_API_KEY = userdata.get('GOOGLE_API_KEY')
    print("✅ API Key from Colab Secrets")
except Exception:
    GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY') or input("Enter Google API Key: ")

client = genai.Client(api_key=GOOGLE_API_KEY)
print("✅ GenAI client created")

# %% [markdown]
# ## 3. Mount Drive

# %%
try:
    from google.colab import drive
    drive.mount('/content/drive')
    print("✅ Drive mounted")
except Exception:
    print("⚠️  Not in Colab or Drive already mounted")

# %% [markdown]
# ## 4. Encoding Dictionary

# %%
class EncodingDictionary:
    """Load Encoding_Dictionary.json and extract a prompt-sized subset."""

    PRIORITY = [
        'A_indicators', 'A_categories',
        'C_performance', 'C_subdimensions', 'C_outcome_types', 'C_theories',
        'D_directions', 'D_significance', 'D_relationships',
        'D_effect_size_types', 'D_stat_tests',
        'B_methods', 'B_units', 'B_data_sources', 'B_tools',
        'E_study_design', 'E_sample_units', 'E_settings', 'E_countries',
        'K_climate', 'L_lcz', 'M_age_groups',
        'F_quality',
        'Z_semantic_layers', 'Z_spatial_layers', 'Z_morphological_attributes',
        'G_pathways', 'H_subtypes',
    ]

    def __init__(self, path):
        self.data = {}
        p = Path(path)
        if p.exists():
            self.data = json.load(open(p, encoding='utf-8'))
            total = sum(len(v) for v in self.data.values() if isinstance(v, dict))
            print(f"📖 Encoding Dictionary: {len(self.data)} tables, {total} codes")
        else:
            print(f"❌ Not found: {path}")

    def subset(self, max_chars=40000):
        out, sz = {}, 0
        for name in self.PRIORITY:
            table = self.data.get(name)
            if not table or not isinstance(table, dict):
                continue
            simplified = {}
            for code, entry in table.items():
                if not isinstance(entry, dict):
                    continue
                item = {
                    "name": entry.get('name', code),
                    "definition": entry.get('definition', '')[:200],
                }
                if name == 'A_indicators':
                    if entry.get('formula'):
                        item["formula"] = entry['formula'][:150]
                    if entry.get('category'):
                        item["category"] = entry['category']
                simplified[code] = item
            chunk = len(json.dumps(simplified, ensure_ascii=False))
            if sz + chunk < max_chars:
                out[name] = simplified
                sz += chunk
        return out

encoding_dict = EncodingDictionary(CONFIG['encoding_dict_path'])

# %% [markdown]
# ## 5. Knowledge Base

# %%
class KnowledgeBase:
    """Index SVCs_P_Evidence and Transferability_Context."""

    def __init__(self, evidence_path, context_path):
        self.evidence = []
        self.dim_idx = defaultdict(list)
        self.subdim_idx = defaultdict(list)
        self.ctx_by_evidence = {}

        p = Path(evidence_path)
        if p.exists():
            self.evidence = json.load(open(p, encoding='utf-8'))
            print(f"📚 SVCs_P_Evidence: {len(self.evidence)} records")
            self._build_index()
        else:
            print(f"❌ Not found: {evidence_path}")

        p2 = Path(context_path)
        if p2.exists():
            contexts = json.load(open(p2, encoding='utf-8'))
            print(f"🌍 Transferability_Context: {len(contexts)} records")
            for c in contexts:
                for rid in c.get('linked_records', []):
                    if rid.startswith('SVCs_P_'):
                        self.ctx_by_evidence[rid] = c
        else:
            print(f"❌ Not found: {context_path}")

    def _build_index(self):
        for e in self.evidence:
            perf = e.get('performance', {})
            dim = perf.get('dimension_id')
            subdim = perf.get('subdimension_id')
            if dim:
                self.dim_idx[dim].append(e)
            if subdim and subdim not in ('PRS_NA', None):
                self.subdim_idx[subdim].append(e)
        print(f"   Index: {len(self.dim_idx)} dims, {len(self.subdim_idx)} subdims")

    def retrieve(self, dimensions, subdimensions=None):
        """Retrieve ALL evidence for target dimensions (no truncation).
        With 284 total records and ~790 tokens/record, full retrieval
        stays well within Gemini 3.1 Pro's 1M token context window."""
        evds, seen = [], set()

        # Primary: by dimension
        for d in dimensions:
            for e in self.dim_idx.get(d, []):
                eid = e['evidence_id']
                if eid not in seen:
                    seen.add(eid)
                    evds.append(e)

        # Secondary: add subdimension-specific records not yet included
        if subdimensions:
            for sd in subdimensions:
                for e in self.subdim_idx.get(sd, []):
                    eid = e['evidence_id']
                    if eid not in seen:
                        seen.add(eid)
                        evds.append(e)

        # Report
        from collections import Counter
        dim_counts = Counter(e['performance']['dimension_id'] for e in evds)
        print(f"🔍 Retrieved: {len(evds)} evidence records (no cap)")
        print(f"   Per dimension: {dict(dim_counts)}")
        return evds

kb = KnowledgeBase(CONFIG['evidence_path'], CONFIG['context_path'])

# %% [markdown]
# ## 6. Transferability Matcher (deterministic Python — NOT LLM)

# %%
def compute_transferability(evidence_record, ctx_record, project):
    """
    Pre-compute transferability match for one evidence record.
    This runs in Python — the LLM never needs to do join/match operations.
    """
    if not ctx_record:
        return {
            "context_id": None,
            "climate_match": "unknown", "lcz_match": "unknown",
            "setting_match": "unknown", "user_group_match": "unknown",
            "causal_limitations": "N/A",
            "overall": "unknown",
        }

    def _climate(ctx_code, proj_code):
        if not ctx_code or not proj_code or ctx_code.strip() == '' or proj_code.strip() == '' or 'NA' in ctx_code or 'XX' in ctx_code or 'NA' in proj_code:
            return "unknown"
        if ctx_code == proj_code:
            return "exact"
        # Same major group: compare first 5 chars (KPN_C vs KPN_C)
        if len(ctx_code) >= 5 and len(proj_code) >= 5 and ctx_code[:5] == proj_code[:5]:
            return "compatible"
        return "mismatch"

    def _lcz(ctx_code, proj_code):
        if not ctx_code or not proj_code or ctx_code.strip() == '' or proj_code.strip() == '' or 'NA' in ctx_code or 'NA' in proj_code:
            return "unknown"
        if ctx_code == proj_code:
            return "exact"
        # LCZ_URB is a parent of LCZ_1 through LCZ_10
        if ctx_code == 'LCZ_URB' or proj_code == 'LCZ_URB':
            return "compatible"
        # Same density class heuristic: both numeric → check distance
        ctx_num = ctx_code.replace('LCZ_', '')
        proj_num = proj_code.replace('LCZ_', '')
        if ctx_num.isdigit() and proj_num.isdigit():
            if abs(int(ctx_num) - int(proj_num)) <= 1:
                return "compatible"
        return "mismatch"

    def _setting(ctx_code, proj_code):
        if not ctx_code or not proj_code or ctx_code.strip() == '' or proj_code.strip() == '' or 'NA' in ctx_code or 'NA' in proj_code:
            return "unknown"
        if ctx_code == proj_code:
            return "exact"
        # SET_URB is parent of all specific settings
        if ctx_code == 'SET_URB' or proj_code == 'SET_URB':
            return "compatible"
        return "mismatch"

    def _user(ctx_code, proj_code):
        if not ctx_code or not proj_code or ctx_code.strip() == '' or proj_code.strip() == '' or 'NA' in ctx_code or 'UNSPECIFIED' in ctx_code or 'NA' in proj_code:
            return "unknown"
        if ctx_code == proj_code:
            return "exact"
        if ctx_code == 'AGE_ALL' or proj_code == 'AGE_ALL':
            return "compatible"
        return "mismatch"

    climate = _climate(
        ctx_record.get('climate', {}).get('koppen_zone_id', ''),
        project.get('koppen_climate_zone', ''))
    lcz = _lcz(
        ctx_record.get('urban_form', {}).get('lcz_type_id', ''),
        project.get('lcz_type', ''))
    setting = _setting(
        ctx_record.get('urban_form', {}).get('space_type_id', ''),
        project.get('space_type', ''))
    user = _user(
        ctx_record.get('user', {}).get('age_group_id', ''),
        project.get('user_groups', ''))

    scores = [climate, lcz, setting, user]
    n_good = sum(1 for s in scores if s in ('exact', 'compatible'))
    n_bad  = sum(1 for s in scores if s == 'mismatch')

    if n_good >= 3 and n_bad == 0:
        overall = "high"
    elif n_bad >= 2:
        overall = "low"
    else:
        overall = "moderate"

    return {
        "context_id": ctx_record.get('context_id'),
        "climate_match": climate,
        "lcz_match": lcz,
        "setting_match": setting,
        "user_group_match": user,
        "causal_limitations": ctx_record.get('applicability', {}).get(
            'causal_limitations', 'N/A'),
        "overall": overall,
    }


def enrich_evidence(evidence_list, kb, project):
    """Attach pre-computed transferability to each evidence record."""
    enriched = []
    for e in evidence_list:
        e_copy = dict(e)  # shallow copy
        ctx = kb.ctx_by_evidence.get(e['evidence_id'])
        e_copy['_transferability'] = compute_transferability(e, ctx, project)
        enriched.append(e_copy)
    # Stats
    t_counts = Counter(e['_transferability']['overall'] for e in enriched)
    print(f"🌍 Transferability pre-computed: {dict(t_counts)}")
    return enriched

# %% [markdown]
# ## 7. Load User Query & Retrieve

# %%
qpath = Path(CONFIG['user_query_path'])
if qpath.exists():
    USER_QUERY = json.load(open(qpath, encoding='utf-8'))
    print(f"✅ User query: {qpath.name}")
else:
    print("📤 Upload user query JSON:")
    try:
        from google.colab import files
        up = files.upload()
        USER_QUERY = json.loads(list(up.values())[0].decode('utf-8'))
    except Exception:
        USER_QUERY = {}
        print("❌ Cannot load user query")

project = USER_QUERY.get('project', {})
perf_q  = USER_QUERY.get('performance_query', {})
target_dims    = perf_q.get('dimensions', [])
target_subdims = perf_q.get('subdimensions', [])

print(f"\n📋 Project:       {project.get('name', 'N/A')}")
print(f"   Location:      {project.get('location', 'N/A')}")
print(f"   Climate (KPN): {project.get('koppen_climate_zone', 'N/A')}")
print(f"   LCZ:           {project.get('lcz_type', 'N/A')}")
print(f"   Space type:    {project.get('space_type', 'N/A')}")
print(f"\n🎯 Dimensions:    {target_dims}")
print(f"🎯 Subdimensions: {target_subdims}")

# ── Retrieve evidence ──
matched = kb.retrieve(target_dims, target_subdims)

# ── Pre-compute transferability (Python, NOT LLM) ──
matched = enrich_evidence(matched, kb, project)

# ── Group by indicator ──
indicator_groups = defaultdict(list)
for e in matched:
    indicator_groups[e['indicator']['indicator_id']].append(e)

print(f"\n📊 {len(matched)} evidence → {len(indicator_groups)} unique indicators")
for ind_id, evds in sorted(indicator_groups.items(),
                           key=lambda x: -len(x[1]))[:10]:
    t = Counter(e['_transferability']['overall'] for e in evds)
    print(f"   {ind_id:20s}: {len(evds):3d} records "
          f"(H={t.get('high',0)} M={t.get('moderate',0)} "
          f"L={t.get('low',0)} U={t.get('unknown',0)})")

# ── Codebook subset ──
cb_subset = encoding_dict.subset(CONFIG['max_codebook_chars'])
print(f"\n📖 Codebook subset: {len(cb_subset)} tables")

# %% [markdown]
# ## 8. LLM Caller

# %%
def call_llm(prompt_text, tag="LLM"):
    """Call Gemini and parse JSON response."""
    config = types.GenerateContentConfig(
        temperature=CONFIG['temperature'],
        max_output_tokens=CONFIG['max_output_tokens'],
        thinking_config=types.ThinkingConfig(
            thinking_level=CONFIG['thinking_level'],
        ),
    )
    print(f"\n{'─'*60}")
    print(f"🤖 {tag} — calling LLM (~{len(prompt_text)//4:,} tokens)...")
    t0 = time.time()

    response = client.models.generate_content(
        model=CONFIG['model_name'],
        contents=prompt_text,
        config=config,
    )
    text = response.text
    elapsed = time.time() - t0
    print(f"✅ {tag} — {len(text):,} chars in {elapsed:.1f}s")

    # Token usage
    if hasattr(response, 'usage_metadata') and response.usage_metadata:
        um = response.usage_metadata
        print(f"   Tokens — prompt: {getattr(um, 'prompt_token_count', '?')}, "
              f"response: {getattr(um, 'candidates_token_count', '?')}")

    return _parse_json(text)


def _parse_json(text):
    """Extract JSON from LLM response with auto-repair."""
    text = text.strip()
    if text.startswith('```json'):
        text = text[7:]
    elif text.startswith('```'):
        text = text[3:]
    if text.endswith('```'):
        text = text[:-3]
    text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Auto-repair truncated JSON
    repaired = text.rstrip().rstrip(',: \n\t"\'')
    repaired += ']' * max(0, text.count('[') - text.count(']'))
    repaired += '}' * max(0, text.count('{') - text.count('}'))
    try:
        result = json.loads(repaired)
        if isinstance(result, dict):
            result['_warning'] = 'Auto-repaired truncated JSON'
        print("⚠️  JSON auto-repaired (truncation)")
        return result
    except json.JSONDecodeError:
        pass

    return {'raw': text[:500] + '...', 'error': True}

# %% [markdown]
# ## 9. Agent 1 — Evidence Assessor

# %%
AGENT1_PROMPT = """\
# SceneRx-AI Stage 1 — Agent 1: Evidence Assessor

## Task
You receive grouped evidence records organized by indicator. Each evidence
record already has a pre-computed `_transferability` field — do NOT recompute
it; simply count the values per indicator.

For each indicator group, produce an "assessment card" summarizing evidence
strength and transferability.

## Project Profile
- Climate: {project_climate}
- LCZ: {project_lcz}
- Setting: {project_setting}
- User groups: {project_users}
- Target dimensions: {target_dims}
- Target subdimensions: {target_subdims}

## Transferability
Each evidence record already contains a `_transferability` field with:
- climate_match, lcz_match, setting_match, user_group_match
- overall: "high" | "moderate" | "low" | "unknown"

Simply count the `overall` values per indicator for your assessment card.
Do NOT recompute transferability — it was computed deterministically upstream.

## Evidence Strength Criteria (priority order)
1. evidence_tier_id: TIR_T1 > TIR_T2 > TIR_T3
2. is_descriptive_statistic: false (inferential) > true (descriptive)
3. framework_mapping_basis: "direct" > any proxy
4. significance_id: SIG_001 > SIG_01 > SIG_05 > SIG_NS
5. relationship.type_id: REL_REG/REL_MED (causal-leaning) > REL_COR > REL_DES

## Strength Score Definition
- **A**: ≥2 inferential records, best tier TIR_T1 or TIR_T2, significance ≥ SIG_01,
  at least one with framework_mapping_basis = "direct"
- **B**: ≥1 inferential record, best tier TIR_T2+, significance ≥ SIG_05
- **C**: descriptive-only, or all evidence is TIR_T3, or no significance ≥ SIG_05

## Input Data

### Indicator Groups ({n_indicators} indicators, {n_evidence} total records)
```json
{indicator_data}
```

## Output
Output a JSON array. One object per indicator:
```json
[
  {{
    "indicator_id": "IND_XXX",
    "evidence_count": 5,
    "inferential_count": 4,
    "descriptive_count": 1,
    "dominant_direction": "DIR_POS | DIR_NEG | DIR_MIX",
    "strongest_tier": "TIR_T1 | TIR_T2 | TIR_T3",
    "best_significance": "SIG_001 | SIG_01 | SIG_05 | SIG_NS",
    "has_direct_mapping": true,
    "transferability_summary": {{
      "high_count": 2,
      "moderate_count": 1,
      "low_count": 0,
      "unknown_count": 2
    }},
    "dimensions_covered": ["PRF_AES"],
    "subdimensions_covered": ["PRS_AES_ATTR"],
    "strength_score": "A | B | C",
    "key_evidence_ids": ["SVCs_P_XXX", "SVCs_P_YYY"],
    "assessment_note": "Brief 1–2 sentence summary"
  }}
]
```

Output valid JSON only. No markdown fences, no commentary.
"""

# ── Prepare Agent 1 input ──
print("\n" + "=" * 60)
print("🔬 STEP 1 — Agent 1: Evidence Assessor")
print("=" * 60)

indicator_data_for_prompt = []
for ind_id, evds in indicator_groups.items():
    evds_clean = []
    for e in evds:
        # Keep all fields including _transferability, but strip _ctx if present
        e_copy = {k: v for k, v in e.items() if k != '_ctx'}
        evds_clean.append(e_copy)
    indicator_data_for_prompt.append({
        "indicator_id": ind_id,
        "evidence_count": len(evds_clean),
        "evidence": evds_clean,
    })

agent1_prompt = AGENT1_PROMPT.format(
    project_climate=project.get('koppen_climate_zone', 'N/A'),
    project_lcz=project.get('lcz_type', 'N/A'),
    project_setting=project.get('space_type', 'N/A'),
    project_users=project.get('user_groups', 'N/A'),
    target_dims=json.dumps(target_dims),
    target_subdims=json.dumps(target_subdims),
    n_indicators=len(indicator_data_for_prompt),
    n_evidence=len(matched),
    indicator_data=json.dumps(indicator_data_for_prompt, ensure_ascii=False, indent=2),
)

assessment_cards = call_llm(agent1_prompt, tag="Agent 1: Assessor")

# ── Print Agent 1 results ──
if isinstance(assessment_cards, list):
    print(f"\n📋 Agent 1 Output: {len(assessment_cards)} indicator cards")
    for card in assessment_cards[:15]:
        ind_name = cb_subset.get('A_indicators', {}).get(
            card.get('indicator_id', ''), {}).get('name', '?')
        ts = card.get('transferability_summary', {})
        print(f"   {card.get('indicator_id', '?'):20s} ({ind_name})")
        print(f"     Strength: {card.get('strength_score', '?')} | "
              f"Direction: {card.get('dominant_direction', '?')} | "
              f"Evidence: {card.get('inferential_count', 0)}inf + "
              f"{card.get('descriptive_count', 0)}desc | "
              f"Transfer: {ts.get('high_count', 0)}H/"
              f"{ts.get('moderate_count', 0)}M/"
              f"{ts.get('low_count', 0)}L/"
              f"{ts.get('unknown_count', 0)}U")
else:
    print(f"⚠️  Unexpected Agent 1 output: {type(assessment_cards)}")
    print(json.dumps(assessment_cards, indent=2)[:500])

# %% [markdown]
# ## 10. Agent 2 — Ranker & Selector

# %%
AGENT2_PROMPT = """\
# SceneRx-AI Stage 1 — Agent 2: Indicator Ranker & Selector

## Task
You receive assessment cards from Agent 1, plus the Encoding Dictionary and
the project profile. Select the top 5–8 indicators and produce the final
structured JSON output.

## Project Profile
- Name: {project_name}
- Climate: {project_climate} ({project_climate_name})
- LCZ: {project_lcz}
- Setting: {project_setting}
- User groups: {project_users}
- Target dimensions: {target_dims}
- Target subdimensions: {target_subdims}

## Encoding Dictionary ({cb_table_count} tables)
Use this to expand every code to {{code, name, definition}}.
```json
{codebook}
```

## Assessment Cards ({n_cards} indicators)
```json
{cards}
```

## Core Constraints
| ID | Constraint |
|----|-----------|
| C1 | Every recommended indicator MUST reference evidence_ids from the assessment cards. Do NOT invent. |
| C2 | Expand ALL codes to {{code, name, definition}} via the Encoding Dictionary. No bare codes. |
| C3 | Do NOT output numerical target values — only INCREASE / DECREASE. |
| C4 | Indicators with strength_score "C" should NOT be recommended unless no better alternatives exist. |
| C5 | Output valid JSON only. No markdown fences, no commentary outside the JSON. |
| C6 | Only use dimension/subdimension codes that exist in the Encoding Dictionary (C_performance, C_subdimensions). Do NOT invent codes. |

## Selection Rules
1. **Rank by**: (a) strength_score A > B > C, (b) transferability high > moderate > low > unknown,
   (c) subdimension relevance to target.
2. **Coverage**: at least one indicator per target dimension (where evidence exists).
3. **Diversity**: include both compositional (CAT_CMP) and configurational (CAT_CFG/CAT_CCG)
   if evidence supports them.
4. **Quality floor**: exclude indicators supported only by descriptive evidence (inferential_count = 0).
5. **Conflict flag**: if dominant_direction = DIR_MIX, note this in rationale.

## Output Schema
```json
{{
  "metadata": {{
    "project_name": "...",
    "project_climate": {{"code": "KPN_XXX", "name": "...", "definition": "..."}},
    "project_lcz": {{"code": "LCZ_X", "name": "...", "definition": "..."}},
    "project_setting": {{"code": "SET_XXX", "name": "...", "definition": "..."}},
    "target_dimensions": [
      {{"code": "PRF_XXX", "name": "...", "definition": "..."}}
    ],
    "target_subdimensions": [
      {{"code": "PRS_XXX", "name": "...", "definition": "..."}}
    ],
    "total_evidence_reviewed": 0,
    "total_evidence_cited": 0,
    "total_indicators_recommended": 0
  }},

  "recommended_indicators": [
    {{
      "rank": 1,
      "indicator": {{
        "code": "IND_XXX",
        "name": "...",
        "definition": "...",
        "category": {{"code": "CAT_XXX", "name": "...", "definition": "..."}},
        "formula": "from assessment card or Encoding Dictionary"
      }},
      "performance_link": {{
        "dimension": {{"code": "PRF_XXX", "name": "...", "definition": "..."}},
        "subdimension": {{"code": "PRS_XXX", "name": "...", "definition": "..."}},
        "outcome_type": {{"code": "OUT_XXX", "name": "...", "definition": "..."}}
      }},
      "evidence_summary": {{
        "evidence_ids": ["SVCs_P_XXX", "SVCs_P_YYY"],
        "inferential_count": 4,
        "descriptive_count": 1,
        "strength_score": "A",
        "strongest_tier": "TIR_T1",
        "best_significance": "SIG_001",
        "dominant_direction": "DIR_POS"
      }},
      "transferability_summary": {{
        "high_count": 2,
        "moderate_count": 1,
        "low_count": 0,
        "unknown_count": 2
      }},
      "target_direction": {{
        "direction": "INCREASE | DECREASE",
        "derivation": "Explain: evidence direction + performance goal → this direction"
      }},
      "rationale": "2–3 sentences: what the evidence shows, its strength, transferability to this project"
    }}
  ],

  "indicator_relationships": [
    {{
      "indicators": [{{"code": "IND_A", "name": "..."}}, {{"code": "IND_B", "name": "..."}}],
      "type": "SYNERGISTIC | TRADE_OFF | INDEPENDENT",
      "explanation": "How they interact, based on evidence"
    }}
  ],

  "summary": {{
    "total_indicators": 0,
    "total_evidence_records": 0,
    "evidence_strength_profile": {{
      "tier_1_count": 0,
      "tier_2_count": 0,
      "tier_3_count": 0,
      "descriptive_only_count": 0
    }},
    "transferability_profile": {{
      "high_count": 0,
      "moderate_count": 0,
      "low_count": 0,
      "unknown_count": 0
    }},
    "category_coverage": {{
      "composition_count": 0,
      "configuration_count": 0,
      "cross_category_count": 0
    }},
    "dimension_coverage": [
      {{"code": "PRF_XXX", "name": "...", "indicator_count": 0, "evidence_count": 0}}
    ],
    "key_findings": ["Finding 1", "Finding 2"],
    "evidence_gaps": ["Gap 1"],
    "transferability_caveats": ["Caveat 1"]
  }}
}}
```

Output valid JSON only.
"""

print("\n" + "=" * 60)
print("🏆 STEP 2 — Agent 2: Ranker & Selector")
print("=" * 60)

# Get project climate name from codebook for display
climate_code = project.get('koppen_climate_zone', 'N/A')
climate_name = cb_subset.get('K_climate', {}).get(climate_code, {}).get('name', 'N/A')

agent2_prompt = AGENT2_PROMPT.format(
    project_name=project.get('name', 'N/A'),
    project_climate=climate_code,
    project_climate_name=climate_name,
    project_lcz=project.get('lcz_type', 'N/A'),
    project_setting=project.get('space_type', 'N/A'),
    project_users=project.get('user_groups', 'N/A'),
    target_dims=json.dumps(target_dims),
    target_subdims=json.dumps(target_subdims),
    codebook=json.dumps(cb_subset, ensure_ascii=False, indent=2),
    cb_table_count=len(cb_subset),
    n_cards=len(assessment_cards) if isinstance(assessment_cards, list) else 0,
    cards=json.dumps(assessment_cards, ensure_ascii=False, indent=2),
)

result = call_llm(agent2_prompt, tag="Agent 2: Ranker")

# ── Print Agent 2 results ──
if isinstance(result, dict) and 'error' not in result:
    inds = result.get('recommended_indicators', [])
    print(f"\n🏆 Agent 2 Output: {len(inds)} indicators selected")
    for ind in inds:
        i = ind.get('indicator', {})
        td = ind.get('target_direction', {})
        es = ind.get('evidence_summary', {})
        ts = ind.get('transferability_summary', {})
        perf = ind.get('performance_link', {})
        print(f"   #{ind.get('rank', '?')} {i.get('code', '?')} ({i.get('name', '?')})")
        print(f"      Direction: {td.get('direction', '?')} | "
              f"Dimension: {perf.get('dimension', {}).get('code', '?')} | "
              f"Strength: {es.get('strength_score', '?')}")
        print(f"      Transfer: H={ts.get('high_count', 0)} M={ts.get('moderate_count', 0)} "
              f"L={ts.get('low_count', 0)} U={ts.get('unknown_count', 0)}")
        print(f"      Rationale: {ind.get('rationale', '?')[:100]}...")

    rels = result.get('indicator_relationships', [])
    if rels:
        print(f"\n🔗 Relationships ({len(rels)}):")
        for r in rels:
            pair = [x.get('code', '?') for x in r.get('indicators', [])]
            print(f"   {pair} → {r.get('type', '?')}")

    summary = result.get('summary', {})
    gaps = summary.get('evidence_gaps', [])
    if gaps:
        print(f"\n⚠️  Gaps: {gaps}")
    caveats = summary.get('transferability_caveats', [])
    if caveats:
        print(f"⚠️  Caveats: {caveats}")
else:
    print(f"❌ Agent 2 error")
    print(json.dumps(result, indent=2)[:500])

# %% [markdown]
# ## 11. Full JSON Output

# %%
print("📄 Full JSON:")
print(json.dumps(result, ensure_ascii=False, indent=2))

# %% [markdown]
# ## 12. Save Results

# %%
out_dir = Path(CONFIG['output_path'])
out_dir.mkdir(parents=True, exist_ok=True)

ts = datetime.now().strftime('%Y%m%d_%H%M%S')

# Save final result
out_file = out_dir / f'STAGE1_{ts}.json'
json.dump(result, open(out_file, 'w', encoding='utf-8'),
          ensure_ascii=False, indent=2)
print(f"✅ Result saved:      {out_file}")

# Save assessment cards (Agent 1 output)
cards_file = out_dir / f'STAGE1_{ts}_cards.json'
json.dump(assessment_cards, open(cards_file, 'w', encoding='utf-8'),
          ensure_ascii=False, indent=2)
print(f"✅ Cards saved:       {cards_file}")

# Save prompts for reproducibility
for name, prompt_text in [("agent1", agent1_prompt), ("agent2", agent2_prompt)]:
    pf = out_dir / f'STAGE1_{ts}_{name}_prompt.txt'
    with open(pf, 'w', encoding='utf-8') as f:
        f.write(prompt_text)
    print(f"✅ {name} prompt saved: {pf}")
