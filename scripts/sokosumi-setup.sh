#!/usr/bin/env bash
# Guided Sokosumi coworker setup for Argus on Cardano preprod.
#
# Each phase inspects current state before writing; nothing is guessed or
# duplicated. Run it top to bottom — it stops wherever input or an approval
# is needed. Requires: sokosumi CLI v1.0.4+, and `sokosumi --preprod auth login`
# already done (browser OAuth, human step).
#
#   bash scripts/sokosumi-setup.sh
#
# Re-running is safe: every phase re-reads state and skips what's done.
# Verified against the CLI's bundled `sokosumi` skill (sokosumi skills path).

set -euo pipefail
S="sokosumi --preprod"
J="--json"

say()  { printf '\n=== %s ===\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die()  { printf '\n!! %s\n' "$*" >&2; exit 1; }

say "0 · auth"
$S auth whoami $J || die "Run: sokosumi --preprod auth login (browser OAuth), then re-run this."
note "authenticated"

say "0.5 · discovery"
note "$($S workspaces list --personal $J 2>/dev/null || echo 'no personal workspace yet')"
note "$($S coworkers list --scope owned $J 2>/dev/null || echo '{}')"
echo "  Vendor creation requires an organization Workspace. Join the hackathon"
echo "  workspace in the browser first if you haven't:"
echo "    https://preprod.sokosumi.com/join/9Ycw8wzmzXB2WEKa-umzUJX6_GEFiVdu"

say "1 · vendor"
note "$($S vendors me $J 2>/dev/null || echo '{}')"
echo "  If no vendor exists yet:"
echo "    $S vendors create --name Argus --slug argus $J"
echo "  (if slug 'argus' is taken: argus-intel or argus402)"
echo "  Re-run vendors me --json and export the id:"
echo "    export VENDOR_ID=<vendor id>"
[ "${VENDOR_ID:-}" ] || die "Set VENDOR_ID and re-run."

say "2 · coworker (private, capability: tasks)"
echo "    $S coworkers register --vendor-id $VENDOR_ID --name \"Argus\" \\"
echo "        --capability tasks --personal --create-api-key $J"
echo "  (register is the developer path; --create-api-key mints the runtime"
echo "   key inline. Repeat 'connect' after approval, never 'register'.)"
echo "  Then:"
echo "    export COWORKER_ID=<coworker id>"
[ "${COWORKER_ID:-}" ] || die "Set COWORKER_ID and re-run."

say "3 · personal-workspace grant"
echo "  register --personal requests access; confirm it landed:"
echo "    $S coworkers connect $COWORKER_ID --personal --vendor-id $VENDOR_ID $J"
echo "  GRANTED means live in your personal workspace — enough to test now,"
echo "  no organizer needed. (Buy personal credits in Sokosumi Web if a paid"
echo "  task needs them; Stripe test card 4242 4242 4242 4242.)"

say "4 · runtime key → OS vault (skip if register --create-api-key was used)"
echo "    $S coworkers api-key $COWORKER_ID $J | \\"
echo "    $S runtime key-import --coworker-id $COWORKER_ID --api-key-stdin"
echo "  Pipe directly; the key must never land in .env, source, or a task."

say "5 · personal smoke test (do this FIRST — no approval needed)"
cat <<EOF
  Add to .env:
    COWORKER_ID=$COWORKER_ID
  Then: npm run coworker
  In another shell:
    $S tasks create --personal \\
        --coworker-id $COWORKER_ID \\
        --description "What is the BTC whale flow over the last 3 blocks?" \\
        --status READY $J
  Then:
    $S runtime receipt TASK_ID --coworker-id $COWORKER_ID --personal $J
  settled=true + txHash = Masumi settlement proof on-chain.
EOF

say "6 · connect to the TOKEN2049 hackathon workspace"
$S workspaces list $J || true
echo "  Pick the organization id (ORG_ID) + slug, then:"
echo "    $S coworkers connect $COWORKER_ID --vendor-id $VENDOR_ID --workspace-id ORG_ID $J"
echo "  PENDING is expected — a workspace owner/admin must approve."
echo "  Ask organizers: 'Coworker: Argus ($COWORKER_ID), Vendor: Argus"
echo "  ($VENDOR_ID), Access request: <id> — could you approve?'"
echo "  Re-run connect after approval; GRANTED means live."
echo "    $S workspaces check ORG_ID $J   # seat eligibility before org tasks"
echo "  Then: export ORG_ID=<org id> ORG_SLUG=<slug>"
echo "  and add COWORKER_ORG_ID / COWORKER_ORG_SLUG to .env for org tasks."

say "done"
