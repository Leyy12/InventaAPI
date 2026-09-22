# R7C — frozen catalog exporter (local implementation only)

Base: `33682a0cd0cb8fd3202fb12e4560b8266931d880`.
Production baseline: `ac3908401fac5732192ac364600c7f397a3a6af6`.

No production invocation, export, audit, backfill, freeze or unfreeze occurred in
R7C. The final production command remains UNAUTHORIZED until a later reviewed gate.
This exporter does not establish a freeze. Follow R7B first: reconcile actually
deployed rules, block browser writes, drain privileged writers, establish the
external freeze, then set/read back the control flag. The flag does not stop old
writers or all new request/preview writes. No temporary rules are created here.

## Explicit invocation and credentials

`scripts/export-frozen-catalog.mjs` requires all six options, without defaults:

| Option | Contract |
|---|---|
| `--project` | Explicit project ID; eventual authorized target is `inventaapi-db` |
| `--confirm-project` | Exact repeated project ID |
| `--database` | Explicit `(default)`; other databases intentionally unsupported in v1 |
| `--confirm-database` | Exact repeated database ID |
| `--credentials` | Absolute path to operator-controlled service-account JSON outside Git |
| `--output` | Absolute, new `.json` filename in an existing, access-restricted directory |

No executable production command is supplied. Unknown/duplicate switches fail.
No overwrite/cap-increase flag exists. Do not copy credentials into this repository.
Prefer an existing read-only IAM identity with document get/list and aggregation
permissions. OAuth datastore scope does not enforce read-only IAM by itself.
Broader operator privileges do not enable mutation APIs in this exporter.

Existing `database/firebase.js` can select environment credentials or a local-file
fallback. This exporter deliberately does not import it, load `.env`, consult CLI
aliases, use ADC, or infer a target. Service-account `project_id` and project-scoped
email must match. Only validated email/key enter an explicit JWT client; credential
JSON token URI/universe/other endpoint fields are ignored. Missing inspectable
project metadata fails. Keys/tokens and raw SDK/network/filesystem errors are not
printed. No credential material enters output or evidence.

The adapter has only control/count/page capabilities. Fixed Firestore origin;
no SDK write, batch, transaction write, rules/index/IAM operation. The sole POST
is a read-only count aggregation. Redirects fail; requests have a 30-second timeout
and responses a 32 MiB bound. Oversized responses abort, not truncate. No alternate
host is selectable. Implementation references:
[listDocuments](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/listDocuments),
[runAggregationQuery](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/runAggregationQuery).

## Freeze and complete reads

1. Validate explicit options/adapter target and unused artifact/evidence filenames.
2. Read exactly `catalog_control/writer`; require boolean `frozen === true` and
   updateTime. Missing, unreadable, false and string values fail closed.
3. Independently count and scan `products` and `product_submission_identity`.
4. Repeat both ordered scans and counts. Compare every ID, updateTime and decoded
   content hash. Any detected membership/count/version/content change aborts.
5. Read control again: require boolean true and unchanged updateTime, detecting
   control changes even if the flag has returned to true.
6. Publish files only after these gates and serialization pass.

Document-name ascending order; at most 500 documents/page; follow every continuation
token, including short pages. Reject duplicates, out-of-order IDs, repeated tokens,
empty continuation pages, missing metadata, wrong targets and count disagreement.
An early terminal page is not proof of completeness: independent counts must agree.

This is option B: observed two-pass stability UNDER AN EXTERNAL FREEZE, not a
point-in-time snapshot or proof of disabled privileged writers. A writer can act
after the final read; transient create/delete entirely between observations may
evade comparisons. Continue holding the verified freeze through later release gates.

No visibility/status filtering: include active, inactive, archived, unpublished
and all other retained products. An initial count above 5,000 OR a streamed 5,001st
product fails `PRODUCT CAP EXCEEDED`; no successful partial artifact. Identities
have no 400-record export cap: include every bound/retired/deleted/malformed record.
Zero identities is valid and explicitly counted. The 400 limit belongs only to
later R3 atomic BACKFILL. Never substitute `catalog_reservations` as the source.

## R3 compatibility and Firestore conversion

Main schema: `{products:[{id,data}], reservations:[{id,data}]}`, consumed directly
by the unchanged R3 CLI. IDs come from document names, never embedded id/_id fields.
R3 reads identity aliases, variant/legacy variation structures, category/segment/
brand/name, prices and reservation identity/productId/state. No normalization,
projection, repair or filtering occurs here. Export success is not audit success.

- JSON strings, booleans, null, arrays/maps retain semantics. Map keys are sorted;
  array order is retained. Safe integers and finite doubles remain numbers.
- Unsafe integers, negative zero, nonfinite values and unknown types fail rather
  than being rounded, coerced or dropped.
- Only top-level createdAt/updatedAt/created_at/updated_at/reviewedAt timestamps,
  which the R3 audit does not consume, use the defined representation
  `{$firestoreType:"timestamp",value:"<original UTC RFC3339>"}`. Fractional precision
  is retained. Timestamps elsewhere fail, protecting audit/legacy identity semantics.
- GeoPoints, references and bytes are explicitly rejected everywhere. New type
  support requires review; unsupported nested values are never silently omitted.
- Credential-like field names/recognizable private-key/token/PayMongo secret values
  abort instead of being redacted. This screening is defense-in-depth, not a claim
  to recognize arbitrary unknown secrets. Only catalog collections enter output;
  arbitrary environment/configuration and the full control document never do.

## Output finalization and evidence

Use an access-restricted local directory on a filesystem supporting hard links
(e.g. NTFS). Apply Windows ACLs as appropriate; POSIX modes do not establish them.
Exclusive-create mode-0600 files are written/flushed in a uniquely owned sibling
temporary directory. Complete evidence is published first and the complete catalog
last via atomic no-replace hard links. Unlike rename, this refuses a concurrently
created destination. Existing artifact OR evidence refuses the run. No overwrite.

Failures before catalog publication leave no new final catalog; owned evidence
and temporary output are cleaned where practical, never replacing existing files.
A crash can leave temporary files or orphan evidence; evidence alone is NOT success.
The pair is not claimed to be a two-file atomic commit. Investigate existing paths;
do not blindly delete them. Verify the sidecar hash before using a final catalog.

`<output>.evidence.json` records project/database, UTC start/completion, both counts,
frozen pre/post booleans/updateTimes, stability result, exporter version `r7c-v1`,
artifact basename and SHA-256 of exact catalog bytes. No credentials, credential
path, tokens or env dump. Hashes prove integrity, not provenance/signatures.
Completion timestamp marks verified reading/serialization, just before publication.

## Local validation

`npm run test:adviser:r7c` uses Node 22, sanitized environment and an exact loader
allowlist blocking auth/SDK/network imports and global fetch. Emulator access is
also blocked. Synthetic adapters only; the unchanged R3 audit compatibility child
uses the same isolation. Behavioral REST tests check the exact endpoints and
count-only POST body, supplemented by a narrow static mutation-API assertion.
Run R3, R6B and R6C regressions before review. No production credentials or network
are required. No shared application behavior or dependency versions are changed.

Validated locally under Node 22.20.0:

| Suite | Passed | Failed | Skipped | Cancelled |
|---|---:|---:|---:|---:|
| R7C isolated exporter | 68 | 0 | 0 | 0 |
| R3 audit/catalog/import | 168 | 0 | 0 | 0 |
| R6B release | 49 | 0 | 0 | 0 |
| R6C payment mode | 51 | 0 | 0 | 0 |
| Total | 336 | 0 | 0 | 0 |

Boundary evidence: 5,000 accepted; 5,001 rejected both by count and streamed
detection; false/missing/string freeze rejected; pre/post freeze/control changes
rejected; zero identities accepted; 901 identities accepted (not limited to 400);
target/credential mismatch rejected; generated artifact accepted directly by the
unchanged R3 CLI. SDK/network imports and global fetch were proven blocked in tests.
