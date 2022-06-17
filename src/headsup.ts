import { onCleanup, createEffect, mapArray, createSignal, createMemo } from 'solid-js'
import { read, owrite, write } from './play'
import { Vec2 } from 'soli2d'
import { make_sticky_pos } from './make_sticky'
import { make_position } from './make_util'
import { loop_for } from './play'
import { ticks } from './shared'


const colors = { h: 'red', 'd': 'red', 'c': 'black', 's': 'black' }
const suits = ['h', 'd', 'c', 's']
const ranks = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K']
const cards = ranks.flatMap(rank => suits.map(suit => rank + suit))
const backs = cards.map(_ => 'zz')
const cards4 = [...Array(4).keys()].flatMap(_ => cards.slice(0))
const backs4 = cards4.map(_ => 'zz')


let back_klass = ['back']
let rank_klasses = { '1': 'ace', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', 'T': 'ten', 'J': 'jack', 'Q': 'queen', 'K': 'king' }
let suit_klasses = { 's': 'spades', 'd': 'diamonds', 'h': 'hearts', 'c': 'clubs' }


let chip_colors = ['w', 'b', 'g', 'p', 'y']
let chips10 = chip_colors.flatMap(color => [...Array(200).keys()].map(() => color))


export class HeadsUp {

  get cards() {
    return this.a_cards.cards
  }

  get chips() {
    return this.a_chips.chips
  }

  set $ref($ref: HTMLElement) {
    owrite(this._$ref, $ref)
  }

  onScroll() {
    owrite(this._$clear_bounds)
  }


  view = 'headsup'

  constructor() { 
  
    this._$ref = createSignal(undefined, { equals: false })
    let m_ref = createMemo(() => read(this._$ref))

    this._$clear_bounds = createSignal(undefined, { equals: false })

    this.m_rect = createMemo(() => {
      read(this._$clear_bounds)
      return m_ref()?.getBoundingClientRect()
    })

    this.m_chip_amount_font_size = createMemo(() => {
      let rect = this.m_rect()
      if (rect) {
        return (rect.width / 16) * 0.3
      }
      return 1
    })

    this.a_cards = make_cards(this)
    this.a_chips = make_chips_all(this)

  }
}

function make_card_flags() {
  let _revealing = createSignal(false)
  let _settling = createSignal(false)


  return {
    get settling() {
      return read(_settling)
    },
    set settling(v: boolean) {
      return owrite(_settling, v)
    },

    get revealing() {
      return read(_revealing)
    },
    set revealing(v: boolean) {
      return owrite(_revealing, v)
    }
  }
}

function make_card(table: HeadsUp, card: Card, v_pos: Vec2, _pos: Pos) {
  let [o_name, o_sr, o_pos] = card.split('@')
  let o_stack_type = '__' + o_name

  let [o_rank, o_suit] = o_sr.split('')
  let o_back = o_suit === o_rank

  let flags = make_card_flags()

  flags.settling = true

  let m_rank = createMemo(() => flags.settling || flags.revealing ? 'z': o_rank)
  let m_suit = createMemo(() => flags.settling || flags.revealing ? 'z' : o_suit)
  let m_back = createMemo(() => m_rank() === m_suit())

  function settle_for(v_pos: Vec2, on_settled: () => void = () => {}) {
    loop_for(ticks.thirds, (dt, dt0, _it) => {
      _pos.lerp(v_pos.x, v_pos.y, 0.2 + _it * 0.8)
      if (_it === 1) {
        flags.revealing = true
        flags.settling = false
        setTimeout(() => {
          flags.revealing = false
        }, ticks.half)
        on_settled(_it)
      }
    })
  }

  settle_for(v_pos)
  let m_klass = createMemo(() => ([
    flags.revealing ? 'revealing': '',
    ...(m_back() ? back_klass : [
      colors[m_suit()],
      rank_klasses[m_rank()],
      suit_klasses[m_suit()]
    ])
  ]).join(' ').trim().replace(/\s+/g, ' '));



  let m_style = createMemo(() => ({
    transform: `translate(calc(${_pos.x} * 100%), calc(${_pos.y} * 100%))`
  }))


  return {
    get style() {
      return m_style()
    },
    get klass() {
      return m_klass()
    },
    get rank() {
      return m_rank()
    },
    get suit() {
      return m_suit()
    }
  }
}

function make_cards(table: HeadsUp) {

  let _cards = createSignal([])


  let sticky_pos = make_sticky_pos((c: OCard, v: Vec2) => make_position(v.x, v.y))

  cards.forEach(_ => sticky_pos.release_pos(_, make_position(0, 0)))
  backs.forEach(_ => sticky_pos.release_pos(_, make_position(0, 0)))

  let m_cards = createMemo(mapArray(_cards[0], _ => {

    let [o_stack_type, o_card, o_pos] = _.split('@')

    let v_pos = Vec2.make(...o_pos.split('-').map(_ => parseFloat(_)))
    let _p = sticky_pos.acquire_pos(o_card, Vec2.make(v_pos.x, v_pos.y))


    let res = make_card(table, _, v_pos, _p)

    onCleanup(() => {
      sticky_pos.release_pos(o_card, _p)
    })

    return res
  }))

  return {
    set cards(cards: Array<Card>) {
      owrite(_cards, cards)
    },
    get cards() {
      return m_cards()
    }
  }
}


function make_chip_holder(table: HeadsUp, _chips: OChips) {
  let [o_name, o_chips, o_pos] = _chips.split('@')
  let o_stack_type = '__' + o_name

  let chips = o_chips.split('$').map(_ => [o_stack_type, _, o_pos].join('@'))

  return {
    chips
  }
}



function make_chips_all(table: HeadsUp) {

  let _chips_all = createSignal([])

  let sticky_pos = make_sticky_pos((c: OChip, v: Vec2) => make_position(v.x, v.y))

  chips10.forEach(_ => sticky_pos.release_pos(_, make_position(0, 0)))

  let m_chips_all = createMemo(mapArray(_chips_all[0], (_, i) => make_chip_holder(table, _)))

  let _chips = createMemo(() => m_chips_all().flatMap(_ => _.chips))



  let m_chips = createMemo(mapArray(_chips, _ => {
    let [o_stack_type, o_chip, o_pos] = _.split('@')
    let o_chip_color = o_chip.slice(-1)[0]

    let v_pos = Vec2.make(...o_pos.split('-').map(_ => parseFloat(_)))
    let _p = sticky_pos.acquire_pos(o_chip_color, Vec2.make(v_pos.x, v_pos.y))

    let res = make_chips(table, _, v_pos, _p)

    onCleanup(() => {
      sticky_pos.release_pos(o_chip_color, _p)
    })

    return res
  }))

  
  return {
    get chips() {
      return m_chips()
    },
    set chips(chips: Array<OChip>) {
      owrite(_chips_all, chips)
    }
  }
}


const color_offsets = {
  'w': [-1.1, 0], 'b': [-0.55, -1.1], 'g': [0.55, -1.1], 'p': [0, 0], 'y': [1.1, 0]
}

const color_colors = { 'w': 'white', 'b': 'black', 'g': 'green', 'p': 'purple', 'y': 'yellow' }

function make_chips(table: HeadsUp, _: OChips, v_pos: Vec2, _pos: Pos) {
  let [o_stack_type, o_chip, o_pos] = _.split('@')
  let o_chip_color = o_chip.slice(-1)[0]
  let o_chip_amount = parseInt(o_chip.slice(0, -1))

  let v_pos_offset = v_pos.add(Vec2.make(...color_offsets[o_chip_color]))

  function settle_for(v_pos: Vec2, on_settled: () => void = () => {}) {
    loop_for(ticks.thirds * 10, (dt, dt0, _it) => {
      _pos.lerp(v_pos.x, v_pos.y, 0.2 + _it * 0.8)
      if (_it === 1) {
        on_settled(_it)
      }
    })
  }

  settle_for(v_pos_offset)
  let m_klass = createMemo(() => ([
    color_colors[o_chip_color]
  ]).join(' ').trim().replace(/\s+/g, ' '));



  let m_style = createMemo(() => ({
    transform: `translate(calc(${_pos.x} * 100%), calc(${_pos.y} * 100%))`,
    'font-size': `${table.m_chip_amount_font_size()}px`
  }))

  return {
    amount: o_chip_amount,
    get style() {
      return m_style()
    },
    get klass() {
      return m_klass()
    },
  }

}


