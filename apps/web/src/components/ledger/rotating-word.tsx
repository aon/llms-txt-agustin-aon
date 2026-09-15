"use client";

import { useEffect, useState } from "react";

const REST_MS = 3200;
const ERASE_MS = 60;
const KEY_MS = 110;

type Phase = "rest" | "erase" | "type";

/** A headline word that is erased and retyped, letter by letter, inside a fixed-width slot. */
export function RotatingWord({
  words,
  paused = false,
}: {
  words: string[];
  paused?: boolean;
}) {
  const reduced = useReducedMotion();
  const active = !paused && !reduced;
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("rest");
  const [text, setText] = useState(words[0] ?? "");
  const target = words[index] ?? "";
  const slot = Math.max(...words.map((w) => w.length));

  useEffect(() => {
    if (reduced) {
      setText(target);
      return;
    }
    if (phase === "rest") {
      if (!active) return;
      const id = setTimeout(() => {
        setIndex((i) => (i + 1) % words.length);
        setPhase("erase");
      }, REST_MS);
      return () => clearTimeout(id);
    }
    if (phase === "erase") {
      if (text.length === 0) {
        setPhase("type");
        return;
      }
      const id = setTimeout(() => setText(text.slice(0, -1)), ERASE_MS);
      return () => clearTimeout(id);
    }
    if (phase === "type") {
      if (text.length >= target.length) {
        setPhase("rest");
        return;
      }
      const id = setTimeout(
        () => setText(target.slice(0, text.length + 1)),
        KEY_MS + Math.random() * 60,
      );
      return () => clearTimeout(id);
    }
  }, [phase, text, target, reduced, active, words.length]);

  return (
    <span
      className="inline-block whitespace-nowrap text-left align-baseline font-medium font-mono"
      style={{ width: `${slot}ch` }}
    >
      <span className="inline-block rounded-[0.08em] bg-line px-[0.12em]">
        {text}
      </span>
    </span>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}
