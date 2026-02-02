"use client";

import { useMemo, useState } from "react";

type RoleAssignment = { id: string; role: string; assignee: string };
type TimelineStep = { id: string; title: string; date: string };
type ReviewNote = { id: string; author: string; note: string; createdAt: string };

type PlanWorkflowProps = {
  roles: RoleAssignment[];
  timeline: TimelineStep[];
  notes: ReviewNote[];
  shareSlug: string;
};

export function PlanWorkflow({ roles, timeline, notes, shareSlug }: PlanWorkflowProps) {
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>(roles);
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>(timeline);
  const [reviewNotes, setReviewNotes] = useState<ReviewNote[]>(notes);
  const [newNote, setNewNote] = useState("");
  const [shareLink, setShareLink] = useState<string | null>(`/s/${shareSlug}`);

  const moveStep = (index: number, direction: "up" | "down") => {
    setTimelineSteps((prev) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const updated = [...prev];
      const [removed] = updated.splice(index, 1);
      updated.splice(targetIndex, 0, removed);
      return updated;
    });
  };

  const addRoleAssignment = () => {
    setRoleAssignments((prev) => [
      ...prev,
      {
        id: `role-${prev.length + 1}`,
        role: "Partner",
        assignee: "New teammate"
      }
    ]);
  };

  const addTimelineStep = () => {
    setTimelineSteps((prev) => [
      ...prev,
      {
        id: `step-${prev.length + 1}`,
        title: "New step",
        date: "2025-02-10"
      }
    ]);
  };

  const appendReviewNote = () => {
    if (!newNote.trim()) return;
    const now = new Date();
    setReviewNotes((prev) => [
      ...prev,
      {
        id: `note-${prev.length + 1}`,
        author: "You",
        note: newNote,
        createdAt: now.toISOString().slice(0, 10)
      }
    ]);
    setNewNote("");
  };

  const shareText = useMemo(() => {
    if (!shareLink) return "Create a share link for collaboration.";
    return `Active share link: ${shareLink}`;
  }, [shareLink]);

  const generateShareLink = () => {
    const slug = `plan-${Math.random().toString(36).slice(2, 8)}`;
    setShareLink(`/s/${slug}`);
  };

  return (
    <div className="space-y-8">
      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label">Role assignments</p>
            <p className="text-sm text-slate-600">Assign responsibilities without pressure.</p>
          </div>
          <button type="button" className="button-secondary" onClick={addRoleAssignment}>
            Add role
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {roleAssignments.map((role) => (
            <div key={role.id} className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">{role.role}</p>
              <p className="text-sm text-slate-600">{role.assignee}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label">Timeline steps</p>
            <p className="text-sm text-slate-600">Reorder milestones to reflect new priorities.</p>
          </div>
          <button type="button" className="button-secondary" onClick={addTimelineStep}>
            Add step
          </button>
        </div>
        <div className="space-y-3">
          {timelineSteps.map((step, index) => (
            <div key={step.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                <p className="text-sm text-slate-600">{step.date}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => moveStep(index, "up")}
                  aria-label="Move step up"
                >
                  Move up
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => moveStep(index, "down")}
                  aria-label="Move step down"
                >
                  Move down
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-4">
        <div>
          <p className="label">Review notes</p>
          <p className="text-sm text-slate-600">
            Notes are append-only so the team can see the full context.
          </p>
        </div>
        <div className="space-y-3">
          {reviewNotes.length === 0 ? (
            <p className="text-sm text-slate-500">No notes yet. Add the first note below.</p>
          ) : (
            reviewNotes.map((note) => (
              <div key={note.id} className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">
                  {note.author} • {note.createdAt}
                </p>
                <p className="text-sm text-slate-800">{note.note}</p>
              </div>
            ))
          )}
        </div>
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            className="input"
            placeholder="Add a supportive note..."
            value={newNote}
            onChange={(event) => setNewNote(event.target.value)}
          />
          <button type="button" className="button" onClick={appendReviewNote}>
            Add note
          </button>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <p className="label">Share link</p>
          <p className="text-sm text-slate-600">{shareText}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="button" onClick={generateShareLink}>
            Generate share link
          </button>
          {shareLink && (
            <a className="button-secondary" href={shareLink}>
              Open share view
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
