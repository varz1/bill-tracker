/** A short fingerprint of some text (the first 128 bits of its SHA-256), for telling "changed" from "same". */
export async function fingerprint(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
