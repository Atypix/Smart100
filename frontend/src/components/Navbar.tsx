// frontend/src/components/Navbar.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css'; // We'll create this for basic styling

const Navbar: React.FC = () => {
  return (
    <nav className="navbar">
      <ul className="navbar-nav">
        <li className="nav-item">
          <Link to="/suggestion" className="nav-link">Suggestion</Link>
        </li>
        <li className="nav-item">
          <Link to="/backtest" className="nav-link">Backtest</Link>
        </li>
        <li className="nav-item">
          <Link to="/api-keys" className="nav-link">Clés API</Link>
        </li>
      </ul>
    </nav>
  );
};

export default Navbar;
