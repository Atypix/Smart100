// frontend/src/components/ApiKeyManager.tsx
import React, { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { ApiKey, ApiKeyFormData } from '../types';
import * as api from '../services/api'; // Assuming api.ts is in ../services

const initialFormData: ApiKeyFormData = {
  exchange_name: '',
  api_key: '',
  api_secret: '',
};

const ApiKeyManager: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ApiKeyFormData>(initialFormData);
  const [isEditing, setIsEditing] = useState<string | null>(null); // Stores ID of key being edited

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const keys = await api.fetchApiKeys();
      setApiKeys(keys);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch API keys.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (isEditing) {
        // For update, only send fields that are filled.
        // Backend expects full object if certain fields are optional or partial updates are handled.
        // Our backend's PUT /keys/:id can handle partial updates for name, key, secret.
        const updateData: Partial<ApiKeyFormData> = {};
        if (formData.exchange_name) updateData.exchange_name = formData.exchange_name;
        // For key/secret, they should be re-entered if changing.
        // If they are left blank in the form during edit, they should not be sent for update,
        // unless the backend interprets empty strings as "clear this field" (which ours doesn't).
        // For this implementation, if api_key or api_secret is blank during edit, it means "don't change".
        // However, the backend service requires them if they are to be updated.
        // Let's assume for edit, if user wants to change key/secret, they must provide new values.
        // If they only want to change name, they can leave key/secret blank.
        if (formData.api_key) updateData.api_key = formData.api_key;
        if (formData.api_secret) updateData.api_secret = formData.api_secret;


        if (Object.keys(updateData).length > 0) {
            await api.updateApiKey(isEditing, updateData);
        } else {
            // If no actual data changed, maybe just refresh or do nothing.
            // Forcing an update with empty data might not be what the backend service expects.
            // The service itself updates `updated_at` even with no changed fields.
            await api.updateApiKey(isEditing, {}); // Triggers timestamp update on backend
        }
        
      } else {
        await api.addApiKey(formData);
      }
      setFormData(initialFormData);
      setIsEditing(null);
      fetchKeys(); // Refresh list
    } catch (err: any) {
      setError(err.message || `Failed to ${isEditing ? 'update' : 'add'} API key.`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (key: ApiKey) => {
    setIsEditing(key.id);
    // Populate form with exchange_name. Key/secret should be re-entered if changing.
    setFormData({
      exchange_name: key.exchange_name,
      api_key: '', // Do not pre-fill sensitive data for editing
      api_secret: '', // Do not pre-fill sensitive data for editing
    });
    setError(null); // Clear previous errors
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this API key?')) return;
    setIsLoading(true);
    setError(null);
    try {
      await api.deleteApiKey(id);
      fetchKeys(); // Refresh list
    } catch (err: any) {
      setError(err.message || 'Failed to delete API key.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const cancelEdit = () => {
    setIsEditing(null);
    setFormData(initialFormData);
    setError(null);
  };

  const maskApiKey = (key: string) => {
    if (!key || key.length < 8) return key; // or return 'Invalid Key'
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  return (
    <div className="api-key-manager">
      <h2>API Key Management</h2>

      {isLoading && <p>Loading...</p>}
      {error && <p className="error-message" style={{ color: 'red' }}>Error: {error}</p>}

      <form onSubmit={handleSubmit} className="api-key-form">
        <h3>{isEditing ? 'Edit API Key' : 'Add New API Key'}</h3>
        <div>
          <label htmlFor="exchange_name">Exchange Name:</label>
          <input
            type="text"
            id="exchange_name"
            name="exchange_name"
            value={formData.exchange_name}
            onChange={handleInputChange}
            required={!isEditing} // Required only when adding
          />
        </div>
        <div>
          <label htmlFor="api_key">API Key:</label>
          <input
            type="text"
            id="api_key"
            name="api_key"
            value={formData.api_key}
            onChange={handleInputChange}
            placeholder={isEditing ? "Enter new API Key (optional)" : "Enter API Key"}
            required={!isEditing} // Required only when adding
          />
        </div>
        <div>
          <label htmlFor="api_secret">API Secret:</label>
          <input
            type="password" // Use password type for secret
            id="api_secret"
            name="api_secret"
            value={formData.api_secret}
            onChange={handleInputChange}
            placeholder={isEditing ? "Enter new API Secret (optional)" : "Enter API Secret"}
            required={!isEditing} // Required only when adding
          />
        </div>
        <button type="submit" disabled={isLoading}>
          {isEditing ? 'Update Key' : 'Add Key'}
        </button>
        {isEditing && (
          <button type="button" onClick={cancelEdit} disabled={isLoading}>
            Cancel Edit
          </button>
        )}
      </form>

      <h3>Your API Keys</h3>
      {apiKeys.length === 0 && !isLoading && <p>No API keys found.</p>}
      <table className="api-keys-table">
        <thead>
          <tr>
            <th>Exchange</th>
            <th>API Key (Masked)</th>
            <th>Created At</th>
            <th>Updated At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {apiKeys.map((key) => (
            <tr key={key.id}>
              <td>{key.exchange_name}</td>
              <td>{maskApiKey(key.api_key)}</td>
              <td>{new Date(key.created_at).toLocaleString()}</td>
              <td>{new Date(key.updated_at).toLocaleString()}</td>
              <td>
                <button onClick={() => handleEdit(key)} disabled={isLoading}>Edit</button>
                <button onClick={() => handleDelete(key.id)} disabled={isLoading} className="delete-button">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <style>{`
        .api-key-manager { margin: 20px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
        .api-key-form div { margin-bottom: 10px; }
        .api-key-form label { display: inline-block; width: 150px; }
        .api-key-form input { padding: 8px; border: 1px solid #ddd; border-radius: 4px; width: calc(100% - 170px); }
        .api-keys-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .api-keys-table th, .api-keys-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .api-keys-table th { background-color: #f4f4f4; }
        .error-message { color: red; margin-bottom: 15px; }
        .delete-button { margin-left: 5px; background-color: #ffdddd; }
        button { padding: 8px 12px; margin-right: 5px; border-radius: 4px; cursor: pointer; }
        button:disabled { cursor: not-allowed; opacity: 0.7; }
      `}</style>
    </div>
  );
};

export default ApiKeyManager;
