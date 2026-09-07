import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
function viteSyncPlugin() {
    var syncFile = path.resolve(__dirname, 'server/data/sync_state.json');
    function ensureDir() {
        var dir = path.dirname(syncFile);
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
            }
            catch (_a) { }
        }
    }
    function readSyncData() {
        try {
            if (fs.existsSync(syncFile)) {
                var raw = fs.readFileSync(syncFile, 'utf-8');
                return JSON.parse(raw);
            }
        }
        catch (_a) { }
        return { payload: null, revision: 0 };
    }
    function writeSyncData(payload) {
        ensureDir();
        var current = readSyncData();
        var nextRevision = (current.revision || 0) + 1;
        var data = { payload: payload, revision: nextRevision, lastModified: Date.now() };
        var tmp = "".concat(syncFile, ".tmp.").concat(Date.now());
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
        try {
            fs.renameSync(tmp, syncFile);
        }
        catch (_a) {
            fs.writeFileSync(syncFile, JSON.stringify(data, null, 2), 'utf-8');
        }
        return nextRevision;
    }
    return {
        name: 'vite-sync-plugin',
        configureServer: function (server) {
            server.middlewares.use(function (req, res, next) {
                var _a, _b, _c;
                var url = ((_a = req.url) === null || _a === void 0 ? void 0 : _a.split('?')[0]) || '';
                if (url === '/api/sync/status' && req.method === 'GET') {
                    var current = readSyncData();
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.end(JSON.stringify({
                        ok: true,
                        revision: current.revision || 0,
                        lastModified: ((_b = current.payload) === null || _b === void 0 ? void 0 : _b.lastModified) || 0,
                        deviceName: ((_c = current.payload) === null || _c === void 0 ? void 0 : _c.deviceName) || null,
                    }));
                    return;
                }
                if (url === '/api/sync' && req.method === 'GET') {
                    var current = readSyncData();
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.end(JSON.stringify({
                        ok: true,
                        payload: current.payload,
                        revision: current.revision || 0,
                        serverTimestamp: Date.now(),
                    }));
                    return;
                }
                if (url === '/api/sync' && req.method === 'POST') {
                    var body_1 = '';
                    req.on('data', function (chunk) {
                        body_1 += chunk;
                    });
                    req.on('end', function () {
                        try {
                            var parsed = JSON.parse(body_1);
                            var payload = parsed.payload || parsed;
                            var revision = writeSyncData(payload);
                            res.setHeader('Content-Type', 'application/json');
                            res.setHeader('Access-Control-Allow-Origin', '*');
                            res.end(JSON.stringify({
                                ok: true,
                                revision: revision,
                                serverTimestamp: Date.now(),
                            }));
                        }
                        catch (err) {
                            res.statusCode = 400;
                            res.end(JSON.stringify({ error: 'Données JSON invalides' }));
                        }
                    });
                    return;
                }
                next();
            });
        },
    };
}
export default defineConfig({
    plugins: [react(), viteSyncPlugin()],
    server: {
        host: true, // Écoute sur 0.0.0.0 pour un accès immédiat depuis iPhone sur le réseau local
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
