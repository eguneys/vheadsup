import './index.css'
import './theme.css'
import { render } from 'solid-js/web'

import App from './view'

import { Table } from './table'

import ctrl from './ctrl'

export default function VCardTable(element: HTMLElement, options = {}) {

  let table = new Table()

  ctrl(table, options)



  render(App(table), element)

  return {
  }
}
