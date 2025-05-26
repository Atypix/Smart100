// frontend/src/components/LoginPage.test.tsx
/// <reference types="@testing-library/jest-dom" />
// import React from 'react'; // Removed as unused
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// import '@testing-library/jest-dom'; // Referenced via triple-slash directive
import LoginPage from './LoginPage';
import * as api from '../services/api'; // To be mocked

// Mock the api service module
jest.mock('../services/api');
const mockedApi = api as jest.Mocked<typeof api>;

// Mock localStorage (as components might interact with it directly via api.loginUser side-effects)
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('LoginPage Component', () => {
  let mockOnLoginSuccess: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    mockedApi.loginUser.mockReset();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear(); // Though not directly used by login page, good practice
    localStorageMock.clear(); // Ensure localStorage store is empty for setItem checks

    mockOnLoginSuccess = jest.fn(); // Create a new mock for each test
  });

  test('renders with email, password inputs, and login button', () => {
    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} />);
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Login/i })).toBeInTheDocument();
  });

  test('allows typing into email and password fields', () => {
    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} />);
    const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/Password/i) as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    expect(emailInput.value).toBe('test@example.com');
    expect(passwordInput.value).toBe('password123');
  });

  describe('Login Success', () => {
    test('calls onLoginSuccess, stores token, and shows no error on successful login', async () => {
      const mockToken = 'test-jwt-token-success';
      mockedApi.loginUser.mockResolvedValueOnce({ token: mockToken });

      render(<LoginPage onLoginSuccess={mockOnLoginSuccess} />);
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password' } });
      fireEvent.click(screen.getByRole('button', { name: /Login/i }));

      await waitFor(() => {
        expect(mockedApi.loginUser).toHaveBeenCalledWith('test@example.com', 'password');
        expect(mockOnLoginSuccess).toHaveBeenCalledTimes(1);
        expect(localStorageMock.setItem).toHaveBeenCalledWith('jwtToken', mockToken);
        expect(localStorageMock.setItem).toHaveBeenCalledTimes(1); // Ensure it was only called once
        expect(screen.queryByText(/error/i)).not.toBeInTheDocument(); // No error message
        expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument(); 
      });
    });
  });

  describe('Login Failure', () => {
    test('does not call onLoginSuccess, does not store token, and shows error message on failed login', async () => {
      const errorMessage = 'Invalid credentials';
      mockedApi.loginUser.mockRejectedValueOnce(new Error(errorMessage));

      render(<LoginPage onLoginSuccess={mockOnLoginSuccess} />);
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'wrongpassword' } });
      fireEvent.click(screen.getByRole('button', { name: /Login/i }));

      await waitFor(() => {
        expect(mockedApi.loginUser).toHaveBeenCalledWith('test@example.com', 'wrongpassword');
        expect(mockOnLoginSuccess).not.toHaveBeenCalled();
        expect(localStorageMock.setItem).not.toHaveBeenCalled();
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    test('handles login failure if token is missing in response', async () => {
        // Simulate API responding 200 OK but with no token (should not happen with current backend)
        mockedApi.loginUser.mockResolvedValueOnce({} as any); // Cast to any to simulate missing token
  
        render(<LoginPage onLoginSuccess={mockOnLoginSuccess} />);
        fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
        fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password' } });
        fireEvent.click(screen.getByRole('button', { name: /Login/i }));
  
        await waitFor(() => {
          expect(mockOnLoginSuccess).not.toHaveBeenCalled();
          expect(localStorageMock.setItem).not.toHaveBeenCalled();
          expect(screen.getByText('Login successful, but no token was provided by the server.')).toBeInTheDocument();
        });
      });
  });

  describe('Loading State', () => {
    test('disables login button and shows loading text during login attempt', async () => {
      // Make the mock API call pend indefinitely
      mockedApi.loginUser.mockImplementation(() => new Promise(() => {})); 

      render(<LoginPage onLoginSuccess={mockOnLoginSuccess} />);
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password' } });
      fireEvent.click(screen.getByRole('button', { name: /Login/i }));

      await waitFor(() => {
        const loginButton = screen.getByRole('button', { name: /Logging in.../i });
        expect(loginButton).toBeDisabled();
        expect(loginButton).toHaveTextContent('Logging in...'); // Check button text change
        // Or, if there's a separate loading indicator:
        // expect(screen.getByText(/Logging in.../i)).toBeInTheDocument(); 
      });
      // Note: To fully test the button re-enabling, the promise would need to resolve/reject.
      // This test primarily focuses on the state *during* the call.
    });
  });
});
