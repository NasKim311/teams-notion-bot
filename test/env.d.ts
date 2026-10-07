// cloudflare:test 의 env 타입을 Worker Env와 맞춘다.
import type { Env as WorkerEnv } from "../src/types";

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}
