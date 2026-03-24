FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY version.json ./

# Dossier de persistance pour la config
RUN mkdir -p /app/config-data

VOLUME ["/app/config-data"]

CMD ["node", "src/index.js"]
