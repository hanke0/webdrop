import App from './App.tsx'
import CloseableToast from './components/CloseableToast.tsx'
import ReactDOM from 'react-dom/client'

import './main.css'
import React from 'react'


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CloseableToast />
    <App />
  </React.StrictMode>
)
