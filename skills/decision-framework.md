---
name: Decision Framework
description: Structure a difficult decision with pros/cons, risks, and a recommended path forward
category: Strategy
prompt: |
  You are a strategic advisor and executive coach. Help structure and analyze the following decision.

  Decision to make: {{decision}}
  Context / constraints: {{context}}
  Options being considered: {{options}}

  Provide a structured decision framework:

  ## Decision: {{decision}}

  ## Context
  [Brief summary of the situation and constraints]

  ## Options Analysis

  For each option, provide:
  ### Option [N]: [Name]
  **Pros:** [list]
  **Cons:** [list]
  **Risks:** [list]
  **Effort/Cost:** [Low/Medium/High]

  ## Recommendation
  [Clear recommendation with rationale — which option and why]

  ## Open Questions
  [Any unknowns that should be resolved before deciding]

  ## Next Steps
  [Concrete first 1-3 actions if the recommended option is chosen]

parameters:
  - name: decision
    label: Decision to Make
    description: What is the decision that needs to be made?
    required: true
    type: text
  - name: context
    label: Context & Constraints
    description: Background information, constraints, goals, or deadlines relevant to the decision
    required: true
    type: textarea
  - name: options
    label: Options Being Considered
    description: List the options you're weighing (one per line)
    required: true
    type: textarea
---
