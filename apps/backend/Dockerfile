FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
RUN mkdir -p uploads logs
EXPOSE 3001
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
