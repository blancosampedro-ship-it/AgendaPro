// Script para verificar la configuración de Settings
// Usando sql.js que es puro JavaScript
const fs = require('fs');
const path = require('path');

// Usar el módulo nativo de sqlite de Node si está disponible
async function main() {
  const dbPath = path.join(__dirname, 'prisma', 'dev.db');
  console.log('Opening database:', dbPath);
  
  // Verificar que el archivo existe
  if (!fs.existsSync(dbPath)) {
    console.error('Database file not found!');
    return;
  }
  
  // Leer archivo como binario y buscar patrones
  const buffer = fs.readFileSync(dbPath);
  const content = buffer.toString('utf8', 0, Math.min(buffer.length, 100000));
  
  // Buscar si existe la palabra "avoidWeekends" en la DB
  if (content.includes('avoidWeekends')) {
    console.log('Column "avoidWeekends" exists in database schema');
  } else {
    console.log('WARNING: Column "avoidWeekends" NOT FOUND in database!');
  }
  
  console.log('\nTo check the actual value, please run the app and look for these log messages:');
  console.log('  - "Raw settings from DB:"');
  console.log('  - "Computed workday settings:"');
  console.log('  - "isWeekend check:"');
}

main().catch(console.error);
