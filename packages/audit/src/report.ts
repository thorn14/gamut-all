import type { AuditResult, AuditIssue } from './runner.js';

// ── formatText ────────────────────────────────────────────────────────────────

export function formatText(result: AuditResult): string {
  const lines: string[] = [];

  lines.push('[gamut-all audit]');
  lines.push('');

  if (result.variantsChecked > 0) {
    lines.push(`Registry variants checked: ${result.variantsChecked}`);
  }
  if (result.elementsChecked > 0) {
    lines.push(`DOM elements checked: ${result.elementsChecked}`);
  }

  lines.push(`Passed: ${result.passCount}  Failed: ${result.failCount}`);
  lines.push('');

  if (result.issues.length === 0) {
    lines.push('✓ No issues found.');
    return lines.join('\n');
  }

  const errors = result.issues.filter(i => i.severity === 'error');
  const warnings = result.issues.filter(i => i.severity === 'warning');

  if (errors.length > 0) {
    lines.push(`Errors (${errors.length}):`);
    for (const issue of errors) {
      lines.push(`  [${issue.type}] ${issue.message}`);
    }
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push(`Warnings (${warnings.length}):`);
    for (const issue of warnings) {
      lines.push(`  [${issue.type}] ${issue.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── formatJSON ────────────────────────────────────────────────────────────────

export interface JSONReport {
  tool: '@gamut-all/audit';
  timestamp: string;
  summary: {
    variantsChecked: number;
    elementsChecked: number;
    passCount: number;
    failCount: number;
    issueCount: number;
    errorCount: number;
    warningCount: number;
  };
  issues: AuditIssue[];
}

export function formatJSON(result: AuditResult): string {
  const report: JSONReport = {
    tool: '@gamut-all/audit',
    timestamp: new Date().toISOString(),
    summary: {
      variantsChecked: result.variantsChecked,
      elementsChecked: result.elementsChecked,
      passCount: result.passCount,
      failCount: result.failCount,
      issueCount: result.issues.length,
      errorCount: result.issues.filter(i => i.severity === 'error').length,
      warningCount: result.issues.filter(i => i.severity === 'warning').length,
    },
    issues: result.issues,
  };
  return JSON.stringify(report, null, 2);
}
