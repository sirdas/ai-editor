---
name: codebase-rules
description: Coding rules and design patterns for this codebase
---

# General rules for the ai-editor codebase
1. Do not add unnecessary comments in code, only comment on things that are complex, need explaining, helpful for the future revisions.

# Integrating Tiptap performantly in your app

Tiptap is a very performant editor (even able to edit an entire book!), often when you run into performance issues, it's not Tiptap itself, but the way you integrate it into your app. Here are some tips to make sure your editor runs smoothly.

## React Tiptap Editor Integration

When using Tiptap with React, the most common performance issue is that the editor is re-rendered too often. This can happen for several reasons:

-   When using the `useEditor` hook, it by default will re-render the editor on every change. So, you should isolate the editor (and things that depend on it) in a separate component to prevent unnecessary re-renders.
-   The editor should be isolated from renders that don't affect it. For example, if you have a sidebar that doesn't interact with the editor, it should be in a separate component.

Luckily, the solution for most of these issues is the same: isolate the editor in a separate component. Here is an example of how you can do this:

DO: isolate the editor in a separate component

```
import { EditorContent, useEditor } from '@tiptap/react'

const TiptapEditor = () => {
  const editor = useEditor({
    extensions,
    content,
  })

  return (
    <>
      <EditorContent editor={editor} />
      {/* Other components that depend on the editor instance */}
      <MenuComponent editor={editor} />
    </>
  )
}

export default TiptapEditor
```

DON'T: render the editor in the same component as other components

```
import { EditorContent, useEditor } from '@tiptap/react'

const App = () => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const editor = useEditor({
    extensions,
    content,
  })

  return (
    <>
      <UnrelatedSidebar onChange={setSidebarOpen} />
      <EditorContent editor={editor} />
      <MenuComponent editor={editor} />
      <Sidenav isSidebarOpen={sidebarOpen}>
        <AnotherComponent />
      </Sidenav>
    </>
  )
}

export default App
```

These unrelated components will cause the editor to re-render more often than necessary, and make each render more expensive.

### Track down performance issues

You can use the React DevTools Profiler to see which components are re-rendering and why. Another strategy is to put a `console.count('editor render')` in the editor component and see how often it is re-rendered. This can help you identify which components are causing unnecessary re-renders.

If it is re-rendered more often than you expect, you can take the following steps:

-   Check if the editor is rendering because of its parent component.
-   Isolate the editor from unrelated state changes (e.g. opening a sidebar should not cause the editor to re-render).
-   Use `useEditorState` to prevent unnecessary re-renders within the editor component.

Hopefully, these tips will help you track down and fix any performance issues you encounter.

### Use `useEditorState` to prevent unnecessary re-renders

The `useEditorState` hook allows you to subscribe to changes in the editor state and re-render only when necessary. This can help you prevent unnecessary re-renders of the editor and its components.

```
import { useEditor, useEditorState } from '@tiptap/react'

function Component() {
  const editor = useEditor({
    extensions,
    content,
  })

  const editorState = useEditorState({
    editor,
    // This function will be called every time the editor state changes
    selector: ({ editor }: { editor: Editor }) => ({
      // It will only re-render if the bold or italic state changes
      isBold: editorInstance.isActive('bold'),
      isItalic: editorInstance.isActive('italic'),
    }),
  })

  return (
    <>
      <EditorContent editor={editor} />
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editorState.isBold ? 'primary' : ''}
      >
        Bold
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editorState.isItalic ? 'primary' : ''}
      >
        Italic
      </button>
    </>
  )
}
```

The `selector` function allows you to specify which parts of the editor state you want to subscribe to. By default this will be deeply compared with the previous selected state, and only re-render if it has changed. You can select any part of the editor state, or even derive new values from it.

### Gain more control over rendering

As of Tiptap v2.5.0, you can gain more control over rendering by using the `immediatelyRender` and `shouldRerenderOnTransaction` options. This can be useful if you want to prevent the editor from rendering immediately or on every transaction.

```
import { useEditor } from '@tiptap/react'

function Component() {
  const editor = useEditor({
    extensions,
    content,
    /**
     * This option gives us the control to enable the default behavior of rendering the editor immediately.
     */
    immediatelyRender: true,
    /**
     * This option gives us the control to disable the default behavior of re-rendering the editor on every transaction.
     */
    shouldRerenderOnTransaction: false,
  })

  return <EditorContent editor={editor} />
}
```

## React node views performance

Node views allow you to render custom components in place of nodes within the editor. This enables you to embed any kind of content in your editor. However, when using React components, be aware of potential performance implications.

For technical reasons, node views are expected to be rendered synchronously. Tiptap will create new elements for each node view and mount your React component in them. This can be expensive, especially if you have many instances of node views throughout your editor.

We've optimized as much as possible on our side, but if you find that rendering node views is causing performance issues, consider using plain HTML elements or a different approach to render your content within your node view.

---

## Integrate Tiptap into your React app

### New: React Composable API

Tiptap now offers a declarative `<Tiptap>` component with automatic context management and built-in subcomponents. Perfect for complex UIs with multiple child components.

To start using Tiptap, create a new component. Let's call it `Tiptap` and add the following code in `src/Tiptap.tsx`:

```
// src/Tiptap.tsx
import { useEditor, EditorContent } from '@tiptap/react'
import { FloatingMenu, BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'

const Tiptap = () => {
  const editor = useEditor({
    extensions: [StarterKit], // define your extension array
    content: '<p>Hello World!</p>', // initial content
  })

  return (
    <>
      <EditorContent editor={editor} />
      <FloatingMenu editor={editor}>This is the floating menu</FloatingMenu>
      <BubbleMenu editor={editor}>This is the bubble menu</BubbleMenu>
    </>
  )
}

export default Tiptap
```

### Add it to your app

Finally, replace the content of `src/App.tsx` with our new `Tiptap` component.

```
import Tiptap from './Tiptap'

const App = () => {
  return (
    <div className="card">
      <Tiptap />
    </div>
  )
}

export default App
```

## Using the EditorContext

Tiptap provides a React context called `EditorContext`, that allows you to access the editor instance and its state from anywhere in your component tree. This is particularly useful for building custom toolbars, menus, or other components that need to interact with the editor.

```
// src/Tiptap.tsx
import { useEditor, EditorContent, EditorContext } from '@tiptap/react'
import { FloatingMenu, BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { useMemo } from 'react'

const Tiptap = () => {
  const editor = useEditor({
    extensions: [StarterKit], // define your extension array
    content: '<p>Hello World!</p>', // initial content
  })

  // Memoize the provider value to avoid unnecessary re-renders
  const providerValue = useMemo(() => ({ editor }), [editor])

  return (
    <EditorContext.Provider value={providerValue}>
      <EditorContent editor={editor} />
      <FloatingMenu editor={editor}>This is the floating menu</FloatingMenu>
      <BubbleMenu editor={editor}>This is the bubble menu</BubbleMenu>
    </EditorContext.Provider>
  )
}

export default Tiptap
```

### Consume the Editor context in child components

If you use the `EditorProvider` to set up your Tiptap editor, you can now access your editor instance from any child component using the `useCurrentEditor` hook.

```
import { useCurrentEditor } from '@tiptap/react'

const EditorJSONPreview = () => {
  const { editor } = useCurrentEditor()

  return <pre>{JSON.stringify(editor.getJSON(), null, 2)}</pre>
}
```

**Important**: This won't work if you use the `useEditor` hook to setup your editor.

You should now see a pretty barebones example of Tiptap in your browser.

## Reacting to Editor state changes

To react to editor state changes, you can use the `useEditorState` hook from `@tiptap/react`. This hook can be used to fetch information from the editor state without causing re-renders on the editor component or it's children.

```
import { useEditorState } from '@tiptap/react'

function MyEditorComponent() {
  // ... your editor setup code

  const editorState = useEditorState({
    editor,

    // the selector function is used to select the state you want to react to
    selector: ({ editor }) => {
      if (!editor) return null;

      return {
        isEditable: editor.isEditable,
        currentSelection: editor.state.selection,
        currentContent: editor.getJSON(),
        // you can add more state properties here e.g.:
        // isBold: editor.isActive('bold'),
        // isItalic: editor.isActive('italic'),
      };
    },
  });
}
```

## Use SSR with React and Tiptap

Tiptap can be used with server-side rendering (SSR) in React applications. However, to ensure that the editor is only initialized on the client side, you need to use the `immediatelyRender` option when creating the editor instance to prevent it from rendering on the server.

Here is an example of how to set up Tiptap with SSR in a React component:

```
'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

export function MyEditor() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Hello World!</p>',
    // Disable immediate rendering to prevent SSR issues
    immediatelyRender: false,
  })

  if (!editor) {
    return null // Prevent rendering until the editor is initialized
  }

  return <EditorContent editor={editor} />
}
```

## Optimize your performance

We recommend visiting the [React Performance Guide] to integrate the Tiptap Editor efficiently. This will help you avoid potential issues as your app scales.

## Alternative: Composable React API

Tiptap also provides a declarative `<Tiptap>` component that simplifies editor setup with automatic context management and built-in subcomponents. This composable API is ideal for complex UIs with many child components. Learn more in the [React Composable API guide].