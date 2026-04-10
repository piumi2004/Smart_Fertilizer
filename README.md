# GoviSmart (React + Vite) + Express API

## Local development (forms and `/api` need the backend)

1. **Backend:** copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI`, `JWT_SECRET`, and other values.
2. Install dependencies: `npm install` in the project root and `npm install` in `backend/`.
3. Start **Vite + API** together: `npm run dev:full` from the project root, then open [http://localhost:5173](http://localhost:5173).

Alternatively, use two terminals: `cd backend && npm run dev` (API on port 5000 by default) and `npm run dev` (Vite). The dev server proxies `/api` to the backend so auth cookies stay on the same origin as the app.

If you open the built `dist/` or use a static server without a proxy, API calls return **404** unless you set `VITE_API_BASE_URL` at build time — see `.env.example`.

### Still seeing “API not found (404)”?

1. **Use the exact URL Vite prints** (for example `http://localhost:5177/`) — not an old tab on `http://localhost:5173` if Vite moved to another port because 5173 was busy.
2. **Confirm the backend has the services routes:** open [http://127.0.0.1:5000/api/services/health](http://127.0.0.1:5000/api/services/health). You should see JSON like `{"ok":true,"services":true}`. If that URL returns **404** but [http://127.0.0.1:5000/health](http://127.0.0.1:5000/health) works, stop the backend (Ctrl+C) and start it again from this project’s `backend` folder (`npm run dev`) so you are not running an old process.

---

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
