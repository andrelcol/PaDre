import { useState } from 'react'

import type { InviteLinkStatus } from '@/domains/meetups/model/invite-link.ts'
import { formatMeetupInstant } from '@/domains/meetups/model/schedule.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Label } from '@/shared/ui/label.tsx'

type MeetupInviteLinkPanelProps = {
  link: InviteLinkStatus | undefined
  loading: boolean
  shareUrl: string | null
  expiresAt: string | null
  timeZone: string
  pending: boolean
  notice: string
  error: string
  onCreate: () => void
  onRevoke: () => void
  onCopy: () => void
}

export function MeetupInviteLinkPanel({
  link,
  loading,
  shareUrl,
  expiresAt,
  timeZone,
  pending,
  notice,
  error,
  onCreate,
  onRevoke,
  onCopy,
}: MeetupInviteLinkPanelProps) {
  const [confirming, setConfirming] = useState<'create' | 'revoke' | null>(null)
  const active = link?.state === 'active' || Boolean(shareUrl)
  const expiry = expiresAt ?? link?.expires_at

  function confirm(kind: 'create' | 'revoke', run: () => void) {
    if (confirming === kind) {
      setConfirming(null)
      run()
      return
    }
    setConfirming(kind)
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Link de convite</h2>
      <p className="text-sm text-muted-foreground">
        Quem tiver o link pode entrar sem ser seu amigo. Gerar um novo link
        invalida o anterior.
      </p>
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando o link
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {shareUrl ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-share-url">Link do convite</Label>
          <input
            id="invite-share-url"
            readOnly
            value={shareUrl}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <Button
            variant="secondary"
            disabled={pending}
            onClick={onCopy}
            className="w-full sm:w-auto"
          >
            Copiar link
          </Button>
          {expiry ? (
            <p className="text-sm text-muted-foreground">
              Válido até {formatMeetupInstant(expiry, timeZone)}.
            </p>
          ) : null}
        </div>
      ) : link?.state === 'active' && expiry ? (
        <p className="text-sm">
          Há um link vigente até {formatMeetupInstant(expiry, timeZone)}. Ele
          não fica guardado para copiar de novo. Gere um novo para compartilhar.
        </p>
      ) : link?.state === 'revoked' ? (
        <p className="text-sm">O último link foi revogado.</p>
      ) : link?.state === 'expired' ? (
        <p className="text-sm">O último link expirou.</p>
      ) : link?.state === 'none' ? (
        <p className="text-sm text-muted-foreground">Nenhum link vigente.</p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          disabled={pending}
          onClick={() => confirm('create', onCreate)}
          className="w-full sm:w-auto"
        >
          {confirming === 'create'
            ? 'Confirmar novo link'
            : active
              ? 'Gerar novo link'
              : 'Gerar link'}
        </Button>
        {active ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => confirm('revoke', onRevoke)}
            className="w-full sm:w-auto"
          >
            {confirming === 'revoke' ? 'Confirmar revogação' : 'Revogar link'}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
