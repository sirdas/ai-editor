import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres'
});

// Initialize the database schema
let initPromise: Promise<any> | null = null;
function getInitPromise() {
  if (!initPromise) {
    initPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        "createdAt" BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        "documentId" TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        "authorId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        "createdAt" BIGINT NOT NULL,
        resolved BOOLEAN DEFAULT FALSE,
        type TEXT NOT NULL,
        replies JSONB DEFAULT '[]'::jsonb,
        "selectedText" TEXT
      );
      ALTER TABLE comments ADD COLUMN IF NOT EXISTS "selectedText" TEXT;
    `).catch(err => {
        console.error('Failed to create documents table:', err)
        initPromise = null; // Retry on next request if it failed
    });
  }
  return initPromise;
}

export interface DocumentRecord {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

export async function getDocuments(): Promise<DocumentRecord[]> {
  await getInitPromise();
  const result = await pool.query('SELECT id, title, content, "createdAt" as "createdAt" FROM documents ORDER BY "createdAt" DESC');
  return result.rows.map(row => ({
    id: String(row.id),
    title: String(row.title),
    content: row.content ? String(row.content) : '',
    createdAt: Number(row.createdAt)
  }));
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  await getInitPromise();
  const result = await pool.query('SELECT id, title, content, "createdAt" as "createdAt" FROM documents WHERE id = $1', [id]);
  if (result.rows.length === 0) return undefined;
  
  const row = result.rows[0];
  return {
    id: String(row.id),
    title: String(row.title),
    content: row.content ? String(row.content) : '',
    createdAt: Number(row.createdAt)
  };
}

export async function createDocument(id: string, title: string, content: string = ''): Promise<DocumentRecord> {
  await getInitPromise();
  const createdAt = Date.now();
  await pool.query(
    'INSERT INTO documents (id, title, content, "createdAt") VALUES ($1, $2, $3, $4)',
    [id, title, content, createdAt]
  );
  return { id, title, content, createdAt };
}

export async function updateDocument(id: string, title: string, content: string): Promise<DocumentRecord | undefined> {
  await getInitPromise();
  await pool.query(
    'UPDATE documents SET title = $1, content = $2 WHERE id = $3',
    [title, content, id]
  );
  return getDocument(id);
}

export async function deleteDocument(id: string): Promise<void> {
  await getInitPromise();
  await pool.query('DELETE FROM documents WHERE id = $1', [id]);
}

// User functions
export interface UserRecord {
  id: string;
  name: string;
  color: string;
}

export async function getUser(id: string): Promise<UserRecord | undefined> {
  await getInitPromise();
  const result = await pool.query('SELECT id, name, color FROM users WHERE id = $1', [id]);
  if (result.rows.length === 0) return undefined;
  return result.rows[0] as UserRecord;
}

export async function createUser(id: string, name: string, color: string): Promise<UserRecord> {
  await getInitPromise();
  await pool.query('INSERT INTO users (id, name, color) VALUES ($1, $2, $3)', [id, name, color]);
  return { id, name, color };
}

export async function updateUser(id: string, name: string): Promise<UserRecord | undefined> {
  await getInitPromise();
  await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, id]);
  return getUser(id);
}

// Comment functions
export interface CommentReply {
  id: string;
  text: string;
  authorId: string;
  createdAt: number;
  // Denormalized for display — stored directly in JSONB so no join is needed
  authorName?: string;
  authorColor?: string;
}

export interface CommentRecord {
  id: string;
  documentId: string;
  authorId: string;
  text: string;
  createdAt: number;
  resolved: boolean;
  type: "inline" | "document";
  replies: CommentReply[];
  /** For AI-created inline comments: the exact text to annotate, stored so the client can apply the ProseMirror mark */
  selectedText?: string;
  // Joined fields for UI convenience
  authorName?: string;
  authorColor?: string;
}

export async function getComments(documentId: string): Promise<CommentRecord[]> {
  await getInitPromise();
  const result = await pool.query(`
    SELECT c.id, c."documentId", c."authorId", c.text, c."createdAt", c.resolved, c.type, c.replies, c."selectedText",
           u.name as "authorName", u.color as "authorColor"
    FROM comments c
    JOIN users u ON c."authorId" = u.id
    WHERE c."documentId" = $1
    ORDER BY c.resolved ASC, c."createdAt" DESC
  `, [documentId]);
  
  return result.rows.map(row => ({
    id: String(row.id),
    documentId: String(row.documentId),
    authorId: String(row.authorId),
    text: String(row.text),
    createdAt: Number(row.createdAt),
    resolved: Boolean(row.resolved),
    type: row.type as "inline" | "document",
    replies: row.replies || [],
    selectedText: row.selectedText ?? undefined,
    authorName: String(row.authorName),
    authorColor: String(row.authorColor)
  }));
}

export async function createComment(data: Omit<CommentRecord, "authorName" | "authorColor">): Promise<CommentRecord> {
  await getInitPromise();
  await pool.query(`
    INSERT INTO comments (id, "documentId", "authorId", text, "createdAt", resolved, type, replies, "selectedText")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [data.id, data.documentId, data.authorId, data.text, data.createdAt, data.resolved, data.type, JSON.stringify(data.replies), data.selectedText ?? null]);
  
  // Fetch with joined user data to return
  const result = await pool.query(`
    SELECT c.id, c."documentId", c."authorId", c.text, c."createdAt", c.resolved, c.type, c.replies, c."selectedText",
           u.name as "authorName", u.color as "authorColor"
    FROM comments c
    JOIN users u ON c."authorId" = u.id
    WHERE c.id = $1
  `, [data.id]);
  
  const row = result.rows[0];
  return {
    id: String(row.id),
    documentId: String(row.documentId),
    authorId: String(row.authorId),
    text: String(row.text),
    createdAt: Number(row.createdAt),
    resolved: Boolean(row.resolved),
    type: row.type as "inline" | "document",
    replies: row.replies || [],
    selectedText: row.selectedText ?? undefined,
    authorName: String(row.authorName),
    authorColor: String(row.authorColor)
  };
}

export async function updateComment(id: string, updates: Partial<Pick<CommentRecord, "text" | "resolved" | "replies">>): Promise<void> {
  await getInitPromise();
  
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.text !== undefined) {
    setClauses.push(`text = $${paramIndex++}`);
    values.push(updates.text);
  }
  if (updates.resolved !== undefined) {
    setClauses.push(`resolved = $${paramIndex++}`);
    values.push(updates.resolved);
  }
  if (updates.replies !== undefined) {
    setClauses.push(`replies = $${paramIndex++}`);
    values.push(JSON.stringify(updates.replies));
  }

  if (setClauses.length === 0) return;

  values.push(id);
  const query = `UPDATE comments SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`;
  await pool.query(query, values);
}

export async function deleteComment(id: string): Promise<void> {
  await getInitPromise();
  await pool.query('DELETE FROM comments WHERE id = $1', [id]);
}
