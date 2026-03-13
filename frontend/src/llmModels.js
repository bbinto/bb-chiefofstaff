// Single source of truth for all LLM models across the app.
// Used by Settings.jsx (dropdowns) and LLMEvaluator.jsx (selection grid).

export const CLAUDE_MODELS = [
  { value: 'claude-opus-4-6',          label: 'Claude Opus 4.6',         tag: 'Arena #1 Text' },
  { value: 'claude-opus-4-6-thinking', label: 'Claude Opus 4.6 Thinking', tag: 'Arena #1 Thinking' },
  { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1',          tag: 'Most capable' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5',      tag: 'Recommended' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude Haiku 3.5',        tag: 'Fast' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',        tag: 'Fast' },
  { value: 'claude-3-haiku-20240307',  label: 'Claude 3 Haiku',           tag: 'Budget' },
]

export const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash',     label: 'Gemini 2.5 Flash',      tag: 'Balanced' },
  { value: 'gemini-2.5-pro',       label: 'Gemini 2.5 Pro',        tag: 'Highest quality' },
]

export const OLLAMA_CLOUD_MODELS = [
  { value: 'gpt-oss:120b-cloud',          label: 'GPT-OSS 120B',           tag: 'High quality' },
  { value: 'qwen3-vl:235b-cloud',         label: 'Qwen3 VL 235B',          tag: 'Vision' },
  { value: 'deepseek-v3.1:671b-cloud',    label: 'DeepSeek V3.1 671B',     tag: 'High quality' },
  { value: 'nemotron-3-nano:30b-cloud',   label: 'Nemotron 3 Nano 30B',    tag: 'Low latency' },
  { value: 'glm-5:cloud',                 label: 'GLM-5',                  tag: 'General purpose' },
  { value: 'qwen3.5:397b-cloud',          label: 'Qwen3.5 397B',           tag: 'High quality' },
  { value: 'nemotron-3-super:cloud',      label: 'Nemotron 3 Super',       tag: 'High quality' },
]

export const OLLAMA_LOCAL_MODELS = [
  // Add locally-installed Ollama models here, e.g.:
  // { value: 'llama3.2', label: 'Llama 3.2', tag: 'Local' },
]
