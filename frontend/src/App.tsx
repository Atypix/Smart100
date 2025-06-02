// frontend/src/App.tsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import BacktestRunnerPage from './components/BacktestRunnerPage'; // Existing page
// Import actual placeholder pages
import SuggestionPage from './pages/SuggestionPage'; 
import ApiKeysPage from './pages/ApiKeysPage';

import './App.css'; // Keep existing App.css

const App: React.FC = () => {
  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/suggestion" />} /> {/* Default redirect */}
            <Route path="/suggestion" element={<SuggestionPage />} />
            <Route path="/backtest" element={<BacktestRunnerPage />} />
            <Route path="/api-keys" element={<ApiKeysPage />} />
            {/* Add other routes here as needed */}
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
