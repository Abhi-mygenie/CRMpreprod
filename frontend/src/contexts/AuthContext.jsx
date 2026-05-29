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
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    // CR-008: attach session MyGenie token as header (backend prefers header over DB)
    const mygenieToken = (typeof window !== "undefined") ? sessionStorage.getItem("mygenie_token") : null;
    if (mygenieToken) headers["X-MyGenie-Token"] = mygenieToken;
    const client = axios.create({
        baseURL: API,
        headers,
        timeout: 300000 // 5 minutes timeout for long operations like order sync
    });
    return client;
};

// Auth Provider
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem("token"));
    const [loading, setLoading] = useState(true);

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
        // CR-008: persist MyGenie token in sessionStorage (survives refresh, cleared on tab close)
        if (res.data.mygenie_token) {
            sessionStorage.setItem("mygenie_token", res.data.mygenie_token);
        }
        setToken(res.data.access_token);
        setUser(res.data.user);
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
        // CR-008: clear MyGenie session token on logout
        sessionStorage.removeItem("mygenie_token");
        setToken(null);
        setUser(null);
    };

    // Direct set user and token (for forgot password auto-login)
    const setUserAndToken = (userData, accessToken) => {
        localStorage.setItem("token", accessToken);
        setToken(accessToken);
        setUser(userData);
    };

    return (
        <AuthContext.Provider value={{ user, token, api, login, register, logout, loading, setUserAndToken }}>
            {children}
        </AuthContext.Provider>
    );
};

export { API };
