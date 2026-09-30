import { useEffect, useState } from 'react'
import type { ApiSettings } from '../../domain'
import type { LlmConfig } from '../../lib/llm'

type Model = { id: string; name: string }

export function ModelPicker({ api, cfg, ui, onSelect }: { api: ApiSettings; cfg: LlmConfig | null; ui: string; onSelect: (model: string) => void }) {
  const [models, setModels] = useState<Model[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if ((cfg?.provider || api.agentProvider || 'openrouter') !== 'openrouter') return
    const controller = new AbortController()
    setLoading(true)
    fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error('catalog'); return r.json() })
      .then((data: { data: { id: string; name: string; pricing: { prompt: string; completion: string }; architecture: { output_modalities: string[] } }[] }) => {
        setModels(data.data.filter((m) => Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0 && m.architecture.output_modalities.includes('text') && !m.architecture.output_modalities.includes('audio') && !m.id.includes('nemotron-3-ultra')).map(({ id, name }) => ({ id, name })))
      }).catch((e) => { if (e.name !== 'AbortError') setFailed(true) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [cfg?.provider, api.agentProvider])
  const configured = [cfg?.model, api.taskModelAssistant, api.agentModel].filter((x): x is string => Boolean(x))
  const choices = Array.from(new Map([...configured.map((id) => ({ id, name: id })), ...models].map((m) => [m.id, m])).values())
  return <div className="as-pop as-model-picker">
    <label>{ui === 'fr' ? 'Modèle pour cette conversation' : 'Model for this conversation'}
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ui === 'fr' ? 'Rechercher ou saisir un identifiant…' : 'Search or enter a model ID…'} />
    </label>
    <button type="button" onClick={() => onSelect('')}>{ui === 'fr' ? 'Utiliser les paramètres par défaut' : 'Use default settings'}</button>
    {loading && <p role="status">{ui === 'fr' ? 'Chargement du catalogue…' : 'Loading models…'}</p>}
    {failed && <p role="status">{ui === 'fr' ? 'Catalogue indisponible. Saisis un identifiant de modèle.' : 'Catalogue unavailable. Enter a model ID.'}</p>}
    {choices.filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(query.toLowerCase())).map((m) => <button type="button" key={m.id} className={cfg?.model === m.id ? 'on' : ''} onClick={() => onSelect(m.id)} title={m.id}>{m.name}</button>)}
    {query.trim() && !choices.some((m) => m.id === query.trim()) && <button type="button" onClick={() => onSelect(query.trim())}>{ui === 'fr' ? 'Utiliser' : 'Use'} {query.trim()}</button>}
  </div>
}
