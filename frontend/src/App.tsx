// frontend/src/App.tsx
import React, { useState, useEffect } from 'react';
import BacktestRunnerPage from './components/BacktestRunnerPage';
import ApiKeyManager from './components/ApiKeyManager';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import * as api from './services/api'; // For getToken, logoutUser
import './index.css'; // Import global styles

type ViewName = 'login' | 'register' | 'app';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<ViewName>('login'); // Default to login

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      setIsAuthenticated(true);
      setCurrentView('app');
    } else {
      setIsAuthenticated(false);
      setCurrentView('login'); // Or 'login' if you prefer that as initial default for non-auth
    }
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setCurrentView('app');
  };

  const handleRegisterSuccess = () => {
    // After successful registration, direct user to login
    setCurrentView('login'); 
    // Optionally, display a message: "Registration successful! Please log in."
    // This could be handled with another state variable or by passing a prop to LoginPage
  };

  const handleLogout = () => {
    api.logoutUser(); // Clears the token from localStorage
    setIsAuthenticated(false);
    setCurrentView('login');
  };

  const navigateToRegister = () => {
    setCurrentView('register');
  };

  const navigateToLogin = () => {
    setCurrentView('login');
  };
  
  const headerStyles: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 20px',
    borderBottom: '1px solid #ccc',
  };

  const navStyles: React.CSSProperties = {
    display: 'flex',
    gap: '15px',
  };
  
  const navButtonStyles: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#007bff',
    cursor: 'pointer',
    padding: '5px',
    textDecoration: 'underline',
  };


  return (
    <div className="App">
      <header className="App-header" style={headerStyles}>
        <h1>Smart100 Trading App</h1>
        <nav style={navStyles}>
          {isAuthenticated ? (
            <button onClick={handleLogout} style={navButtonStyles}>Logout</button>
          ) : (
            <>
              {currentView === 'login' && (
                <button onClick={navigateToRegister} style={navButtonStyles}>Need an account? Register</button>
              )}
              {currentView === 'register' && (
                <button onClick={navigateToLogin} style={navButtonStyles}>Already have an account? Login</button>
              )}
            </>
          )}
        </nav>
      </header>
      <main>
        {isAuthenticated && currentView === 'app' && (
          <>
            <BacktestRunnerPage />
            <hr style={{ margin: '20px 0' }} />
            <section className="api-key-management-section">
              <ApiKeyManager />
            </section>
          </>
        )}
        {!isAuthenticated && currentView === 'login' && (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        )}
        {!isAuthenticated && currentView === 'register' && (
          <RegisterPage onRegisterSuccess={handleRegisterSuccess} />
        )}
      </main>
      <footer className="App-footer">
        <p>&copy; 2024 Smart100</p>
      </footer>
    </div>
  );
}

export default App;
