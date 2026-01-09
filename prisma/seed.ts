import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  // Hogar y Servicios Básicos
  { name: 'Hogar', icon: '🏠' },
  { name: 'Casa', icon: '🏠' },
  { name: 'Arriendo', icon: '🔑' },
  { name: 'Luz', icon: '💡' },
  { name: 'Agua', icon: '🚰' },
  { name: 'Internet', icon: '🌐' },
  { name: 'Celular', icon: '📱' },
  { name: 'Gas', icon: '🔥' },

  // Alimentación
  { name: 'Supermercado', icon: '🛒' },
  { name: 'Comidas fuera', icon: '🍽️' },
  { name: 'Restaurante', icon: '🍝' },
  { name: 'Café', icon: '☕' },
  { name: 'Bebidas', icon: '🥤' },
  { name: 'Gustitos', icon: '🍦' },

  // Transporte
  { name: 'Transporte', icon: '🚗' },
  { name: 'Auto', icon: '🚘' },
  { name: 'Bencina', icon: '⛽' },
  { name: 'Uber', icon: '🚕' },
  { name: 'Micro', icon: '🚌' },
  { name: 'Metro', icon: '🚇' },
  { name: 'Peaje', icon: '🚧' },

  // Salud y Cuidado Personal
  { name: 'Salud', icon: '⚕️' },
  { name: 'Farmacia', icon: '💊' },
  { name: 'Doctor', icon: '👨‍⚕️' },
  { name: 'Gimnasio', icon: '💪' },
  { name: 'Deportes', icon: '🏋️' },
  { name: 'Peluquería', icon: '💇' },

  // Entretenimiento y Suscripciones
  { name: 'Entretenimiento', icon: '🎬' },
  { name: 'Cine', icon: '🍿' },
  { name: 'Juegos', icon: '🎮' },
  { name: 'Suscripciones', icon: '📺' },
  { name: 'Spotify', icon: '🎵' },
  { name: 'Netflix', icon: '📺' },

  // Compras y Regalos
  { name: 'Compras', icon: '🛍️' },
  { name: 'Ropa', icon: '👕' },
  { name: 'Tecnología', icon: '💻' },
  { name: 'Regalos', icon: '🎁' },
  { name: 'Mascotas', icon: '🐾' },

  // Familia y Educación
  { name: 'Familia', icon: '👨‍👩‍👧‍👦' },
  { name: 'Hijos', icon: '🧸' },
  { name: 'Educación', icon: '📚' },
  { name: 'Colegio', icon: '🏫' },
  { name: 'Jardín', icon: '🎈' },

  // Financiero
  { name: 'Deudas', icon: '💸' },
  { name: 'Crédito', icon: '💳' },
  { name: 'Inversión', icon: '📈' },
  { name: 'Ahorro', icon: '💰' },
  { name: 'Seguro', icon: '🛡️' },

  // Otros
  { name: 'Otros', icon: '📦' },
  { name: 'Varios', icon: '🔖' },
];

async function main() {
  console.log('Start seeding categories...');

  for (const cat of categories) {
    const category = await prisma.category.upsert({
      where: { name: cat.name },
      update: { icon: cat.icon },
      create: {
        name: cat.name,
        icon: cat.icon,
      },
    });
    console.log(`Created/Updated category: ${category.name} ${category.icon}`);
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
