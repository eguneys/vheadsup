import './index.css'
import './theme.css'
import './solitaire.css'
import './headsup.css'
import { render } from 'solid-js/web'

import App from './view'
import ctrl from './ctrl'

export default function VCardTable(element: HTMLElement, options = {}) {

  let table = ctrl()

  render(App(table), element)

  return {
  }
}
