// frontend/src/components/LoginPage.tsx
import React, { useState, FormEvent } from 'react';
import { loginUser } from '../services/api'; // Import actual API function

interface LoginPageProps {
  onLoginSuccess: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await loginUser(email, password); // Using actual API function
      
      if (response && response.token) {
        localStorage.setItem('jwtToken', response.token); // Store the token
        onLoginSuccess(); // Call the success callback
      } else {
        // This case might indicate an unexpected response structure from the API
        setError('Login successful, but no token was provided by the server.');
      }
    } catch (err: any) {
      if (err && err.message) {
        setError(err.message);
      } else {
        setError('An unknown error occurred during login.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Login</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.inputGroup}>
          <label htmlFor="email" style={styles.label}>Email:</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={handleEmailChange}
            required
            style={styles.input}
            disabled={isLoading}
          />
        </div>
        <div style={styles.inputGroup}>
          <label htmlFor="password" style={styles.label}>Password:</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={handlePasswordChange}
            required
            style={styles.input}
            disabled={isLoading}
          />
        </div>
        
        {error && <p style={styles.errorMessage}>{error}</p>}
        
        {isLoading && <p style={styles.loadingMessage}>Logging in...</p>}
        
        <button type="submit" style={styles.button} disabled={isLoading}>
          {isLoading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
};

// Basic inline styles
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '80vh', // Take up most of the viewport height
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
    width: '300px',
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
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'background-color 0.2s',
  },
  // buttonHover: { // Would need onMouseOver/Out for inline styles or use classes
  //   backgroundColor: '#0056b3',
  // },
  errorMessage: {
    color: 'red',
    marginBottom: '10px',
    textAlign: 'center',
  },
  loadingMessage: {
    color: '#555',
    marginBottom: '10px',
    textAlign: 'center',
  }
};

export default LoginPage;
