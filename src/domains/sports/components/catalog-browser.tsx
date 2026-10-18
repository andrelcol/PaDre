import { useCatalog } from '@/domains/sports/api/queries.ts'
import { CatalogView } from '@/domains/sports/components/catalog-view.tsx'

export function CatalogBrowser() {
  const catalog = useCatalog()

  if (catalog.isPending) {
    return <CatalogView status="loading" sports={[]} />
  }

  if (catalog.isError) {
    return <CatalogView status="error" sports={[]} />
  }

  return <CatalogView status="ready" sports={catalog.data} />
}
