import { useTheme } from '@/shared/theme/theme-context.ts'
import { themeModes, type ThemeMode } from '@/shared/theme/theme.ts'
import { cn } from '@/shared/lib/utils.ts'

const labels: Record<ThemeMode, string> = {
  light: 'Claro',
  dark: 'Escuro',
  system: 'Sistema',
}

export function ThemeControl() {
  const { mode, setMode } = useTheme()

  return (
    <fieldset className="basis-full md:basis-auto">
      <legend className="mb-2 text-sm font-semibold">Aparência</legend>
      <div className="grid grid-cols-3 gap-1">
        {themeModes.map((option) => {
          const selected = mode === option
          return (
            <label
              key={option}
              className={cn(
                'flex min-h-11 cursor-pointer items-center justify-center rounded-full px-2 text-center text-xs font-semibold focus-within:ring-3 focus-within:ring-ring',
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground',
              )}
            >
              <input
                type="radio"
                name="padre-theme"
                className="sr-only"
                value={option}
                checked={selected}
                onChange={() => setMode(option)}
              />
              {labels[option]}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
