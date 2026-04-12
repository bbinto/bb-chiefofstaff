---
name: Draft Email
description: Write a professional email based on your intent and key points
category: Writing
prompt: |
  You are an expert business communicator. Draft a professional email based on the following inputs.

  Tone: {{tone}}
  Recipient: {{recipient}}
  Purpose: {{purpose}}
  Key points to include: {{key_points}}

  Requirements:
  - Subject line should be clear and compelling
  - Opening should be warm but professional
  - Body should be concise and action-oriented
  - Closing should include a clear next step or call to action
  - Keep it under 200 words unless the content requires more

  Format as:
  **Subject:** [subject line]

  [email body]

parameters:
  - name: recipient
    label: Recipient / Audience
    description: Who is this email going to? (e.g., "direct report", "executive stakeholder", "customer")
    required: true
    type: text
  - name: tone
    label: Tone
    description: The tone of the email
    required: true
    type: select
    options:
      - value: professional
        label: Professional
      - value: friendly
        label: Friendly & Warm
      - value: assertive
        label: Assertive / Direct
      - value: empathetic
        label: Empathetic
      - value: formal
        label: Formal
  - name: purpose
    label: Email Purpose
    description: What is the goal of this email? (e.g., "request a meeting", "deliver feedback", "escalate an issue")
    required: true
    type: text
  - name: key_points
    label: Key Points
    description: Bullet points or notes on what needs to be covered
    required: true
    type: textarea
---
