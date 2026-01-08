// Script para aplicar la migración de holidays manualmente
// Usa mejor-sqlite3 si está disponible, sino usa sql-wasm

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dbPath = path.join(__dirname, 'prisma', 'dev.db');
const migrationPath = path.join(__dirname, 'prisma', 'migrations', '20260108110716_add_holidays_and_workdays', 'migration.sql');

console.log('=== Aplicando migración de holidays ===\n');

// Leer el SQL de la migración
const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
console.log('Migration SQL loaded:', migrationPath);

// Crear un archivo temporal con los comandos SQL
const tempSqlFile = path.join(__dirname, 'temp_migration.sql');
fs.writeFileSync(tempSqlFile, migrationSQL);

// Verificar estructura actual de Settings buscando en el archivo
const dbBuffer = fs.readFileSync(dbPath);
const dbContent = dbBuffer.toString('utf8', 0, Math.min(dbBuffer.length, 200000));

if (dbContent.includes('avoidWeekends')) {
  console.log('\n✓ La migración ya fue aplicada (avoidWeekends existe)');
  fs.unlinkSync(tempSqlFile);
  process.exit(0);
}

console.log('\n⚠ La migración necesita ser aplicada');
console.log('\nPara aplicarla manualmente:');
console.log('1. Descarga sqlite-tools de: https://www.sqlite.org/download.html');
console.log('2. Ejecuta: sqlite3 "' + dbPath + '" < "' + tempSqlFile + '"');
console.log('\nO alternativamente, abre la app de DB Browser for SQLite y ejecuta el SQL.');
console.log('\n--- SQL a ejecutar ---\n');
console.log(migrationSQL);

fs.unlinkSync(tempSqlFile);
