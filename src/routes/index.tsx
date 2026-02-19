import { createFileRoute } from '@tanstack/react-router'
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor.tsx'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return <SimpleEditor />
}
