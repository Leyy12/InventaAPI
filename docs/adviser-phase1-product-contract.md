# Adviser Phase 1 product compatibility contract

This phase adds a read-only compatibility boundary. It does not migrate or
rewrite Firestore documents, and it does not change importer, API-key,
subscription, payment, quota, or deployment behavior.

## Product shapes found

The client repository currently reads or produces two principal product shapes.

1. Current Admin/importer shape
   - `name`, `brand`, `segment`, `category`, `description`
   - `status` (`Active` or `Archived`) and `is_active` (`true` or `false`)
   - `variants[]` containing segment-specific fields such as `flavor`, `size`,
     `dosage`, `form`, `specs`, or `dimensions`, plus `price`, `sku`, and
     `expirationDate`
   - optional `image_url`, `metadata`, and `tags`
2. Legacy seed/root-field shape
   - `name`/`product`, `barcode`/`sku`, `businessType`/`segment`, `category`
   - root `price`, `size`, `capacity`, `expirationDate`, and `image`/`image_url`
   - optional `attributes` for brand or other legacy values
   - `variations[]` option groups rather than priced `variants[]`
   - usually `status: "Active"`, with `is_active` sometimes absent

The compatibility layer also recognizes common stored aliases already present
in source code, but it does not infer unsupported business segments.

## Canonical projection

`services/product-contract.js` projects either shape without changing the source
document. The projection provides normalized display fields, a canonical
Grocery/Pharmacy/Hardware segment, a category comparison key, current variants,
legacy variations, root-field fallbacks, publication evidence, and deterministic
identity keys.

Legacy root price/SKU/size values become a single compatibility variant only
when no current `variants[]` exist. Legacy `variations[]` remain separately
preserved because converting option groups into priced variants would invent
data.

Unknown segment values normalize to `null`; they are not silently assigned to a
known segment. Category display text is whitespace-normalized but otherwise
preserved.

## Identity

Meaningful normalized SKUs/barcodes are preferred. Every meaningful variant SKU
is exposed as an identity key so later duplicate work can detect an overlapping
variant identifier. Placeholder values such as `N/A`, `none`, or `unknown` are
not treated as SKUs.

When no meaningful SKU exists, the fallback identity includes normalized:

- segment
- category
- brand
- name
- size and capacity
- stable variant descriptors
- legacy variation descriptors

Price is intentionally excluded because a normal price update must not change a
product's identity.

## Publication visibility

Visibility is fail-closed:

- an explicit archive flag or negative status always hides the product;
- an explicit `false` publication/active flag always hides the product;
- malformed or unknown publication fields hide the product;
- a recognized positive status or explicit `true` publication/active flag is
  required;
- a public projection must also have a name, category, and recognized segment;
- documents with no recognized publication signal are hidden.

This precedence makes conflicting legacy/current combinations deterministic.
For example, `status: "Active"` with `is_active: false` is hidden, as is
`status: "Archived"` with `is_active: true`.

## DaaS behavior

The API-key document continues to authorize product document IDs. Current keys
store those IDs in `linkedProductIds` and `linkedVariantSelections`. Historical
keys may also contain `linkedProducts` entries shaped as `{ id, name, sku,
segment }`; for compatibility, only a valid stored `id` from such an entry may
contribute authorization. Missing or malformed IDs grant no access, and IDs are
never inferred from names, SKUs, categories, segments, prices, or array order.

The catalog resolver ignores every embedded product field other than that
stable legacy ID and loads the current document on every request, then applies
the compatibility and publication contracts. Therefore an existing key sees a
current eligible update without replacement, while the same key stops receiving
a product after it becomes inactive, archived, unpublished, or ambiguous.

## Test boundary

Run:

```text
npm run test:adviser:phase1
```

The command uses a fixed pure-unit-test manifest. Before starting Node's test
runner it recursively inspects that manifest's local import graph and rejects
Firebase SDK/bootstrap, PayMongo, network, or external-package dependencies.
Firebase/PayMongo configuration variables are removed from the child process and
Firebase emulator hosts are pinned to non-production localhost endpoints as
defense in depth. Phase 1 tests
do not require or start an emulator.
