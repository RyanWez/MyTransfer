import { EventEmitter } from "events";

const globalForEvents = globalThis as unknown as { sse?: EventEmitter };
export const sse = globalForEvents.sse ?? new EventEmitter();
sse.setMaxListeners(0);
globalForEvents.sse = sse;
