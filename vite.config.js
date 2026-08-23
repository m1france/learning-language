import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api-deepl-free': {
                target: 'https://api-free.deepl.com',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api-deepl-free/, ''); },
            },
            '/api-deepl-pro': {
                target: 'https://api.deepl.com',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api-deepl-pro/, ''); },
            },
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
        },
    },
});
