import { formatDate } from "./utils/format-date.js";
import { parse } from "../shared/parser";

export function show(value: string) {
  return formatDate(parse(value));
}
