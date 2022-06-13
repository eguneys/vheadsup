import { createSignal } from 'solid-js'
import { Vec2 } from 'soli2d'

export function loop_for(duration: number, fn: (dt: number, dt0: number, i: number) => void) {
  let _elapsed = 0
  return loop((dt, dt0) => {
    _elapsed += dt

    let i = Math.min(1, _elapsed / duration)

    fn(dt, dt0, i)

    if (i === 1) {
      return true
    }
  })
}

export function loop(fn: (dt: number, dt0: number) => true | undefined) {
  let animation_frame_id
  let fixed_dt = 1000/60
  let timestamp0: number | undefined,
  min_dt = fixed_dt,
    max_dt = fixed_dt * 2,
    dt0 = fixed_dt

  let elapsed = 0

  function step(timestamp: number) {
    let dt = timestamp0 ? timestamp - timestamp0 : fixed_dt

    dt = Math.min(max_dt, Math.max(min_dt, dt))

    if (fn(dt, dt0)) {
      return
    }

    dt0 = dt
    timestamp0 = timestamp
    animation_frame_id = requestAnimationFrame(step)
  }
  animation_frame_id = requestAnimationFrame(step)

  return () => {
    cancelAnimationFrame(animation_frame_id)
  }
}

export function owrite(signal, fn) {
  if (typeof fn === 'function') {
    return signal[1](fn)
  } else {
    signal[1](_ => fn)
  }
}

export function write(signal, fn) {
  return signal[1](_ => {
    fn(_)
    return _
  })
}

export function read(signal) {
  if (Array.isArray(signal)) {
    return signal[0]()
  } else {
    return signal()
  }
}



export class DragDecay {
  static make = (drag: MouseDrag, orig: Vec2, target: any, no_start: boolean = false) => {
    return new DragDecay(drag, orig, target, no_start)
  }


  get move() {
    return Vec2.make(...this.drag.move).add(this.decay)
  }

  get translate() {
    return Vec2.make(...this.drag.move).sub(this.start)
  }

  get drop() {
    return this.drag.drop
  }


  constructor(readonly drag: MouseDrag,
              readonly orig: Vec2, 
              readonly target: any,
              readonly no_start: boolean) {
                this.start = Vec2.make(...(no_start ? drag.move : drag.start))
                this.decay = orig.sub(this.start)
              }
}
