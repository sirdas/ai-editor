---
name: codebase-description
description: Describes the goals and means of this codebase
---

## Main goal
Main goal of ai-editor: a collaborative text editor that is powered by Claude's LLM to make suggestions/edits for better coherence and cohesion, auto-translating different languages to the main language, etc. to empower author(s) writing a document.

## Notable dependencies
Framework: TanStack Start
Data management: TanStack Query
Deployment tool: nitro
Text editor library: tiptap
Editor collaboration library: yjs
Design libraries: tailwind, shadcn
Database (if necessary): Postgres

## Product requirements
We want to make a standard looking text editor (similar to Google Docs) making full use of standard tiptap APIs/UIs if possible.

Claude should be an "author" like other real human users. Users can add comments (similar to comments in Google Docs) in parts of the text, giving feedback other users or Claude about the relevant text. Claude can answer comments directed towards it, and also make changes to the text if actionable steps are found.

Users should be able to highlight text to make Claude perform actions such as auto-translate, or make more coherent, cohesive, and consistent with the rest of the text (in content or writing style). Another highlight should allow users to reorganize parts or the whole text.

Claude will review changes as they come in, and add comments if needed. There should also be a manual "Request  Review from Claude" button

There should be an option to add instructions for Claude for the document, so it has the necessary context and instructions to make good editorial decisions.

Should be able to create multiple documents (flat file structure) and switch between them.

## Non-goals for the current MVP phase
1. No user auth (each browser tab is a user)