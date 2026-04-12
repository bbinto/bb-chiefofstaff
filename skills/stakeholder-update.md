---
name: Stakeholder Update
description: Create a concise executive status update following the BLUF framework - leads with conclusions, not process
category: Writing
prompt: |
  You are an expert at executive communication. Create a clear, concise stakeholder update following the BLUF (Bottom Line Up Front) principle.

  **Project:** {{project}}
  **Period:** {{period}}
  **Audience:** {{audience}}
  **Current Status:** {{status}}
  **Content (accomplishments, metrics, risks, upcoming milestones):**
  {{content}}

  ---

  ## Writing Principles

  1. **Lead with conclusions, not process**
     - Not: "We ran 5 experiments this week and analyzed the data..."
     - Yes: "Conversion rate increased 15% from optimization work"

  2. **Focus on impact, not activities**
     - Not: "Held 12 customer interviews"
     - Yes: "Identified #1 barrier to adoption (complexity of setup)"

  3. **Make problems visible early** - propose solutions, not just problems
  4. **Quantify whenever possible** - show trends, not just snapshots
  5. **Make it scannable** - headers, bullets, bold key info, visual indicators

  ---

  ## Output Format

  # {{project}} — {{period}}

  ## BLUF
  **Status:** [🟢 On track / 🟡 At risk / 🔴 Blocked / ✅ Complete based on {{status}}]
  **Key Takeaway:** [One sentence summary of current state]
  **Action Needed:** [What you need from stakeholders, or "No action needed"]

  ## Progress Summary
  [3-5 bullet points max - what shipped, milestones achieved, key metrics movement]
  - [Accomplishment with impact]
  - [Accomplishment with impact]
  - [Accomplishment with impact]

  ## Key Metrics
  | Metric | Current | Target | Trend | Status |
  |--------|---------|--------|-------|--------|
  | [Metric] | [Value] | [Target] | [up/flat/down] | [🟢/🟡/🔴] |

  [Include 3-5 most important metrics only. Extract from the content provided.]

  ## Risks & Blockers
  [Only issues that matter at executive level. If none, say "No significant risks at this time."]

  **[Priority: HIGH/MEDIUM] [Issue Name]**
  - **Impact:** [What is at stake]
  - **Mitigation:** [What you are doing about it]
  - **Help Needed:** [What stakeholders can do, if applicable]

  ## Upcoming Milestones

  **Next 30 Days:**
  - [Milestone] ([expected date])

  **Next 90 Days:**
  - [Major milestone] ([month])

  ## Decisions Needed
  [Only if action is required from stakeholders. Otherwise omit this section.]

  **Decision:** [Clear description]
  **Options:** [2-3 options with brief pros/cons]
  **Recommendation:** [What you recommend and why]
  **Timeline:** [When decision is needed]

  ---

  Keep the entire update under 1 page (2 minutes reading time). Tailor depth and language for {{audience}}.

parameters:
  - name: project
    label: Project / Initiative Name
    description: Name of the project or initiative this update covers
    required: true
    type: text
  - name: period
    label: Time Period
    description: The period this update covers (e.g. "Week of Mar 24, 2026" or "Q1 2026")
    required: true
    type: text
  - name: audience
    label: Audience
    description: Who will read this? (e.g. "C-Suite", "Product & Engineering leadership", "Cross-functional team", "Board")
    required: true
    type: select
    options:
      - value: C-Suite
        label: C-Suite / Executives
      - value: Product & Engineering leadership
        label: Product & Engineering Leadership
      - value: Cross-functional team
        label: Cross-functional Team
      - value: Board / Investors
        label: Board / Investors
  - name: status
    label: Current Status
    description: Overall status of the project
    required: true
    type: select
    options:
      - value: On track
        label: "🟢 On Track"
      - value: At risk
        label: "🟡 At Risk"
      - value: Blocked
        label: "🔴 Blocked"
      - value: Complete
        label: "✅ Complete"
  - name: content
    label: Content
    description: Paste in your raw notes - accomplishments, metrics, risks, blockers, upcoming milestones. The skill will structure and polish them.
    required: true
    type: textarea
---
