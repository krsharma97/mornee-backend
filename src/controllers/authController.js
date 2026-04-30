import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import { generateToken } from '../utils/jwt.js';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'dummy-client-id');

export const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    // Always register as 'customer' to prevent non-customer signups
    const role = 'customer';

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, first_name, last_name, role`,
      [email, hashedPassword, firstName || '', lastName || '', role]
    );

    const user = result.rows[0];
    const token = generateToken(user.id, user.role);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get user
    const result = await pool.query(
      'SELECT id, email, password, first_name, last_name, role, status FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check status
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user.id, user.role);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT id, email, first_name, last_name, phone, role, avatar_url, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      role: user.role,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { firstName, lastName, phone } = req.body;

    const result = await pool.query(
      `UPDATE users
       SET first_name = $1, last_name = $2, phone = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, email, first_name, last_name, phone, role`,
      [firstName || '', lastName || '', phone || '', userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

export const changePassword = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get current user password
    const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedNewPassword, userId]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

export const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Google token required' });

    let payload;
    try {
      // If we have a real Client ID, verify properly
      if (process.env.GOOGLE_CLIENT_ID) {
        const ticket = await googleClient.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } else {
        // Fallback for development without Client ID - DO NOT USE IN PROD
        // Decode JWT payload without signature verification just to get email
        const base64Url = token.split('.')[1];
        if (!base64Url) throw new Error('Invalid token');
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        payload = JSON.parse(jsonPayload);
      }
    } catch (err) {
      console.error('Google token verification failed:', err);
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const email = payload.email;
    const firstName = payload.given_name || payload.name?.split(' ')[0] || 'Google';
    const lastName = payload.family_name || payload.name?.split(' ').slice(1).join(' ') || 'User';
    
    // Check if user exists
    let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;

    if (userResult.rows.length === 0) {
      // Create new user (Generate a random password since they logged in via Google)
      const randomPassword = await bcrypt.hash(Math.random().toString(36).slice(-8), 10);
      const insertResult = await pool.query(
        `INSERT INTO users (email, password, first_name, last_name, role, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING id, email, first_name, last_name, role`,
        [email, randomPassword, firstName, lastName, 'customer']
      );
      user = insertResult.rows[0];
    } else {
      user = userResult.rows[0];
      if (user.status !== 'active') {
        return res.status(403).json({ error: 'Account is not active' });
      }
    }

    const appToken = generateToken(user.id, user.role);
    res.json({
      message: 'Login successful',
      token: appToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ error: 'Google login failed' });
  }
};

export const facebookLogin = async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Facebook token required' });

    // Verify token with Facebook Graph API
    let fbUser;
    try {
      const fbResponse = await axios.get(`https://graph.facebook.com/me?fields=id,email,first_name,last_name&access_token=${accessToken}`);
      fbUser = fbResponse.data;
    } catch (err) {
      console.error('Facebook token verification failed:', err.response?.data || err.message);
      // For development without real tokens, if graph fails we can mock it if a dummy token is passed
      if (accessToken.startsWith('dummy_')) {
         fbUser = { email: 'fb_user@example.com', first_name: 'Facebook', last_name: 'User' };
      } else {
         return res.status(401).json({ error: 'Invalid Facebook token' });
      }
    }

    if (!fbUser.email) {
      return res.status(400).json({ error: 'Facebook account must have an email attached' });
    }

    let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [fbUser.email]);
    let user;

    if (userResult.rows.length === 0) {
      const randomPassword = await bcrypt.hash(Math.random().toString(36).slice(-8), 10);
      const insertResult = await pool.query(
        `INSERT INTO users (email, password, first_name, last_name, role, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING id, email, first_name, last_name, role`,
        [fbUser.email, randomPassword, fbUser.first_name || 'Facebook', fbUser.last_name || 'User', 'customer']
      );
      user = insertResult.rows[0];
    } else {
      user = userResult.rows[0];
      if (user.status !== 'active') {
        return res.status(403).json({ error: 'Account is not active' });
      }
    }

    const appToken = generateToken(user.id, user.role);
    res.json({
      message: 'Login successful',
      token: appToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Facebook login error:', error);
    res.status(500).json({ error: 'Facebook login failed' });
  }
};
