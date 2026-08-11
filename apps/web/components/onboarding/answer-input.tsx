"use client";

import { useState, type FormEvent } from "react";

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
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-neutral-200 bg-neutral-50 p-3">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Ta réponse…"
        aria-label="Ta réponse au coach"
        disabled={disabled}
        autoComplete="off"
        maxLength={2000}
      />
      <Button type="submit" disabled={disabled || value.trim().length === 0}>
        Envoyer
      </Button>
    </form>
  );
}
