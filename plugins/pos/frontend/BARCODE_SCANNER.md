# POS barcode scanner

La camara del navegador en celular requiere HTTPS o `localhost`. Para probar desde un telefono en la LAN, usa un tunel HTTPS temporal hacia Vite, por ejemplo:

```bash
cloudflared tunnel --url http://localhost:5173
```

Abre en el celular la URL HTTPS que entregue el tunel y entra a `/app/pos`. Acceder por `http://192.168.x.x:5173/app/pos` puede bloquear el permiso de camara en navegadores moviles.
