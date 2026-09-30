import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Code2, Download, RotateCcw } from 'lucide-react'
import { BlockShell, useBlockEnv } from './shared'

/**
 * Model-written mini apps run in a sandboxed iframe: opaque origin (no
 * access to the app, its storage or API keys) and a CSP that blocks network
 * calls. A tiny bridge lets them pronounce words and report a score.
 */

const THEME_VARS: [string, string][] = [['--ink', '--ink'], ['--muted', '--muted'], ['--line', '--line'], ['--paper', '--paper'], ['--card', '--white'], ['--accent', '--coral']]

function themeCss(): string {
  const style = getComputedStyle(document.documentElement)
  const vars = THEME_VARS.map(([name, source]) => `${name}:${style.getPropertyValue(source).trim() || 'inherit'};`).join('')
  const dark = document.documentElement.dataset.theme === 'dark'
  return `:root{${vars}color-scheme:${dark ? 'dark' : 'light'};--good:#3f8f5d;--bad:#d9534f}
*{box-sizing:border-box}
html,body{margin:0;background:transparent;color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
body{padding:18px}
button{font:inherit;cursor:pointer}
input,select,textarea{font:inherit;color:inherit}`
}

function bridge(id: string): string {
  return `(function(){var id=${JSON.stringify(id)};function post(m){m.__vl=id;parent.postMessage(m,'*')}
window.app={speak:function(t){post({type:'speak',text:String(t)})},done:function(s,t){post({type:'done',score:+s||0,total:+t||0})}};
function size(){post({type:'height',h:Math.ceil(document.documentElement.scrollHeight)})}
try{new ResizeObserver(size).observe(document.documentElement)}catch(e){}
window.addEventListener('load',size);setTimeout(size,60);setTimeout(size,400);
window.addEventListener('error',function(e){post({type:'error',message:String(e.message||e)})});})();`
}

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob: https:; media-src data: blob:"

export function buildArtifactDocument(code: string, id: string): string {
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${themeCss()}</style><script>${bridge(id)}</script>`
  if (/<html[\s>]/i.test(code)) {
    return /<head[^>]*>/i.test(code) ? code.replace(/<head[^>]*>/i, (tag) => `${tag}${head}`) : code.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${head}</head>`)
  }
  return `<!doctype html><html><head>${head}</head><body>${code}</body></html>`
}

export function HtmlArtifact({ code, index, partial }: { code: string; index: number; partial?: boolean }) {
  const env = useBlockEnv()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(360)
  const [showCode, setShowCode] = useState(false)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const id = useMemo(() => `a${index}-${Math.random().toString(36).slice(2, 8)}`, [index, reload])
  const srcDoc = useMemo(() => (partial ? '' : buildArtifactDocument(code, id)), [code, id, partial])
  const title = code.match(/<title>([^<]{1,80})<\/title>/i)?.[1] ?? code.match(/<h1[^>]*>([^<]{1,80})<\/h1>/i)?.[1]

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.__vl !== id) return
      const data = event.data as { type: string; h?: number; text?: string; score?: number; total?: number; message?: string }
      if (data.type === 'height' && data.h) setHeight(Math.max(160, Math.min(env.inCanvas ? 4000 : 720, data.h)))
      if (data.type === 'speak' && data.text) env.speak(data.text.slice(0, 600))
      if (data.type === 'done' && data.total) env.setBlock(index, { score: data.score, total: data.total, done: true })
      if (data.type === 'error' && data.message) setError(data.message.slice(0, 200))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [id, env, index])

  const download = () => {
    const url = URL.createObjectURL(new Blob([buildArtifactDocument(code, 'standalone')], { type: 'text/html' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${(title || 'activite').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.html`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const saved = env.getBlock(index)

  return (
    <BlockShell kind="html" title={title} index={index} wide
      score={saved?.total ? { score: saved.score ?? 0, total: saved.total } : null}
      footer={
        <>
          <button type="button" className="ab-ghost" onClick={() => setShowCode(!showCode)}><Code2 size={13} /> {showCode ? env.c.hideCode : env.c.showCode}</button>
          <button type="button" className="ab-ghost" onClick={() => { setError(null); setReload(reload + 1) }}><RotateCcw size={13} /> {env.c.restart}</button>
          <button type="button" className="ab-ghost" onClick={download}><Download size={13} /> .html</button>
        </>
      }>
      {partial ? (
        <div className="ab-building"><span className="ab-pulse" /> {env.c.buildingApp}</div>
      ) : showCode ? (
        <pre className="ab-source"><code>{code}</code></pre>
      ) : (
        <iframe
          key={id}
          ref={frameRef}
          className="ab-frame"
          title={title || env.c.blockKinds.html}
          sandbox="allow-scripts allow-forms"
          srcDoc={srcDoc}
          style={{ height: env.inCanvas ? 'calc(100vh - 190px)' : height }}
        />
      )}
      {error && <p className="ab-explain bad">{error}</p>}
    </BlockShell>
  )
}
