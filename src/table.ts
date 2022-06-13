import { ticks } from './shared'
import { on, createRoot, createEffect, onCleanup, createSignal, createMemo, mapArray } from 'solid-js'
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
    res.push([rank, suit])
  }
  return res
}

export class Table {

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

  on_click = () => {
    console.log('on click')
  }

  on_hover = () => { }

  on_drag_update = () => { }

  find_inject_drag = () => { }

  find_on_drag_start = () => {
    return this.stacks.find(_ => _.on_drag_start())
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
        prev.target.settle_loop()
      }
    }))

    this.a_stacks = make_stacks(this)

    setTimeout(() => {
    this.a_stacks.stacks = [
      'zzzzzzzzzzzzzzz2h3d@5.2-2', 
      'zzzz2h3d@2.2-2', 
      'zzzz2h3d@1-2', 
      'zzzz2h3d@4-2', 
    ]
    }, 1000)

    let drag_decay = createMemo(() => {
      return this.m_drag()?.decay
    })

    createEffect(() => {
      if (!drag_decay()) {
        this.cards.forEach(_ => _.mouse_down = false)
      }
    })
  }

}

const make_stack = (table: Table, stack: Stack) => {
  let [_cards, pos] = stack_pp(stack)

  let _settle = createSignal(undefined, { equals: false })
  let _pos = make_position(...pos_vs(pos))
  let a_cards = stack_cards(_cards)

  let res

  let m_cards = createMemo(mapArray(() => a_cards, 
                                    _ => make_card(table, res, _, make_position(0, 0))))

  let gap = 0.2,
  lerp_mul = 0.9
  createEffect(() => {
    m_cards().forEach((_, i, _arr) => {
      let _i = 1-(i / _arr.length),
        _i2 = (_i + 1) * (_i + 1) * (_i + 1) / 8
      _.lerp_rel(
        _pos.x, _pos.y + i * gap, 0.1 + (_i2 * lerp_mul)
    )
    })
  })

  createEffect(() => {
    read(_settle)
    let cancel = loop_for(ticks.seconds, (dt, dt0, _i) => {
      m_cards().forEach((_, i, _arr) => {
        let _i = 1-(i / _arr.length),
          _i2 = (_i + 1) * (_i + 1) * (_i + 1) / 8
        _.lerp_rel(
          _pos.x, _pos.y + i * gap, 0.1 + (_i2 * lerp_mul)
        )
      })

    })
    onCleanup(() => {
      cancel()
    })
  })


  let vs_rect = createMemo(() => {
      return m_cards()[0]?.vs_rect() || Vec2.unit
  })


  let m_abs_pos = createMemo(() => {
    return _pos.vs.mul(vs_rect())
  })


  res = {
    settle_loop() {
      owrite(_settle)
    },
    on_drag_start() {
      let cards = m_cards()
      return cards.find(_ => _.mouse_down)
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

  let m_stacks = createMemo(() => {
    let stacks = read(_stacks)
    return stacks.map(_ => make_stack(table, _))
  })

  let m_cards = createMemo(() => {
    return m_stacks().flatMap(stack => stack.cards)
  })

  return {
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
  let [rank, suit] = card;
  let back = rank === suit;


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
    vs_rect,
    set $ref($ref: HTMLElement) {
      owrite(_$ref, $ref)
    },
    lerp_abs(move: Vec2) {
      _pos.lerp_vs(move.div(vs_rect()))
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

    let { click, hover, drag } = mouse

    if (click) {
      on_click(click)
    }

    if (hover) {
      on_hover(hover)
    }


    if (drag && !!drag.move0) {
      let inject_drag = find_inject_drag()

      if (inject_drag) {
        owrite(_drag_decay, new DragDecay(drag, inject_drag.abs_pos, inject_drag, true))
      }
    }

    if (drag && !drag.move0) {
      let res = find_on_drag_start(drag)
      if (res) {
        owrite(_drag_decay, new DragDecay(drag, res.abs_pos, res))
      }
    }
  })

  createEffect(() => {
    let decay = m_drag_decay()
    if (decay) {
      createEffect(on(update, (dt, dt0) => {
        on_drag_update(decay)
        decay.target.lerp_abs(decay.move)
        if (decay.drop) {
          owrite(_drag_decay, undefined)
        }
      }))
    }
  })


  return {
    get decay() {
      return m_drag_decay()
    }
  }
}
