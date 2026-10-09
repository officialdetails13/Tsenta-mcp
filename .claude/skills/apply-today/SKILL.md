---
name: apply-today
description: Run today's batch of job applications through the Tsenta MCP using the user's saved filters. Use when the user types /apply-today or asks to run today's applications.
---

# Apply today

Run the daily Tsenta application batch. The user has explicitly authorized automatic submission
(auto-submit on, review-before-submit off, resume mode AGGRESSIVE). Do not change those settings.
Tools are prefixed `mcp__tsenta__`; load them with ToolSearch if they are deferred. If the Tsenta
tools are unavailable, say so and stop.

## Goal

Use the monthly application allowance (about 60 applications per day) before it resets on
2026-10-30. After 2026-10-30, do not apply; tell the user the allowance has reset.
Call `get-application-balance` first. Spend the monthly bucket only. Never spend pack credits
unless the user says so. Stop if the monthly bucket is used up.

## Search

Call `get-job-recommendations` with `limit: 50`, `autoApplyOnly: true`, `maxYearsExperience: 6`.
Prioritise the newest postings: search `datePosted: "24h"` first, apply to those, then keep widening the
window (`7d`, then `14d`, then `30d`) until about 60 qualifying jobs have been applied to for the day
(already-applied jobs are filtered out automatically, so each wider pass only returns new ones).

Run one search per title, for each location set below:

- Titles (`search`): product manager, business analyst, product owner, program manager,
  technical project manager, product operations, product marketing.
- Locations: `["state:IL", "state:TX", "state:CA", "state:MA", "state:NY", "state:FL", "state:WA", "state:GA", "state:CO", "state:NC", "state:VA", "state:AZ"]`
  (this covers Dallas, NYC and Chicago; if a search returns few results, also try
  `city:Dallas`, `city:New York`, `city:Chicago`, `city:Boston`, `city:Miami` separately)
- Remote US: `locations: ["country:US"]`, `workplaceTypes: ["REMOTE"]`

Already-applied jobs are filtered out by the tool.

## Filter every job yourself (the search filters are loose)

- Keep only product management, product owner, business analyst, program or technical project
  manager, product operations, and product marketing roles. Skip designers, engineers, interns,
  sales, architects, and consultants.
- Skip any title containing president, director, vice, VP, AVP, SVP, EVP, "head of", or "principal".
- Skip jobs listing more than 6 years of experience (`yearsOfExperienceMin` > 6). When no
  requirement is listed, skip obviously senior roles (Staff or Lead with senior scope).
- Location must be in Illinois, Texas, California, Massachusetts, New York, Florida, Washington,
  Georgia, Colorado, North Carolina, Virginia, Arizona, or genuinely remote within the US.
  Skip non-US jobs.
- Minimum match score is 70: skip any job with `matchScore` below 70 (the user's rule, "nothing below").
  Within each pass, apply to higher `matchScore` first. 80% was tried and is unreachable on this
  account (best matches are about 70-78%).
- Never re-apply: the search tool hides jobs with the same job id, but the same role is often posted
  under different ids (siblings, a parent company vs a subsidiary, or "Location ..." title variants).
  Before applying, check `list-applications` (query by company name) and skip any company+title
  combination that already appears, and skip siblings listed in a job's `siblings` field.

## Apply

Call `apply-to-job` with `jobIds` in batches of up to 20, about 60 total per day. Then check
`list-applications` with `filter: "failed"` and retry each failure at most once.

## Report

Keep it short: number applied, remaining balance (monthly and pack), notable companies, any
failures, and whether the pool of qualifying jobs is running dry (suggest widening filters if so).
