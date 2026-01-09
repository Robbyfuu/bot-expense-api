FROM node:18-alpine

# Instalar dependencias del sistema necesarias para Prisma y Baileys (si aplica)
RUN apk add --no-cache openssl

WORKDIR /app

# Copiar archivos de dependencia
COPY package.json pnpm-lock.yaml ./

# Instalar pnpm y dependencias
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copiar el resto del código
COPY . .

# Generar cliente de Prisma
RUN npx prisma generate

# Crear directorio para autenticación de WhatsApp (Volumen)
RUN mkdir -p /app/auth_info_baileys

# Compilar la aplicación
RUN pnpm run build

# Exponer puerto (aunque Railway lo maneja por ENV PORT)
EXPOSE 3000

# Comando de inicio
CMD ["node", "dist/src/main"]
