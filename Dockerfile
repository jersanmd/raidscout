# -- RaidScout Discord Bot ----------------------------------
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist/bot.cjs dist/bot.cjs
EXPOSE 3003
CMD ["node", "dist/bot.cjs"]
