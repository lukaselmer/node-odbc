#!/bin/sh
# The dist-tag for a version, so a prerelease never becomes `latest`.

case "$1" in
  *-rst*) echo tag=alpha ;;
  *-alpha*) echo tag=alpha ;;
  *-beta*) echo tag=beta ;;
  *-rc*) echo tag=rc ;;
  *) echo tag=latest ;;
esac
