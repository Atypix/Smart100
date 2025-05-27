// frontend/src/services/api.ts
import { ApiKey, ApiKeyFormData } from '../types';

const API_BASE_URL = '/api'; // Adjust if your API is hosted elsewhere

interface ApiErrorResponse {
  message: string;
  error?: any; // Can be more specific if backend provides structured errors
}

// Helper function to get the auth token
export const getToken = (): string | null => { // Renamed and Exported
  return localStorage.getItem('jwtToken'); // Standardized to 'jwtToken'
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

// --- Auth Service Functions ---

export const loginUser = async (email_param: string, password_param: string): Promise<{ token: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: email_param, password: password_param }),
  });
  // handleResponse will throw for non-ok responses
  // The component calling loginUser will be responsible for storing the token
  return handleResponse<{ token: string }>(response);
};

export const registerUser = async (email_param: string, password_param: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: email_param, password: password_param }),
  });
  // handleResponse will throw for non-ok responses
  return handleResponse<any>(response);
};

export const logoutUser = (): void => {
  localStorage.removeItem('jwtToken');
  // Optionally, redirect or update UI state here or in the component calling this
};


// --- API Key Service Functions ---

export const fetchApiKeys = async (): Promise<ApiKey[]> => {
  const token = getToken(); // Use the new getToken function
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
  const token = getToken(); // Corrected: was getAuthToken
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
  const token = getToken(); // Use the new getToken function
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
  const token = getToken(); // Use the new getToken function
  const response = await fetch(`${API_BASE_URL}/keys/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  // For DELETE, we expect a 204 No Content, which handleResponse can manage.
  await handleResponse<void>(response); 
};

// --- AI Strategy Choice Service Functions ---

export interface AIChoiceResponse {
  symbol: string;
  chosenStrategyId?: string; // Optional because it might not be found
  chosenStrategyName?: string; // Optional
  message: string;
}

export const getAICurrentStrategy = async (symbol: string): Promise<AIChoiceResponse> => {
  const response = await fetch(`${API_BASE_URL}/ai/current-strategy/${symbol}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      // No Authorization header needed for this public endpoint
    },
  });
  // handleResponse will throw for non-ok responses (like 404 or 500)
  // For 404 specifically, the backend sends a JSON body, which handleResponse will parse.
  // The component calling this function will need to check the message or presence of chosenStrategyId
  // to determine if a choice was actually found or if it's a "not found" message.
  return handleResponse<AIChoiceResponse>(response);
};
