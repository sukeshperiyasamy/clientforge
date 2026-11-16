export function zonedToIso(local: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error("Choose a valid date and time.");
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const target = local.replace("T", " ");
  const base = Date.parse(local + "Z");
  const matches: number[] = [];
  for (let minutes = -16 * 60; minutes <= 16 * 60; minutes += 15) {
    const t = base + minutes * 60000;
    const parts = Object.fromEntries(
      fmt.formatToParts(t).map((p) => [p.type, p.value]),
    );
    if (
      `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` ===
      target
    )
      matches.push(t);
  }
  if (!matches.length)
    throw new Error(
      "That local time does not exist in this timezone. Choose another time.",
    );
  if (matches.length > 1)
    throw new Error(
      "That time occurs twice when daylight saving ends. Choose an unambiguous time.",
    );
  return new Date(matches[0]).toISOString();
}
export function nextRuleRun(
  rule: { weekdays: number[]; localTime: string; timezone: string },
  after = new Date(),
): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: rule.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(after)
      .map((p) => [p.type, p.value]),
  );
  const first = Date.parse(
    `${parts.year}-${parts.month}-${parts.day}T12:00:00Z`,
  );
  for (let day = 0; day < 15; day++) {
    const candidate = new Date(first + day * 86400000);
    if (!rule.weekdays.includes(candidate.getUTCDay())) continue;
    try {
      const iso = zonedToIso(
        `${candidate.toISOString().slice(0, 10)}T${rule.localTime}`,
        rule.timezone,
      );
      if (Date.parse(iso) > after.getTime()) return iso;
    } catch {}
  }
  throw new Error("Could not find a valid run time in the next two weeks.");
}
