// Single source of truth for all LLM models across the app.
// Used by Settings.jsx (dropdowns) and LLMEvaluator.jsx (selection grid).

export const CLAUDE_MODELS = [
  { value: 'claude-fable-5',            label: 'Claude Fable 5',     tag: 'Most powerful' },
  { value: 'claude-opus-4-8',           label: 'Claude Opus 4.8',    tag: 'Most capable' },
  { value: 'claude-opus-4-6',           label: 'Claude Opus 4.6',    tag: 'Older Opus' },
  { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6',  tag: 'Recommended' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',   tag: 'Best value' },
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
  {
    value: 'qwen3:27b',
    label: 'Qwen3 27B',
    tag: 'Best overall · 24GB',
    description: 'Best dense local model for consumer hardware. Strong reasoning and instruction-following — great all-rounder for CoS workflows.',
  },
  {
    value: 'qwen3:30b',
    label: 'Qwen3 30B',
    tag: 'Balanced · All-round',
    description: 'Slightly larger Qwen3 variant. Well-rounded for planning, summarization, and multi-step tasks.',
  },
  {
    value: 'devstral:24b',
    label: 'Devstral Small 24B',
    tag: 'Agentic · Tool use',
    description: 'Tuned specifically for agentic workflows and tool use. Best pick when CoS needs to execute multi-step actions with tools.',
  },
  {
    value: 'llama4:scout',
    label: 'Llama 4 Scout',
    tag: 'Long context · Multimodal',
    description: 'Supports up to 10M token context and images. Best when processing large documents or multiple sources in a single run.',
  },
  {
    value: 'gpt-oss:20b',
    label: 'GPT-OSS 20B',
    tag: 'Reasoning · 16GB',
    description: 'Adjustable reasoning (~o3-mini level) that fits in 16GB. Good balance of quality and speed for daily CoS tasks.',
  },
  {
    value: 'gemma4',
    label: 'Gemma 4',
    tag: 'Vision · Multimodal',
    description: 'Google\'s latest local model with strong vision and tool-calling support. Best when your CoS needs to interpret images or screenshots.',
  },
]
