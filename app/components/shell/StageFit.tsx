"use client";
import { useEffect } from "react";
import { initStage } from "@/lib/stage";

// Runs the v8 fitStage sizing mechanism (see lib/stage.ts).
export function StageFit() {
  useEffect(() => initStage(), []);
  return null;
}
