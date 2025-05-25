// frontend/src/services/api.ts
import { ApiKey, ApiKeyFormData } from '../types';

const API_BASE_URL = '/api'; // Adjust if your API is hosted elsewhere

interface ApiErrorResponse {
  message: string;
  error?: any; // Can be more specific if backend provides structured errors
}

// Helper function to get the auth token
const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken'); // Or your preferred way of storing/retrieving the token
};

// Helper function to handle API responses
const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let errorData: ApiErrorResponse;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { message: `Request failed with status ${response.status}` };
    }
    console.error('API Error:', errorData);
    throw new Error(errorData.message || 'An unknown error occurred');
  }
  // For 204 No Content, response.json() will fail.
  if (response.status === 204) {
    return {} as T; // Or null, depending on how you want to handle it
  }
  return response.json() as Promise<T>;
};

// --- API Key Service Functions ---

export const fetchApiKeys = async (): Promise<ApiKey[]> => {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/keys`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  return handleResponse<ApiKey[]>(response);
};

export const addApiKey = async (data: ApiKeyFormData): Promise<ApiKey> => {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return handleResponse<ApiKey>(response);
};

export const updateApiKey = async (id: string, data: Partial<ApiKeyFormData>): Promise<ApiKey> => {
  // Note: The backend expects all fields for an update if they are part of the DTO.
  // If the backend allows partial updates, this is fine. Otherwise, ensure `data` includes all necessary fields.
  // For this implementation, we assume partial updates are fine if the service supports it.
  // The service created in previous steps supports partial updates for name, key, secret.
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/keys/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return handleResponse<ApiKey>(response);
};

export const deleteApiKey = async (id: string): Promise<void> => {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/keys/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  // For DELETE, we expect a 204 No Content, which handleResponse can manage.
  await handleResponse<void>(response); 
};
