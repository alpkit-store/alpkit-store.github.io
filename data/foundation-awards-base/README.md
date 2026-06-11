# AKF Applications — System Overview

End-to-end pipeline for Alpkit Foundation grant applications. Replaces a manual Microsoft Forms + spreadsheet process that became unsustainable as volume grew to 300–600 applications per batch, every two months.

---

## Why it works this way

**Applications as Markdown files.** Each application is a single `.md` file with YAML frontmatter. No database to set up or maintain, no schema migrations, no JOIN queries. The narrative sections (description, case statement) live in the same file as the structured data. Readable in any text editor and works naturally with version control.

**Trustees vote in a shared spreadsheet.** One XLS per group is uploaded to SharePoint. Trustees mark their votes directly — no file to email back, no returns to collect. On awards night the spreadsheet is sorted by vote count and fed straight into `decide.py`.

**Decisions are decoupled from emails.** After the meeting, applications sit at `approved-pending-email` or `declined-pending-email` until you're ready to send. This gives a dry-run window before anything goes out.

**Shortlisting rule: any one vote.** An application only needs a single trustee champion to reach the meeting. A majority-required rule would risk strong-but-unusual applications being dropped before anyone could discuss them.

**Technology-assisted prioritisation.** A rule-based system applies the AKF Prioritisation Criteria to rank applications before the trustee meeting. Contact fields are excluded from the assessment to prevent identity-based bias. The system produces a consistent, repeatable ranked order — trustees review every application and make all funding decisions.

**Email via Microsoft Graph.** Outcome emails send from `akf@alpkit.com` using the existing M365 infrastructure. No third-party service subscription; consistent with the organisation's existing setup.

---

## Tools

| Tool | Purpose |
|---|---|
| **Tally** | Application form — conditional logic for eligibility gate, REST API for intake |
| **Microsoft Graph API** | Sending outcome emails from `akf@alpkit.com` |
| **Azure (AKF Email Sender app)** | App-only auth for Graph — no user login required at runtime |
| **Python 3** | All scripts — no deployment needed, runs on any machine |
| **openpyxl** | Excel generation for trustee review sheets and shortlist |
| **reportlab** | PDF generation for trustee meeting reference doc |

---

## Directory structure

```
021_AKF_Applications/
├── scripts/
│   ├── intake.py           Tally API → MD files
│   ├── score.py            Auto-score applications [to build]
│   ├── batch.py            Assign batch + group fields
│   ├── export_sheets.py    Excel review sheet per group → reviews/sheets/
│   ├── combine.py          Aggregate returned votes → shortlist
│   ├── preview_pdf.py      Trustee meeting PDF
│   ├── decide.py           Record decisions live at meeting
│   └── send_emails.py      Outcome emails via Microsoft Graph
├── applications/           All applications as MD files (one per submission)
│   └── Historic/           15,471 converted historic applications
├── reviews/
│   ├── sheets/             Generated trustee review spreadsheets
│   ├── returns/            Returned trustee spreadsheets (drop here)
│   └── templates/          Email templates (email_success.md, email_decline.md)
├── logs/                   Timestamped email send logs
├── archive/                Retired files
├── TEST-Applications/      10 test applications for script development
├── README.md               This document
├── DESIGN.md               System design, decisions, open questions, build status
├── Trustees_Guide.md       Operational guide for running a batch (steps 4–7)
├── AKF_Scoring_Rulebook.md Scoring methodology — also used as AI scoring prompt
├── tally.env               API credentials (not committed)
└── requirements.txt        Python dependencies
```

---

## Scoring system

Applications are scored 0–5 across five dimensions:

| Dimension | What it checks |
|---|---|
| 1. Outdoor activity | Project is centred on a qualifying outdoor activity |
| 2. Inclusion | Applicant serves people who face identified barriers |
| 3. Proportionate ask | Request is specific, costed, and ≤ £5,000 |
| 4. Identified beneficiaries | Names who benefits, in what number, and why they need support |
| 5. Category fit | Falls within Participation, Health, Education, Environment, or Diversity |

Score-5 applications receive a sub-score (0–10) to rank the strongest within the top tier. If Dimension 1 = 0, the maximum overall score is 2 regardless of other dimensions.

Full methodology and edge case decisions: `AKF_Scoring_Rulebook.md`

---

## Open decisions

| # | Decision | Status |
|---|---|---|
| 1 | `score.py` — Claude API with prompt caching, contact fields stripped | Agreed, not built |
| 2 | SharePoint upload — automate via Graph API after generating preview pack | Parked — manual first cycle |
| 3 | Non-shortlisted applications — bulk decline after `decide.py`? | Open |
| 4 | Award claim form (`tally.so/r/9qvvpV`) | To build |
| 5 | Financial award payment — manual bank transfer or automated? | Open |
| 6 | Equipment voucher generation — Shopify voucher API? | Open |
| 7 | Follow-up timing — how long after project end before requesting report? | Open |

---

*For setup, schema, status lifecycle, and build status: see `LOG.md`*
*For running a batch end-to-end: see `Trustees_Guide.md`*
