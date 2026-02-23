import type {
  ZoneAnalysisResult,
  DesignStrategyResult,
  ProjectPipelineResult,
} from '../types';

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return '-';
  return v.toFixed(decimals);
}

function mdTable(headers: string[], rows: string[][]): string {
  const sep = headers.map(() => '---');
  const lines = [
    '| ' + headers.join(' | ') + ' |',
    '| ' + sep.join(' | ') + ' |',
    ...rows.map(r => '| ' + r.join(' | ') + ' |'),
  ];
  return lines.join('\n');
}

export function generateReport(params: {
  projectName?: string;
  pipelineResult?: ProjectPipelineResult | null;
  zoneResult: ZoneAnalysisResult;
  designResult?: DesignStrategyResult | null;
}): string {
  const { projectName, pipelineResult, zoneResult, designResult } = params;
  const sections: string[] = [];

  // 1. Header
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  let header = `# GreenSVC Analysis Report\n\nGenerated: ${timestamp}`;
  if (projectName) header += `\nProject: ${projectName}`;
  sections.push(header);

  // 2. Pipeline Summary
  if (pipelineResult) {
    sections.push('## Pipeline Summary');
    sections.push(mdTable(
      ['Metric', 'Value'],
      [
        ['Total Images', String(pipelineResult.total_images)],
        ['Zone-Assigned Images', String(pipelineResult.zone_assigned_images)],
        ['Calculations Run', String(pipelineResult.calculations_run)],
        ['Calculations Succeeded', String(pipelineResult.calculations_succeeded)],
        ['Calculations Failed', String(pipelineResult.calculations_failed)],
        ['Zone Statistics Count', String(pipelineResult.zone_statistics_count)],
      ],
    ));
    if (pipelineResult.steps.length > 0) {
      sections.push('### Pipeline Steps\n');
      sections.push(pipelineResult.steps.map(s => `- **${s.step}**: ${s.status} — ${s.detail}`).join('\n'));
    }
  }

  // 3. Zone Diagnostics Overview
  const sortedDiags = [...zoneResult.zone_diagnostics].sort((a, b) => b.total_priority - a.total_priority);
  if (sortedDiags.length > 0) {
    sections.push('## Zone Diagnostics Overview');
    sections.push(mdTable(
      ['Zone Name', 'Status', 'Total Priority', 'Problems (P\u22654)'],
      sortedDiags.map(d => {
        const highProblems = Object.values(d.problems_by_layer)
          .flat()
          .filter(p => p.priority >= 4).length;
        return [d.zone_name, d.status, String(d.total_priority), String(highProblems)];
      }),
    ));
  }

  // 4. Zone Statistics — Full Layer
  const fullStats = zoneResult.zone_statistics.filter(s => s.layer === 'full');
  if (fullStats.length > 0) {
    sections.push('## Zone Statistics — Full Layer');
    sections.push(mdTable(
      ['Zone', 'Indicator', 'Mean', 'Std', 'Z-score', 'Percentile', 'Priority', 'Classification'],
      fullStats.map(s => [
        s.zone_name,
        s.indicator_id,
        fmt(s.mean),
        fmt(s.std),
        fmt(s.z_score),
        fmt(s.percentile, 0),
        String(s.priority),
        s.classification,
      ]),
    ));
  }

  // 5. Indicator Definitions
  const defs = Object.values(zoneResult.indicator_definitions);
  if (defs.length > 0) {
    sections.push('## Indicator Definitions');
    sections.push(mdTable(
      ['ID', 'Name', 'Unit', 'Direction', 'Category'],
      defs.map(d => [
        d.id,
        d.name,
        d.unit || '-',
        d.target_direction || '-',
        d.category || '-',
      ]),
    ));
  }

  // 6. Design Strategies
  if (designResult) {
    sections.push('## Design Strategies');
    for (const zone of Object.values(designResult.zones)) {
      sections.push(`### Zone: ${zone.zone_name} — ${zone.status}`);
      if (zone.overall_assessment) {
        sections.push(`**Assessment:** ${zone.overall_assessment}`);
      }
      for (const strategy of zone.design_strategies) {
        sections.push(`#### Strategy ${strategy.priority}: ${strategy.strategy_name} (Confidence: ${strategy.confidence})`);
        sections.push(`- **Target indicators:** ${strategy.target_indicators.join(', ')}`);
        sections.push(`- **Intervention:** ${strategy.intervention.object} / ${strategy.intervention.action} / ${strategy.intervention.variable}`);
        if (strategy.intervention.specific_guidance) {
          sections.push(`- **Guidance:** ${strategy.intervention.specific_guidance}`);
        }
        if (strategy.expected_effects.length > 0) {
          sections.push(`- **Expected effects:** ${strategy.expected_effects.map(e => `${e.indicator} ${e.direction} (${e.magnitude})`).join('; ')}`);
        }
        if (strategy.potential_tradeoffs) {
          sections.push(`- **Tradeoffs:** ${strategy.potential_tradeoffs}`);
        }
      }
      if (zone.implementation_sequence) {
        sections.push(`\n**Implementation Sequence:** ${zone.implementation_sequence}`);
      }
      if (zone.synergies) {
        sections.push(`**Synergies:** ${zone.synergies}`);
      }
    }
  }

  // 7. Footer
  sections.push('---\n\nGenerated by GreenSVC-AI Analysis Pipeline');

  return sections.join('\n\n');
}
