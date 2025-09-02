# Usa imagem oficial do Node.js
FROM node:22

# Diretório de trabalho dentro do container
WORKDIR /app

# Copia package.json e instala dependências
COPY package*.json ./
RUN npm install --production

# Copia o restante do código
COPY . .

# Expor a porta definida (Railway ou local)
EXPOSE ${PORT}

# Iniciar o servidor
CMD ["npm", "start"]
