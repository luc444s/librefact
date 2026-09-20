# AGENTS.md — android-g5

Cómo compilar, instalar y verificar el APK de SYSTUTOR para Android (armv7, 32-bit).

## Qué es esto

Un solo APK (`com.g5pg`) que corre el stack completo **sin root, sin Termux y sin VM**:

- **Chaquopy 17 + CPython 3.11** (armeabi-v7a) embebido.
- **systutor-core** (kernel + app de referencia) portado a 3.11.
- **PostgreSQL 18.2** embebido (runtime nativo del proyecto G4) en `127.0.0.1:54329`.
- **FastAPI + Uvicorn** sirviendo API y el SPA (frontend `apps/web`) en `127.0.0.1:8000`.
- **7 plugins** habilitados + base de **1259 productos**.
- UI en un **WebView** apuntando a `http://127.0.0.1:8000`.

No cambies el `applicationId`: **debe ser `com.g5pg`** (ver *Invariantes*).

## Prerequisitos (toolchain)

Rutas usadas por los scripts (Linux del build host):

| Herramienta | Ruta / versión |
|---|---|
| JDK 17 | `~/.android-toolchain/jdk-17.0.20.1+1` |
| Gradle 8.9 | `~/.android-toolchain/gradle-8.9` |
| Android SDK (platform-34, build-tools 34) | `~/.android-toolchain/android-sdk` |
| NDK r27d | `~/.android-toolchain/android-ndk-r27d` |
| Python 3.11 (Chaquopy `buildPython`) | `/home/linuxbrew/.linuxbrew/bin/python3.11` |
| Rust + target | `rustup target add armv7-linux-androideabi` |
| `ar`, `zstd`, `xz` | del sistema (los usa `build-pg-extensions.sh`) |

En el **dispositivo de pruebas** debe estar instalado el APK **`com.g4pg`** (G4): de ahí se extrae el runtime de PostgreSQL y el seed. Si no está, ejecutá el proyecto `postgres-android` primero.

## Artefactos generados (gitignored)

Los scripts producen estos archivos, que **no se commitean**:

```
app/src/main/jniLibs/armeabi-v7a/*.so     # postgres + libpq + libs  (fetch-g4-postgres.sh)
app/src/main/assets/pgsupport.zip           # seed PGDATA + share      (fetch-g4-postgres.sh)
app/src/main/assets/pgextensions.zip        # plpgsql, pg_trgm, ...    (build-pg-extensions.sh)
app/src/main/assets/webapp.zip              # SPA compilado            (build-webapp.sh)
app/src/main/assets/plugins.zip             # plugins portados a 3.11  (build-plugins-asset.sh)
app/src/main/assets/seed_productos.csv      # dataset Perú             (build-plugins-asset.sh)
app/src/main/python/systutor/, app/         # core portado             (sync-systutor-core.sh)
app/src/main/python/g5_products_importer.py # importador              (build-plugins-asset.sh)
```

Único artefacto **commiteado**: `app/wheels/pydantic_core-2.46.5-cp311-cp311-android_26_armeabi_v7a.whl`.

## Build rápido (artefactos ya presentes)

```sh
cd android-g5
export JAVA_HOME=~/.android-toolchain/jdk-17.0.20.1+1
export ANDROID_HOME=~/.android-toolchain/android-sdk
~/.android-toolchain/gradle-8.9/bin/gradle --no-daemon :app:assembleDebug
# salida: app/build/outputs/apk/debug/app-debug.apk  (~58 MB)
```

## Build desde cero (todos los pasos)

Ejecutá los scripts en este orden (son idempotentes). Todos se invocan **desde `android-g5/`**.

```sh
cd android-g5

# 1. core portado: copia vendor/systutor-core y aplica los parches de 3.11
scripts/sync-systutor-core.sh

# 2. runtime PostgreSQL + seed PGDATA (requiere com.g4pg instalado y adb)
ADB=~/.android-toolchain/android-sdk/platform-tools/adb scripts/fetch-g4-postgres.sh

# 3. extensiones PG (plpgsql, pg_trgm, ...) del mismo build Termux 18.2
scripts/build-pg-extensions.sh

# 4. frontend full (apps/web + plugins) -> webapp.zip
scripts/build-webapp.sh

# 5. plugins portados + seed de productos
scripts/build-plugins-asset.sh

# 6. (opcional) reconstruir el wheel de pydantic-core; ya está commiteado
# scripts/build-pydantic-core.sh

# 7. compilar el APK
export JAVA_HOME=~/.android-toolchain/jdk-17.0.20.1+1
export ANDROID_HOME=~/.android-toolchain/android-sdk
~/.android-toolchain/gradle-8.9/bin/gradle --no-daemon :app:assembleDebug
```

Si no existe `local.properties`, creálo con `sdk.dir=/home/<user>/.android-toolchain/android-sdk` o exportá `ANDROID_HOME`.

## Instalar y ejecutar

```sh
export ANDROID_HOME=~/.android-toolchain/android-sdk
ADB=$ANDROID_HOME/platform-tools/adb
$ADB install -r app/build/outputs/apk/debug/app-debug.apk
$ADB shell am start -n com.g5pg/com.systutor.g5.MainActivity
```

> La app buena es **`com.g5pg`**. Si existe la vieja `com.systutor.g5`, desinstalala:
> `$ADB uninstall com.systutor.g5`. Ambas tienen etiqueta "G5".

## Verificar que funciona

```sh
# logs del arranque (postgres, plugins, core, webview)
$ADB logcat -d -s G5:* | grep -v '\[pg\]'

# puertos escuchando: 54329 (postgres) y 8000 (uvicorn)  [hex D439 / 1F40]
$ADB shell "cat /proc/net/tcp" | grep -iE '1F40|D439'

# API end-to-end
$ADB forward tcp:18000 tcp:8000
TOKEN=$(curl -s -X POST http://127.0.0.1:18000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"ChangeMe123!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s http://127.0.0.1:18000/api/v1/system/plugin-runtime -H "Authorization: Bearer $TOKEN"
curl -s "http://127.0.0.1:18000/api/v1/plugins/productos/products?limit=1" -H "Authorization: Bearer $TOKEN"
```

Resultado esperado: 7 plugins `enabled`, `productos total=1259`, y el SPA visible en el WebView.

Arranque esperado en el moto e15: **~12 s en frío**, ~10 s de ellos es un core importando Python. Postgres ~1 s. Login API ~1.5 s (PBKDF2 600k). RAM ~290–300 MB PSS.

## Invariantes (no romper)

1. **`applicationId` = `com.g5pg` (8 caracteres).** Los `.so` de PostgreSQL llevan el prefijo absoluto `/data/data/<pkg>/files/usr` y el rewrite de `fetch-g4-postgres.sh` es *length-preserving* (`com.g4pg`→`com.g5pg`). Otro id/largo rompe con `could not open directory .../usr`.
2. **ABI `armeabi-v7a`** y **Python ≤3.11**: el device es 32-bit (`zygote32`, `abilist64` vacío). Python 3.12+ en Chaquopy es solo 64-bit.
3. **`android:extractNativeLibs="true"` + `packaging { jniLibs { useLegacyPackaging = true } }`.** Sin esto, `libpostgres.so` no existe en disco y `exec` da ENOENT.
4. **`com.g4pg` instalado** en el device: es la fuente de `jniLibs` y `pgsupport.zip`.
5. El submódulo `vendor/systutor-core` queda **intacto**; los parches de 3.11 se aplican sobre la copia (`sync-systutor-core.sh`).

## Gotchas conocidos y solución

| Síntoma | Causa / fix |
|---|---|
| `connection refused` en el WebView; log `FATAL postgres not ready` | Hay un postmaster viejo (lock) o abriste la app duplicada. La app reutiliza un postmaster vivo y borra `postmaster.pid` viejo; verificar el paquete `com.g5pg`. |
| `could not access file "pg_trgm"` / `"plpgsql"` | Falta `pgextensions.zip` o no se ejecutó el fix de `$libdir`. El `pkglibdir` de G4 está roto; `g5core._fix_pg_paths` reescribe a rutas absolutas. |
| `extension script file ... near line 7` | Corre `scripts/build-pg-extensions.sh` (trae `pg_trgm.so`/`plpgsql.so` del build Termux). |
| `missing plugin structure: backend` o `plugin not found on filesystem: compras` | El symlink `plugins/commerce/backend -> purchase/backend` no se dereferenció. `build-plugins-asset.sh` usa `tar -h`. |
| `create function ... LANGUAGE C` / `DO $$` falla | plpgsql sin `probin` correcto; ver `_fix_pg_paths`. |
| `relation "crm_customer_commercial_assignments" does not exist` | Bug del plugin CRM; el script parchea la migración 0005 para crear las tablas `crm_*`. |
| `ModuleNotFoundError: No module named 'httpx'` | Falta la dependencia en `app/build.gradle` (`pip { install("httpx") }`). |
| `SyntaxError` en import de plugins/core | Sintaxis PEP 695 (3.12-only). Los scripts de port la backportean; si agregás un plugin nuevo, revisá `class X[T]` / `async def f[T]` / `type A = ...`. |
| `python.stdout`/logs inundados y se pierden | Postgres loguea mucho; `MainActivity` solo loguea ready/ERROR/FATAL y pasa `log_statement=none`. |

## Estructura

```
android-g5/
├── settings.gradle, build.gradle, gradle.properties
├── app/
│   ├── build.gradle                     # appId com.g5pg, ABI, pip, packaging
│   ├── wheels/                          # wheel pydantic-core (commiteado)
│   └── src/main/
│       ├── AndroidManifest.xml          # permisos cámara/media/archivos, cleartext
│       ├── java/com/systutor/g5/MainActivity.java
│       └── python/
│           ├── g5core.py                # boot: PG, plugins, SPA, seed, self-test
│           ├── g5_products_importer.py  # (generado)
│           ├── systutor/, app/          # (generado por sync-systutor-core.sh)
│           └── ...
└── scripts/                             # build reproducible
```

## Permisos ya configurados

`CAMERA`, `READ_MEDIA_IMAGES/VIDEO/VISUAL_USER_SELECTED`, `READ_EXTERNAL_STORAGE` (≤12), `WRITE_EXTERNAL_STORAGE` (≤9). El WebView otorga `getUserMedia` (`onPermissionRequest`) para el escáner del POS y abre el selector del sistema (`onShowFileChooser`) para subir archivos. `127.0.0.1` cuenta como contexto seguro, así que la cámara funciona sin HTTPS.

## Limitaciones conocidas (no son bugs)

- `libicudata.so` pesa 33 MB (ICU de PostgreSQL): es el grueso del APK.
- El arranque en frío (~12 s) es el import del stack Python en un solo core (GIL). Mejoras pendientes: ForegroundService (backend caliente), shell SPA inmediato, lazy plugin loading, bulk seed.
- No hay wheel Android de `asyncpg`; por eso el port usa `psycopg` (async URL a `postgresql+psycopg`).
