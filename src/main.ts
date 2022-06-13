import './index.css'
import './theme.css'
import { render } from 'solid-js/web'

import App from './view'

import { Table } from './table'

export default function VCardTable(element: HTMLElement, options = {}) {

  let table = new Table()
  render(App(table), element)

  return {
  }
}
