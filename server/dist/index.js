import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readFileSync, existsSync, statSync } from 'fs';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { resolve, extname, join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
const app = new Hono();
const DIST_DIR = '/app/dist';
const execFileAsync = promisify(execFile);
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
};
app.use('/*', cors());
app.get('/api/health', (c) => c.json({ status: 'ok' }));
const youtubeIdFromUrl = (value) => {
    try {
        const url = new URL(value);
        if (url.hostname === 'youtu.be')
            return url.pathname.slice(1).split('/')[0];
        if (url.hostname.endsWith('youtube.com'))
            return url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop() || '';
    }
    catch { }
    return '';
};
const downloadYouTubeAudio = async (videoId) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vivre-listening-'));
    try {
        const output = join(tempDir, 'audio.%(ext)s');
        await execFileAsync('yt-dlp', [
            '--no-playlist', '--no-warnings', '--extract-audio', '--audio-format', 'mp3',
            '--output', output, `https://www.youtube.com/watch?v=${videoId}`,
        ], { maxBuffer: 1024 * 1024 });
        const file = (await readdir(tempDir)).find((name) => name.endsWith('.mp3'));
        if (!file)
            throw new Error('Audio YouTube introuvable après extraction.');
        return { bytes: await readFile(join(tempDir, file)), tempDir };
    }
    catch (error) {
        await rm(tempDir, { recursive: true, force: true });
        throw error;
    }
};
const transcribeYouTubeAudio = async (videoId, language, apiKey) => {
    const { bytes, tempDir } = await downloadYouTubeAudio(videoId);
    try {
        const form = new FormData();
        form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), 'youtube.mp3');
        form.append('model', 'whisper-1');
        form.append('response_format', 'verbose_json');
        form.append('language', language);
        form.append('timestamp_granularities[]', 'segment');
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST', headers: { Authorization: apiKey }, body: form,
        });
        if (!response.ok)
            throw new Error(`Transcription OpenAI impossible (${response.status}).`);
        const payload = await response.json();
        return (payload.segments ?? []).flatMap((segment, index) => {
            const text = segment.text?.trim() || '';
            const start = segment.start ?? 0;
            const end = segment.end ?? start + 2.5;
            return text ? [{ id: `asr-${index}`, start, end, text }] : [];
        });
    }
    finally {
        await rm(tempDir, { recursive: true, force: true });
    }
};
const decodeHtml = (value) => value
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
app.post('/api/youtube-transcript', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const videoId = youtubeIdFromUrl(body.url || '');
    if (!/^[\w-]{6,}$/.test(videoId))
        return c.json({ error: 'Lien YouTube invalide.' }, 400);
    try {
        const page = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=${body.language === 'fr' ? 'fr' : 'en'}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VivreLaLangue/1.0)' },
        }).then(async (response) => response.ok ? response.text() : '');
        const captionsMatch = page.match(/"captionTracks":(\[[\s\S]*?\])(?=,"audioTracks"|,"translationLanguages"|})/);
        if (!captionsMatch) {
            const authorization = c.req.header('Authorization');
            if (!authorization?.startsWith('Bearer '))
                return c.json({ error: 'Cette vidéo ne propose pas de sous-titres. Ajoute une clé OpenAI pour lancer la transcription complète.' }, 422);
            const cues = await transcribeYouTubeAudio(videoId, body.language || 'en', authorization);
            if (!cues.length)
                return c.json({ error: 'La transcription ne contient aucun texte.' }, 422);
            return c.json({ videoId, cues, transcribed: true });
        }
        const tracks = JSON.parse(captionsMatch[1]);
        const preferred = tracks.find((track) => track.languageCode?.startsWith(body.language || '')) || tracks[0];
        if (!preferred?.baseUrl)
            return c.json({ error: 'Aucune piste de sous-titres disponible.' }, 422);
        const captionUrl = new URL(preferred.baseUrl);
        captionUrl.searchParams.set('fmt', 'json3');
        const captions = await fetch(captionUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VivreLaLangue/1.0)' } });
        if (!captions.ok)
            return c.json({ error: 'Impossible de récupérer les sous-titres de cette vidéo.' }, 502);
        const payload = await captions.json();
        const cues = (payload.events ?? []).flatMap((event, index) => {
            const text = decodeHtml((event.segs ?? []).map((segment) => segment.utf8 ?? '').join('')).replace(/\n/g, ' ').trim();
            const start = (event.tStartMs ?? 0) / 1000;
            const end = start + Math.max(0.4, (event.dDurationMs ?? 2500) / 1000);
            return text ? [{ id: `yt-${index}`, start, end, text }] : [];
        });
        if (!cues.length)
            return c.json({ error: 'La piste de sous-titres ne contient aucun texte.' }, 422);
        return c.json({ videoId, cues, language: preferred.languageCode, label: preferred.name?.simpleText || preferred.languageCode });
    }
    catch (error) {
        return c.json({ error: error instanceof Error ? error.message : 'Impossible de préparer cette vidéo.' }, 502);
    }
});
app.get('*', (c) => {
    const url = new URL(c.req.url);
    let filePath = resolve(DIST_DIR, '.' + url.pathname);
    if (!filePath.startsWith(DIST_DIR)) {
        filePath = resolve(DIST_DIR, 'index.html');
    }
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        filePath = resolve(DIST_DIR, 'index.html');
    }
    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = readFileSync(filePath);
    return c.body(content, 200, { 'Content-Type': contentType });
});
const port = parseInt(process.env.PORT || '3001');
serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server running on port ${info.port}`);
});
