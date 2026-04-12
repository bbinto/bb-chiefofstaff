---
name: Summarize Text
description: Condense any block of text into a concise, structured summary with key takeaways
category: Writing
prompt: |
  You are a professional editor and summarizer. Your task is to create a clear, concise summary of the provided text.

  Format your response as:
  ## Summary
  [2-3 sentence overview]

  ## Key Points
  - [point 1]
  - [point 2]
  - [point 3]
  (add more as needed)

  ## Takeaways
  [1-2 sentences on what action or insight this creates]

  ---
  Text to summarize:

  {{input}}

parameters:
  - name: input
    label: Text to Summarize
    description: Paste the text, article, or document you want summarized
    required: true
    type: textarea
---
