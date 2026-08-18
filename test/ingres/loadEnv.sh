# Loads test/ingres/.env, which holds the values that must not be committed.

envFile="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env"

if [[ -f "$envFile" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$envFile"
  set +a
fi

function requireVariables() {
  local missing=()
  for name in "$@"; do
    [[ -n "${!name:-}" ]] || missing+=("$name")
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Missing: ${missing[*]}" >&2
    echo "Set them in test/ingres/.env, see test/ingres/.env.example." >&2
    exit 2
  fi
}
