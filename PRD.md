# Discovery Layer — Product Requirements Document

Category intelligence platform for B2B security staffing in Bengaluru.

V1 scope: structured vendor onboarding, verified profiles, AI-assisted requirement capture, shortlist + normalized quote comparison, ops console. No public API, no MCP server, no open marketplace.

---

## 1. Objectives

### Primary
- Buyer gets a relevant vendor shortlist in under 15 minutes from a plain-language brief.
- Normalized, side-by-side comparison of vendor quotes across rate, compliance, SLA, and hidden terms.
- Verified vendor data with explicit freshness signals.

### Secondary
- Vendors publish capability and commercial terms once in a standardized format and receive qualified RFQs.
- Ops team can manually verify, correct, and merge vendor records at scale.

### Non-goals (V1)
- Payments, contracts, e-signature.
- Multi-category support (housekeeping, catering, etc.).
- Open APIs, MCP server, llms.txt, external LLM discoverability.
- Automated negotiation or bidding.

---

## 2. Personas

| Persona | Role | Primary need |
|---|---|---|
| Priya | Facility/Admin head at a 500-person office | Replace incumbent security vendor without running a month-long RFP |
| Rahul | Procurement manager, 3-warehouse logistics firm | Compare 5 vendors on normalized cost per guard per month |
| Suresh | Owner, mid-size security agency | More qualified leads without paying broker commissions |
| Anita | Ops analyst at Discovery Layer | Verify new vendors, resolve duplicates, unblock buyers |

---

## 3. Core user flows

### 3.1 Buyer flow — new sourcing
1. Buyer signs up with work email + OTP.
2. Lands on **Create brief** screen. Types plain-language need.
3. AI extracts structured fields. Buyer reviews/edits 3–5 follow-up questions.
4. System returns **Shortlist** (default 5 vendors) with ranking rationale.
5. Buyer selects vendors → **Request quotes**.
6. Vendors respond. Quotes are normalized into a **Compare** screen.
7. Buyer marks winner, reason, and expected contract start date.

### 3.2 Buyer flow — re-source / renewal
1. Buyer opens past brief → **Duplicate brief**.
2. System pre-fills prior fields, flags rate drift vs last quote.
3. Flow continues as 3.1 from step 4.

### 3.3 Vendor flow — onboarding
1. Vendor receives WhatsApp/email invite with signup link, or self-signs.
2. Phone OTP → basic profile (name, GST, PSARA, city).
3. Guided capability form (guard types, sectors, headcount, women guards, backup).
4. Compliance uploads (PSARA, PF/ESI, insurance, GST cert).
5. Commercial structure form (day rate, night rate, supervisor rate, min term, min headcount, OT rule, replacement SLA).
6. Submits for review. Status: `pending_verification`.
7. Ops verifies → status `verified`. Vendor becomes searchable.

### 3.4 Vendor flow — RFQ response
1. Vendor gets notified of new RFQ matching their serviceability.
2. Opens RFQ card: structured brief + standard quote template.
3. Fills quote (rates, deviations from standard terms, validity).
4. Submits → buyer sees it on the Compare screen.

### 3.5 Ops flow — verification
1. Queue of `pending_verification` vendors.
2. Each record shows uploaded docs, GST lookup result, phone verification, dedupe candidates.
3. Ops approves, rejects with reason, or requests more info.
4. Approved vendors get `verified` badge and `last_verified_at` timestamp.

---

## 4. Screens (V1)

### Buyer web app
| # | Screen | Purpose |
|---|---|---|
| B1 | Sign up / Log in | Work-email OTP auth |
| B2 | Dashboard | Active briefs, open RFQs, past sourcings |
| B3 | Create brief — step 1 (free text) | Plain-language input box, sample prompts |
| B4 | Create brief — step 2 (clarify) | 3–5 dynamic follow-up questions generated from extraction gaps |
| B5 | Brief summary | Structured brief preview, editable fields, confirm |
| B6 | Shortlist | Ranked vendor cards with rationale, filters (serviceability, compliance, rate band), weights adjuster |
| B7 | Vendor detail | Full profile, freshness, compliance docs status, past response time, references count |
| B8 | RFQ basket | Selected vendors, review before sending, edit deadline |
| B9 | RFQ tracking | Per-vendor status (sent, viewed, responded, declined), time-to-respond |
| B10 | Compare | Side-by-side normalized quotes; toggle: headline rate, fully loaded rate, per-guard-per-month; highlight deviations |
| B11 | Decision | Mark winner, reason, start date, optional NPS |

### Vendor mobile web / app
| # | Screen | Purpose |
|---|---|---|
| V1 | Sign up | Phone OTP, GST |
| V2 | Home | Profile completeness %, open RFQs, profile freshness prompt |
| V3 | Capability form | Multi-step, save-as-you-go |
| V4 | Compliance uploads | PSARA, PF/ESI, insurance, GST cert; status per doc |
| V5 | Commercial terms | Rate card + standard SLA deviations |
| V6 | RFQ inbox | Cards with match score and deadline |
| V7 | RFQ respond | Pre-filled template from profile, overrides allowed |
| V8 | Profile preview | Buyer-facing view |

### Ops console
| # | Screen | Purpose |
|---|---|---|
| O1 | Verification queue | Pending vendors, SLA timer |
| O2 | Vendor record | Docs, GST check, dedupe candidates, edit, merge, approve/reject |
| O3 | RFQ monitor | Stuck RFQs, low-response cases |
| O4 | Buyer support | Open briefs, flagged issues |
| O5 | Data quality | Freshness drift, missing fields, outdated rates |
| O6 | Category config | Schema edits, weight defaults, verification rules |

---

## 5. Data schema (Postgres, V1)

All tables have `id (uuid)`, `created_at`, `updated_at`. Commercial and capability tables are append-only versioned via `*_history` tables keyed on `(vendor_id, effective_from)`.

### 5.1 Identity

**`buyer_org`**
- name, gst, city, employee_band, site_count, created_by_user_id

**`buyer_user`**
- email, phone, name, role, buyer_org_id, auth_provider

**`vendor`**
- legal_name, display_name, gst, psara_license_no, psara_state, incorporation_year, company_type, hq_address, hq_city, contact_name, contact_phone, contact_email, status (`draft|pending_verification|verified|suspended`), verified_at, last_updated_at, last_active_at, completeness_score, freshness_score

**`vendor_user`**
- vendor_id, phone, name, role, last_login_at

### 5.2 Capability

**`vendor_capability`** (current)
- vendor_id (unique), guard_types (enum set: `unarmed, armed, supervisor, bouncer`), sectors (enum set: `office, warehouse, industrial, residential, retail`), max_headcount, relief_capacity_pct, support_24x7 (bool), women_guards (bool), training_inhouse (bool), uniform_included (bool)

**`vendor_service_area`**
- vendor_id, city, pincode_prefix, travel_radius_km

### 5.3 Compliance

**`vendor_compliance`**
- vendor_id (unique), gst_verified (bool), pf_esi_support (bool), psara_valid_until, insurance_valid_until, wc_policy (bool)

**`vendor_document`**
- vendor_id, doc_type (`psara|gst|pf|esi|insurance|sample_invoice|reference_letter`), file_url, uploaded_at, verified_by_user_id, verified_at, status (`pending|verified|rejected`), reject_reason

### 5.4 Commercial

**`vendor_rate_card`** (current)
- vendor_id (unique), billing_unit (`pgpm` default), day_rate, night_rate, supervisor_rate, women_guard_rate, min_contract_months, min_headcount, ot_rule (`1.5x|2x|custom`), ot_rule_note, holiday_rule, replacement_sla_hours, replacement_penalty_per_day, validity_until, currency (`INR`)

**`vendor_rate_card_history`**
- same fields + effective_from, effective_to, changed_by_user_id

### 5.5 Brief and RFQ

**`brief`**
- buyer_org_id, created_by_user_id, raw_text, status (`draft|active|closed`), site_type, city, pincode, required_headcount, shift_pattern (`8h|12h|24x7`), armed_required (bool), women_guards_required (bool), start_date, contract_months, notes

**`brief_extraction`**
- brief_id, llm_model, extraction_json, confidence, unresolved_fields[], created_at

**`shortlist`**
- brief_id, vendor_id, rank, score, rationale_text, created_at

**`rfq`**
- brief_id, vendor_id, status (`sent|viewed|responded|declined|expired`), sent_at, viewed_at, responded_at, deadline_at

**`quote`**
- rfq_id, day_rate, night_rate, supervisor_rate, women_guard_rate, included_reliefs, ot_rule, holiday_rule, replacement_sla_hours, validity_until, deviations_json, attachments[], normalized_pgpm_rate, fully_loaded_pgpm_rate

**`decision`**
- brief_id, winning_vendor_id, reason_code (`price|sla|compliance|reference|other`), reason_text, start_date, nps

### 5.6 Trust and behavior

**`vendor_reference`**
- vendor_id, client_name, client_industry, headcount_served, since, contact_optional

**`vendor_behavior_rollup`** (nightly job)
- vendor_id, rfq_view_rate_30d, response_rate_30d, median_response_hours_30d, decline_reasons[]

### 5.7 Audit
**`event_log`** — actor, actor_type, entity_type, entity_id, event, payload_json, occurred_at.

---

## 6. AI architecture (V1)

Two touchpoints only. DB is source of truth; the model never invents vendors.

### 6.1 Requirement parsing
- Input: `brief.raw_text` + answers to clarifying questions.
- Model: single strong LLM with JSON schema-constrained output.
- Output: `brief_extraction.extraction_json` validated against brief schema; unresolved fields drive follow-up questions on B4.

### 6.2 Shortlist rationale
- Retrieval + deterministic ranking happen in Postgres.
- LLM receives only the top-N candidate rows and the structured brief, then writes `shortlist.rationale_text` explaining fit and tradeoffs.
- Guardrails: model cannot add vendors not in the candidate set; output must cite field values present in input.

---

## 7. Ranking (V1 defaults)

Weighted score over normalized [0,1] components:

| Component | Default weight |
|---|---|
| Serviceability (city/pincode/radius) | 0.20 |
| Headcount capacity vs requirement | 0.15 |
| Compliance completeness | 0.15 |
| Freshness (last_updated_at, last_verified_at) | 0.10 |
| Response behavior (response_rate_30d, median_response_hours) | 0.10 |
| Replacement SLA | 0.10 |
| Price band fit (not raw price) | 0.10 |
| Reference count & recency | 0.10 |

Hard filters applied before scoring: `status=verified`, armed requirement, women-guard requirement, min contract term compatibility.

---

## 8. Verification rules (V1)

A vendor moves to `verified` only if:
- GST verified via external lookup.
- Phone OTP completed by at least one vendor_user.
- PSARA document uploaded and manually reviewed.
- At least one document in `sample_invoice` or `reference_letter` reviewed.
- Ops approval recorded with `verified_by_user_id`.

Badges: `basic_verified`, `compliance_verified` (all core docs + valid PSARA), `recently_updated` (profile touched within 30 days).

---

## 9. Metrics

Supply: verified_vendor_count, avg completeness_score, freshness_rate_30d, rfq_response_rate_30d.

Demand: briefs_created, shortlist_to_rfq_rate, rfq_to_quote_rate, quote_to_decision_rate, p50_time_to_shortlist, p50_time_to_first_quote.

Quality: buyer_relevance_rating (post-shortlist thumbs), vendor_complaint_rate, outdated_profile_rate, ops_corrections_per_vendor.

Instrument every state transition via `event_log` from day one.

---

## 10. Tech stack

- Frontend: Next.js (buyer + vendor + ops as separate routes, shared UI lib).
- Backend: FastAPI (Python) — LLM tooling is easier here.
- DB: Postgres with `pg_trgm` for fuzzy vendor dedupe; Postgres full-text for search in V1.
- Storage: S3-compatible for docs.
- Auth: OTP (MSG91 or similar) + email magic link.
- LLM: single frontier model, schema-constrained outputs.
- Analytics: server-side event log + a product analytics tool.

---

## 11. Milestones

- **Day 0–30** — finalize schema, wireframes, 20 buyer + 30 vendor interviews, validate top-10 decision fields.
- **Day 31–60** — build V3–V5 vendor forms, B3–B6 buyer flow, O1–O2 ops console; onboard first 20 vendors manually.
- **Day 61–90** — launch with 50 vendors, run 20 real comparisons, measure §9 metrics.
- **Month 4–6** — quote normalization v2, renewal reminders, benchmark views, begin monetization.
- **Month 7–12** — Hyderabad, housekeeping category, public vendor profile pages; only then evaluate API / MCP.

---

## 12. Open questions

- Do buyers pay per sourcing cycle or as SaaS? Decide after 10 pilot decisions.
- Who owns quote validity and re-quoting when briefs drift? Default: vendor must revalidate after 14 days.
- How much deviation from standard terms do we allow before a quote is flagged "non-standard"? Proposed: any non-null field in `quote.deviations_json`.
- Dedupe strategy for vendors operating under multiple GSTs — treat as separate records in V1, merge in ops later.
