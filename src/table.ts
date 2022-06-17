import { on, createEffect, onCleanup, createSignal, createMemo, mapArray } from 'solid-js'
import { read, write, owrite } from './play'
import { make_position } from './make_util'
import { Vec2 } from 'soli2d'
import { make_drag, make_sticky_pos } from './make_sticky'
import { loop_for } from './play'
import { ticks } from './shared'

const colors = { h: 'red', 'd': 'red', 'c': 'black', 's': 'black' }
const suits = ['h', 'd', 'c', 's']
const ranks = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K']
const cards = ranks.flatMap(rank => suits.map(suit => rank + suit))
const backs = cards.map(_ => 'zz')
const cards4 = [...Array(4).keys()].flatMap(_ => cards.slice(0))
const backs4 = cards4.map(_ => 'zz')


function hit_rectangle(rect: [number, number, number, number], v: Vec2) {
  let left = rect[0],
    top = rect[1],
    right = left + rect[2],
    bottom = top + rect[3]

  return left <= v.x && v.x <= right && top <= v.y && v.y <= bottom
}

function make_hooks(table: Table) {

  return { 
    on_hover() {
    },
    on_up() {
      table.cards.forEach(_ => _.mouse_down = false)
    },
    on_click() {
      return table.a_cards.find_on_click()
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

  get klass() {
    return this.m_klass()
  }

  get dragging() {
    return !!this.m_drag()?.decay
  }

  get cards() {
    return this.a_cards.cards
  }

  get bases() {
    return this.a_cards.bases
  }

  onScroll() {
    owrite(this._$clear_bounds)
  }

  set $ref($ref: HTMLElement) {
    owrite(this._$ref, $ref)
  }

  apply_drop(rule: DropRule) {
    this.hooks.on_apply_drop(rule)
  }

  apply_click() {
    this.hooks.on_apply_click()
  }


  constructor(readonly hooks: any) {

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

    createEffect(on(() => this.dragging, (v, prev) => {
      if (!!prev && !v) {
        this.a_cards.drop()
      }
    }))

    this.m_klass = createMemo(() => [
      this.dragging ? 'dragging' : ''
    ])
  }
}


function make_rules(table: Table) {

  let _gaps = createSignal([])
  let m_gaps = createMemo(() => {
    let gaps = read(_gaps)
    return new Map(gaps.map(_ => {
      let [o_stack_type, gap] = _.split('@')
      return ['__' + o_stack_type, parseFloat(gap)]
    }))
  })

  let _reveals = createSignal([])
  let m_reveals = createMemo(() => {
    let reveals = read(_reveals)
    return reveals.map(_ => {
      let [o_stack_type, o_i] = _.split('@')
      return {
        o_stack_type: '__' + o_stack_type,
        o_i: parseInt(o_i)
      }
    })
  })

  let _drags = createSignal([])
  let m_drags = createMemo(() => {
    let drags = read(_drags)
    return new Map(drags.map(_ => {
      let [name, nb] = _.split('@')
      return ['__' + name, parseInt(nb)]
    }))
  })

  let _drops = createSignal([])
  let m_drops = createMemo(() => {
    let drops = read(_drops)
    return drops.map(_ => {
      let [from, o_i, to] = _.split('@')
      return {
        o_stack_type: '__' + from,
        o_i: parseInt(o_i),
        drop_stack_type: '__' + to,
        _
      }
    })
  })

  return {
    set gaps(gaps: Array<OGap>) {
      owrite(_gaps, gaps)
    },
    get gaps() {
      return m_gaps()
    },
    get reveals() {
      return m_reveals()
    },
    set reveals(reveals: Array<OReveal>) {
      owrite(_reveals, reveals)
    },
    set drops(drops: Array<AllowedDrop>) {
      owrite(_drops, drops)
    },
    set drags(drags: Array<AllowedDrag>) {
      owrite(_drags, drags)
    },
    can_drag(o_stack_type: string, o_stack_n: number, o_i: number) {
      let stack = m_drags().get(o_stack_type)
      if (stack) {
        return stack >= o_stack_n - o_i
      }
    },
    drop_rule(o_stack_type: string, o_stack_n: number, o_i: number, drop_stack_type: string) {
      let drop = m_drops().find(_ => 
                                _.o_stack_type === o_stack_type && 
                                  _.o_i === o_i &&
                                  _.drop_stack_type === drop_stack_type)


      return drop?._
    },
    can_drop(o_stack_type: string, o_stack_n: number, o_i: number, drop_stack_type: string) {
      return !!m_drops().find(_ => 
                              _.o_stack_type === o_stack_type && 
                                _.o_i === o_i &&
                                _.drop_stack_type === drop_stack_type)

    }
  }

}


function make_stack(table: Table, stack: Stack) {
  let [o_name, o_cards, o_pos] = stack.split('@')
  let _pos = Vec2.make(...o_pos.split('-').map(_ => parseFloat(_)))

  let o_stack_type = '__' + o_name
  let m_gap = createMemo(() => table.a_rules.gaps.get(o_stack_type) ?? 0.2)
  let o_stack_n = o_cards.length / 2
  let cards = []

  let m_v_poss_by_o_i = createMemo(() => {
    let res = []
    for (let i = 0; i < o_cards.length; i+=2) {
      let o_i = i/ 2
      let v = Vec2.make(_pos.x, _pos.y + (o_i) * m_gap())
      res.push([o_i, v])
    }
    return new Map(res)
  })

  for (let i = 0; i < o_cards.length; i+=2) {
    let o_i = i/ 2
    cards.push([o_stack_type, o_i, o_cards.slice(i, i + 2)].join('@'))
  }

  let m_can_drop_base = createMemo(() => {
    let { can_drop_args } = table.a_cards
    if (can_drop_args) {
      return table.a_rules.can_drop(...can_drop_args, o_name)
      && m_o_top()
    }
  })


  let base_flags = make_card_flags()

  let m_base_klass = createMemo(() => [
    o_stack_type,
    base_flags.hovering_drop ? 'hovering-drop' : '',
    m_can_drop_base() ? 'can-drop' : '',
  ].join(' ').trim().replace(/\s+/g, ' '))

  let m_base_style = createMemo(() => ({
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
  })

  let m_abs_pos = createMemo(() => {
    let rect = vs_rect()
    if (rect) {
      return _pos.mul(rect)
    }
  })

  let vs_rect_bounds = createMemo(() => {
    let rect = vs_rect()
    let abs = m_abs_pos()
    if (rect && abs) {
      return [abs.x, abs.y, rect.x, rect.y]
    }
  })

  let m_drop_rule = createMemo(() => {
    let { can_drop_args } = table.a_cards
    if (can_drop_args) {
      return table.a_rules.drop_rule(...can_drop_args, o_stack_type)
    }
  })




  let base = {
    get drop_rule() {
      return m_drop_rule()
    },
    vs_rect,
    vs_rect_bounds,
    o_stack_type,
    set $ref($ref: HTMLElement) {
      owrite(_$ref, $ref)
    },
    flags: base_flags,
    get klass() {
      return m_base_klass()
    },
    get style() {
      return m_base_style()
    }
  }

  return {
    base,
    o_name,
    o_stack_n,
    o_stack_type,
    get pos() {
      return _pos
    },
    v_poss(o_i: number) {
      return m_v_poss_by_o_i().get(o_i)
    },
    cards
  }
}

function make_cards(table: Table) {

  let _drag_stack = createSignal()
  let _stacks = createSignal([])

  let _can_drop_args = createSignal()

  let sticky_pos = make_sticky_pos((c: OCard, v: Vec2) => make_position(v.x, v.y))

  cards4.forEach(_ => sticky_pos.release_pos(_, make_position(0, 0)))
  backs4.forEach(_ => sticky_pos.release_pos(_, make_position(0, 0)))

  let m_stack_more = createMemo(mapArray(_stacks[0], (_, i) => make_stack(table, _, i()))) 
  let m_stack_bases = createMemo(() => m_stack_more().map(_ => _.base))
  let m_drag_stacks = createMemo(() => [read(_drag_stack)].filter(Boolean).map(_ => make_stack(table, _, 0)))

  let m_stacks = createMemo(() => [
    ...m_stack_more(),
    ...m_drag_stacks()
  ])

  let m_stacks_by_type = createMemo(() => new Map(m_stacks().map(_ => [_.o_stack_type, _])))

  let m_stack_bases_by_type = createMemo(() => new Map(m_stack_bases().map(_ => [_.o_stack_type, _])))

  let _cards = createMemo(() => m_stacks().flatMap(_ => _.cards))

  let m_cards = createMemo(mapArray(_cards, _ => {
    let [o_stack_type, o_i, o_card] = _.split('@')

    let m_o_stack_n = createMemo(() => m_stacks_by_type().get(o_stack_type).o_stack_n)

    let o_pos = m_stacks_by_type().get(o_stack_type).v_poss(parseInt(o_i))
    let _p = sticky_pos.acquire_pos(o_card, Vec2.make(o_pos.x, o_pos.y))

    let res = make_card(table, _, m_o_stack_n, _p)
    onCleanup(() => {
      if (res.revealing) {
        sticky_pos.release_immediate(_p)
      } else {
        if (!res.flags.ghosting) {
          sticky_pos.release_pos(o_card, _p)
        }
      }
    })

    return res
  }))

  let _drag_target = make_position(0, 0)


  let m_drag_cards = createMemo(() => {
    return m_cards().filter(_ => _.o_stack_type[2] === 'd')
  })

  let m_top_cards = createMemo(() => {
    return m_cards().filter(_ => !_.o_drag && _.o_top)
  })

  let gap = 0.2
  createEffect(on(() => _drag_target.vs, (vs) => {
    let drags = m_drag_cards()
    drags.forEach((_, o_i, _arr) => {
      let _i = 1-(o_i / _arr.length),
        _i2 = (_i + 1) * (_i + 1) * (_i + 1) / 8

      let v = Vec2.make(0, (o_i) * gap)
      _.lerp_abs_rel(vs, v, 0.1 + (_i2 * 0.9))
    })
  }))

  let m_drag_card = createMemo(() => {
    let drags = m_drag_cards()
    return drags[0]
  })

  createEffect(() => {
    let drag_card = m_drag_card()
    let top_cards = m_top_cards()
    let bases = m_stack_bases()

    const center = drag_card?.abs_pos_center
    if (center) {
      let hit_top = top_cards.find(_ => {
        let res = _.vs_rect_bounds()
        if (res) {
          return hit_rectangle(res, center)
        }
      })

      top_cards.forEach(_ => _.flags.hovering_drop = (_ === hit_top))

      let hit_base = bases.find(_ => {
        let res = _.vs_rect_bounds()
        if (res) {
          return hit_rectangle(res, center)
        }
      })
      bases.forEach(_ => _.flags.hovering_drop = (_ === hit_base))
    } else {
      top_cards.forEach(_ => _.flags.hovering_drop = false)
      bases.forEach(_ => _.flags.hovering_drop = (_ === false))
    }
  })


  function drop_target_for_pos_n(o_stack_type: number, i: number) {
    let { pos, o_stack_n }  = m_stacks_by_type().get(o_stack_type)  || m_stacks_by_type().get(o_stack_type)
    let gap = table.a_rules.gaps.get(o_stack_type) ?? 0.2

    return Vec2.make(pos.x, pos.y + (i + o_stack_n) * gap)
  }

  return {
    drop() {
    let drags = m_drag_cards()
    let top_cards = m_top_cards()
    let bases = m_stack_bases()

    const drop_target = top_cards.find(_ => _.flags.hovering_drop) ||
      bases.find(_ => _.flags.hovering_drop)

    drags.forEach((_, i, _arr) => {
      let settle_vs = _.v_pos
      if (drop_target?.drop_rule) {
        settle_vs = drop_target_for_pos_n(drop_target.o_stack_type, i)
      }

      _.settle_for(settle_vs, () => {
        if (i !== _arr.length - 1) { return }

        const rule = drop_target?.drop_rule

        m_cards().forEach(_ => _.flags.ghosting = false)
        owrite(_drag_stack, undefined)
        owrite(_can_drop_args, undefined)

        if (rule) {
          table.apply_drop(rule)
        }
      })
    })

    },
    set stacks(stacks: Array<OStack>) {
      owrite(_stacks, stacks)
    },
    get bases() {
      return m_stack_bases()
    },
    get cards() {
      return m_cards()
    },
    get can_drop_args() {
      return read(_can_drop_args)
    },
    get drag_card() {
      return m_drag_card()
    },
    stack_by_type(o_stack_type: string) {
      return m_stacks_by_type().get(o_stack_type)
    },
    find_on_click() {
      let cards = m_cards()
      let card = cards.find(_ => _.mouse_down)

      if (card && card.can_click) {
        table.apply_click()
      }
    },
    find_on_drag_start() {
      if (read(_drag_stack)) {
        return
      }
      let cards = m_cards()

      let card = cards.find(_ => _.mouse_down)

      if (card && card.can_drag) {
        let stack_cards = cards.filter(_ => _.o_stack_type === card.o_stack_type)
        let drags = stack_cards.filter(_ => _.o_i >= card.o_i)

        drags.forEach(_ => _.flags.ghosting = true)

        let { o_stack_type, o_stack_n, o_i, abs_pos, pos } = card

        if (abs_pos) {
          _drag_target.x = abs_pos.x
          _drag_target.y = abs_pos.y
        }

        let __o_stack_type = '_' + o_stack_type.slice(1)

        owrite(_can_drop_args, [__o_stack_type, o_stack_n, o_i])

        owrite(_drag_stack, 
               [`d_`+o_stack_type.slice(2),
                 drags.map((_, o_i, _arr) => _.card_sr).join(''), `${pos.x}-${pos.y}`].join('@'))

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
  let _hovering_drop = createSignal(false)

  return {
    get hovering_drop() {
      return read(_hovering_drop)
    },
    set hovering_drop(v: boolean) {
      owrite(_hovering_drop, v)
    },
    get ghosting() {
      return read(_ghosting)
    },
    set ghosting(v: boolean) {
      owrite(_ghosting, v)
    }
  }
}

function make_card(table: Table, o_card: OCard, m_o_stack_n: number, _pos: Pos) {
  let [o_stack_type, _o_i, o_sr] = o_card.split('@')
  let [o_rank, o_suit] = o_sr.split('')
  let o_i = parseInt(_o_i)

  let m_v_pos = createMemo(() => {
    return table.a_cards.stack_by_type(o_stack_type).v_poss(o_i)
  })

  let o_back = o_suit === o_rank
  let o_drag = o_stack_type[2] === 'd'
  let m_o_top = createMemo(() => o_i === m_o_stack_n() - 1)
  let can_click = o_suit === o_rank && o_suit === 's'

  let m_lerp_i = createMemo(() => 1 - (o_i / m_o_stack_n()))

  let flags = make_card_flags()

  let m_revealing = createMemo(() =>
    !!table.a_rules.reveals.find(_ => _.o_stack_type === o_stack_type && _.o_i === o_i)
  )

  let m_can_drag = createMemo(() => {
    let o_stack_n = m_o_stack_n()
    return table.a_rules.can_drag(o_stack_type, o_stack_n, o_i)
  })

  let m_can_drop = createMemo(() => {
    let { can_drop_args } = table.a_cards
    if (can_drop_args) {
      return table.a_rules.can_drop(...can_drop_args, o_stack_type)
      && m_o_top()
    }
  })

  let m_drop_rule = createMemo(() => {
    let { can_drop_args } = table.a_cards
    if (can_drop_args) {
      return table.a_rules.drop_rule(...can_drop_args, o_stack_type)
    }
  })

  function settle_for(v_pos: Vec2, on_settled: () => void = () => {}) {
    loop_for(ticks.thirds, (dt, dt0, _it) => {
      _pos.lerp(v_pos.x, v_pos.y, m_lerp_i() * 0.2 + _it * 0.8)
      if (_it === 1) {
        on_settled(_it)
      }
    })
  }

  createEffect(() => {
    let v_pos = m_v_pos()
    if (!o_drag) {
      settle_for(v_pos)
    } else {
      _pos.x = v_pos.x
      _pos.y = v_pos.y
    }
  })
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

  let vs_rect_bounds = createMemo(() => {
    let rect = vs_rect()
    let abs = m_abs_pos()
    if (rect && abs) {
      return [abs.x, abs.y, rect.x, rect.y]
    }
  })


  let m_abs_pos_center = createMemo(() => {
    let rect = vs_rect()
    if (rect) {
      return _pos.vs.add(Vec2.unit.half).mul(rect)
    }
  })




  let m_klass = createMemo(() => ([ 
    flags.hovering_drop ? 'hovering-drop' : '',
    flags.ghosting ? 'ghosting' : '',
    m_revealing() ? 'revealing' : '',
    m_can_drag() ? 'can-drag' : '',
    m_can_drop() ? 'can-drop' : '',
    o_drag ? 'dragging' : '',
    ...(o_back ? back_klass : [
      colors[o_suit],
      rank_klasses[o_rank],
      suit_klasses[o_suit]
    ])
  ]).join(' ').trim().replace(/\s+/g, ' '));


  let m_style = createMemo(() => ({
    transform: `translate(calc(${_pos.x} * 100%), calc(${_pos.y} * 100%))`
  }))


  return {
    can_click,
    get drop_rule() {
      return m_drop_rule()
    },
    get can_drop_args() {
      let o_stack_n = m_o_stack_n()
      let __o_stack_type = '_' + o_stack_type.slice(1)
      return [__o_stack_type, o_stack_n, o_i]
    },
    get can_drop() {
      return m_can_drop()
    },
    get can_drag() {
      return m_can_drag()
    },
    get revealing() {
      return m_revealing()
    },
    settle_for,
    flags,
    o_stack_type,
    get o_stack_n() {
      return m_o_stack_n()
    },
    o_i,
    get o_top() {
      return m_o_top()
    },
    get o_drag() {
      return o_drag
    },
    get color() {
      return colors[o_suit]
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
    vs_rect_bounds,
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
    get v_pos() {
      return m_v_pos()
    },
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
    get abs_pos_center() {
      return m_abs_pos_center()
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



