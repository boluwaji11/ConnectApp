#!/usr/bin/env bash
#
# HRT-397. Put development's Stripe keys in the two places that read them.
#
# The keys come from a sandbox inside the ConnectApp Stripe account, because
# Connect's platform settings belong to the account and a sandbox anywhere else
# cannot create a connected account the way production does. See
# docs/environments.md.
#
#   scripts/set-dev-stripe.sh sk_test_... pk_test_...
#
set -euo pipefail

secret="${1:-}"
publishable="${2:-}"

if [ -z "$secret" ] || [ -z "$publishable" ]; then
  echo "Usage: scripts/set-dev-stripe.sh <secret key> <publishable key>" >&2
  exit 1
fi

# A live key here would put real charges behind a development screen, which is
# the whole thing these two environments exist to prevent.
case "$secret" in
  *_test_*) ;;
  *) echo "That is not a test key. Development takes sk_test_ or rk_test_ only." >&2; exit 1 ;;
esac
case "$publishable" in
  pk_test_*) ;;
  *) echo "That is not a test publishable key. Development takes pk_test_ only." >&2; exit 1 ;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
file="$root/.env.local"

set_in_file() {
  name="$1"; value="$2"
  # Written with awk rather than sed, because a Stripe key contains characters
  # sed would read as part of its own expression.
  awk -v n="$name" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ "^" n "=" { print n "=" v; done = 1; next }
    { print }
    END { if (!done) print n "=" v }
  ' "$file" > "$file.new"
  mv "$file.new" "$file"
  chmod 600 "$file"
}

set_in_file STRIPE_SECRET_KEY "$secret"
set_in_file NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY "$publishable"
echo "Written into .env.local."

cd "$root"
printf '%s' "$secret" | vercel env add STRIPE_SECRET_KEY preview --force >/dev/null
printf '%s' "$publishable" | vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY preview --force >/dev/null
echo "Set on Vercel Preview. Production was not touched."
echo
echo "Next: node scripts/set-dev-stripe-webhooks.mjs, which makes the two webhook"
echo "destinations and writes their signing secrets. Without them a gift given on"
echo "development reaches Stripe and is never recorded."
