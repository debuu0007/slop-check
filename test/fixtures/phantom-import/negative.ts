import { readFile } from "node:fs/promises";
import express from "express";
import "./theme.css";

export async function load(path: string) {
  return express.json(await readFile(path, "utf8"));
}
