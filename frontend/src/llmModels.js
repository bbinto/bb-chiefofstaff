// Single source of truth for all LLM models across the app.
// Used by Settings.jsx (dropdowns) and LLMEvaluator.jsx (selection grid).

export const CLAUDE_MODELS = [
  { value: 'claude-opus-4-6',           label: 'Claude Opus 4.6',    tag: 'Most capable' },
  { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6',  tag: 'Recommended' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',   tag: 'Best value' },
  { value: 'claude-3-haiku-20240307',   label: 'Claude 3 Haiku',     tag: 'Budget' },
]

export const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash',     label: 'Gemini 2.5 Flash',      tag: 'Balanced' },
  { value: 'gemini-2.5-pro',       label: 'Gemini 2.5 Pro',        tag: 'Highest quality' },
]

export const OLLAMA_CLOUD_MODELS = [
  {
    value: 'deepseek-v4-pro:cloud',
    label: 'DeepSeek V4 Pro',
    tag: 'Reasoning · Analysis',
    description: 'Best for deep analytical tasks and multi-step reasoning. Use when you need to draw structured conclusions from complex information.',
  },
  {
    value: 'deepseek-v3.1:671b-cloud',
    label: 'DeepSeek V3.1 671B',
    tag: 'Deep comprehension',
    description: 'Largest model available — strongest raw comprehension for dense documents or nuanced content. Slower, but most thorough on big information loads.',
  },
  {
    value: 'kimi-k2.6:cloud',
    label: 'Kimi K2.6',
    tag: 'Long context · Agentic',
    description: 'Specialist for extremely long contexts. Best when feeding in large documents, multiple sources, or running agentic info-gathering across many inputs.',
  },
  {
    value: 'kimi-k2-thinking:cloud',
    label: 'Kimi K2 Thinking',
    tag: 'Deep reasoning',
    description: 'Extended step-by-step reasoning. Great for synthesizing multiple sources into a coherent, well-structured conclusion or analysis.',
  },
  {
    value: 'glm-5.1:cloud',
    label: 'GLM-5.1',
    tag: 'Thinking · 128K context',
    description: 'Solid all-rounder with 128K context, thinking mode, and tool use. Good default for research workflows and summarization tasks.',
  },
]

export const OLLAMA_LOCAL_MODELS = [
  // Add locally-installed Ollama models here, e.g.:
  // { value: 'llama3.2', label: 'Llama 3.2', tag: 'Local' },
]
