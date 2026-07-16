'use client';
import { useState } from 'react';

type Result = { name: string; level: string; expected: string; actual: string; pass: boolean };
type Report = {
  overall?: boolean;
  chosenObjective?: string;
  useConversions?: boolean;
  customConversionId?: string | null;
  customConversionDiag?: string[];
  lookalikeDiag?: string[];
  results?: Result[];
  createdIds?: Record<string, string>;
  adsManagerUrl?: string;
  rawReadback?: unknown;
  error?: { message: string } | string;
  note?: string;
};

export default function TestCampaignSection() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  async function runTest() {
    setRunning(true);
    setReport(null);
    try {
      const res = await fetch('/api/admin/test-campaign', { method: 'POST' });
      const json = await res.json();
      setReport(json);
    } catch (err) {
      setReport({ error: err instanceof Error ? err.message : 'Request failed' });
    }
    setRunning(false);
  }

  // Build a compact, paste-friendly summary of the whole report.
  function reportText(): string {
    if (!report) return '';
    const lines: string[] = [];
    if (errorMsg) lines.push(`ERROR: ${errorMsg}`);
    lines.push(`overall: ${report.overall ? 'PASS' : 'FAIL'}`);
    lines.push(`objective: ${report.chosenObjective ?? '—'} · useConversions: ${report.useConversions}`);
    if (report.customConversionDiag?.length) {
      lines.push('customConversion:');
      report.customConversionDiag.forEach((d) => lines.push(`  - ${d}`));
    }
    if (report.lookalikeDiag?.length) {
      lines.push('lookalike:');
      report.lookalikeDiag.forEach((d) => lines.push(`  - ${d}`));
    }
    if (report.results?.length) {
      lines.push('criteria:');
      report.results.forEach((r) =>
        lines.push(`  ${r.pass ? 'PASS' : 'FAIL'} | ${r.name} (${r.level}) | expected: ${r.expected} | actual: ${r.actual}`),
      );
    }
    if (report.rawReadback) lines.push(`rawReadback: ${JSON.stringify(report.rawReadback)}`);
    return lines.join('\n');
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore — clipboard may be blocked; user can still screenshot.
    }
  }

  const errorMsg =
    typeof report?.error === 'string' ? report?.error : report?.error?.message;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mt-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold">Campaign Test Harness</h2>
        <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-800 px-2.5 py-1 rounded-full">
          Owner only
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Builds a real but <strong>paused</strong> Meta campaign using the production
        code path, reads it back, and checks it against the criteria table. Never
        spends — the campaign stays paused in Ads Manager for inspection.
      </p>

      <button
        onClick={runTest}
        disabled={running}
        className="w-full py-2.5 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-50"
      >
        {running ? 'Building & verifying… (up to a minute)' : 'Run test campaign'}
      </button>

      {report && (
        <div className="mt-5 space-y-4">
          <button
            onClick={copyReport}
            className="w-full py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 transition"
          >
            {copied ? '✅ Copied — paste it to Claude' : '📋 Copy full report to clipboard'}
          </button>

          {errorMsg && (
            <div className="rounded-lg border border-red-700 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              <p className="font-semibold mb-1">Test failed</p>
              <p className="text-red-400/80 break-words">{errorMsg}</p>
              {report.note && <p className="text-xs text-red-400/60 mt-1">{report.note}</p>}
            </div>
          )}

          {report.useConversions === false && (
            <div className="rounded-lg border border-amber-700 bg-amber-900/20 px-4 py-3 text-xs text-amber-300">
              <p className="font-semibold mb-1">
                ⚠️ Fell back to Traffic — the Spotify-click custom conversion wasn&apos;t available.
              </p>
              {report.customConversionDiag?.length ? (
                <ul className="list-disc pl-4 space-y-0.5 text-amber-400/90">
                  {report.customConversionDiag.map((d, i) => (
                    <li key={i} className="font-mono break-words">{d}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-amber-400/80">No diagnostic captured.</p>
              )}
            </div>
          )}

          {report.lookalikeDiag?.length ? (
            <div className="rounded-lg border border-gray-700 bg-gray-800/40 px-4 py-3 text-xs text-gray-300">
              <p className="font-semibold mb-1 text-gray-200">Lookalike audience</p>
              <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
                {report.lookalikeDiag.map((d, i) => (
                  <li key={i} className="font-mono break-words">{d}</li>
                ))}
              </ul>
              <p className="text-gray-500 mt-1">&quot;Seed too small&quot; is expected until ~100 Spotify clicks.</p>
            </div>
          ) : null}

          {report.results && (
            <>
              <div
                className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                  report.overall
                    ? 'border border-green-700 bg-green-900/20 text-green-300'
                    : 'border border-amber-700 bg-amber-900/20 text-amber-300'
                }`}
              >
                {report.overall ? '✅ All criteria passed' : '⚠️ Some criteria failed'}
                <span className="ml-2 font-normal text-xs opacity-80">
                  objective: {report.chosenObjective} · useConversions: {String(report.useConversions)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-800">
                      <th className="py-1.5 pr-2">Criterion</th>
                      <th className="py-1.5 pr-2">Level</th>
                      <th className="py-1.5 pr-2">Expected</th>
                      <th className="py-1.5 pr-2">Actual</th>
                      <th className="py-1.5">✓</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.results.map((r) => (
                      <tr key={r.name} className="border-b border-gray-800/60 align-top">
                        <td className="py-1.5 pr-2 text-gray-200">{r.name}</td>
                        <td className="py-1.5 pr-2 text-gray-500">{r.level}</td>
                        <td className="py-1.5 pr-2 text-gray-400 font-mono">{r.expected}</td>
                        <td className={`py-1.5 pr-2 font-mono ${r.pass ? 'text-gray-400' : 'text-red-400'}`}>
                          {r.actual}
                        </td>
                        <td className="py-1.5">{r.pass ? '✅' : '❌'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {report.adsManagerUrl && (
            <a
              href={report.adsManagerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-blue-400 hover:text-blue-300 transition"
            >
              View paused campaign in Ads Manager →
            </a>
          )}

          {report.rawReadback != null && (
            <div>
              <button
                onClick={() => setShowRaw((s) => !s)}
                className="text-xs text-gray-500 hover:text-gray-300 transition"
              >
                {showRaw ? 'Hide' : 'Show'} raw read-back
              </button>
              {showRaw && (
                <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-black/40 border border-gray-800 p-3 text-[11px] text-gray-400">
                  {JSON.stringify(report.rawReadback, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
