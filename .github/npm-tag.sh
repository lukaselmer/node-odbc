#!/bin/sh
# The dist-tag for a version, so a prerelease never becomes `latest`.
# Matches anywhere in the prerelease identifier, so `-rustalpha.1` counts as alpha.

case "$1" in
  *-*rc*) echo tag=rc ;;
  *-*beta*) echo tag=beta ;;
  *-*alpha*) echo tag=alpha ;;
  *-*) echo tag=next ;;
  *) echo tag=latest ;;
esac
