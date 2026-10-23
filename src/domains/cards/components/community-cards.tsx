import { useState, type FormEvent } from 'react'

import {
  useCardParticipation,
  useCardTemplate,
  usePlayerCards,
  usePublishCardTemplate,
  useRatePlayer,
  useSaveCardDraft,
} from '@/domains/cards/api/queries.ts'
import { PadrePlayerCard } from '@/domains/cards/components/player-card.tsx'
import { cardRatingMinimum } from '@/domains/cards/model/player-card.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

export function CommunityCards({
  slug,
  canConfigure,
}: {
  slug: string
  canConfigure: boolean
}) {
  const template = useCardTemplate(slug)
  const cards = usePlayerCards(slug)
  const participation = useCardParticipation(slug)
  const rate = useRatePlayer(slug)
  const [selected, setSelected] = useState('')
  const [score, setScore] = useState('70')
  const [attributeId, setAttributeId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const active = template.data?.active
  const selectedCard = cards.data?.cards.find(
    (card) => card.username === selected,
  )

  async function submitRating(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setError('')
    const value = Number(score)
    if (
      !selected ||
      !attributeId ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 99
    ) {
      setError('Escolha um jogador, um atributo e uma nota inteira de 1 a 99.')
      return
    }
    try {
      await rate.mutateAsync({ username: selected, attributeId, score: value })
      setMessage(
        'Avaliação registrada. A nota anterior deste atributo foi substituída.',
      )
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  return (
    <section className="flex flex-col gap-6" aria-labelledby="community-cards">
      <div className="flex flex-col gap-2">
        <h2 id="community-cards" className="text-xl font-semibold">
          Cartinhas
        </h2>
        <p className="text-sm text-muted-foreground">
          Avaliações subjetivas desta comunidade, de 1 a 99. O overall só
          aparece quando cada atributo tiver pelo menos {cardRatingMinimum}{' '}
          avaliadores. Médias de grupos pequenos não garantem anonimato.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            setError('')
            participation.mutate(true, {
              onError: (caught) => setError(errorText(caught)),
            })
          }}
        >
          Ativar minha cartinha
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setError('')
            participation.mutate(false, {
              onError: (caught) => setError(errorText(caught)),
            })
          }}
        >
          Desativar minha cartinha
        </Button>
      </div>
      {canConfigure ? <CardTemplateEditor slug={slug} /> : null}
      {cards.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as cartinhas.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {cards.data?.cards.map((card) => (
          <button
            key={card.username}
            type="button"
            className="text-left"
            aria-label={`Abrir cartinha de ${card.display_name}`}
            onClick={() => {
              setSelected(card.username)
              setAttributeId(card.attributes[0]?.id ?? '')
            }}
          >
            <PadrePlayerCard
              card={card}
              communityName={cards.data?.community_name ?? ''}
            />
          </button>
        ))}
      </div>
      {cards.data && cards.data.cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma cartinha ativa. A participação é voluntária.
        </p>
      ) : null}
      {selectedCard && active ? (
        <form
          className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
          onSubmit={(event) => void submitRating(event)}
        >
          <h3 className="text-lg font-semibold">
            Avaliar @{selectedCard.username}
          </h3>
          <div className="flex flex-col gap-1">
            <Label htmlFor="card-attribute">Atributo</Label>
            <select
              id="card-attribute"
              className="h-11 rounded-md border bg-background px-3"
              value={attributeId}
              onChange={(event) => setAttributeId(event.target.value)}
            >
              {selectedCard.attributes.map((attribute) => (
                <option key={attribute.id} value={attribute.id}>
                  {attribute.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="card-score">Nota de 1 a 99</Label>
            <Input
              id="card-score"
              inputMode="numeric"
              value={score}
              onChange={(event) => setScore(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={rate.isPending}>
            Registrar nota
          </Button>
        </form>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-pitch">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}

function CardTemplateEditor({ slug }: { slug: string }) {
  const template = useCardTemplate(slug)
  const save = useSaveCardDraft(slug)
  const publish = usePublishCardTemplate(slug)
  const source =
    template.data?.draft?.attributes ?? template.data?.active?.attributes ?? []
  const [rows, setRows] = useState(
    source.length > 0
      ? source.map((item) => ({
          name: item.name,
          description: item.description ?? '',
        }))
      : [
          { name: '', description: '' },
          { name: '', description: '' },
          { name: '', description: '' },
        ],
  )
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  function update(index: number, field: 'name' | 'description', value: string) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <h3 className="font-semibold">Configurar atributos</h3>
      <p className="text-sm text-muted-foreground">
        De 3 a 8 habilidades esportivas. Publicar cria uma versão nova. As notas
        da versão anterior não migram.
      </p>
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            aria-label={`Nome do atributo ${index + 1}`}
            value={row.name}
            onChange={(event) => update(index, 'name', event.target.value)}
          />
          <Input
            aria-label={`Descrição do atributo ${index + 1}`}
            value={row.description}
            onChange={(event) =>
              update(index, 'description', event.target.value)
            }
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setRows((current) =>
                current.filter((_, rowIndex) => rowIndex !== index),
              )
            }
          >
            Remover
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            setRows((current) => [...current, { name: '', description: '' }])
          }
        >
          Adicionar atributo
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setRows((current) => {
              if (current.length < 2) return current
              const next = [...current]
              const last = next.pop()
              if (!last) return current
              next.splice(next.length - 1, 0, last)
              return next
            })
          }}
        >
          Reordenar último
        </Button>
        <Button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            setError('')
            setNotice('')
            save.mutate(rows, {
              onSuccess: () => setNotice('Rascunho salvo.'),
              onError: (caught) => setError(errorText(caught)),
            })
          }}
        >
          Salvar rascunho
        </Button>
        <Button
          type="button"
          disabled={publish.isPending}
          onClick={() => {
            setError('')
            setNotice('')
            publish.mutate(undefined, {
              onSuccess: () => setNotice('Configuração publicada.'),
              onError: (caught) => setError(errorText(caught)),
            })
          }}
        >
          Publicar
        </Button>
      </div>
      {template.data?.active ? (
        <p className="text-sm">Versão ativa: {template.data.active.version}</p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-pitch">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function errorText(caught: unknown) {
  if (caught instanceof Error) return caught.message
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String(caught.message)
  }
  return 'Não foi possível concluir.'
}
