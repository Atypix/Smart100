// frontend/src/components/RegisterPage.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RegisterPage from './RegisterPage';
import * as api from '../services/api'; // To be mocked

// Mock the api service module
jest.mock('../services/api');
const mockedApi = api as jest.Mocked<typeof api>;

describe('RegisterPage Component', () => {
  let mockOnRegisterSuccess: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    mockedApi.registerUser.mockReset();
    mockOnRegisterSuccess = jest.fn(); // Create a new mock for each test
  });

  test('renders with email, password, confirm password inputs, and register button', () => {
    render(<RegisterPage onRegisterSuccess={mockOnRegisterSuccess} />);
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password:/i)).toBeInTheDocument(); // Use regex for exact match if needed
    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Register/i })).toBeInTheDocument();
  });

  test('allows typing into email, password, and confirm password fields', () => {
    render(<RegisterPage onRegisterSuccess={mockOnRegisterSuccess} />);
    const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^Password:/i) as HTMLInputElement;
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i) as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } });

    expect(emailInput.value).toBe('test@example.com');
    expect(passwordInput.value).toBe('password123');
    expect(confirmPasswordInput.value).toBe('password123');
  });

  describe('Form Validation', () => {
    test('shows error if passwords do not match', async () => {
      render(<RegisterPage onRegisterSuccess={mockOnRegisterSuccess} />);
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText(/^Password:/i), { target: { value: 'password123' } });
      fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'password456' } });
      fireEvent.click(screen.getByRole('button', { name: /Register/i }));

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
      });
      expect(mockedApi.registerUser).not.toHaveBeenCalled();
      expect(mockOnRegisterSuccess).not.toHaveBeenCalled();
    });

    test('shows error if password is too short', async () => {
      render(<RegisterPage onRegisterSuccess={mockOnRegisterSuccess} />);
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText(/^Password:/i), { target: { value: '123' } });
      fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: '123' } });
      fireEvent.click(screen.getByRole('button', { name: /Register/i }));

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 6 characters long.')).toBeInTheDocument();
      });
      expect(mockedApi.registerUser).not.toHaveBeenCalled();
      expect(mockOnRegisterSuccess).not.toHaveBeenCalled();
    });
  });

  describe('Registration Success', () => {
    test('calls onRegisterSuccess, shows success message, and clears form on successful registration', async () => {
      const successMessage = 'User registered successfully! Please login.';
      mockedApi.registerUser.mockResolvedValueOnce({ message: successMessage });

      render(<RegisterPage onRegisterSuccess={mockOnRegisterSuccess} />);
      const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement;
      const passwordInput = screen.getByLabelText(/^Password:/i) as HTMLInputElement;
      const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i) as HTMLInputElement;

      fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } });
      fireEvent.click(screen.getByRole('button', { name: /Register/i }));

      await waitFor(() => {
        expect(mockedApi.registerUser).toHaveBeenCalledWith('newuser@example.com', 'password123');
        expect(mockOnRegisterSuccess).toHaveBeenCalledTimes(1);
        expect(screen.getByText(successMessage)).toBeInTheDocument();
        expect(emailInput.value).toBe('');
        expect(passwordInput.value).toBe('');
        expect(confirmPasswordInput.value).toBe('');
      });
    });
  });

  describe('Registration Failure (API Error)', () => {
    test('does not call onRegisterSuccess and shows API error message on failed registration', async () => {
      const errorMessage = 'Email already exists.';
      mockedApi.registerUser.mockRejectedValueOnce(new Error(errorMessage));

      render(<RegisterPage onRegisterSuccess={mockOnRegisterSuccess} />);
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'exists@example.com' } });
      fireEvent.change(screen.getByLabelText(/^Password:/i), { target: { value: 'password123' } });
      fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'password123' } });
      fireEvent.click(screen.getByRole('button', { name: /Register/i }));

      await waitFor(() => {
        expect(mockedApi.registerUser).toHaveBeenCalledWith('exists@example.com', 'password123');
        expect(mockOnRegisterSuccess).not.toHaveBeenCalled();
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
        expect(screen.queryByText(/success/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    test('disables register button and shows loading text during registration attempt', async () => {
      mockedApi.registerUser.mockImplementation(() => new Promise(() => {})); // Pend indefinitely

      render(<RegisterPage onRegisterSuccess={mockOnRegisterSuccess} />);
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText(/^Password:/i), { target: { value: 'password123' } });
      fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'password123' } });
      fireEvent.click(screen.getByRole('button', { name: /Register/i }));

      await waitFor(() => {
        const registerButton = screen.getByRole('button', { name: /Registering.../i });
        expect(registerButton).toBeDisabled();
        expect(registerButton).toHaveTextContent('Registering...');
        // Or, if there's a separate loading indicator:
        // expect(screen.getByText(/Registering.../i)).toBeInTheDocument();
      });
    });
  });
});
