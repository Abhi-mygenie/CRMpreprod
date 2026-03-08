import { useState, useEffect, createContext, useContext } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return context;
};

// API helper with auth
export const createApiClient = (token) => {
    const client = axios.create({
        baseURL: API,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 300000 // 5 minutes timeout for long operations like order sync
    });
    return client;
};

// Auth Provider
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem("token"));
    const [loading, setLoading] = useState(true);
    const [isDemoMode, setIsDemoMode] = useState(localStorage.getItem("is_demo") === "true");

    // Create API client
    const api = createApiClient(token);

    useEffect(() => {
        if (token) {
            // Fetch user from API
            api.get("/auth/me")
                .then(res => setUser(res.data))
                .catch(() => {
                    localStorage.removeItem("token");
                    setToken(null);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [token]);

    const login = async (email, password) => {
        const res = await axios.post(`${API}/auth/login`, { email, password });
        localStorage.setItem("token", res.data.access_token);
        localStorage.setItem("is_demo", res.data.is_demo || false);
        setToken(res.data.access_token);
        setUser(res.data.user);
        setIsDemoMode(res.data.is_demo || false);
        return res.data;
    };

    const demoLogin = async () => {
        const res = await axios.post(`${API}/auth/demo-login`);
        localStorage.setItem("token", res.data.access_token);
        localStorage.setItem("is_demo", "true");
        setToken(res.data.access_token);
        setUser(res.data.user);
        setIsDemoMode(true);
        return res.data;
    };

    const register = async (data) => {
        const res = await axios.post(`${API}/auth/register`, data);
        localStorage.setItem("token", res.data.access_token);
        setToken(res.data.access_token);
        setUser(res.data.user);
        return res.data;
    };

    const logout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("is_demo");
        setToken(null);
        setUser(null);
        setIsDemoMode(false);
    };

    // Direct set user and token (for forgot password auto-login)
    const setUserAndToken = (userData, accessToken) => {
        localStorage.setItem("token", accessToken);
        localStorage.removeItem("is_demo");
        setToken(accessToken);
        setUser(userData);
        setIsDemoMode(false);
    };

    return (
        <AuthContext.Provider value={{ user, token, api, login, demoLogin, register, logout, loading, isDemoMode, setUserAndToken }}>
            {children}
        </AuthContext.Provider>
    );
};

export { API };
