#!/bin/sh
# Derives the npm dist-tag from the version, so that a prerelease never becomes
# the default install.

set -eu

version="$1"
prerelease="${version#*-}"

if [ "$prerelease" = "$version" ]; then
  echo tag=latest
  exit 0
fi

case "$prerelease" in
  *rc*) echo tag=rc ;;
  *beta*) echo tag=beta ;;
  *alpha*) echo tag=alpha ;;
  *) echo tag=next ;;
esac
