# SKILL.md — Skill File Format

Skills are Markdown files stored in the `/skills` directory. Each file uses YAML frontmatter to define a reusable AI prompt with optional parameters that users can fill in before running.

## File Format

```markdown
---
name: Human-readable skill name
description: One-line description of what this skill does
category: Category name (e.g., Writing, Productivity, Strategy, Analysis)
prompt: |
  The full prompt sent to the LLM.
  Use {{parameter_name}} placeholders to inject user-provided values.

  Multi-line prompts use the YAML block scalar (|) syntax.

parameters:           # optional — omit if the skill needs no inputs
  - name: param_name  # matches {{param_name}} in the prompt
    label: Display Label
    description: Helpful hint shown below the input
    required: true    # or false
    type: text        # text | textarea | select
    options:          # only for type: select
      - value: option_value
        label: Option Label
---
```

## Parameter Types

| Type | Description |
|------|-------------|
| `text` | Single-line text input |
| `textarea` | Multi-line text input |
| `select` | Dropdown with predefined options |

## Prompt Placeholders

Use `{{parameter_name}}` anywhere in the prompt to inject the user's input. Parameter names must match exactly (case-sensitive).

## Example

```markdown
---
name: Summarize Text
description: Condense any block of text into a concise summary
category: Writing
prompt: |
  Summarize the following text:

  {{input}}

parameters:
  - name: input
    label: Text to Summarize
    required: true
    type: textarea
---
```

## Adding New Skills

1. Create a new `.md` file in `/skills/`
2. Wrap the YAML in `---` frontmatter delimiters
3. The skill will automatically appear in the "Run Skills" modal in the frontend
