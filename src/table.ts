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

  set $ref($ref: HTMLElement) {
    owrite(this._$ref, $ref)
  }


  onScroll() {
    owrite(this._$clear_bounds)
  }

  on_click = () => {
    console.log('on click')
  }

  on_hover = () => {
    //console.log('on hover')
  }

  find_inject_drag = () => {
    //console.log('find inject drag')
  }

  find_on_drag_start = () => {
    return this.stacks.find(_ => _.mouse_down)
  }

  constructor() {

    this._$ref = createSignal(undefined, { equals: false })
    let m_ref = createMemo(() => read(this._$ref))

    this._$clear_bounds = createSignal(undefined, { equals: false })


    this.m_rect = createMemo(() => {
      read(this._$clear_bounds)
      return m_ref()?.getBoundingClientRect()
    })


    createEffect(() => {
      console.log(this.m_rect())
    })

    this.m_drag = createMemo(() => {
      let $ref = m_ref()
      if ($ref) {
        return make_drag(this, $ref)
      }
    })


    this.a_stacks = make_stacks(this)

    this.a_stacks.stacks = [
      'zzzz2h3d@5.2-2', 
      'zzzz2h3d@2.2-2', 
      'zzzz2h3d@1-2', 
      'zzzz2h3d@4-2', 
    ]


    let drag_decay = createMemo(() => {
      return this.m_drag()?.decay
    })

    createEffect(() => {
      console.log(drag_decay())
    })

    createEffect(() => {
      if (!drag_decay()) {
        console.log('here')
        this.stacks.forEach(_ => _.mouse_down = false)
      }
    })
  }

}


const make_stacks = (table: Table) => {

  let _stacks = createSignal([])

  let m_poss_by_card = createMemo(() => {
    let stacks = read(_stacks)

    return stacks.flatMap(stack => {
      let [_cards, _pos] = stack_pp(stack)

      let v_pos = Vec2.make(...pos_vs(_pos))
      let cards = stack_cards(_cards)

      return cards.map((card, i) =>
       [card, v_pos.add(Vec2.make(0, 0.2 * i))])
    })
  })


  let _p_cards = make_poss_resource(
  m_poss_by_card,
  (card, pos, v_pos) => make_card(table, card, pos, v_pos),
  () => make_position(-1, 3.5))

  let m_cards = () => _p_cards.items

  createEffect(() => {
    let cards = m_cards()
    let cancel = loop_for(ticks.half * 20, (dt, dt0, i) => {
      cards.forEach(_ => _.settle_loop(dt, dt0, i))
    })
    onCleanup(() => {
      cancel()
    })
  })

  return {
    set stacks(stacks: Array<Stack>) {
      owrite(_stacks, stacks)
    },
    get stacks() {
      return m_cards()
    }
  }
}

let back_klass = ['back']
let rank_klasses = { '1': 'ace', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', 'T': 'ten', 'J': 'jack', 'Q': 'queen', 'K': 'king' }
let suit_klasses = { 's': 'spades', 'd': 'diamonds', 'h': 'hearts', 'c': 'clubs' }

const make_card = (table: Table, 
                   card: Card, 
                   _pos: Pos,
                   v_pos: Pos) => {

  let [rank, suit] = card
  let back = rank === suit


  let m_klass = createMemo(() => (
            back ? back_klass : [ 
              rank_klasses[rank],
              suit_klasses[suit]
            ]).join(' '))

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
    set $ref($ref: HTMLElement) {
      owrite(_$ref, $ref)
    },
    lerp_abs(move: Vec2) {
      console.log(move, vs_rect(), move.div(vs_rect()))
      _pos.lerp_vs(move.div(vs_rect()))
    },
    get pos() {
      return _pos
    },
    get abs_pos() {
      return m_abs_pos()
    },
    settle_loop(dt, dt0, i) {
      _pos.lerp(v_pos.x, v_pos.y, i)
    },
    get style() {
      return m_style()
    },
    get klass() {
      return m_klass()
    }
  }
}



function make_poss_resource<ItemRef, Item, Pos>(
  _m_poss_by_item: (_: ItemRef) => [Item, Pos] ,
  make_item: (_: Item, p: Pos) => any, 
  make_position: () => Pos) {

  let _m_items = createMemo(() => _m_poss_by_item().map(_ => _[0]))

  let m_items = createMemo(() => {
    let _poss_by_item = _m_poss_by_item()
    let _used_poss = []
    return mapArray(_m_items, _ => {
      let [item, v_pos] = _poss_by_item.find(_a => _a[0] === _ && !_used_poss.includes(_a) && _used_poss.push(_a))

      let _pos = acquire_pos(item)
      return make_item(item, _pos, v_pos)
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

        console.log(decay.move, decay.translate)
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
