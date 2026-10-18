import { useQuery } from '@tanstack/react-query'

import { getCatalog } from '@/domains/sports/api/catalog.ts'

export function useCatalog() {
  return useQuery({
    queryKey: ['sports', 'catalog'],
    queryFn: getCatalog,
  })
}
