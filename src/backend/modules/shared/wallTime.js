/*
 * Wall-clock time ↔ real instants in an IANA time zone, with Intl. rrule and
 * other "floating" dates keep wall time as UTC; these convert both ways.
 * Shared by Calendar (recurrence) and Tasks (recurring templates).
 */

const formatters = new Map();
function partsIn(date, tz) {
  if (!formatters.has(tz)) {
    formatters.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  }
  const parts = Object.fromEntries(formatters.get(tz).formatToParts(date).map((part) => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
}

/** Real instant → the same wall-clock time expressed as a UTC date. */
export function toWall(date, tz) {
  return new Date(partsIn(date, tz));
}

/** Wall-clock time (as a UTC date) in `tz` → real instant. */
export function fromWall(wall, tz) {
  const guess = wall.getTime();
  const offset = partsIn(new Date(guess), tz) - guess;
  let result = guess - offset;
  const corrected = partsIn(new Date(result), tz) - result;
  if (corrected !== offset) result = guess - corrected;
  return new Date(result);
}
