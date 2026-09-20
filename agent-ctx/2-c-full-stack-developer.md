# Task 2-c — Quotation Engine Backend (work record)

Agent: full-stack-developer (quotation backend)

## Files created (no existing files modified)
- `src/lib/quote-service.ts` — server-only service: `resolveSettings()`, `createVersionFromPayload()`, `QuotePayload` interface, plus helpers `sortQuotationItems()`, `computeValidityDate()`, `isUniqueConstraintError()`.
- `src/app/api/quotations/route.ts` — GET list (status/search/mine filters, admin always own-scoped) + POST create (customer resolve, lead verification, transactional quotation+V1, publish-notice).
- `src/app/api/quotations/[id]/route.ts` — GET detail (customer, lead.leadNumber, createdBy, currentVersion with bathrooms+items section-ordered, versions timeline).
- `src/app/api/quotations/[id]/versions/route.ts` — POST new version (max+1, CANCELLED blocked, quotation.status follows new version).
- `src/app/api/quotations/[id]/publish/route.ts` — POST publish current version (SA always; admin only when `admins_can_publish=true`; cancelled blocked).
- `src/app/api/quotations/[id]/status/route.ts` — PATCH status (QUOTE_STATUSES validated; SA any; admin only QUOTE_SHARED/TC_ACCEPTED/PAYMENT_PENDING and only from published pipeline; version + quotation synced).
- `src/app/api/quotations/[id]/duplicate/route.ts` — POST deep-copy current version → new DRAFT quotation, V1 INITIAL.

## Key decisions
- Numbering: `nextQuotationNumber(prefix)` with retry-on-P2002 (self-healing, since seeded quotes started at 245 without a counter row — first create retried 245→249 automatically). Same retry wraps duplicate.
- `createVersionFromPayload` accepts optional `tx` so POST /quotations runs quotation-create + version-create in ONE transaction (no nested interactive transactions).
- Tile dedupe; fixtures/addons quantities merged per material; AREA-rule materials under `fixtures` get qty from `calcAreaMaterialQuantity(totalArea, coverage, wastage)` ignoring sent qty; qty ≥ 1 enforced otherwise.
- Items snapshot name/unit/rate from Material at creation time; section order TILES→FIXTURES→ADDONS→OTHER ('Design Consultation' item under OTHER, unit `set`).
- Publish downgrade (admin + setting false + publish:true) → DRAFT + `notice`, never an error.
- Admin status changes additionally require quotation.status ∈ {PUBLISHED, QUOTE_SHARED, TC_ACCEPTED, PAYMENT_PENDING}.
- Guard added: publishing a CANCELLED quotation → 400 (spec silent; prevents resurrect).

## Verification (all via curl against dev server, see worklog numbers)
- 9×5 Premium example: area 45, package 157,500, ceramic tile qty 49.51 × 65 = 3,218.15 (engine `calc.ts` ceil of 45×1.1 FP artifact — authoritative, unmodified), items 16,517.15, gross 174,017.15, discount 5,000, taxable 169,017.15, GST 30,423.09, total 199,440.24. ✔
- RBAC matrix tested: admin own-scope on list/detail/versions/publish/status/duplicate/lead-link; 401 unauth; 400s for empty bathrooms / bad package / bad tile / zero dims / qty<1 / invalid status / missing customer.
- `admins_can_publish=true` → admin publish 200; flipped to `false` via DB → admin publish 403 + create-with-publish → DRAFT + notice (setting restored to `true` afterwards).
- Audits observed: QUOTE_CREATE, QUOTE_PUBLISH, QUOTE_VERSION_CREATE, QUOTE_STATUS, QUOTE_DUPLICATE.
- `bun run lint` 0 errors (2 pre-existing warnings in Task-0 files); `tsc --noEmit` clean for my files.
