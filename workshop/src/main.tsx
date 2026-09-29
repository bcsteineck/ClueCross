import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkshopApp } from './WorkshopApp'
import './workshop.scss'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkshopApp />
  </StrictMode>,
)
