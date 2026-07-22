FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
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
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/storage/uploads && chown -R node:node /app
USER node
EXPOSE 4000
CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm start"]
