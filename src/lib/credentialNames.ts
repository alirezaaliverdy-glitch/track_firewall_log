export function nextAvailableCredentialName(requested: string, existingNames: Iterable<string>) {
  const base = requested.trim();
  const occupied = new Set(Array.from(existingNames, (name) => name.trim().toLocaleLowerCase("en-US")));
  if (!occupied.has(base.toLocaleLowerCase("en-US"))) return base;
  let suffix = 2;
  while (occupied.has(`${base}-${suffix}`.toLocaleLowerCase("en-US"))) suffix += 1;
  return `${base}-${suffix}`;
}
