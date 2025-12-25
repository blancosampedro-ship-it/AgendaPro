/**
 * Prisma Path Configuration
 * DEBE ejecutarse ANTES de cualquier import de Prisma
 * 
 * Este módulo configura las rutas de módulos para que Node.js
 * pueda encontrar .prisma/client en app.asar.unpacked
 */

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as Module from 'module';

/**
 * Configura las rutas de módulos para Prisma en producción
 * Debe llamarse antes de importar @prisma/client
 */
export function configurePrismaModulePaths(): void {
  if (!app.isPackaged) {
    return; // En desarrollo no hace falta
  }

  const resourcesPath = process.resourcesPath;
  const unpackedPath = path.join(resourcesPath, 'app.asar.unpacked');
  const unpackedNodeModules = path.join(unpackedPath, 'node_modules');

  // Verificar que existe
  if (!fs.existsSync(unpackedNodeModules)) {
    console.error('Unpacked node_modules not found:', unpackedNodeModules);
    return;
  }

  // Añadir el path de unpacked a los paths de búsqueda de módulos
  const originalResolveFilename = (Module as any)._resolveFilename;
  
  (Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
    // Interceptar requests de .prisma/client
    if (request === '.prisma/client/default' || request.startsWith('.prisma/client')) {
      const moduleName = request.replace('.prisma/client', '.prisma/client');
      const unpackedPath = path.join(unpackedNodeModules, moduleName);
      
      // Intentar resolver desde unpacked primero
      if (fs.existsSync(unpackedPath + '.js') || fs.existsSync(path.join(unpackedPath, 'index.js'))) {
        try {
          return originalResolveFilename.call(this, unpackedPath, parent, isMain, options);
        } catch (e) {
          // Si falla, continuar con la resolución normal
        }
      }
    }
    
    // Llamar al resolver original
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  // También configurar la variable de entorno del query engine
  const arm64EnginePath = path.join(
    unpackedNodeModules,
    '.prisma',
    'client',
    'libquery_engine-darwin-arm64.dylib.node'
  );
  
  const x64EnginePath = path.join(
    unpackedNodeModules,
    '.prisma',
    'client',
    'libquery_engine-darwin.dylib.node'
  );

  if (fs.existsSync(arm64EnginePath)) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = arm64EnginePath;
  } else if (fs.existsSync(x64EnginePath)) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = x64EnginePath;
  }

  console.log('Prisma module paths configured for production');
}
