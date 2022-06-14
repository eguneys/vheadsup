import { ticks } from './shared'
import { batch, untrack, on, createRoot, createEffect, onCleanup, createSignal, createMemo, mapArray } from 'solid-js'
import { owrite, read, write, loop_for } from './play'
import { make_position } from './make_util'
import { loop, Vec2 } from 'soli2d'
import Mouse from './mouse'
import { DragDecay } from './play'

/*
setCards(['', '', ''])

'zzzz2h3d@a-b'
'2h@100-50'

*/


function stack_pp(ref: StackRef) {
  return ref.split('@')
}

function pos_vs(pos: Pos) {
  return pos.split('-').map(_ => parseFloat(_))
}

function stack_cards(cards: Cards) {
  let res = []
  for (let i = 0; i < cards.length; i+= 2) {
    let rank = cards[i],
      suit = cards[i+1]
    res.push(rank+suit)
  }
  return res
}

export class Table {

  get drag_stack() {
    return this.a_stacks.drag
  }

  get drag_cards() {
    let { drag_stack } = this

    if (drag_stack) {
      return drag_stack.cards
    }
    return []
  }

  get stacks() {
    return this.a_stacks.stacks
  }

  get cards() {
    return this.a_stacks.cards
  }

  set $ref($ref: HTMLElement) {
    owrite(this._$ref, $ref)
  }


  onScroll() {
    owrite(this._$clear_bounds)
  }

  on_up = () => {
    this.cards.forEach(_ => _.mouse_down = false)
    this._inject_drag = undefined
  }

  on_click = () => {
    console.log('on click')
  }

  on_hover = () => { }

  on_drag_update = () => { }

  find_inject_drag = () => { 
    return this._inject_drag
  }

  find_on_drag_start = () => {

    if (this.drag_stack) {
      return
    }

    let splits = this.stacks.map(_ => _.find_drag_split())
    let i = splits.findIndex(Boolean)

    if (i > -1) {
      let stack = splits[i]
      this.a_stacks.drag = stack

      owrite(this._drag_split, [i, stack.length])
    }
  }

  inject_drag(stack: Stack) {
    this._inject_drag = stack
  }

  constructor() {

    this._$ref = createSignal(undefined, { equals: false })
    let m_ref = createMemo(() => read(this._$ref))

    this._$clear_bounds = createSignal(undefined, { equals: false })

    this.m_rect = createMemo(() => {
      read(this._$clear_bounds)
      return m_ref()?.getBoundingClientRect()
    })


    this.m_drag = createMemo(() => {
      let $ref = m_ref()
      if ($ref) {
        return make_drag(this, $ref)
      }
    })


    createEffect(on(() => this.m_drag()?.decay, (v, prev) => {
      if (!!prev && !v) {
        prev.target.settle_loop(true)
      }
    }))

    this.a_stacks = make_stacks(this)

    setTimeout(() => {
    this.a_stacks.stacks = [
      'zzzzzzzzzzzzzzzz2h3d@5.2-2', 
      'zzzz2h3d@2.2-2', 
      'zzzz2h3d@1-2', 
      'zzzz2h3d@4-2', 
    ]
    }, 1000)

    let drag_decay = createMemo(() => {
      return this.m_drag()?.decay
    })


    this._drag_split = createSignal()

    createEffect(() => {
      console.log(read(this._drag_split))
    })

    createEffect(on(() => this.a_stacks.drag, (v, p) => {
      if (!v && !!p) {
        owrite(this._drag_split, undefined)
      }
    }))

    createEffect(on(this._drag_split[0], (v, p) => {
      if (!!v && !p) {

        let [s_index, s_length] = v

        let stack = this.stacks[s_index].slice_cards_back(s_length)

        stack.forEach(_ => _.dragging = true)
      }
      if (!v && !!p) {
        let [s_index, s_length] = p

        let stack = this.stacks[s_index].slice_cards_back(s_length)

        console.log(stack)
        stack.forEach(_ => _.dragging = false)
      }
    }))


  }

}

const make_stack = (table: Table, stack: Stack, instant_track: boolean) => {
  let [_cards, pos] = stack_pp(stack)

  let _settle = createSignal(!instant_track)
  let _pos = make_position(...pos_vs(pos))
  let a_cards = stack_cards(_cards)

  let _base_pos = _pos.clone

  let res

  let m_cards = createMemo(mapArray(() => a_cards, 
                                    _ => make_card(table, res, _, make_position(0, 0))))

  let gap = 0.2

  const f_track_pos = () => {
    if (read(_settle)) {
      return
    }
    m_cards().forEach((_, i, _arr) => {
      let _i = 1-(i / _arr.length),
        _i2 = (_i + 1) * (_i + 1) * (_i + 1) / 8
      _.lerp_rel(
        _pos.x, _pos.y + i * gap, 0.1 + (_i2 * 0.9)
      )
    })
  }

  if (instant_track) {
    createEffect(f_track_pos)
    m_cards().forEach((_, i) => {
      _.lerp_rel(_pos.x, _pos.y + i * gap, 1)
    })
  } else {
    f_track_pos()
  }

  createEffect(on(_settle[0], (v) => {
    if (!v) {
      return
    }
    let cancel = loop_for(ticks.half, (dt, dt0, _it) => {
      m_cards().forEach((_, i, _arr) => {
        let _i = 1-(i / _arr.length),
          _i2 = (_i + 1) * (_i + 1) * (_i + 1) / 8
        _.lerp_rel(
          _pos.x, _pos.y + i * gap, (_i2 * 0.2) + _it * 0.8
        )
      })

      if (_it === 1) {
        owrite(_settle, false)
      }
    })
    onCleanup(() => {
      cancel()
    })
  }))


  let vs_rect = createMemo(() => {
      return m_cards()[0]?.vs_rect() || Vec2.unit
  })


  let m_abs_pos = createMemo(() => {
    return _pos.vs.mul(vs_rect())
  })

  let drop_after_settle = false

  let m_drop_after_settle = createMemo(() => {
    if (!read(_settle)) {
      if (drop_after_settle) {
        return true
      }
    }
    return false
  })

  res = {
    slice_cards_back(i: number) {
      let cards = m_cards()
      return cards.slice(-i)
    },
    m_drop_after_settle,
    settle_loop(reset: boolean) {
      batch(() => {
        if (reset) {
          _pos.x = _base_pos.x
          _pos.y = _base_pos.y

          drop_after_settle = true
        }

        owrite(_settle, true)
      })
    },
    find_drag_split() {
      let cards = m_cards()
      let i = cards.findIndex(_ => _.mouse_down)


      if (i > -1) {
        let d_stack = cards.slice(i, cards.length)
        return d_stack
      }
    },
    get cards() {
      return m_cards()
    },
    lerp_abs(vs: Vec2) {
      _pos.lerp_vs(vs.div(vs_rect()))
    },
    get abs_pos() {
      return m_abs_pos()
    }
  }

  return res
}

const make_stacks = (table: Table) => {
  let _stacks = createSignal([])
  let _drag = createSignal([])

  let m_stacks = createMemo(mapArray(_stacks[0], _ => make_stack(table, _)))

  let m_cards = createMemo(() => {
    return m_stacks().flatMap(stack => stack.cards)
  })

  let m_drag_stack = createMemo(() => {
    let d = read(_drag)
    if (d && d.length > 0) {
      return untrack(() => make_stack(table, d, true))
    }
  })


  createEffect(on(m_drag_stack, (v, p) => {
    if (!p && !!v) {
      table.inject_drag(v)
    }
    if (v) {
      createEffect(() => {
        if (v.m_drop_after_settle()) {
          owrite(_drag, undefined)
        }
      })
    }
  }))

  return {
    set drag(drag: Array<Card>) {
      let stack = drag.map(_ => _.card_ref).join('')

      let pos = drag[0].pos.vs
      stack += `@${pos.x}-${pos.y}`
      owrite(_drag, stack)
    },
    get drag() {
      return m_drag_stack()
    },
    set stacks(stacks: Array<Stack>) {
      owrite(_stacks, stacks)
    },
    get stacks() {
      return m_stacks()
    },
    get cards() {
      return m_cards()
    }
  }
}

let back_klass = ['back']
let rank_klasses = { '1': 'ace', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', 'T': 'ten', 'J': 'jack', 'Q': 'queen', 'K': 'king' }
let suit_klasses = { 's': 'spades', 'd': 'diamonds', 'h': 'hearts', 'c': 'clubs' }

const make_card = (table: Table, stack: Stack, card: Card, _pos: Pos) => { 
  let [rank, suit] = card.split('');
  let back = rank === suit;

  let _dragging = createSignal(false)

  let m_klass = createMemo(() => (back ? back_klass : [ 
    rank_klasses[rank],
    suit_klasses[suit]
  ]).join(' '));

  let m_style = createMemo(() => ({
    transform: `translate(calc(${_pos.x} * 100%), calc(${_pos.y} * 100%))`
  }))


  let _$ref = createSignal()

  let m_rect = createMemo(() => {
    read(table._$clear_bounds)
    return read(_$ref)?.getBoundingClientRect()
  })

  let vs_rect = createMemo(() => {
    let r = m_rect()
    if (r) {
      return Vec2.make(r.width, r.height)
    }
    return Vec2.unit
  })

  let m_abs_pos = createMemo(() => {
    return _pos.vs.mul(vs_rect())
  })

  return {
    get suit() {
      return suit
    },
    get rank() {
      return rank
    },
    card_ref: card,
    vs_rect,
    set $ref($ref: HTMLElement) {
      owrite(_$ref, $ref)
    },
    lerp_abs(move: Vec2) {
      _pos.lerp_vs(move.div(vs_rect()))
    },
    set dragging(value: boolean) {
      owrite(_dragging, value)
    },
    get dragging() {
      return read(_dragging)
    },
    get pos() {
      return _pos
    },
    get abs_pos() {
      return m_abs_pos()
    },
    lerp_rel(x: number, y: number, i: number) {
      _pos.lerp(x, y, i)
    },
    get style() {
      return m_style()
    },
    get klass() {
      return m_klass()
    }
  }
}



function make_poss_resource<ItemRef, Item>(
  _m_item_by_ref: (_: ItemRef) => Item ,
  make_item: (_: Item, p: Pos) => any, 
  make_position: () => Pos) {

  let m_items = createMemo(() => {
    let _poss_by_item = _m_poss_by_item()
    let _used_poss = []
    return mapArray(_m_items, _ => {
      let item = _poss_by_item.find(_a => _a === _ && !_used_poss.includes(_a) && _used_poss.push(_a))

      let _pos = acquire_pos(item)
      return make_item(item, _pos)
    })()
  })

  let released_positions = new Map<Item, Array<Pos>>()

  function acquire_pos(item: Item) {
    let _ = released_positions.get(item)
    if (_ && _.length > 0) {
      return _.pop()
    } else {
      return make_position(item)
    }
  }

  return {
    
    release_pos(item: Item, pos: Position) {
      let res = released_positions.get(item)

      if (!res) {
        res = []
        released_positions.set(item, res)
      }
      res.push(pos)
    },
    get items() {
      return m_items()
    }
  }
}


const make_drag = (table: Table, $ref: HTMLElement) => {

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
          owrite(_drag_decay, new DragDecay(drag, inject_drag.abs_pos, inject_drag, true))
        }
      }
    }

    if (drag && !drag.move0) {
      let res = find_on_drag_start(drag)
      if (res) {
        owrite(_drag_decay, new DragDecay(drag, res.abs_pos, res))
      }
    }
  })

  createEffect(on(update, (dt, dt0) => {
    let decay = m_drag_decay()
    if (decay) {


      on_drag_update(decay)
      decay.target.lerp_abs(decay.move)
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

function ease(t: number) {
  return t<.5 ? 2*t*t : -1+(4-2*t)*t
}
