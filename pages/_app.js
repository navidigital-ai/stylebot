import "../styles/globals.css";
import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error: error?.message || String(error) };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif" }}>
          <h2>Ошибка загрузки</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App({ Component: PageComponent, pageProps }) {
  return (
    <ErrorBoundary>
      <PageComponent {...pageProps} />
    </ErrorBoundary>
  );
}
