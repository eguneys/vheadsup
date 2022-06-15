import { on, createEffect, onCleanup, createSignal, createMemo, mapArray } from 'solid-js'
import { read, write, owrite } from './play'
import { make_position } from './make_util'
import { Vec2 } from 'soli2d'
import { make_drag, make_sticky_pos } from './make_sticky'
import { loop_for } from './play'
import { ticks } from './shared'

const suits = ['h', 'd', 'c', 's']
const ranks = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K']
const cards = ranks.flatMap(rank => suits.map(suit => rank + suit))
const backs = cards.map(_ => 'zz')
const cards4 = [...Array(4).keys()].flatMap(_ => cards.slice(0))
const backs4 = cards4.map(_ => 'zz')

function make_hooks(table: Table) {

  return { 
    on_hover() {
    },
    on_up() {
      table.cards.forEach(_ => _.mouse_down = false)
    },
    on_click() {
    },
    find_inject_drag() {
    },
    on_drag_update() {
    },
    find_on_drag_start() {
      return table.a_cards.find_on_drag_start()
    }
  }
}


export class Table {


  get cards() {
    return this.a_cards.cards
  }

  onScroll() {
    owrite(this._$clear_bounds)
  }

  set $ref($ref: HTMLElement) {
    owrite(this._$ref, $ref)
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
        return make_drag(make_hooks(this), $ref)
      }
    })

    this.a_cards = make_cards(this)
    this.a_rules = make_rules(this)

    createEffect(on(() => this.m_drag()?.decay, (v, prev) => {
      if (!!prev && !v) {
        this.a_cards.drop()
      }
    }))


    setTimeout(() => {


      this.a_rules.drags = [
        'p1@2',
        'p2@2',
        'p3@1'
      ]

    this.a_cards.stacks = [
      'p1@zzzz2h3d@0.2-2', 
      'p2@zzzz2h3d@1.4-2', 
      'p3@2c@2.6-2', 
      'p4@2c3h@4.6-2', 
    ]
    }, 1000)





  }
}


function make_rules(table: Table) {

  let _drags = createSignal([])
  let m_drags = createMemo(() => {
    let drags = read(_drags)
    return new Map(drags.map(_ => {
      let [name, nb] = _.split('@')
      return ['__' + name, parseInt(nb)]
    }))
  })

  return {
    set drags(drags: Array<AllowedDrag>) {
      owrite(_drags, drags)
    },
    can_drag(o_stack_type: string, o_stack_i: number, o_stack_n: number, o_i: number) {
      let stack = m_drags().get(o_stack_type)

      if (stack) {
        return stack >= o_stack_n - o_i
      }
    }
  }

}
      
      
function make_cards(table: Table) {

  let _drags = createSignal([])
  let _stacks = createSignal([])

  let sticky_pos = make_sticky_pos((c: OCard, v: Vec2) => make_position(v.x, v.y))

  cards4.forEach(_ => sticky_pos.release_pos(_, make_position(0, 0)))
  backs4.forEach(_ => sticky_pos.release_pos(_, make_position(0, 0)))


  let gap = 0.2
  let m_stack_cards = createMemo(() => {
    let stacks = read(_stacks)

    return stacks.flatMap((stack, o_stack_i, _arr) => {
      let o_stack_n = _arr.length
      let [o_name, o_cards, o_pos] = stack.split('@')
      let _pos = Vec2.make(...o_pos.split('-').map(_ => parseFloat(_)))

      let res = []
      for (let i = 0; i < o_cards.length; i+=2) {
        let o_i = i/ 2
        let v = Vec2.make(_pos.x, _pos.y + (o_i) * gap)
        res.push(['__' + o_name, o_stack_i, o_stack_n, o_i, o_cards.slice(i, i + 2), `${v.x}-${v.y}`].join('@'))
      }
      return res
    })
  })

  let _cards = createMemo(() => {
    return [
      ...m_stack_cards(),
      ...read(_drags)
    ]
  })

  let m_cards = createMemo(mapArray(_cards, _ => {
    let [o_stack_type, o_stack_i, o_stack_n, o_i, o_card, o_pos] = _.split('@')
    let [x, y] = o_pos.split('-').map(_ => parseFloat(_))
    let _p = sticky_pos.acquire_pos(o_card, Vec2.make(x, y))

    onCleanup(() => {
      sticky_pos.release_pos(o_card, _p)
    })

    return make_card(table, _, _p)
  }))

  let _drag_target = make_position(0, 0)

  createEffect(on(() => _drag_target.vs, (vs) => {
    let drags = m_cards().filter(_ => _.o_stack_type === 'drag')
    drags.forEach((_, o_i, _arr) => {
      let _i = 1-(o_i / _arr.length),
        _i2 = (_i + 1) * (_i + 1) * (_i + 1) / 8

      let v = Vec2.make(0, (o_i) * gap)
      _.lerp_abs_rel(vs, v, 0.1 + (_i2 * 0.9))
    })
  }))

  return {
    drop() {

    let drags = m_cards().filter(_ => _.o_stack_type === 'drag')

    drags.forEach(_ => {
      _.settle_for(_.v_pos, () => {
        m_cards().forEach(_ => _.flags.ghosting = false)
        owrite(_drags, [])
      })
    })

    },
    set stacks(stacks: Array<OStack>) {
      owrite(_stacks, stacks)
    },
    get cards() {
      return m_cards()
    },
    find_on_drag_start() {
      if (read(_drags).length > 0) {
        return
      }
      let cards = m_cards()

      let card = cards.find(_ => _.mouse_down)

      if (card && card.can_drag) {
        let stack_cards = cards.filter(_ => _.stack_i === card.stack_i)
        let drags = stack_cards.filter(_ => _.o_i >= card.o_i)

        drags.forEach(_ => _.flags.ghosting = true)

        let { abs_pos } = card

        if (abs_pos) {
          _drag_target.x = abs_pos.x
          _drag_target.y = abs_pos.y
        }

        owrite(_drags, drags.map((_, o_i, _arr) => 
                                 ['drag', o_i, _arr.length, o_i, _.card_sr, _.o_pos].join('@')))
        return _drag_target
      }
    }
  }
}

let back_klass = ['back']
let rank_klasses = { '1': 'ace', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', 'T': 'ten', 'J': 'jack', 'Q': 'queen', 'K': 'king' }
let suit_klasses = { 's': 'spades', 'd': 'diamonds', 'h': 'hearts', 'c': 'clubs' }

function make_card_flags() {

  let _ghosting = createSignal(false)

  return {
    get ghosting() {
      return read(_ghosting)
    },
    set ghosting(v: boolean) {
      owrite(_ghosting, v)
    }
  }
}

function make_card(table: Table, o_card: OCard, _pos: Pos) {
  let [o_stack_type, o_stack_i, o_stack_n, o_i, o_sr, o_pos] = o_card.split('@')
  let [o_rank, o_suit] = o_sr.split('')
  let [o_x, o_y] = o_pos.split('-').map(_ => parseFloat(_))

  let v_pos = Vec2.make(o_x, o_y)

  let o_back = o_suit === o_rank
  let o_drag = o_stack_type === 'drag'

  let _lerp_i = 1 - (o_stack_i / o_stack_n)

  let flags = make_card_flags()

  let m_can_drag = createMemo(() => {
    return table.a_rules.can_drag(o_stack_type, o_stack_i, o_stack_n, o_i)
  })

  function settle_for(v_pos: Vec2, on_settled: () => void = () => {}) {
    loop_for(ticks.thirds, (dt, dt0, _it) => {
      _pos.lerp(v_pos.x, v_pos.y, _lerp_i * 0.2 + _it * 0.8)
      if (_it === 1) {
        on_settled(_it)
      }
    })
  }

  if (false && !o_drag) {
    settle_for(v_pos)
  } else {
    _pos.x = v_pos.x
    _pos.y = v_pos.y
  }
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
  })

  let m_abs_pos = createMemo(() => {
    let rect = vs_rect()
    if (rect) {
      return _pos.vs.mul(rect)
    }
  })





  let m_klass = createMemo(() => (o_back ? back_klass : [ 
    flags.ghosting ? 'ghosting' : '',
    m_can_drag() ? 'can-drag' : '',
    rank_klasses[o_rank],
    suit_klasses[o_suit]
  ]).join(' '));


  let m_style = createMemo(() => ({
    transform: `translate(calc(${_pos.x} * 100%), calc(${_pos.y} * 100%))`
  }))


  return {
    get can_drag() {
      return m_can_drag()
    },
    settle_for,
    flags,
    get o_stack_type() {
      return o_stack_type
    },
    get stack_i() {
      return o_stack_i
    },
    get o_i() {
      return o_i
    },
    get suit() {
      return o_suit
    },
    get rank() {
      return o_rank
    },
    card_sr: o_sr,
    card_ref: o_card,
    vs_rect,
    set $ref($ref: HTMLElement) {
      owrite(_$ref, $ref)
    },
    lerp_abs(move: Vec2) {
      let rect = vs_rect()
      if (rect) {
        _pos.lerp_vs(move.div(rect))
      }
    },
    lerp_abs_rel(move: Vec2, rel: Vec2, i: number) {
      let rect = vs_rect()
      if (rect) {
        _pos.lerp_vs(move.div(rect).add(rel), i)
      }
    },
    v_pos,
    get o_pos() {
      let x = _pos.x,
      y = _pos.y
      return `${x}-${y}`
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



