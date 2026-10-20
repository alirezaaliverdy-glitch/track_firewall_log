FROM node:22-alpine AS taoshi-fetch
COPY native/taoshi/fetch-sdk.mjs /fetch-sdk.mjs
RUN node /fetch-sdk.mjs
FROM debian:12-slim AS taoshi-build
RUN apt-get update && apt-get install -y --no-install-recommends g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=taoshi-fetch /sdk /sdk
COPY native/taoshi/replay.cpp /replay.cpp
RUN g++ -w -DLINUX -DLINUX64 -I/sdk -O2 /replay.cpp -Wl,--start-group /sdk/libNetSDK.a /sdk/libBasic.a /sdk/libTPLayer.a /sdk/libStreamParaser.a -Wl,--end-group -pthread -ldl -static -o /taoshi-replay
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY prisma ./prisma
RUN pnpm prisma:generate
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY docker-install-tools.sh /usr/local/bin/firewall-install-tools
RUN sed -i 's/\r$//' /usr/local/bin/firewall-install-tools \
  && sh /usr/local/bin/firewall-install-tools \
  && corepack enable
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY assets ./assets
COPY docker-entrypoint.sh /usr/local/bin/firewall-entrypoint
COPY --from=build /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma /tmp/generated-prisma-client
RUN set -eu; client_dir="$(dirname "$(readlink -f node_modules/@prisma/client)")"; cp -a /tmp/generated-prisma-client "$client_dir/../.prisma"; rm -rf /tmp/generated-prisma-client
COPY --from=build /app/dist ./dist
COPY --from=taoshi-build /taoshi-replay /usr/local/bin/taoshi-replay
RUN mkdir -p src/config && cp dist/config/database-url.js src/config/database-url.js
RUN sed -i 's/\r$//' /usr/local/bin/firewall-entrypoint \
  && chmod 0755 /usr/local/bin/firewall-entrypoint \
  && mkdir -p /app/storage/uploads /app/storage/bootstrap /app/storage/telemetry /app/storage/settings \
  && chown -R node:node /app/storage
USER node
EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/firewall-entrypoint"]
