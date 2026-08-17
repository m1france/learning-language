import React from 'react'
import { X } from 'lucide-react'

type TeleprompterOverlayProps = {
  text: string
  opacity?: number
  onClose: () => void
}

export function TeleprompterOverlay({
  text,
  opacity = 0.4,
  onClose,
}: TeleprompterOverlayProps) {
  return (
    <div
      className="minimal-prompter-bar"
      style={{
        backgroundColor: `rgba(10, 14, 20, ${opacity})`,
      }}
    >
      <div className="minimal-prompter-content">
        <p className="minimal-prompter-text">{text}</p>
      </div>
      <button className="minimal-prompter-close" onClick={onClose} title="Fermer le prompteur">
        <X size={15} />
      </button>
    </div>
  )
}
