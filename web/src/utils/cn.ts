import clsx, { type ClassValue } from "clsx";

/**
 * Utility for constructing class names.
 * Wraps clsx for ergonomic conditional class composition.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
