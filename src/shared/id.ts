// ULID: 10 chars of millisecond timestamp + 16 chars of randomness, Crockford base32.
// Lexicographic order == creation order, which keeps KV key listings sorted by time.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newId(now: number = Date.now()): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let random = "";
  for (const b of bytes) random += ALPHABET[b % 32];
  return time + random;
}
