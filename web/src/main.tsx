import './i18n.ts'
import App from './App.tsx'
import CloseableToast from './components/closable-toast.tsx'
import ReactDOM from 'react-dom/client'
import React from 'react'
import './main.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CloseableToast />
    <App />
  </React.StrictMode>
)
