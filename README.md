# PROYECTO: BOT DE GASTOS WHATSAPP (NESTJS + BAILEYS + OPENAI)

## 📌 Visión General

Este proyecto es un backend para una aplicación de "Control de Gastos en Pareja". El sistema actúa como un bot de WhatsApp que recibe fotos de boletas (recibos), las procesa con Inteligencia Artificial (**OpenAI GPT-4o**) para extraer datos estructurados, y los guarda en una base de datos PostgreSQL.

Cuenta con un flujo avanzado de **Confirmación Inteligente**, **Corrección en Lenguaje Natural** y **Normalización de Comercios** mediante RUT chileno.

## 🛠 Stack Tecnológico

- **Lenguaje/Framework**: TypeScript, NestJS.
- **Gestor de Paquetes**: `pnpm`.
- **Base de Datos**: PostgreSQL.
- **ORM**: Prisma (v5.x).
- **WhatsApp**: `@whiskeysockets/baileys` (Librería Socket).
- **IA/Vision**: `openai` (Modelo `gpt-4o`).
- **Infraestructura**: Docker (Alpine), Railway.

## 📂 Estructura del Proyecto

- `src/whatsapp/`: Servicio de conexión socket a WA y manejo de mensajes.
- `src/openai/`: Servicio de integración con OpenAI para visión y procesamiento de lenguaje.
- `src/expenses/`: Módulo API REST (`GET /expenses`) para consumo de datos.
- `prisma/schema.prisma`: Modelos `User`, `Expense`, `Merchant`.
- `auth_info_baileys/`: Persistencia de sesión (ignorado por git).

## 🚀 Guía de Inicio Rápido

### 1. Prerrequisitos

- Node.js (v22+)
- pnpm
- Docker y Docker Compose
- API Key de OpenAI

### 2. Configuración de Entorno

```bash
cp .env.example .env
```

Variables clave:

- `DATABASE_URL`: `postgresql://...`
- `OPENAI_API_KEY`: Tu llave de OpenAI.
- `ALLOWED_NUMBERS`: Array JSON con los números permitidos.

### 3. Ejecución

Levantar DB:

```bash
docker-compose up -d
pnpm prisma migrate dev
```

Iniciar Bot:

```bash
pnpm start:dev
```

## 📝 Flujo de Uso

1.  **Recepción**: Envía imagen de boleta.
2.  **Extracción IA**: GPT-4o extrae datos + RUT.
3.  **Borrador**: El bot guarda un gasto `PENDING` y pide confirmación.
4.  **Confirmación/Corrección**:
    - Si todo está bien: Responde **"SI"**.
    - Si hay errores: Escribe **"El monto es 5000"** o **"El vendedor es Lider"**.
    - **Selección**: Si corriges el vendedor y hay ambigüedad, el bot te dará a elegir (1, 2, 3...).
5.  **Guardado**: Al confirmar, el gasto pasa a `CONFIRMED` y se asocia al `Merchant` correcto.

## 📊 API REST

Consumo de gastos guardados:

- **Endpoint**: `GET /expenses`
- **Respuesta**: Array de objetos con datos de gasto, usuario y comercio.
