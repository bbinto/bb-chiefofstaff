#!/usr/bin/env python3
"""Send a markdown file as an HTML email via Gmail SMTP."""

import os
import sys
import smtplib
import markdown
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from dotenv import dotenv_values

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         font-size: 15px; line-height: 1.6; color: #1a1a1a; max-width: 760px;
         margin: 0 auto; padding: 24px 16px; background: #f5f5f5; }}
  .card {{ background: #ffffff; border-radius: 10px; padding: 32px 36px;
           box-shadow: 0 1px 4px rgba(0,0,0,0.08); }}
  h1 {{ font-size: 1.7em; color: #111; border-bottom: 2px solid #e0e0e0;
        padding-bottom: 10px; margin-top: 0; }}
  h2 {{ font-size: 1.25em; color: #222; margin-top: 2em; border-bottom: 1px solid #eee;
        padding-bottom: 6px; }}
  h3 {{ font-size: 1.05em; color: #333; margin-top: 1.5em; }}
  a {{ color: #0066cc; text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
  ul, ol {{ padding-left: 1.4em; }}
  li {{ margin-bottom: 6px; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.93em; }}
  th {{ background: #f0f0f0; text-align: left; padding: 8px 12px;
        border: 1px solid #ddd; font-weight: 600; }}
  td {{ padding: 7px 12px; border: 1px solid #ddd; vertical-align: top; }}
  tr:nth-child(even) td {{ background: #fafafa; }}
  blockquote {{ border-left: 4px solid #e0e0e0; margin: 1em 0; padding: 8px 16px;
                color: #555; background: #fafafa; border-radius: 0 4px 4px 0; }}
  code {{ background: #f2f2f2; padding: 2px 5px; border-radius: 3px;
          font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.88em; }}
  pre {{ background: #f2f2f2; padding: 14px 16px; border-radius: 6px; overflow-x: auto; }}
  pre code {{ background: none; padding: 0; }}
  hr {{ border: none; border-top: 1px solid #e0e0e0; margin: 2em 0; }}
  .footer {{ font-size: 0.8em; color: #999; margin-top: 24px; text-align: center; }}
</style>
</head>
<body>
<div class="card">
{content}
</div>
<p class="footer">bb-chiefofstaff · {filename}</p>
</body>
</html>"""


def main():
    if len(sys.argv) < 4:
        print("Usage: send-email.py <to> <subject> <markdown-file>", file=sys.stderr)
        sys.exit(1)

    to_addr = sys.argv[1]
    subject = sys.argv[2]
    md_path = Path(sys.argv[3])

    if not md_path.exists():
        print(f"ERROR: File not found: {md_path}", file=sys.stderr)
        sys.exit(1)

    project_dir = Path(__file__).parent.parent
    env = {**dotenv_values(project_dir / ".env"), **os.environ}

    gmail_user = env.get("GMAIL_USER", "bbinto@gmail.com")
    app_password = env.get("GMAIL_APP_PASSWORD", "")

    if not app_password:
        print("ERROR: GMAIL_APP_PASSWORD not set in .env", file=sys.stderr)
        sys.exit(1)

    md_text = md_path.read_text(encoding="utf-8")
    html_body = markdown.markdown(md_text, extensions=["tables", "fenced_code", "nl2br"])
    html = HTML_TEMPLATE.format(content=html_body, filename=md_path.name)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = gmail_user
    msg["To"] = to_addr
    msg.attach(MIMEText(md_text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(gmail_user, app_password)
        smtp.sendmail(gmail_user, to_addr, msg.as_string())

    print(f"Email sent to {to_addr}: {subject}")


if __name__ == "__main__":
    main()
