/**
 * Reads a position an administrator typed to move an item in a list of `count`
 * items: a whole number from 1 to `count`. Anything else is refused with the
 * message to show beside the input.
 */
export function readTargetPosition(text: string, count: number): { position: number } | { error: string } {
  const value = text.trim()
  const position = Number(value)
  return /^\d+$/.test(value) && position >= 1 && position <= count
    ? { position }
    : { error: `Enter a whole number from 1 to ${count}.` }
}
