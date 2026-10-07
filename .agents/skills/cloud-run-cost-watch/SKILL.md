---
name: cloud-run-cost-watch
description: Review actual Google Cloud billing for this project's Cloud Run deployment. Use for recurring or one-time cost checks; do not report estimates as billed amounts.
metadata:
  short-description: Check Cloud Run costs from billing data
---

# Cloud Run Cost Watch

Review actual charges for this project's Cloud Run deployment using read-only billing data. Focus on Cloud Run, Cloud Build, Artifact Registry, and related network or logging charges.

## Source of truth

- Use the user's configured Cloud Billing export to BigQuery when it is available. Inspect the table schema before querying because standard and detailed exports differ.
- Scope rows to the Cloud Run project and report the currency, date range, and whether totals are before or after credits, taxes, and adjustments.
- Compare month-to-date charges with the previous check when a saved prior result is available. Identify new or unusual charges by service and SKU.
- Never infer an actual bill from deployment count, Cloud Run settings, free-tier allowances, or list prices. A pricing estimate must be labeled as an estimate.

## Access and safety

- Use read-only commands and queries. Do not deploy, change IAM, enable billing export, create budgets, alter cleanup policies, or modify billing configuration.
- Do not print tokens, credential files, account secrets, or unrelated billing data.
- If there is no authenticated Google Cloud account, no project or billing dataset is identified, or the export is not accessible, state exactly what is missing. Do not say the cost is zero.
- Enabling billing export and querying BigQuery can affect data access or incur separate charges; leave that setup to the user unless they explicitly authorize it.

## Reporting

Report the period, currency, total actual cost available, change since the prior period/check, and the largest relevant service/SKU charges. Separate credits and taxes when the export supports them. Mention free-tier usage only as context, not as a deduction unless the billing export reflects it.

For recurring checks, stay quiet when there is no new data and no meaningful change. Notify the user when spending rises materially, an unexpected service appears, an available budget threshold is near or exceeded, or access needs to be configured. If no baseline could be established, request the missing project and billing-export details once and avoid repeating the same blocker without a change.
