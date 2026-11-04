const dateTimeFormatter = (timeZone) => new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function partsAt(instant, timeZone) {
  const parts = Object.fromEntries(dateTimeFormatter(timeZone).formatToParts(instant).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function utcToLocalInput(instant, timeZone) {
  return partsAt(new Date(instant), timeZone);
}

export function localInputToUtc(value, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid date and time.");
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desired;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const displayed = partsAt(new Date(candidate), timeZone);
    const displayedAsUtc = Date.parse(`${displayed}:00Z`);
    candidate += desired - displayedAsUtc;
  }

  if (partsAt(new Date(candidate), timeZone) !== value) {
    throw new Error("That local time does not exist because of a daylight-saving clock change.");
  }

  const alternatives = [-60, -30, 30, 60].some((minutes) => {
    const other = candidate + minutes * 60_000;
    return partsAt(new Date(other), timeZone) === value;
  });
  if (alternatives) throw new Error("That local time occurs twice because of a daylight-saving clock change. Choose another time.");

  return new Date(candidate).toISOString();
}
