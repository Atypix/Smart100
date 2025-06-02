// frontend/src/services/api.ts
import type { ApiKey, ApiKeyFormData, SuggestionResponse, MultipleSuggestionsApiResponse } from '../types'; // Added SuggestionResponse

const API_BASE_URL = '/api'; // Adjust if your API is hosted elsewhere

interface ApiErrorResponse {
  message: string;
  error?: any; // Can be more specific if backend provides structured errors
}

// Custom Error for Authentication/Authorization issues
export class AuthError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
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
    
    console.error(`API Error (Status: ${response.status}):`, errorData);

    if (response.status === 401 || response.status === 403) {
      throw new AuthError(errorData.message || `Access denied (status ${response.status})`, response.status);
    }
    
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
  return handleResponse<any>(response);
};

export const logoutUser = (): void => {
  localStorage.removeItem('jwtToken');
  // Optionally, redirect or update UI state here or in the component calling this
};


// --- API Key Service Functions ---

export const fetchApiKeys = async (): Promise<ApiKey[]> => {
  const token = getToken();
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
  const token = getToken();
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
  const token = getToken();
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
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/keys/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  await handleResponse<void>(response); 
};

// --- AI Strategy Choice Service Functions ---

export interface AIChoiceResponse {
  symbol: string;
  chosenStrategyId?: string | null;
  chosenStrategyName?: string | null;
  chosenParameters?: Record<string, any> | null;
  message: string;
}

export const getAICurrentStrategy = async (symbol: string): Promise<AIChoiceResponse> => {
  const response = await fetch(`${API_BASE_URL}/ai/current-strategy/${symbol}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse<AIChoiceResponse>(response);
};

// --- AI Strategy Suggestion Service Functions ---

export const fetchStrategySuggestion = async (
  symbol: string,
  initialCapital: number,
  lookbackPeriod?: number,
  evaluationMetric?: string,
  optimizeParameters?: boolean,
  riskPercentage?: number, // Existing
  overallSelectionMetric?: string // Added for consistency with backend
): Promise<MultipleSuggestionsApiResponse> => {
  const requestBody: any = { symbol, initialCapital };
  if (lookbackPeriod !== undefined) requestBody.lookbackPeriod = lookbackPeriod;
  if (evaluationMetric !== undefined) requestBody.evaluationMetric = evaluationMetric;
  if (optimizeParameters !== undefined) requestBody.optimizeParameters = optimizeParameters;
  if (riskPercentage !== undefined) requestBody.riskPercentage = riskPercentage;
  if (overallSelectionMetric !== undefined) requestBody.overallSelectionMetric = overallSelectionMetric; // Added

  const response = await fetch(`${API_BASE_URL}/ai/suggest-strategy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Add Authorization header if this endpoint becomes protected in the future
      // 'Authorization': `Bearer ${getToken()}`,
    },
    body: JSON.stringify(requestBody),
  });
  return handleResponse<MultipleSuggestionsApiResponse>(response);
};
