// frontend/src/pages/ApiKeysPage.tsx
import React from 'react';
import ApiKeyManager from '../components/ApiKeyManager'; // Correct path
import './ApiKeysPage.css'; // Optional: for page-specific styling

const ApiKeysPage: React.FC = () => {
  return (
    <div className="api-keys-page-container">
      <h2>Gestion des Clés API</h2>
      <p>Gérez ici vos clés API pour les services externes (par exemple, Binance, Alpha Vantage).</p>
      <ApiKeyManager />
    </div>
  );
};

export default ApiKeysPage;
