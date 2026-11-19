# SADEC — imagem única para o Railway: site + API Node-RED + Java (despacho) + Python (cálculos) + SQLite.
# Etapa 1: dependências Node (inclui módulo nativo do sqlite usado pelo Node-RED) e compilação Java.
FROM node:22-trixie AS build
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-21-jdk-headless && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY ChatBot/node-red/package.json ChatBot/node-red/package-lock.json ChatBot/node-red/
RUN cd ChatBot/node-red && npm ci --omit=dev
COPY Java/SADEC/src Java/SADEC/src
COPY Java/SADEC/test Java/SADEC/test
RUN javac --release 8 -encoding UTF-8 -Xlint:-options -d Java/SADEC/out $(find Java/SADEC/src Java/SADEC/test -name "*.java")

# Etapa 2: execução (Node 22 para node:sqlite, Python 3 e Java 21 runtime).
FROM node:22-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 openjdk-21-jre-headless && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/ChatBot/node-red/node_modules ChatBot/node-red/node_modules
COPY --from=build /app/Java/SADEC/out Java/SADEC/out
COPY . .
ENV NODE_ENV=production \
    SADEC_DATA_DIR=/data \
    SADEC_PYTHON=/usr/bin/python3 \
    SADEC_JAVA=java \
    SADEC_NODE_RED_PORT=1880 \
    PYTHONUTF8=1
EXPOSE 8080
CMD ["node", "scripts/producao.js"]
