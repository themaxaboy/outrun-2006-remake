// Small generic object pool (avoids GC churn for per-chunk / per-frame objects)
export class Pool {
  constructor(factory, reset) {
    this.factory = factory
    this.reset = reset
    this.free = []
    this.created = 0
  }
  acquire() {
    const o = this.free.pop() ?? (this.created++, this.factory())
    return o
  }
  release(o) {
    if (this.reset) this.reset(o)
    this.free.push(o)
  }
}
