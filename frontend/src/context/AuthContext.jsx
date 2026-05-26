import { createContext, useContext, useReducer, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

// Initial state
const initialState = {
  user: null,
  token: null,
  isAuthenticated: false,
  loading: true,
};

// Reducer
function authReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'LOGIN':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        loading: false,
      };

    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        loading: false,
      };

    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
      };

    default:
      return state;
  }
}

// Provider component
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // On mount: verify stored token
  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('chatsphere_token');
      const storedUser = localStorage.getItem('chatsphere_user');

      if (!token) {
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }

      try {
        const response = await api.get('/auth/verify');

        if (response.data.success) {
          dispatch({
            type: 'LOGIN',
            payload: {
              user: response.data.data.user,
              token,
            },
          });
        } else {
          // Token invalid — clean up
          localStorage.removeItem('chatsphere_token');
          localStorage.removeItem('chatsphere_user');
          dispatch({ type: 'LOGOUT' });
        }
      } catch (error) {
        // Token expired or invalid
        localStorage.removeItem('chatsphere_token');
        localStorage.removeItem('chatsphere_user');
        dispatch({ type: 'LOGOUT' });
      }
    };

    verifyToken();
  }, []);

  // Login
  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });

    if (response.data.success) {
      const { user, token } = response.data.data;

      // Store in localStorage
      localStorage.setItem('chatsphere_token', token);
      localStorage.setItem('chatsphere_user', JSON.stringify(user));

      dispatch({
        type: 'LOGIN',
        payload: { user, token },
      });

      return { success: true };
    }

    return { success: false, message: response.data.message };
  };

  // Register
  const register = async (username, email, password) => {
    const response = await api.post('/auth/register', {
      username,
      email,
      password,
    });

    if (response.data.success) {
      const { user, token } = response.data.data;

      // Store in localStorage
      localStorage.setItem('chatsphere_token', token);
      localStorage.setItem('chatsphere_user', JSON.stringify(user));

      dispatch({
        type: 'LOGIN',
        payload: { user, token },
      });

      return { success: true };
    }

    return { success: false, message: response.data.message };
  };

  // Logout
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Logout even if API call fails
      console.error('Logout API error:', error);
    }

    localStorage.removeItem('chatsphere_token');
    localStorage.removeItem('chatsphere_user');
    dispatch({ type: 'LOGOUT' });
  };

  const value = {
    ...state,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
