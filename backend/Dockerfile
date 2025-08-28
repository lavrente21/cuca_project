# Usa imagem oficial do Node.js
FROM node:22

# Define diretório de trabalho dentro do container
WORKDIR /app

# Copia package.json e instala dependências
COPY package*.json ./
RUN npm install

# Copia o restante do código
COPY . .

# Expõe a porta do backend (vem do .env -> APP_PORT)
EXPOSE 5000

# Comando padrão para iniciar
CMD ["npm", "start"]
