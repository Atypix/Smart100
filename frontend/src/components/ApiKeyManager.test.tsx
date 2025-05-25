// frontend/src/components/ApiKeyManager.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ApiKeyManager from './ApiKeyManager';
import * as api from '../services/api'; // To be mocked
import { ApiKey, ApiKeyFormData } from '../types';

// Mock the api service
jest.mock('../services/api');
const mockedApi = api as jest.Mocked<typeof api>;

const mockApiKeys: ApiKey[] = [
  {
    id: '1',
    user_id: 'user1',
    exchange_name: 'Binance',
    api_key: 'binancekey123', // Real key would be longer
    api_secret: 'binancesecret456', // This won't be used in display
    created_at: Date.now() - 100000,
    updated_at: Date.now() - 50000,
  },
  {
    id: '2',
    user_id: 'user1',
    exchange_name: 'Coinbase',
    api_key: 'coinbasekey789',
    api_secret: 'coinbasesecret012',
    created_at: Date.now() - 200000,
    updated_at: Date.now() - 150000,
  },
];

describe('ApiKeyManager Component', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockedApi.fetchApiKeys.mockReset();
    mockedApi.addApiKey.mockReset();
    mockedApi.updateApiKey.mockReset();
    mockedApi.deleteApiKey.mockReset();

    // Default successful fetch
    mockedApi.fetchApiKeys.mockResolvedValue([...mockApiKeys]); // Return a copy
  });

  test('renders loading state initially then displays API keys', async () => {
    render(<ApiKeyManager />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Binance')).toBeInTheDocument();
      expect(screen.getByText('Coinbase')).toBeInTheDocument();
      // Check for masked keys - e.g. "bina...y123"
      expect(screen.getByText(/bina...y123/i)).toBeInTheDocument(); 
      expect(screen.getByText(/coin...y789/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  test('displays error message if fetching keys fails', async () => {
    mockedApi.fetchApiKeys.mockRejectedValueOnce(new Error('Failed to fetch'));
    render(<ApiKeyManager />);

    await waitFor(() => {
      expect(screen.getByText(/Error: Failed to fetch/i)).toBeInTheDocument();
    });
  });

  test('allows adding a new API key', async () => {
    const newKeyData: ApiKeyFormData = {
      exchange_name: 'Kraken',
      api_key: 'krakenapikey',
      api_secret: 'krakensecret',
    };
    const returnedNewKey: ApiKey = { ...newKeyData, id: '3', user_id: 'user1', created_at: Date.now(), updated_at: Date.now() };
    
    mockedApi.addApiKey.mockResolvedValue(returnedNewKey);
    // For the refresh after add:
    mockedApi.fetchApiKeys.mockResolvedValueOnce([...mockApiKeys, returnedNewKey]);


    render(<ApiKeyManager />);
    await waitFor(() => expect(screen.getByText('Binance')).toBeInTheDocument()); // Ensure initial load done

    fireEvent.change(screen.getByLabelText(/Exchange Name/i), { target: { value: newKeyData.exchange_name } });
    fireEvent.change(screen.getByLabelText(/API Key:/i), { target: { value: newKeyData.api_key } });
    fireEvent.change(screen.getByLabelText(/API Secret/i), { target: { value: newKeyData.api_secret } });
    
    fireEvent.click(screen.getByRole('button', { name: /Add Key/i }));

    await waitFor(() => {
      expect(mockedApi.addApiKey).toHaveBeenCalledWith(newKeyData);
      expect(screen.getByText('Kraken')).toBeInTheDocument(); // Check if new key is displayed
    });
  });

  test('allows editing an API key (name and re-entering key/secret)', async () => {
    const keyToEdit = mockApiKeys[0]; // Binance key
    const updatedData: Partial<ApiKeyFormData> = { // User only changes name and provides new key
      exchange_name: 'Binance Updated',
      api_key: 'newbinancekey',
    };
    // Secret is not changed by user in this interaction, so it's not part of `updatedData`
    // The component will send an empty string for secret if not touched,
    // which the current `ApiKeyManager` implementation means "don't change".
    // The backend `updateApiKey` service handles `Partial<ApiKeyFormData>`.

    const returnedUpdatedKey: ApiKey = { 
        ...keyToEdit, 
        exchange_name: updatedData.exchange_name!, 
        api_key: updatedData.api_key!, 
        // secret remains original as it's not in updatedData
        updated_at: Date.now() 
    };
    
    mockedApi.updateApiKey.mockResolvedValue(returnedUpdatedKey);
    // For refresh:
    const updatedList = mockApiKeys.map(k => k.id === keyToEdit.id ? returnedUpdatedKey : k);
    mockedApi.fetchApiKeys.mockResolvedValue(updatedList);


    render(<ApiKeyManager />);
    await waitFor(() => expect(screen.getByText('Binance')).toBeInTheDocument());

    // Click edit on the first key (Binance)
    const editButtons = screen.getAllByRole('button', { name: /Edit/i });
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect((screen.getByLabelText(/Exchange Name/i) as HTMLInputElement).value).toBe(keyToEdit.exchange_name);
      expect((screen.getByLabelText(/API Key:/i) as HTMLInputElement).placeholder).toContain("Enter new API Key (optional)");
    });

    fireEvent.change(screen.getByLabelText(/Exchange Name/i), { target: { value: updatedData.exchange_name } });
    fireEvent.change(screen.getByLabelText(/API Key:/i), { target: { value: updatedData.api_key } });
    // User does not touch API Secret input, meaning they don't want to change it.

    fireEvent.click(screen.getByRole('button', { name: /Update Key/i }));

    await waitFor(() => {
      // Expect updateApiKey to be called with only name and key if secret wasn't touched
      expect(mockedApi.updateApiKey).toHaveBeenCalledWith(keyToEdit.id, updatedData);
      expect(screen.getByText('Binance Updated')).toBeInTheDocument();
      expect(screen.getByText(/newb...key/i)).toBeInTheDocument();
    });
  });
  
  test('allows updating only the secret of an API key', async () => {
    const keyToEdit = mockApiKeys[0]; // Binance key
    const updatedSecretData: Partial<ApiKeyFormData> = { 
      api_secret: 'newsupersecret',
    };
     const returnedUpdatedKey: ApiKey = { 
        ...keyToEdit, 
        api_secret: updatedSecretData.api_secret!, // key/name remain original
        updated_at: Date.now() 
    };
    mockedApi.updateApiKey.mockResolvedValue(returnedUpdatedKey);
    const updatedList = mockApiKeys.map(k => k.id === keyToEdit.id ? returnedUpdatedKey : k);
    mockedApi.fetchApiKeys.mockResolvedValue(updatedList);

    render(<ApiKeyManager />);
    await waitFor(() => expect(screen.getByText('Binance')).toBeInTheDocument());

    const editButtons = screen.getAllByRole('button', { name: /Edit/i });
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect((screen.getByLabelText(/Exchange Name/i)as HTMLInputElement).value).toBe(keyToEdit.exchange_name);
    });
    
    // User only changes secret
    fireEvent.change(screen.getByLabelText(/API Secret/i), { target: { value: updatedSecretData.api_secret } });

    fireEvent.click(screen.getByRole('button', { name: /Update Key/i }));
    
    await waitFor(() => {
      expect(mockedApi.updateApiKey).toHaveBeenCalledWith(keyToEdit.id, updatedSecretData);
      // Visually, the list won't show the secret, but the call is what we test.
      // We can check if the name is still the old one.
      expect(screen.getByText(keyToEdit.exchange_name)).toBeInTheDocument();
    });
  });


  test('cancels editing mode', async () => {
    render(<ApiKeyManager />);
    await waitFor(() => expect(screen.getByText('Binance')).toBeInTheDocument());

    const editButtons = screen.getAllByRole('button', { name: /Edit/i });
    fireEvent.click(editButtons[0]); // Click edit on the first key

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Update Key/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Cancel Edit/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Key/i })).toBeInTheDocument(); // Back to Add mode
      expect((screen.getByLabelText(/Exchange Name/i) as HTMLInputElement).value).toBe(''); // Form reset
    });
  });

  test('allows deleting an API key', async () => {
    const keyToDelete = mockApiKeys[0];
    mockedApi.deleteApiKey.mockResolvedValue(undefined); // delete returns void
    // For refresh:
    const updatedList = mockApiKeys.filter(k => k.id !== keyToDelete.id);
    mockedApi.fetchApiKeys.mockResolvedValue(updatedList);

    // Mock window.confirm
    window.confirm = jest.fn(() => true);

    render(<ApiKeyManager />);
    await waitFor(() => expect(screen.getByText('Binance')).toBeInTheDocument());

    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
    fireEvent.click(deleteButtons[0]); // Delete Binance

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this API key?');

    await waitFor(() => {
      expect(mockedApi.deleteApiKey).toHaveBeenCalledWith(keyToEdit.id);
      expect(screen.queryByText('Binance')).not.toBeInTheDocument();
      expect(screen.getByText('Coinbase')).toBeInTheDocument(); // Other key still there
    });
  });
  
  test('does not delete if user cancels confirmation', async () => {
    render(<ApiKeyManager />);
    await waitFor(() => expect(screen.getByText('Binance')).toBeInTheDocument());

    window.confirm = jest.fn(() => false); // User clicks "Cancel"

    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
    fireEvent.click(deleteButtons[0]);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockedApi.deleteApiKey).not.toHaveBeenCalled();
    expect(screen.getByText('Binance')).toBeInTheDocument(); // Still there
  });
});
