#!/usr/bin/env sh
set -eu

old_web_image=${1:?Previous web image ID is required}
old_api_image=${2:?Previous API image ID is required}
new_web_image=${3:?Current web image ID is required}
new_api_image=${4:?Current API image ID is required}

for image_id in "$old_web_image" "$old_api_image" "$new_web_image" "$new_api_image"; do
  case "$image_id" in
    sha256:*) ;;
    *) echo "Invalid Docker image ID: $image_id" >&2; exit 2 ;;
  esac
  digest=${image_id#sha256:}
  case "$digest" in
    *[!0-9a-f]*|'') echo "Invalid Docker image digest" >&2; exit 2 ;;
  esac
  [ "${#digest}" -eq 64 ] || { echo "Invalid Docker image digest length" >&2; exit 2; }
done

removed_image=
for image_id in "$old_web_image" "$old_api_image"; do
  [ "$image_id" != "$new_web_image" ] || continue
  [ "$image_id" != "$new_api_image" ] || continue
  [ "$image_id" != "$removed_image" ] || continue
  if docker image inspect "$image_id" >/dev/null 2>&1; then
    # Docker refuses to remove an image still used by another container.
    # Never force removal: a shared image must remain available.
    docker image rm "$image_id"
    echo "Removed previous application image $image_id"
  fi
  removed_image=$image_id
done

# Remove unused images from earlier interrupted builds as well. This positive
# label matches only images built for this application's API/web services;
# Docker's image prune preserves any image referenced by a container.
docker image prune --all --force \
  --filter label=io.github.alirezaaliverdy-glitch.track-firewall-log.cleanup-scope=production-app

# Keep useful recent layers, but bound the reclaimable build cache. This does
# not remove running containers, named volumes, or unrelated Docker images.
docker buildx prune --force --max-used-space 2gb
