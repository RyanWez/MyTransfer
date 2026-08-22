import { EventEmitter } from "events";

const globalForEvents = globalThis as unknown as { sse: EventEmitter };
export const sse = globalForEvents.sse || new EventEmitter();
if (process.env.NODE_ENV !== "production") globalForEvents.sse = sse;
