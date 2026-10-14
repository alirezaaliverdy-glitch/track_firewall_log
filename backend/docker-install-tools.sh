#!/bin/sh
set -eu

# Keep TLS and Alpine package signatures enabled. The alternate mirror belongs
# to Alpine: https://wiki.alpinelinux.org/wiki/Template:Mirrors
install_tools() {
  apk --timeout 30 "$@" add --no-cache iputils nmap chromium fontconfig ffmpeg wireguard-tools iproute2 strongswan xl2tpd ppp iptables procps
}

for attempt in 1 2; do
  if install_tools; then exit 0; fi
  echo "Alpine primary repository fetch failed (attempt $attempt); retrying with verified repositories" >&2
  sleep 3
done

branch=$(cut -d. -f1,2 /etc/alpine-release)
case "$branch" in *[!0-9.]*|'') echo "Invalid Alpine release" >&2; exit 1 ;; esac
for attempt in 1 2; do
  if install_tools --repositories-file /dev/null \
    --repository "https://dl-4.alpinelinux.org/alpine/v$branch/main" \
    --repository "https://dl-4.alpinelinux.org/alpine/v$branch/community"; then exit 0; fi
  echo "Alpine alternate repository fetch failed (attempt $attempt)" >&2
  sleep 3
done
echo "Required runtime tools could not be installed; refusing an incomplete image" >&2
exit 1
