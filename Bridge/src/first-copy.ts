// Pi can load a Wilco extension twice in one session: once from Wilco Host's copy and once from
// the npm package (@matrixreligio/wilco), which carries both extensions. Only the first copy
// runs. Each copy asks over Pi's event bus whether one is already there; a copy that is gone
// (after a reload or a session switch) no longer answers, because Pi drops its listeners.

type Bus = { on(topic: string, handler: (data: any) => void): unknown; emit(topic: string, data: unknown): void };

/** Whether this is the first copy of extension `name` in this Pi; it answers later copies. */
export function firstCopy(name: string, events: Bus | undefined): boolean {
  if (!events) return true;
  const topic = `wilco:${name}:loaded`;
  let answered = false;
  events.emit(topic, () => { answered = true; });
  if (answered) return false;
  events.on(topic, (answer: () => void) => answer());
  return true;
}
