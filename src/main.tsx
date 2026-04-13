import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { hasError: true, message }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-apple-gray flex items-center justify-center p-6">
          <div className="bg-white rounded-apple-sm border border-gray-200 shadow-sm max-w-lg w-full p-6">
            <div className="text-lg font-semibold text-gray-900">畫面發生錯誤</div>
            <div className="text-sm text-gray-600 mt-2 break-words">{this.state.message}</div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 px-4 py-2 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-colors"
            >
              重新整理
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
