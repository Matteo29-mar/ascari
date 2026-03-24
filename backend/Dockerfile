FROM node:20-bookworm-slim AS build
WORKDIR /app

# 🔑 FIX CRITICO: installa openssl
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build


FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# 🔑 FIX CRITICO ANCHE NEL RUNTIME
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 4002

CMD sh -c "npx prisma migrate deploy && npm run start"