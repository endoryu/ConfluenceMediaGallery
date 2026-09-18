export async function load(url: string): Promise<unknown> {
  const res = await fetch(url);
  return res.json();
}
