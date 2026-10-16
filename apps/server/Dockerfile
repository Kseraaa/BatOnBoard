# Game server image — build จาก root ของ repo:
#   docker build -f apps/server/Dockerfile .
# (fly.toml ที่ root ตั้งค่านี้ไว้แล้ว)

FROM node:24-alpine AS build
WORKDIR /repo
# ใช้ pnpm เวอร์ชันตาม packageManager ใน package.json
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@batonboard/server..."
RUN pnpm --filter @batonboard/server build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080
# bundle รวม dependency ไว้แล้ว ไม่ต้องมี node_modules
COPY --from=build /repo/apps/server/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/main.js"]
