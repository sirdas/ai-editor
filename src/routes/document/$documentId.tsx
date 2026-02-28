import { createFileRoute } from '@tanstack/react-router'
import { Editor } from '@/components/tiptap-templates/simple/editor'
import { fetchDocument } from '@/lib/server-functions'

export const Route = createFileRoute('/document/$documentId')({
  loader: async ({ params }) => {
    const doc = await fetchDocument({ data: params.documentId })
    if (!doc) {
      throw new Error('Document not found')
    }
    return { document: doc }
  },
  component: DocumentRoute,
})

function DocumentRoute() {
  const { document } = Route.useLoaderData()
  
  return <Editor 
    key={document.id} 
    documentId={document.id} 
    initialTitle={document.title} 
    initialContent={document.content} 
  />
}
