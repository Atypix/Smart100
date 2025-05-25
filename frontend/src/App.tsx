// frontend/src/App.tsx
import React from 'react';
import BacktestRunnerPage from './components/BacktestRunnerPage'; // Ensure this path is correct
import './index.css'; // Import global styles

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Smart100 Trading App - Backtester</h1>
      </header>
      <main>
        <BacktestRunnerPage />
      </main>
      <footer className="App-footer">
        <p>&copy; 2024 Smart100</p>
      </footer>
    </div>
  );
}

export default App;
