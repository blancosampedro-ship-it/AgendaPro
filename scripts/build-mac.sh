#!/bin/bash
# Script para construir e instalar AgendaPro en macOS

set -e

echo "🔨 Construyendo AgendaPro para macOS..."

# Directorio del proyecto
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Cerrar instancias existentes
echo "📦 Cerrando instancias existentes..."
pkill -9 -f "AgendaPro" 2>/dev/null || true
sleep 1

# Limpiar builds anteriores
echo "🧹 Limpiando builds anteriores..."
rm -rf release/mac

# Construir
echo "⚙️ Compilando Electron..."
npm run build:electron

echo "📦 Empaquetando aplicación..."
npm run dist:mac

# Copiar .prisma (workaround para electron-builder)
echo "🔧 Configurando Prisma..."
mkdir -p "release/mac/AgendaPro.app/Contents/Resources/app/node_modules/.prisma"
cp -R "release/mac/AgendaPro.app/Contents/Resources/dot-prisma/client" \
      "release/mac/AgendaPro.app/Contents/Resources/app/node_modules/.prisma/"

# Instalar en /Applications
echo "📲 Instalando en /Applications..."
rm -rf /Applications/AgendaPro.app
cp -R "release/mac/AgendaPro.app" /Applications/

echo ""
echo "✅ AgendaPro instalada correctamente en /Applications"
echo ""
echo "Para abrir: open /Applications/AgendaPro.app"
echo ""
