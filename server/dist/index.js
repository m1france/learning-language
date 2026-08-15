import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/serve-static';
import { readFileSync } from 'fs';
const app = new Hono();
app.use('/*', cors());
app.use('/*', serveStatic({ root: './dist' }));
app.get('/api/health', (c) => c.json({ status: 'ok' }));
app.get('*', (c) => {
    return c.html(readFileSync('./dist/index.html', 'utf-8'));
});
const port = parseInt(process.env.PORT || '3001');
serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server running on port ${info.port}`);
});
