import { eq, sql } from 'drizzle-orm';
import * as schema from '@sagan/db';
import { db } from '../db.js';

export type ConvertResult = { newKind: 'todo' | 'experiment'; newId: string };

// Soft-pointer conversion. The old entity stays in place with status set to
// `archived` and convertedToKind/convertedToId pointing at the new entity, so
// history (agent runs, comments, audit events) keeps working against the old
// id. The new entity is the canonical surface from this point forward.

export async function convertTodoToExperiment(todoId: string): Promise<ConvertResult | null> {
  const rows = await db()
    .select()
    .from(schema.todos)
    .where(eq(schema.todos.id, todoId))
    .limit(1);
  const todo = rows[0];
  if (!todo) return null;
  if (todo.convertedToKind === 'experiment' && todo.convertedToId) {
    return { newKind: 'experiment', newId: todo.convertedToId };
  }
  if (todo.convertedToId) {
    // Pointed somewhere else already; refuse to double-convert.
    return null;
  }

  const projectId =
    todo.linkedKind === 'project' && todo.linkedId ? todo.linkedId : null;

  const inserted = await db()
    .insert(schema.experiments)
    .values({
      title: todo.text,
      body: todo.bodyMd ?? null,
      status: 'planning',
      kind: 'experiment',
      priority: todo.priority,
      projectId,
      createdAt: todo.createdAt,
    })
    .returning({ id: schema.experiments.id });

  const newId = inserted[0]!.id;

  await db()
    .update(schema.todos)
    .set({
      status: 'archived',
      convertedToKind: 'experiment',
      convertedToId: newId,
      updatedAt: new Date(),
    })
    .where(eq(schema.todos.id, todoId));

  return { newKind: 'experiment', newId };
}

export async function convertExperimentToTodo(experimentId: string): Promise<ConvertResult | null> {
  const rows = await db()
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.id, experimentId))
    .limit(1);
  const exp = rows[0];
  if (!exp) return null;
  if (exp.convertedToKind === 'todo' && exp.convertedToId) {
    return { newKind: 'todo', newId: exp.convertedToId };
  }
  if (exp.convertedToId) return null;

  // Experiments with child experiments or attached runs cannot safely
  // become todos. Bail and let the caller fall back.
  const children = await db()
    .select({ id: schema.experiments.id })
    .from(schema.experiments)
    .where(eq(schema.experiments.parentExperimentId, experimentId))
    .limit(1);
  if (children.length > 0) return null;

  const runs = await db()
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(eq(schema.runs.experimentId, experimentId))
    .limit(1);
  if (runs.length > 0) return null;

  const linkedKind = exp.projectId ? 'project' : null;
  const linkedId = exp.projectId ?? null;

  const inserted = await db()
    .insert(schema.todos)
    .values({
      text: exp.title,
      bodyMd: exp.body ?? null,
      status: 'planning',
      priority: exp.priority,
      linkedKind,
      linkedId,
      createdAt: exp.createdAt,
    })
    .returning({ id: schema.todos.id });

  const newId = inserted[0]!.id;

  await db()
    .update(schema.experiments)
    .set({
      status: 'archived',
      convertedToKind: 'todo',
      convertedToId: newId,
      updatedAt: new Date(),
    })
    .where(eq(schema.experiments.id, experimentId));

  return { newKind: 'todo', newId };
}

export async function loadEntityTitle(
  kind: 'todo' | 'experiment',
  id: string,
): Promise<string | null> {
  if (kind === 'todo') {
    const rows = await db()
      .select({ text: schema.todos.text })
      .from(schema.todos)
      .where(eq(schema.todos.id, id))
      .limit(1);
    return rows[0]?.text ?? null;
  }
  const rows = await db()
    .select({ title: schema.experiments.title })
    .from(schema.experiments)
    .where(eq(schema.experiments.id, id))
    .limit(1);
  return rows[0]?.title ?? null;
}

// Suppress unused-import warning for `sql` if the file shrinks later.
void sql;
