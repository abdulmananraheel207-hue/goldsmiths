import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

/** Shows a friendly message instead of a blank screen if a page crashes. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page error:', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    // Clear the error when the user goes to another page.
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card flex flex-col items-center gap-4 p-8 text-center" role="alert">
        <AlertTriangle className="h-10 w-10 text-danger-600" aria-hidden />
        <h1>Sorry, this page had a problem</h1>
        <p className="max-w-lg text-ink-soft">
          Please try again. If it keeps happening, use the menu to open another page and tell the person who looks after this system.
        </p>
        <p className="max-w-lg text-[12.5px] text-ink-faint">{String(this.state.error?.message || '')}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-[38px] rounded-lg bg-onyx-800 px-5 text-[14px] font-medium text-white hover:bg-onyx-600"
        >
          Reload the page
        </button>
      </div>
    );
  }
}
