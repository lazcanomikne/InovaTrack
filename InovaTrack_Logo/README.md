# Arte del icono de InovaTrack

Master del icono. `inovatrack_icon.svg` es la fuente (fondo `#150E38`, anillo de
guiones morados y la caja en blanco); `inovatrack_icon_1024.png` es su
exportación a 1024, y de ahí salen todos los iconos de `public/`.

Las carpetas `iOS/` y `Android/` son para un envoltorio nativo (Xcode /
Android Studio). Hoy InovaTrack es una PWA y **no** las usa: los iconos que la
app sirve de verdad son los de `public/`.

## Cómo se derivan los iconos de `public/`

No basta con reescalar el master a cada tamaño: dos de ellos llevan tratamiento
aparte, y regenerarlos "a lo simple" rompe cómo se ven en el teléfono.

| Archivo | Tamaño | Tratamiento |
| --- | --- | --- |
| `public/favicon.png` | 64 | Reescalado tal cual (conserva alfa y esquinas redondeadas) |
| `public/icons/icon-192.png` | 192 | Igual — también es el logo del login |
| `public/icons/icon-512.png` | 512 | Igual |
| `public/apple-touch-icon.png` | 180 | Fondo a sangre, **sin alfa** |
| `public/icons/apple-touch-icon.png` | 180 | Igual (index.html apunta a esta) |
| `public/icons/icon-512-maskable.png` | 512 | Fondo a sangre, sin alfa, arte al **85%** |

Los dos casos especiales:

- **iOS (`apple-touch-icon`)** rellena de negro cualquier transparencia, así que
  el fondo `#150E38` tiene que llegar a la orilla y el PNG guardarse sin canal
  alfa. iOS le pone encima su propia máscara redondeada.
- **Maskable (Android)** se recorta con la máscara del sistema (círculo,
  cuadrado redondeado…). Sólo está garantizado lo que cae dentro del círculo
  central del 80%. El arte se reduce al 85% para que el anillo de guiones quepa
  holgado; a tamaño completo el anillo queda a ras del borde de esa zona segura.

Al reescalar siempre se parte del master de 1024 en un solo paso (LANCZOS), no
encadenando reducciones.
