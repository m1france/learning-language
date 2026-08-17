import React from 'react'
import { X } from 'lucide-react'

type TeleprompterOverlayProps = {
  text: string
  opacity?: number
  onClose: () => void
  children?: React.ReactNode
}

export function TeleprompterOverlay({
  text,
  opacity = 0.1,
  onClose,
  children,
}: TeleprompterOverlayProps) {
  return (
    <div
      className="prompter-integrated-stack"
      style={{
        backgroundColor: `rgba(10, 14, 22, ${Math.max(0.2, opacity + 0.1)})`,
      }}
    >
      <div className="prompter-text-row">
        <div className="minimal-prompter-content">
          <p className="minimal-prompter-text">{text}</p>
        </div>
        <button className="minimal-prompter-close" onClick={onClose} title="Fermer le prompteur">
          <X size={15} />
        </button>
      </div>

      {children && <div className="prompter-controls-footer">{children}</div>}
    </div>
  )
}
