import { on, createEffect, onCleanup, createSignal, createMemo, mapArray } from 'solid-js'
import { read, write, owrite } from './play'
import { make_position } from './make_util'
import { Vec2 } from 'soli2d'
import { make_drag, make_sticky_pos } from './make_sticky'
import { loop_for } from './play'
import { ticks } from './shared'


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

    createEffect(on(() => this.m_drag()?.decay, (v, prev) => {
      if (!!prev && !v) {
        this.a_cards.drop()
      }
    }))

    /*
    setTimeout(() => {
      this.a_cards.stacks = [
        'zzzzzzzz4haabbccdd2h3d@5.2-2', 
        'zzzz2h3d@2.2-2', 
        'zzzz2h3d@1-2', 
        '2h3dzzzz@3-1', 
        '2h3dzzzz@4-1', 
        '2h3dzzzz@5-1', 
      ]
    }, 3000)

   */


    setTimeout(() => {
    this.a_cards.stacks = [
      'zzzzzzzzaabbccdd2h3d@5.2-2', 
      'zzzz2h3d@2.2-2', 
      'zzzz2h3d@1-2', 
      'zzzz2h3d4h@4-2', 
    ]
    }, 1000)





  }
}
      
      
function make_cards(table: Table) {


  let _drags = createSignal([])
  let _stacks = createSignal([])

  let sticky_pos = make_sticky_pos((c: OCard, v: Vec2) => make_position(v.x, v.y))

  let gap = 0.2
  let m_stack_cards = createMemo(() => {
    let stacks = read(_stacks)

    return stacks.flatMap((stack, o_stack_i, _arr) => {
      let o_stack_n = _arr.length
      let [o_cards, o_pos] = stack.split('@')
      let _pos = Vec2.make(...o_pos.split('-').map(_ => parseFloat(_)))

      let res = []
      for (let i = 0; i < o_cards.length; i+=2) {
        let o_i = i/ 2
        let v = Vec2.make(_pos.x, _pos.y + (o_i) * gap)
        res.push(['rr', o_stack_i, o_stack_n, o_i, o_cards.slice(i, i + 2), `${v.x}-${v.y}`].join('@'))
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

  createEffect(() => {
    let drags = m_cards().filter(_ => _.o_stack_type === 'drag')
    drags.forEach((_, o_i, _arr) => {
      let _i = 1-(o_i / _arr.length),
        _i2 = (_i + 1) * (_i + 1) * (_i + 1) / 8

      let v = Vec2.make(0, (o_i) * gap)
      _.lerp_abs_rel(_drag_target.vs, v, 0.1 + (_i2 * 0.9))
    })
  })

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

      if (card) {
        let stack_cards = cards.filter(_ => _.stack_i === card.stack_i)
        let drags = stack_cards.filter(_ => _.o_i >= card.o_i)

        drags.forEach(_ => _.flags.ghosting = true)

        owrite(_drags, drags.map((_, o_i, _arr) => 
                                 ['drag', o_i, _arr.length, o_i, _.card_sr, _.o_pos].join('@')))

        let { abs_pos } = drags[0]

        if (abs_pos) {
          _drag_target.x = abs_pos.x
          _drag_target.y = abs_pos.y
        }

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

  function settle_for(v_pos: Vec2, on_settled: () => void = () => {}) {
    loop_for(ticks.thirds, (dt, dt0, _it) => {
      _pos.lerp(v_pos.x, v_pos.y, _lerp_i * 0.2 + _it * 0.8)
      if (_it === 1) {
        on_settled(_it)
      }
    })
  }

  if (!o_drag) {
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
    rank_klasses[o_rank],
    suit_klasses[o_suit]
  ]).join(' '));


  let m_style = createMemo(() => ({
    transform: `translate(calc(${_pos.x} * 100%), calc(${_pos.y} * 100%))`
  }))



  return {
    settle_for,
    flags: make_card_flags(),
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



