import { on, createEffect, createSignal, createMemo } from 'solid-js'
import { read, write, owrite } from './play'
import Mouse from './mouse'
import { loop, DragDecay } from './play'

export function make_sticky_pos<Item>(make_position: (item: Item, v: Vec2) => Pos) {

  let released_positions = new Map<Item, Array<Pos>>()

  let immediate


  function release_immediate(_p: Pos) {
    immediate = _p
  }

  function acquire_pos(item: Item, v: Vec2, instant_track: boolean = false) {
    if (immediate) {
      let res = immediate
      immediate = undefined
      return res
    }
    let _ = released_positions.get(item)
    if (!instant_track && _ && _.length > 0) {
      _.sort((a, b) => b.vs.distance(v) - a.vs.distance(v))
      return _.pop()
    } else {
      return make_position(item, v)
    }
  }

  return {
    release_immediate,
    acquire_pos,
    release_pos(item: Item, pos: Position) {
      let res = released_positions.get(item)
      if (!res) {
        res = []
        released_positions.set(item, res)
      }
      res.push(pos)
    },
  }
}




export function make_drag(table: Table, $ref: HTMLElement) {

  let { on_hover,

    on_up,
    on_click,
    find_inject_drag,

    on_drag_update,
    find_on_drag_start
  } = table



  let _drag_decay = createSignal()
  let m_drag_decay = createMemo(() => read(_drag_decay))

  let _update = createSignal([16, 16], { equals: false })
  let update = createMemo(() => read(_update))


  let mouse = new Mouse($ref).init()


  loop((dt, dt0) => {

    mouse.update(dt, dt0)
    owrite(_update, [dt, dt0])

    let { click, hover, drag, up } = mouse

    if (click) {
      on_click(click)
    }

    if (hover) {
      on_hover(hover)
    }

    if (up) {
      on_up()
    }


    if (drag && !!drag.move0) {
      if (!read(_drag_decay)) {
        let inject_drag = find_inject_drag()
        if (inject_drag) {
          owrite(_drag_decay, new DragDecay(drag, inject_drag.abs_pos, inject_drag))
        }
      }
    }

    if (drag && !drag.move0) {
      let res = find_on_drag_start(drag)
      if (res) {
        owrite(_drag_decay, new DragDecay(drag, res.vs, res))
      }
    }
  })

  createEffect(on(update, (dt, dt0) => {
    let decay = m_drag_decay()
    if (decay) {
      on_drag_update(decay)
      decay.target.lerp_vs(decay.move)
      if (decay.drop) {
        owrite(_drag_decay, undefined)
      }
    }
  }))


  return {
    get decay() {
      return m_drag_decay()
    }
  }
}


