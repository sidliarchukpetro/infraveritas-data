# InfraVeritas — attestation archive

Raw evidence behind the attestations recorded on Ethereum.

Every fifteen minutes a measuring device signs a statement about what it
measured, inside a secure element whose key cannot leave the chip. The
statement commits to the raw samples through a hash. This repository holds
those samples, so that the commitment can actually be checked by anyone.

Live register: **[verify.infraveritas.pro](https://verify.infraveritas.pro)**
Contracts, specification and tools: **[infraveritas-verify](https://github.com/sidliarchukpetro/infraveritas-verify)**

## Layout

```
bundles/<deviceCertHash>/<epochIndex>.json    one epoch: attestation, raw
                                              samples, signature, digest,
                                              validation snapshot
manifests/<deviceCertHash>/<YYYY-MM-DD>.json  one local day: every bundle with
                                              its hash, plus gaps in numbering
```

Days are local to the station, not UTC — a solar day split at UTC midnight is
two half-days of nothing useful.

## Check the archive

```bash
git clone https://github.com/sidliarchukpetro/infraveritas-data
cd infraveritas-data
npm install ethers
node verify-archive.mjs .
```

It confirms every listed file is present and unaltered, and that the raw
samples in each bundle hash to the root the device signed. Attestations also
carry a second signed root over extension records; that root is verified by the
relay on receipt, but its encoding is not published, so this tool does not claim
a check a reader could not repeat. It reports gaps in
epoch numbering rather than smoothing them over: an epoch index is consumed the
moment an epoch is created, so a gap means the device measured and could not
deliver, or was not running. Neither is repairable after the fact, and neither
is hidden here.

## Why this exists

A hash commits to data nobody can see is a promise, not evidence. Publishing
the preimage turns the commitment into something a counterparty can verify
against the chain without asking us for anything — and it gives the record a
second home, outside the operator's own machines.

## What is not here

Device firmware, the validation service and the internal architecture are not
published. Everything required to *verify* is public; everything required to
*produce* is not.

Licence: see the LICENSE in `infraveritas-verify`. Reproducing the verification
is expressly encouraged.
