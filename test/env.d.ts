// cloudflare:test 의 env 타입을 Worker Env와 맞춘다.
declare global {
  namespace Cloudflare {
    interface Env extends import("../src/types").Env {}
  }
}

export {};
