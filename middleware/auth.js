import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const DAAS_API_KEY = process.env.DAAS_API_KEY || 'daas_fallback_key';

import { getAuth } from 'firebase-admin/auth';
import User from '../models/User.js';

// Firebase ID Token verification middleware
export const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Access token missing. Firebase verification failed." });
    }

    try {
        const decodedToken = await getAuth().verifyIdToken(token);
        req.firebaseUser = decodedToken;
        next();
    } catch (error) {
        console.error("[Auth] Firebase token verification failed:", error);
        return res.status(403).json({ error: "Invalid or expired Firebase token." });
    }
};

// Admin role check using MongoDB
export const requireAdmin = async (req, res, next) => {
    if (!req.firebaseUser || !req.firebaseUser.uid) {
        return res.status(401).json({ error: "Unauthorized. User identity not found." });
    }

    try {
        const user = await User.findOne({ firestoreId: req.firebaseUser.uid }).lean();
        
        if (!user) {
            return res.status(403).json({ error: "Forbidden. User profile not found." });
        }

        const role = user.role ? user.role.toLowerCase() : "";
        
        if (role !== "admin") {
            return res.status(403).json({ error: "Forbidden. Admin privileges required." });
        }

        next();
    } catch (error) {
        console.error("[Auth] Admin check failed:", error);
        return res.status(500).json({ error: "Internal server error during authorization check." });
    }
};


