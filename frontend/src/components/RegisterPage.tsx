// frontend/src/components/RegisterPage.tsx
import React, { useState } from 'react';
import type { FormEvent } from 'react';
import { registerUser } from '../services/api'; // Import actual API function

interface RegisterPageProps {
  onRegisterSuccess: () => void;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onRegisterSuccess }) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    // Basic password length check (can be more sophisticated)
    if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
    }

    setIsLoading(true);

    try {
      const response = await registerUser(email, password); // Using actual API function

      setSuccessMessage(response.message || 'Registration successful! Please login.'); // Assuming response has a message field
      // Clear form on success
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      
      onRegisterSuccess(); // Call the success callback

    } catch (err: any) {
      if (err && err.message) {
        setError(err.message);
      } else {
        setError('An unknown error occurred during registration.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Register</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.inputGroup}>
          <label htmlFor="reg-email" style={styles.label}>Email:</label>
          <input
            type="email"
            id="reg-email"
            value={email}
            onChange={handleEmailChange}
            required
            style={styles.input}
            disabled={isLoading}
          />
        </div>
        <div style={styles.inputGroup}>
          <label htmlFor="reg-password" style={styles.label}>Password:</label>
          <input
            type="password"
            id="reg-password"
            value={password}
            onChange={handlePasswordChange}
            required
            minLength={6}
            style={styles.input}
            disabled={isLoading}
          />
        </div>
        <div style={styles.inputGroup}>
          <label htmlFor="reg-confirmPassword" style={styles.label}>Confirm Password:</label>
          <input
            type="password"
            id="reg-confirmPassword"
            value={confirmPassword}
            onChange={handleConfirmPasswordChange}
            required
            minLength={6}
            style={styles.input}
            disabled={isLoading}
          />
        </div>
        
        {error && <p style={styles.errorMessage}>{error}</p>}
        {successMessage && <p style={styles.successMessage}>{successMessage}</p>}
        
        {isLoading && <p style={styles.loadingMessage}>Registering...</p>}
        
        <button type="submit" style={styles.button} disabled={isLoading}>
          {isLoading ? 'Registering...' : 'Register'}
        </button>
      </form>
    </div>
  );
};

// Basic inline styles (similar to LoginPage for consistency)
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '80vh',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
  },
  title: {
    marginBottom: '20px',
    color: '#333',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    width: '320px', // Slightly wider for confirm password
    padding: '20px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  inputGroup: {
    marginBottom: '15px',
  },
  label: {
    display: 'block',
    marginBottom: '5px',
    color: '#555',
  },
  input: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    boxSizing: 'border-box',
  },
  button: {
    padding: '10px 15px',
    backgroundColor: '#28a745', // Green for register
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'background-color 0.2s',
  },
  errorMessage: {
    color: 'red',
    marginBottom: '10px',
    textAlign: 'center',
  },
  successMessage: {
    color: 'green',
    marginBottom: '10px',
    textAlign: 'center',
  },
  loadingMessage: {
    color: '#555',
    marginBottom: '10px',
    textAlign: 'center',
  }
};

export default RegisterPage;
