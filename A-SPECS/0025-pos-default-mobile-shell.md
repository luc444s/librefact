# A.SPEC 0025 — POS default route and mobile shell drawer

## Estado

Implementado; SHA pendiente.

## Objetivo

Hacer que POS sea la entrada principal del sistema despues de iniciar sesion y que el shell global sea usable en telefono mediante sidebar tipo sandwich/drawer, ocultando el header global en mobile.

## Contexto

El POS bodega es el flujo operativo principal en celular. El shell desktop existente con sidebar fijo y header de tenant/branch/user ocupa espacio excesivo en pantallas chicas.

## Decision

- Redirigir usuarios autenticados a `/app/pos` por defecto.
- Redirigir `/app` a `pos`.
- En mobile, convertir el sidebar global en drawer abierto por boton hamburguesa.
- En desktop (`lg`), conservar sidebar fijo y header global.
- En mobile, ocultar el header global completo (`Tenant`, `Branch`, `User`, `Cerrar sesion`) para maximizar area util.
- Mantener el modo inmersivo especial del POS.

## Change Surface

### Allowed

- `apps/web/src/app/router.tsx`
- `apps/web/src/features/auth/LoginPage.tsx`
- `apps/web/src/shared/layout/AppLayout.tsx`

### Forbidden

- Cambiar autenticacion backend
- Cambiar permisos o roles
- Cambiar rutas de plugins
- Eliminar dashboard o paginas existentes
- Tocar POS backend

## UX requerida

- Login exitoso sin destino previo debe abrir `/app/pos`.
- Entrar a `/` con sesion activa debe abrir `/app/pos`.
- Entrar a `/app` debe abrir `/app/pos`.
- En telefono:
  - sidebar no ocupa espacio permanente;
  - existe boton hamburguesa;
  - al abrir, aparece drawer con sidebar y overlay;
  - al cambiar ruta, drawer se cierra;
  - header global de tenant/branch/user/logout no se muestra.
- En desktop:
  - sidebar fijo sigue visible;
  - header global sigue visible;
  - layout existente se conserva.

## Test Plan

- `npm run typecheck`
- `npm --prefix apps/web run build`
- Smoke manual:
  - login redirige a `/app/pos`;
  - `/app` redirige a `/app/pos`;
  - mobile viewport muestra hamburguesa y no muestra header global;
  - desktop conserva sidebar/header.

## Acceptance Criteria

- POS es el modulo principal al iniciar sesion.
- Shell usa sidebar drawer en mobile para todo el sistema.
- Header global desaparece en mobile.
- Desktop no pierde sidebar/header.
- `npm run typecheck` PASS.
- `npm --prefix apps/web run build` PASS.

## Implementation Trace

- Estado: implementado; SHA pendiente.
- Verificacion local: `npm run typecheck` PASS; `npm --prefix apps/web run build` PASS.
