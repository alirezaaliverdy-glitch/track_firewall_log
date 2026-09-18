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
RUN corepack enable
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY docker-entrypoint.sh /usr/local/bin/firewall-entrypoint
COPY --from=build /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma /tmp/generated-prisma-client
RUN set -eu; client_dir="$(dirname "$(readlink -f node_modules/@prisma/client)")"; cp -a /tmp/generated-prisma-client "$client_dir/../.prisma"; rm -rf /tmp/generated-prisma-client
COPY --from=build /app/dist ./dist
RUN mkdir -p src/config && cp dist/config/database-url.js src/config/database-url.js
RUN sed -i 's/\r$//' /usr/local/bin/firewall-entrypoint \
  && chmod 0755 /usr/local/bin/firewall-entrypoint \
  && mkdir -p /app/storage/uploads /app/storage/bootstrap /app/storage/telemetry \
  && chown -R node:node /app/storage
USER node
EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/firewall-entrypoint"]
