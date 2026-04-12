#!/usr/bin/env node
/**
 * Benchmark: Prompt Caching vs No Caching
 *
 * Makes 3 API calls with the same system prompt + user message:
 *   Call 1 (no cache):   plain string system — baseline, no caching
 *   Call 2 (cache, 1st): array system with cache_control — writes cache
 *   Call 3 (cache, 2nd): same as call 2 — reads from cache (the savings)
 *
 * Prints real token counts from the API response and calculates cost.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_KEY = process.env.ANTHROPIC_API_KEY;

// Load a real agent file as the system prompt — these are the calls where
// caching actually fires (agent-runner.js already caches these correctly).
// The light-report system prompt is only ~370 tokens, below the 1024-token
// minimum Anthropic requires before it will write a cache entry.
const AGENT_SYSTEM = readFileSync(
  join(__dirname, '../agents/business-health.md'),
  'utf8'
);

if (!API_KEY) {
  console.error('ANTHROPIC_API_KEY not set in .env');
  process.exit(1);
}

// Pricing (Sonnet 4.6)
const PRICE = {
  input:       3.00 / 1_000_000,
  output:      15.00 / 1_000_000,
  cacheWrite:  3.75 / 1_000_000,
  cacheRead:   0.30 / 1_000_000,
};

// Two system prompts to test:
//   SMALL_SYSTEM  = light-report prompt (~370 tokens) — BELOW the 1024-token min
//   LARGE_SYSTEM  = real agent instructions (~4,800 tokens) — ABOVE the min, caching fires
const SMALL_SYSTEM = [
  'You are an executive communications assistant and podcast script writer.',
  'Create a LIGHT version of the provided report in markdown.',
  'Focus only on the most important information for executives.',
  'Return markdown only. Do not add any commentary outside the markdown report.',
].join('\n');

const LARGE_SYSTEM = AGENT_SYSTEM; // ~19k chars = ~4,800 tokens

const USER_PROMPT = `Original filename: weekly-report-2026-04-12.md

Original report markdown:
## Weekly Report — April 12, 2026

### Key Business Metrics
- MRR: $2.4M (+8% WoW)
- Active users: 12,400 (+3%)
- Churn rate: 1.2% (down from 1.5%)

### Top Insights
1. New enterprise tier launched Tuesday — 3 pilot customers signed same day.
2. Support ticket volume spiked 40% after the deployment; root cause: missing error message localization.
3. Mobile DAU surpassed desktop DAU for the first time (52% vs 48%).

### Actions
- Engineering: deploy localization fix by EOD Friday.
- Sales: follow up with 12 warm leads from the conference pipeline.
- Product: schedule UX review for the mobile onboarding flow (owner: Jamie).

### Risks
- AWS costs up 22% MoM — investigate EC2 over-provisioning in the data pipeline.
`;

const MODEL = 'claude-haiku-4-5-20251001'; // Fast + cheap for benchmarking

function calcCost(usage) {
  const inputCost      = (usage.input_tokens ?? 0)                  * PRICE.input;
  const outputCost     = (usage.output_tokens ?? 0)                 * PRICE.output;
  const cacheWriteCost = (usage.cache_creation_input_tokens ?? 0)   * PRICE.cacheWrite;
  const cacheReadCost  = (usage.cache_read_input_tokens ?? 0)       * PRICE.cacheRead;
  return {
    total: inputCost + outputCost + cacheWriteCost + cacheReadCost,
    inputCost, outputCost, cacheWriteCost, cacheReadCost,
  };
}

function printUsage(label, usage) {
  const cost = calcCost(usage);
  console.log(`\n── ${label} ──`);
  console.log(`  input_tokens:                 ${String(usage.input_tokens ?? 0).padStart(6)}`);
  console.log(`  output_tokens:                ${String(usage.output_tokens ?? 0).padStart(6)}`);
  console.log(`  cache_creation_input_tokens:  ${String(usage.cache_creation_input_tokens ?? 0).padStart(6)}  ($${cost.cacheWriteCost.toFixed(6)})`);
  console.log(`  cache_read_input_tokens:      ${String(usage.cache_read_input_tokens ?? 0).padStart(6)}  ($${cost.cacheReadCost.toFixed(6)})`);
  console.log(`  TOTAL COST:                          $${cost.total.toFixed(6)}`);
  return cost.total;
}

async function callAPI({ label, systemPayload, withCachingHeader }) {
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-api-key': API_KEY,
  };
  if (withCachingHeader) {
    headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
  }

  process.stdout.write(`Calling API (${label})... `);
  const start = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      system: systemPayload,
      messages: [{ role: 'user', content: USER_PROMPT }],
    }),
  });

  const data = await res.json();
  const ms = Date.now() - start;

  if (!res.ok) {
    console.error(`\nAPI error: ${data?.error?.message}`);
    process.exit(1);
  }
  console.log(`done (${ms}ms)`);
  return data.usage;
}

async function runScenario(label, systemPromptText) {
  const approxTokens = Math.round(systemPromptText.length / 4);
  const meetsMinimum = approxTokens >= 1024;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SCENARIO: ${label}`);
  console.log(`System prompt: ~${approxTokens} tokens  ${meetsMinimum ? '✓ meets 1024-token cache minimum' : '✗ BELOW 1024-token minimum — caching will not fire'}`);
  console.log('═'.repeat(60));

  const usage1 = await callAPI({
    label: 'no cache (old)',
    systemPayload: systemPromptText,
    withCachingHeader: false,
  });

  await new Promise(r => setTimeout(r, 500));

  const usage2 = await callAPI({
    label: 'cache WRITE (1st call)',
    systemPayload: [{ type: 'text', text: systemPromptText, cache_control: { type: 'ephemeral' } }],
    withCachingHeader: true,
  });

  await new Promise(r => setTimeout(r, 500));

  const usage3 = await callAPI({
    label: 'cache READ  (2nd call)',
    systemPayload: [{ type: 'text', text: systemPromptText, cache_control: { type: 'ephemeral' } }],
    withCachingHeader: true,
  });

  const cost1 = printUsage('Call 1 — No caching (baseline)', usage1);
  const cost2 = printUsage('Call 2 — Cache WRITE (1st cached run)', usage2);
  const cost3 = printUsage('Call 3 — Cache READ  (2nd cached run)', usage3);

  const savingsVsBaseline = cost1 - cost3;
  const savingsPct = cost1 > 0 ? ((savingsVsBaseline / cost1) * 100).toFixed(1) : '0.0';

  console.log('\n  ┌─ Summary ─────────────────────────────────────────');
  console.log(`  │  Baseline:          $${cost1.toFixed(6)}`);
  console.log(`  │  Cache write:       $${cost2.toFixed(6)}   ← first call pays to write cache`);
  console.log(`  │  Cache read:        $${cost3.toFixed(6)}   ← subsequent calls get discount`);
  console.log(`  │  Savings per call:  $${savingsVsBaseline.toFixed(6)}  (${savingsPct}%)`);
  if (meetsMinimum) {
    const daily = savingsVsBaseline * 99;
    console.log(`  │  @ 100 calls/day → $${daily.toFixed(4)}/day, $${(daily * 30).toFixed(2)}/month`);
  }
  console.log('  └────────────────────────────────────────────────────');

  return { cost1, cost3, savingsVsBaseline };
}

async function main() {
  console.log(`\nPrompt Caching Benchmark  —  model: ${MODEL}`);
  console.log('Tests two scenarios:');
  console.log('  A) Small system prompt (light report) — below 1024-token cache minimum');
  console.log('  B) Large system prompt (agent instructions) — above minimum, caching fires\n');

  const a = await runScenario('A — Small system prompt (light report)', SMALL_SYSTEM);
  await new Promise(r => setTimeout(r, 1000));
  const b = await runScenario('B — Large system prompt (agent instructions)', LARGE_SYSTEM);

  console.log(`\n${'═'.repeat(60)}`);
  console.log('FINAL COMPARISON');
  console.log('═'.repeat(60));
  console.log(`  Scenario A (small prompt): ${a.savingsVsBaseline > 0.000001 ? `$${a.savingsVsBaseline.toFixed(6)} savings` : 'no caching — below minimum'}`);
  console.log(`  Scenario B (large prompt): $${b.savingsVsBaseline.toFixed(6)} savings per call (${((b.savingsVsBaseline / b.cost1) * 100).toFixed(1)}%)`);
  console.log('\n  The agent-runner.js system prompts (large) are where caching pays off.');
  console.log('  Light-report prompts need to grow past 1024 tokens to benefit.');
}

main().catch(err => { console.error(err); process.exit(1); });
