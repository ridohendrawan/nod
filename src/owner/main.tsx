// Sarah's page (o.html, D86): its own small bundle, with none of Dan's app in it.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/fonts.css'
import '../styles/tokens.css'
import '../styles/base.css'
import '../styles/components.css'
import '../styles/forms.css'
import '../styles/owner.css'
import { clickByName } from '../ui/clickByName.ts'
import { OwnerPage } from './OwnerPage.tsx'

// Inside a drawn phone (the demo stage), the page leaves room for its status bar.
if (window.self !== window.top) document.documentElement.dataset.frame = 'phone'

const root = document.getElementById('root')
if (!root) throw new Error('Nod: the page has no #root element.')

createRoot(root).render(
  <StrictMode>
    <OwnerPage />
  </StrictMode>,
)

// A preview link (/screens/sarah-approve, src/app/preview) opens one of her sheets: ?open=approve,
// ask or no, through its button.
const OPEN: Record<string, string> = { approve: 'Approve', ask: 'Ask a question', no: 'Say no' }
const open = OPEN[new URLSearchParams(location.search).get('open') ?? '']
if (open) void clickByName([open])
