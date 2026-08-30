# React + TypeScript + Vite

## Configuración SIGP

El frontend toma las URLs desde variables Vite:

```env
VITE_API_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000/ws
```

Para desarrollo se utiliza `.env.development`. Para producción, copiá `.env.production.example` como `.env.production` y reemplazá las URLs por las públicas del backend (`https` y `wss`). No guardes secretos en archivos del frontend: Vite los expone al navegador.

El backend carga `backend-sigp-main-1/.env` mediante `python-dotenv`. Copiá `backend-sigp-main-1/.env.example` y configurá `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` y `CORS_ORIGINS`. El archivo `.env` del backend está excluido de Git.

### Ejecución local

```powershell
# Backend
cd backend-sigp-main-1
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend (otra terminal, desde la raíz)
npm install
npm run dev
```

El frontend de producción se genera con `npm run build`. La configuración de Vite usa `/SIGP/` como base en producción y `/` durante desarrollo. El workflow `.github/workflows/deploy-pages.yml` publica automáticamente la rama `Frontend-V1.0`; en GitHub configurá Pages con la fuente `GitHub Actions` y las variables de entorno `VITE_API_URL` y `VITE_WS_URL` en `Settings > Environments > github-pages > Variables`.

### Despliegue del backend

Se recomienda Render (o cualquier servicio Docker compatible con FastAPI). El archivo `render.yaml` define el servicio y el `Dockerfile` ejecuta Uvicorn en el puerto dinámico `PORT`. Configurá en el servicio `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` y `CORS_ORIGINS`; este último debe incluir el dominio de GitHub Pages, por ejemplo `https://facualtamilanga.github.io`. La base MySQL debe ser accesible desde el servicio desplegado. Luego de obtener la URL HTTPS del backend, usala como `VITE_API_URL` y su equivalente `wss://` como `VITE_WS_URL` al compilar el frontend.

### Resumen de integración V1

El flujo principal está compuesto por login JWT, agenda administrativa, búsqueda y carga de triaje, historia clínica digital, validación de medicamentos y monitor de alertas por WebSocket. Para una verificación end-to-end, levantá MySQL y FastAPI, configurá las variables de entorno y ejecutá el frontend con `npm run dev`. Probá primero `POST /api/auth/login`, luego las rutas según el rol devuelto y finalmente confirmá una alerta mediante `PATCH /api/alertas/{id}/confirmar`.

Limitaciones conocidas de esta versión: el vademécum y el feed de alertas requieren conectar sus tablas/fuentes reales; la firma digital actual es una confirmación lógica; y las tablas `turnos` y `triajes` deben existir en el esquema MySQL desplegado.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
