'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  GripVertical,
  Layers,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { supabase, Task, TaskPriority, TaskStatus } from '@/lib/supabase';

const COLUMNS: { id: TaskStatus; label: string; dotColor: string }[] = [
  { id: 'todo', label: 'To Do', dotColor: 'bg-slate-400' },
  { id: 'in_progress', label: 'In Progress', dotColor: 'bg-amber-400' },
  { id: 'in_review', label: 'In Review', dotColor: 'bg-sky-400' },
  { id: 'done', label: 'Done', dotColor: 'bg-emerald-400' },
];

const PRIORITY_STYLES: Record<TaskPriority, { label: string; classes: string }> = {
  high: {
    label: 'High',
    classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  },
  normal: {
    label: 'Normal',
    classes: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  },
  low: {
    label: 'Low',
    classes: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  },
};

function getDueState(dueDate: string | null, status: TaskStatus) {
  if (!dueDate || status === 'done') return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [year, month, day] = dueDate.split('-').map(Number);
  const target = new Date(year, (month || 1) - 1, day || 1);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: `Overdue (${Math.abs(diffDays)}d)`,
      classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      isOverdue: true,
    };
  }
  if (diffDays === 0) {
    return {
      label: 'Due today',
      classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      isOverdue: false,
    };
  }
  if (diffDays <= 2) {
    return {
      label: `Due in ${diffDays}d`,
      classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      isOverdue: false,
    };
  }
  return {
    label: dueDate,
    classes: 'bg-zinc-800/90 text-zinc-400 border-zinc-700/70',
    isOverdue: false,
  };
}

export default function TaskBoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');

  // Drag state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  // New task modal/drawer state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function initSessionAndTasks() {
      setLoading(true);
      setErrorMsg(null);

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        let currentUserId = sessionData.session?.user?.id ?? null;

        if (!currentUserId) {
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError) throw anonError;
          currentUserId = anonData.user?.id ?? null;
        }

        if (!currentUserId) {
          throw new Error('Could not establish a guest session. Confirm Anonymous Sign-Ins is enabled in Supabase Auth.');
        }

        if (active) setUserId(currentUserId);

        const { data: taskRows, error: tasksError } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false });

        if (tasksError) throw tasksError;

        if (active) {
          setTasks((taskRows as Task[]) ?? []);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load workspace.';
        if (active) setErrorMsg(message);
      } finally {
        if (active) setLoading(false);
      }
    }

    initSessionAndTasks();

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'done').length;
    const overdue = tasks.filter((t) => getDueState(t.due_date, t.status)?.isOverdue).length;
    return { total, completed, overdue };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
      const matchesQuery =
        !q ||
        task.title.toLowerCase().includes(q) ||
        (task.description ?? '').toLowerCase().includes(q);
      return matchesPriority && matchesQuery;
    });
  }, [tasks, searchQuery, priorityFilter]);

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !userId) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        due_date: dueDate || null,
        user_id: userId,
      };

      const { data, error } = await supabase
        .from('tasks')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      setTasks((prev) => [data as Task, ...prev]);
      setTitle('');
      setDescription('');
      setStatus('todo');
      setPriority('normal');
      setDueDate('');
      setIsModalOpen(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Unable to create task.';
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMoveTask(taskId: string, newStatus: TaskStatus) {
    const existing = tasks.find((t) => t.id === taskId);
    if (!existing || existing.status === newStatus) return;

    const previousTasks = tasks;
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    setErrorMsg(null);

    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', taskId);

    if (error) {
      setTasks(previousTasks);
      setErrorMsg(`Failed to move task: ${error.message}`);
    }
  }

  async function handleDeleteTask(taskId: string) {
    const previousTasks = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setErrorMsg(null);

    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) {
      setTasks(previousTasks);
      setErrorMsg(`Failed to delete task: ${error.message}`);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/15 text-indigo-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-zinc-50">
                PulseBoard
              </h1>
              <p className="text-xs text-zinc-400">
                {userId ? `Guest Session · ${userId.slice(0, 8)}…` : 'Connecting guest session…'}
              </p>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
              <span className="text-zinc-400">Total: </span>
              <span className="font-semibold text-zinc-100">{stats.total}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-200/80">Done:</span>
              <span className="font-semibold text-emerald-300">{stats.completed}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-rose-200/80">Overdue:</span>
              <span className="font-semibold text-rose-300">{stats.overdue}</span>
            </div>
          </div>

          <button
            onClick={() => {
              setStatus('todo');
              setIsModalOpen(true);
            }}
            disabled={!userId || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-zinc-900 px-6 py-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks by title or notes..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/90 py-1.5 pr-3 pl-9 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {(['all', 'high', 'normal', 'low'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setPriorityFilter(level)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition ${
                  priorityFilter === level
                    ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-200'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                {level === 'all' ? 'All Priorities' : level}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {errorMsg && (
        <div className="mx-auto mt-4 max-w-7xl px-6">
          <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-300 hover:text-white"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Board */}
      <main className="mx-auto max-w-7xl px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {COLUMNS.map((col) => (
              <div
                key={col.id}
                className="h-80 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {COLUMNS.map((col) => {
              const columnTasks = filteredTasks.filter((t) => t.status === col.id);
              const isDropTarget = dragOverColumn === col.id;

              return (
                <section
                  key={col.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverColumn !== col.id) setDragOverColumn(col.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverColumn === col.id) setDragOverColumn(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const droppedId = e.dataTransfer.getData('text/plain') || draggedTaskId;
                    setDragOverColumn(null);
                    setDraggedTaskId(null);
                    if (droppedId) {
                      handleMoveTask(droppedId, col.id);
                    }
                  }}
                  className={`flex min-h-[460px] flex-col rounded-xl border p-3 transition ${
                    isDropTarget
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-zinc-800/80 bg-zinc-900/45'
                  }`}
                >
                  {/* Column Header */}
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${col.dotColor}`} />
                      <h2 className="text-sm font-medium text-zinc-200">{col.label}</h2>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                        {columnTasks.length}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setStatus(col.id);
                        setIsModalOpen(true);
                      }}
                      className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                      title={`Add task to ${col.label}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Task Cards */}
                  <div className="flex flex-1 flex-col gap-2.5">
                    {columnTasks.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800/90 p-6 text-center">
                        <p className="text-xs font-medium text-zinc-400">No tasks here</p>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          Drag a card in or click + to add one.
                        </p>
                      </div>
                    ) : (
                      columnTasks.map((task) => {
                        const due = getDueState(task.due_date, task.status);
                        const priorityBadge = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.normal;

                        return (
                          <article
                            key={task.id}
                            draggable
                            onDragStart={(e) => {
                              setDraggedTaskId(task.id);
                              e.dataTransfer.setData('text/plain', task.id);
                            }}
                            onDragEnd={() => {
                              setDraggedTaskId(null);
                              setDragOverColumn(null);
                            }}
                            className={`group cursor-grab rounded-lg border border-zinc-800 bg-zinc-900 p-3.5 shadow-sm transition hover:border-zinc-700 active:cursor-grabbing ${
                              draggedTaskId === task.id ? 'opacity-50' : 'opacity-100'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2">
                                <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-zinc-400" />
                                <h3 className="text-sm font-medium leading-snug text-zinc-100">
                                  {task.title}
                                </h3>
                              </div>
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="rounded p-1 text-zinc-500 opacity-0 transition hover:bg-rose-500/15 hover:text-rose-300 group-hover:opacity-100"
                                title="Delete task"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {task.description && (
                              <p className="mt-2 pl-6 text-xs leading-relaxed text-zinc-400">
                                {task.description}
                              </p>
                            )}

                            <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-6">
                              <span
                                className={`rounded border px-2 py-0.5 text-[11px] font-medium ${priorityBadge.classes}`}
                              >
                                {priorityBadge.label}
                              </span>

                              {due && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${due.classes}`}
                                >
                                  <Calendar className="h-3 w-3" />
                                  {due.label}
                                </span>
                              )}
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-100">Create Task</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Wire up RLS policy test"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional details or acceptance notes..."
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    Column
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
                  >
                    {COLUMNS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-zinc-700 px-3.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !title.trim()}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}