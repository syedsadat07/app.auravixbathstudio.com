# Task ID: 2-b — full-stack-developer (master-data backend)

## Scope
Master-data + insights backend for AURAVIX BATH STUDIO: Materials, Material Categories, Packages, Settings, Dashboard, Reports, Orders, Audit Logs, Search, Upload APIs.

## Files created (all under src/app/api/)
1. `materials/route.ts` — GET (?search=&category=<id|name>&status=ACTIVE|ALL; admins ALWAYS ACTIVE-only even if status=ALL; include category; orderBy name asc) + POST (SUPER_ADMIN, per worklog contract, audit MATERIAL_CREATE).
2. `materials/[id]/route.ts` — PATCH SUPER_ADMIN partial update (name, subCategory, brand, sku, description, price, unit, coverage, coverageUnit, wastagePercent, quantityRule, imageUrl, categoryId). price change → audit MATERIAL_PRICE_UPDATE `Updated <name> price ₹old → ₹new`, else MATERIAL_UPDATE. 404 if missing, 400 invalid numbers/category, status field ignored.
3. `materials/[id]/status/route.ts` — PATCH SUPER_ADMIN {status ACTIVE|INACTIVE}; audit MATERIAL_STATUS `<name> <status>`.
4. `material-categories/route.ts` — GET (any authed, id/name/sortOrder/materialCount via _count) + POST SUPER_ADMIN (409 dup, sortOrder = max+1, audit CATEGORY_CREATE).
5. `packages/route.ts` — GET (all packages for all authed; UI filters ACTIVE for admins per 2-b task) + POST SUPER_ADMIN (409 dup name, audit PACKAGE_CREATE).
6. `packages/[id]/route.ts` — PATCH SUPER_ADMIN partial {name, pricePerSqft, description, duration, status}; rate change → audit PACKAGE_UPDATE `<name> rate ₹old → ₹new`, else `Updated package <name>`; name uniqueness 409; status validated ACTIVE|INACTIVE.
7. `settings/route.ts` — GET (any authed) {settings: Record} from Setting table; PUT SUPER_ADMIN {settings} upsert each key (string|number|boolean → String), audit SETTINGS_UPDATE `Updated keys: a, b, c`.
8. `dashboard/route.ts` — role-aware GET. Admin scope: leads assignedAdminId=self, quotations createdById=self. todayAppointments (server-local today, asc, 10, customer name+city, customerCity, leadId) + todayCount; followUps (QUOTE_SHARED/TC_ACCEPTED/PAYMENT_PENDING); ordersWon (ORDER_CONFIRMED/ORDER_FREEZE/PAYMENT_RECEIVED updatedAt this month) + ordersTarget (Setting orders_target, default 10); metrics: totalLeads, activeLeads (notIn CLOSED_LOST/CONVERTED), totalQuotations, publishedQuotations, acceptedQuotations (TC_ACCEPTED→ORDER_FREEZE group), convertedLeads, quotationValue (Σ current-version grossValue status != CANCELLED), revenue (Σ current-version totalPayable PAYMENT_RECEIVED), activeAdmins (SA only — key omitted for admins), totalCustomers (customers with leads in scope); monthly last 6 {label:'Sep',leads,quotes,revenue(revenue bucketed by updatedAt)}; recentQuotes 5 latest incl. versionNumber from latest version + customerName + customer{name}.
9. `reports/route.ts` — GET ?from=&to= (YYYY-MM-DD, default last 90 days; 400 on bad format): leadsByStatus, quotesByStatus {status,count,value(grossValue of current version)}, revenueByMonth {month:'2026-09',revenue}, adviserPerformance {id,name,leads,quotes,won,value(totalPayable of won)} (ADMIN/SUPER_ADMIN users; SA sees those with activity, admin sees self), packageMix {name,count,area} from quotationVersions.packageName (quotation not CANCELLED).
10. `orders/route.ts` — GET ?search= : leads (admin: own) having ≥1 quotation in ORDER_FLAG_STATUSES (imported from lib/status). Active quote = latest updatedAt among pipeline quotes. Returns leadId/leadNumber/leadStatus/customer{...}/createdAt/adviserName/quote{id,quotationNumber,versionNumber,versionType,status,totalPayable,grossValue,publishedAt(PUBLISHED version createdAt else quotation.updatedAt),bathroomCount(current version _count.bathrooms),statusFlags{quotePublished(status∉DRAFT/UNDER_REVIEW),tcAccepted,paymentReceived,orderFreeze}}/otherVersionsCount(active quote versions−1). search matches customer name/phone/leadNumber/quotationNumber. Sorted by active-quote updatedAt desc. NOTE: Quotation table has no money columns — totalPayable/grossValue always read from current (max versionNumber) QuotationVersion.
11. `audit-logs/route.ts` — GET SUPER_ADMIN ?search=&limit=100 (clamp 1..500); search contains over userName/action/entity/entityId/details; orderBy createdAt desc.
12. `search/route.ts` — GET ?q= (min 2 chars, else all-empty groups): leads(≤5, by leadNumber/customer name/phone), customers(≤5, name/phone, scope via leads.some), quotations(≤5, number/customer name, scope createdById), admins(≤5, SA only), materials(≤5, name/sku/brand, SA only).
13. `upload/route.ts` — POST (any authed) {image: dataURL}; regex-validates data:image/(jpeg|jpg|png|webp);base64; decoded ≤2MB; writes public/uploads/<timestamp>-<rand12hex>.<ext> via fs/promises mkdir recursive; returns {url:'/uploads/<filename>'}. 400 on bad type/empty/oversize.

## Tech decisions
- Next.js 16 async params: `{ params }: { params: Promise<{ id: string }> }` + `await params` in all dynamic routes.
- All handlers wrapped in try/catch → jsonError(e); auth via requireUser/requireSuperAdmin; audit() first arg is the user. ApiError for 400/404/409.
- SQLite contains = case-insensitive (LIKE), no `mode:'insensitive'` used.
- Money sums computed in JS from fetched rows (dataset small); round2 from lib/calc.
- POST /api/materials implemented (worklog contract) — required so admin POST returns 403.

## Test results (dev server :3000, login via /api/auth/login — 2-a landed concurrently)
- SA login 200 (jar2), rajesh ADMIN login 200 (jar3).
- Materials: SA list 200 w/ category; status=ALL shows INACTIVE; admin with status=ALL still ACTIVE-only ✅; search/category(name & id) filters ✅; admin POST → 403 ✅; PATCH price 450→475 audited MATERIAL_PRICE_UPDATE, reverted; status INACTIVE→audited, reverted; inactive hidden from admin ✅.
- Categories: GET w/ materialCount; POST 201 (sortOrder 8); dup → 409 ✅.
- Packages: GET 3 seeded; PATCH Basic 2500→2600 audited `Basic rate ₹2500 → ₹2600`, reverted; admin PATCH → 403; bad status → 400 ✅.
- Settings: GET 18 keys; SA PUT 200; admin PUT → 403 ✅.
- Dashboard: SA totals + activeAdmins:2; admin scoped (3 leads/1 quote) & activeAdmins key omitted; monthly labels Apr–Sep 2026; recentQuotes include versionNumber ✅.
- Orders: SA total 1 (BEN01004 PAYMENT_RECEIVED ABS-Q-000245, flags correct); admin 0; search by customer 'priya' & quotation '245' hit ✅.
- Reports: all 5 groups correct vs seeded data (revenueByMonth 2026-08 260306.82; adviserPerformance filtered to activity) ✅.
- Audit-logs: SA 200 + search; admin → 403 ✅.
- Search: q=pri SA → leads/customers/quotations/admins hit, materials empty(no match); admin groups role-scoped; q<2 → empty groups ✅.
- Upload: 200 saved+served (image/png), gif → 400, unauth → 401; test files cleaned up.
- `bun run lint`: 0 errors (2 pre-existing warnings in layout.tsx/client.ts, not mine). `tsc --noEmit`: clean for my files.
- Data left clean: all mutated master rows reverted; only intentional audit-log entries + 'Accessories' category remain.
