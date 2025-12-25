# AgendaPro Resources

Este directorio contiene recursos estáticos para la aplicación:

## Iconos necesarios

- `icon.icns` - Icono de la app para macOS (512x512, 256x256, 128x128, 64x64, 32x32, 16x16)
- `icon.ico` - Icono de la app para Windows
- `tray.png` - Icono del menubar (22x22 @1x, 44x44 @2x para Retina)
- `tray-alert.png` - Icono del menubar con badge de alerta

## Crear iconos

Para crear el icono macOS desde un PNG:
```bash
# Necesitas tener iconutil instalado (viene con Xcode)
mkdir icon.iconset
sips -z 16 16     icon-1024.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon-1024.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon-1024.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon-1024.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon-1024.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon-1024.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon-1024.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon-1024.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon-1024.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon-1024.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
```

## Tray icon

El icono del tray debe ser "template image" en macOS:
- Usar solo negro (#000000) con transparencia
- macOS automáticamente lo adapta al modo oscuro/claro
