#!/bin/sh
# Derives the npm dist-tag from the version, so that a prerelease never becomes
# the default install.
#
# The tag is the prerelease identifier itself, which keeps parallel prereleases
# such as goalpha and rustalpha from overwriting each other's tag.

set -eu

version="$1"
prerelease="${version#*-}"

if [ "$prerelease" = "$version" ]; then
  echo tag=latest
  exit 0
fi

identifier="${prerelease%%.*}"

case "$identifier" in
  *[!a-z]* | '') echo tag=next ;;
  *) echo "tag=$identifier" ;;
esac
