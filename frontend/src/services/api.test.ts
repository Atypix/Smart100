// frontend/src/services/api.test.ts
import * as api from './api'; // Import all functions from api.ts

// Mock global.fetch
global.fetch = jest.fn();

// Mock localStorage
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


describe('Frontend API Service Authentication Functions', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    (fetch as jest.Mock).mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    localStorageMock.clear(); // Ensure localStorage store is empty
  });

  describe('loginUser', () => {
    it('should return token data on successful login', async () => {
      const mockTokenData = { token: 'test-token-123' };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockTokenData,
      });

      const result = await api.loginUser('test@example.com', 'password');
      expect(result).toEqual(mockTokenData);
      expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.any(Object));
      expect(fetch).toHaveBeenCalledTimes(1);
      // loginUser itself should not call setItem; the component does.
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should throw an error on failed login (e.g., invalid credentials)', async () => {
      const mockErrorResponse = { message: 'Invalid credentials' };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => mockErrorResponse,
      });

      await expect(api.loginUser('test@example.com', 'wrongpassword'))
        .rejects
        .toThrow('Invalid credentials');
      expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.any(Object));
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should throw an error if response is not ok and json parsing fails', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => { throw new Error("JSON parse error"); }, // Simulate JSON parse failure
        });
  
        await expect(api.loginUser('test@example.com', 'password'))
          .rejects
          .toThrow('Request failed with status 500'); // Error from handleResponse
        expect(localStorageMock.setItem).not.toHaveBeenCalled();
      });
  });

  describe('registerUser', () => {
    it('should return success response on successful registration', async () => {
      const mockSuccessResponse = { message: 'User registered successfully', userId: 'user-id-456' };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockSuccessResponse,
      });

      const result = await api.registerUser('newuser@example.com', 'newpassword123');
      expect(result).toEqual(mockSuccessResponse);
      expect(fetch).toHaveBeenCalledWith('/api/auth/register', expect.any(Object));
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw an error on failed registration (e.g., email already exists)', async () => {
      const mockErrorResponse = { message: 'Email already exists' };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 409, // Conflict
        json: async () => mockErrorResponse,
      });

      await expect(api.registerUser('exists@example.com', 'password123'))
        .rejects
        .toThrow('Email already exists');
      expect(fetch).toHaveBeenCalledWith('/api/auth/register', expect.any(Object));
    });
  });

  describe('logoutUser', () => {
    it('should remove jwtToken from localStorage', () => {
      // Pre-populate localStorage for the test
      localStorageMock.setItem('jwtToken', 'dummy-token');
      
      api.logoutUser();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('jwtToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledTimes(1);
      // Verify it's actually removed by checking getItem if needed, or trust the mock.
      expect(localStorageMock.getItem('jwtToken')).toBeNull();
    });
  });

  describe('getToken', () => {
    it('should return the token if jwtToken exists in localStorage', () => {
      const mockToken = 'my-test-jwt-token';
      localStorageMock.setItem('jwtToken', mockToken); // Set up the mock store
      
      // Need to re-mock getItem for this specific test case if it was cleared or
      // ensure the store setup in setItem is respected by getItem mock.
      // The current localStorageMock setup should handle this.

      expect(api.getToken()).toBe(mockToken);
      expect(localStorageMock.getItem).toHaveBeenCalledWith('jwtToken');
      expect(localStorageMock.getItem).toHaveBeenCalledTimes(1);
    });

    it('should return null if jwtToken does not exist in localStorage', () => {
      // Store is clear by default from beforeEach
      expect(api.getToken()).toBeNull();
      expect(localStorageMock.getItem).toHaveBeenCalledWith('jwtToken');
      expect(localStorageMock.getItem).toHaveBeenCalledTimes(1);
    });
  });
});
