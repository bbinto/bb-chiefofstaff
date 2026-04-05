---
name: Rewrite for Clarity
description: Rewrite any text to be clearer, more concise, and easier to understand
category: Writing
prompt: |
  You are an expert editor. Rewrite the provided text to be clearer, more concise, and impactful — while preserving the original meaning and intent.

  Target audience: {{audience}}
  Goal: Make it {{goal}}

  Guidelines:
  - Remove jargon and unnecessary words
  - Use active voice
  - Break long sentences into shorter ones
  - Keep the original structure unless it hurts clarity
  - Do NOT change the core message or add new information

  Provide:
  1. The rewritten version
  2. A brief note (1-2 sentences) explaining the main changes made

  ---
  Original text:

  {{input}}

parameters:
  - name: input
    label: Original Text
    description: The text you want rewritten
    required: true
    type: textarea
  - name: audience
    label: Target Audience
    description: Who will read this? (e.g., "executives", "engineers", "customers", "general public")
    required: true
    type: text
  - name: goal
    label: Rewrite Goal
    description: What quality to optimize for
    required: true
    type: select
    options:
      - value: shorter and punchier
        label: Shorter & Punchier
      - value: clearer and simpler
        label: Clearer & Simpler
      - value: more formal and polished
        label: More Formal & Polished
      - value: more casual and conversational
        label: More Casual & Conversational
      - value: more persuasive and compelling
        label: More Persuasive & Compelling
---
