#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."
one=sha256:1111111111111111111111111111111111111111111111111111111111111111
two=sha256:2222222222222222222222222222222222222222222222222222222222222222
three=sha256:3333333333333333333333333333333333333333333333333333333333333333
four=sha256:4444444444444444444444444444444444444444444444444444444444444444

docker() {
  calls="${calls:-}|$*"
  if [ "${missing_image:-}" = "$*" ]; then
    return 1
  fi
  return 0
}

calls=
set -- "$one" "$two" "$three" "$four"
. scripts/deploy/prune-production-images.sh
case "$calls" in
  *"image rm $one"*"image rm $two"*"image prune --all --force --filter label=io.github.alirezaaliverdy-glitch.track-firewall-log.cleanup-scope=production-app"*"buildx prune --force --max-used-space 2gb"*) ;;
  *) echo "Expected only superseded application images and bounded cache to be removed" >&2; exit 1 ;;
esac

calls=
set -- "$one" "$two" "$one" "$four"
. scripts/deploy/prune-production-images.sh
case "$calls" in
  *"image rm $one"*) echo "Current web image must not be removed" >&2; exit 1 ;;
  *"image rm $two"*"buildx prune --force --max-used-space 2gb"*) ;;
  *) echo "Expected only superseded API image to be removed" >&2; exit 1 ;;
esac

calls=
set -- "$one" "$one" "$three" "$four"
. scripts/deploy/prune-production-images.sh
case "$calls" in
  *"image rm $one"*"image rm $one"*) echo "Duplicate old image must be removed only once" >&2; exit 1 ;;
  *"image rm $one"*"buildx prune --force --max-used-space 2gb"*) ;;
  *) echo "Expected shared old image to be removed once" >&2; exit 1 ;;
esac

calls=
missing_image="image inspect $one"
set -- "$one" "$two" "$three" "$four"
. scripts/deploy/prune-production-images.sh
case "$calls" in
  *"image rm $one"*) echo "Already-absent old image must be skipped" >&2; exit 1 ;;
  *"image rm $two"*"buildx prune --force --max-used-space 2gb"*) ;;
  *) echo "Cleanup did not continue after an old image was absent" >&2; exit 1 ;;
esac
unset missing_image

if (set -- invalid "$two" "$three" "$four"; . scripts/deploy/prune-production-images.sh) >/dev/null 2>&1; then
  echo "Malformed Docker image ID was accepted" >&2
  exit 1
fi

echo "Production image cleanup tests passed"
