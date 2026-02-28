import { createFileRoute, redirect } from '@tanstack/react-router'
import { fetchDocuments, addDocumentFn } from '@/lib/server-functions'

export const Route = createFileRoute('/')({
  loader: async () => {
    const docs = await fetchDocuments()
    if (docs.length > 0) {
      throw redirect({
        to: '/document/$documentId',
        params: { documentId: docs[0].id }
      })
    } else {
      const newDoc = await addDocumentFn({ data: { title: 'Untitled Document', content: '' } })
      throw redirect({
        to: '/document/$documentId',
        params: { documentId: newDoc.id }
      })
    }
  },
  component: App
})

function App() {
  return null
}
