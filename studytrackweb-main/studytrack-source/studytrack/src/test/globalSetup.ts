// Runs once before the test workers start: a DST-observing zone makes the date tests meaningful.
export function setup() {
  process.env.TZ = 'America/New_York';
}
