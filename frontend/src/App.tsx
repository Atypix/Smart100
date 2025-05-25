// frontend/src/App.tsx
import React from 'react';
import BacktestRunnerPage from './components/BacktestRunnerPage'; // Ensure this path is correct
import ApiKeyManager from './components/ApiKeyManager'; // Import the new component
import './index.css'; // Import global styles

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Smart100 Trading App</h1>
      </header>
      <main>
        {/* Existing BacktestRunnerPage */}
        <BacktestRunnerPage />
        
        {/* Divider or section for API Key Management */}
        <hr style={{ margin: '20px 0' }} /> 
        <section className="api-key-management-section">
          {/* <h2>API Key Management</h2> // Title is inside ApiKeyManager component */}
          <ApiKeyManager />
        </section>
      </main>
      <footer className="App-footer">
        <p>&copy; 2024 Smart100</p>
      </footer>
    </div>
  );
}

export default App;
