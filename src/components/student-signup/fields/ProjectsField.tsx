// P7 — academic/science projects (multi-add). Each entry = a strict ref category
// + a free-text title + description. Stored into student_project_categories
// (project_category_id, detail); the table carries a single `detail`, so title +
// description are combined there at finalize.
import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Field, inputClass } from "@/components/site/AuthShell";
import { Button } from "@/components/ui/button";
import { RefMultiSelect } from "@/components/signup/RefMultiSelect";
import { Caption, FieldError } from "@/components/signup/Labeled";
import type { ProjectDraft, RefItem } from "../types";

interface ProjectsFieldProps {
  value: ProjectDraft[];
  onChange: (projects: ProjectDraft[]) => void;
}

export function ProjectsField({ value, onChange }: ProjectsFieldProps) {
  const [category, setCategory] = useState<RefItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addProject = () => {
    if (category.length === 0) {
      setError("Pick a project category.");
      return;
    }
    if (!title.trim()) {
      setError("Give your project a title.");
      return;
    }
    onChange([
      ...value,
      { category: category[0], title: title.trim(), description: description.trim() },
    ]);
    setCategory([]);
    setTitle("");
    setDescription("");
    setError(null);
  };

  const removeAt = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((p, idx) => (
            <li
              key={`${p.category.id ?? p.category.name}:${p.title}:${idx}`}
              className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  {p.category.name}
                  {p.category.id === null && " · requested"}
                  {p.description ? ` — ${p.description}` : ""}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove project ${p.title}`}
                onClick={() => removeAt(idx)}
                className="shrink-0 rounded-full p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-2xl border border-dashed border-border bg-brand-cream/40 p-4">
        <Caption label="Project category">
          <RefMultiSelect
            kind="project_category"
            value={category}
            onChange={setCategory}
            max={1}
            closeOnSelect
            ariaLabel="Project category"
            placeholder="e.g. Robotics, Biology research…"
          />
        </Caption>
        <div className="mt-3">
          <Field label="Title">
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Solar-powered weather station"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Description (optional)">
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A sentence or two about what you built or researched."
            />
          </Field>
        </div>
        <FieldError>{error}</FieldError>
        <Button type="button" variant="outline" onClick={addProject} className="mt-3 rounded-full">
          <Plus className="h-4 w-4" /> Add project
        </Button>
      </div>
    </div>
  );
}
