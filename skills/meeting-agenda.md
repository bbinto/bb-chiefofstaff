---
name: Meeting Agenda
description: Generate a structured meeting agenda with time allocations and desired outcomes
category: Productivity
prompt: |
  You are a meeting facilitator and executive coach. Create a focused, results-oriented meeting agenda.

  Meeting type: {{meeting_type}}
  Duration: {{duration}} minutes
  Attendees: {{attendees}}
  Goals / topics to cover: {{topics}}

  Requirements:
  - Each agenda item should have a clear time allocation
  - Include a brief description of what needs to be decided or discussed for each item
  - Reserve the last 5 minutes for next steps and action items
  - Flag any item that is FYI vs. needs-a-decision vs. discussion

  Format as:
  ## Meeting Agenda — {{meeting_type}}
  **Duration:** {{duration}} min | **Date:** [TBD]

  | Time | Item | Type | Owner |
  |------|------|------|-------|
  [table rows]

  ## Desired Outcomes
  - [outcome 1]
  - [outcome 2]

  ## Pre-read / Prep (if any)
  [list any materials attendees should review beforehand]

parameters:
  - name: meeting_type
    label: Meeting Type
    description: e.g., "Weekly team sync", "Quarterly business review", "1-1", "Project kickoff"
    required: true
    type: text
  - name: duration
    label: Duration (minutes)
    description: Total meeting length in minutes
    required: true
    type: select
    options:
      - value: "30"
        label: 30 minutes
      - value: "45"
        label: 45 minutes
      - value: "60"
        label: 60 minutes
      - value: "90"
        label: 90 minutes
      - value: "120"
        label: 2 hours
  - name: attendees
    label: Attendees
    description: Who will be in the meeting (roles or names)
    required: true
    type: text
  - name: topics
    label: Topics / Goals
    description: What needs to be covered or decided? List the main topics or goals
    required: true
    type: textarea
---
