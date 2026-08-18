"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AnswerInputProps = {
  onSubmit: (content: string) => void;
  disabled?: boolean;
};

export function AnswerInput({ onSubmit, disabled = false }: AnswerInputProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 bg-surface-sunken p-3">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Ta réponse…"
        aria-label="Ta réponse au coach"
        disabled={disabled}
        autoComplete="off"
        maxLength={2000}
        className="rounded-full"
      />
      <Button
        type="submit"
        aria-label="Envoyer ma réponse"
        disabled={disabled || value.trim().length === 0}
        className="size-12 shrink-0 px-0"
      >
        <ArrowUp aria-hidden="true" className="size-5" />
      </Button>
    </form>
  );
}
