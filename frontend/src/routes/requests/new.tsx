import { createFileRoute } from '@tanstack/react-router'
import { RequestCreatePage } from '../../components/RequestsWorkspace'
import { parseSingleColumnPrototypeSearch } from '../../components/SingleColumnFormPrototype'

export const Route = createFileRoute('/requests/new')({
  component: RequestCreatePage,
  // PROTOTYPE: ?variant=, ?view= and ?sample= drive the single-column form variants.
  validateSearch: parseSingleColumnPrototypeSearch,
})
