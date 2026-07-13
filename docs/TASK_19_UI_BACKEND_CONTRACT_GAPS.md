# Task 19A UI / Backend Contract Gaps

Date: 2026-07-13

## Contract gaps and disposition

| ID | UI claim or behavior | Backend/API reality | Risk | 19A disposition |
| --- | --- | --- | --- | --- |
| C-01 | Frontend route metadata independently decided what was implemented and navigable | No shared runtime product-state source existed | UI could promise unsupported capability | Fixed: backend Product State Contract owns feature and navigation state. |
| C-02 | Settings appeared in primary navigation | No functional Settings API; page is planned-only | False implemented claim | Fixed: `planned`, not navigation-visible. |
| C-03 | Cisco was a first-class sidebar child | Read-only foundation exists; live inventory is unverified and mutations are deferred | Vendor readiness overstated | Fixed: `partial`/`unverified`, contextual access only. |
| C-04 | NetBox and Wazuh appeared as primary integration children | Only explicit mock adapters exist; production apply disabled | Mock mistaken for configured integration | Fixed: `not_configured`, mock, non-executable, hidden from primary navigation. |
| C-05 | Asset sync appeared as an ordinary destination | Workflow is an explicit mock preview | Preview could be mistaken for production sync | Fixed: `partial`, contextual access only. |
| C-06 | Pending and history appeared as distinct Action destinations | Both routes reuse the unfiltered Action Center | Navigation labels promise missing filters | Fixed: alias routes hidden pending distinct contracts. |
| C-07 | Monitoring devices/daily-check appeared as distinct destinations | Monitoring overview is reused; Daily Check has mixed vendor support | Independent feature maturity overstated | Fixed: partial alias routes hidden. |
| C-08 | Route visibility had no executable invariant | A planned or API-incomplete item could be promoted by a boolean edit | Regression-prone navigation | Fixed: validator rejects forbidden states and any backend/API/UI/test mismatch. |
| C-09 | Frontend and backend feature identities could drift | No stable cross-layer feature key check | Contract changes could silently orphan a route | Fixed: every app route uses `featureKey`; test asserts exact backend/frontend alignment. |
| C-10 | Integration status lacked one explicit configured/executable declaration | Mock handlers existed, but navigation state was separate | Ambiguous runtime capability | Fixed: contract reports `mode=mock`, `configured=false`, `executable=false`. |

## Deferred contract gaps

| ID | Gap | Reason for deferral |
| --- | --- | --- |
| D-01 | Full Cisco read/write capability and live verification | Milestone 19C; device mutation is outside 19A. |
| D-02 | Detection detail, lifecycle, enable/disable, and test flow | Milestone 19D; detection rewrite is prohibited in 19A. |
| D-03 | Finding normalization, deduplication, evidence, and lifecycle convergence | Milestone 19E; finding rewrite is prohibited in 19A. |
| D-04 | Functional Settings Center | Milestone 19F; settings rewrite is prohibited in 19A. |
| D-05 | Production NetBox/Wazuh configuration, health, and execution | Milestone 19H; integration expansion is prohibited in 19A. |
| D-06 | Persian/English content completeness inside every legacy page | Later UX/i18n work; 19A verifies shell direction, navigation labels, routing, and runtime health without rewriting feature content. |
| D-07 | Persisted Linux observability refresh | Requires safe migration recovery; no migration mutation is authorized in 19A. |

## Regression coverage

`backend/test/task19-product-state.test.ts` verifies:

1. planned state cannot be made navigation-visible;
2. a navigable feature cannot lose backend/API/UI/test readiness;
3. mock-only, unverified, alias, and planned routes stay out of generated navigation;
4. frontend `featureKey` values and backend feature records remain aligned; and
5. all Product State API projections match the full contract, including non-executable mock integrations.
