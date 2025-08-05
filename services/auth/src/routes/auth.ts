import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, users, authTokens, type User, type NewUser } from '../models/database';
import { jwtConfig } from '../config';

const auth = new Hono();

// Validation schemas
const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  role: z.enum(['user', 'admin']).default('user'),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const UpdateUserSchema = CreateUserSchema.partial().omit({ password: true });

// Utility functions
const createSuccessResponse = <T>(data: T, message?: string) => ({
  success: true,
  data,
  message,
  timestamp: new Date().toISOString(),
});

const createErrorResponse = (error: string, message?: string) => ({
  success: false,
  error,
  message,
  timestamp: new Date().toISOString(),
});

const validateBody = (schema: z.ZodSchema) => {
  return async (c: Context, next: any) => {
    try {
      const body = await c.req.json();
      const validatedBody = schema.parse(body);
      (c as any).validatedBody = validatedBody;
      await next();
    } catch (error) {
      const logger = (c as any).logger;
      logger.error(error, 'Request validation error');
      return c.json(createErrorResponse('Validation error', error instanceof Error ? error.message : 'Invalid request body'), 400);
    }
  };
};

const jwtAuth = (secret: string) => {
  return async (c: Context, next: any) => {
    const authorization = c.req.header('authorization');
    
    if (!authorization) {
      return c.json(createErrorResponse('Authorization header required'), 401);
    }

    const token = authorization.replace('Bearer ', '');
    
    try {
      const payload = jwt.verify(token, secret);
      (c as any).user = payload;
      await next();
    } catch (error) {
      return c.json(createErrorResponse('Invalid token'), 401);
    }
  };
};

const requireRole = (roles: string[]) => {
  return async (c: Context, next: any) => {
    const user = (c as any).user;
    
    if (!user) {
      return c.json(createErrorResponse('Authentication required'), 401);
    }

    if (!roles.includes(user.role)) {
      return c.json(createErrorResponse('Insufficient permissions'), 403);
    }

    await next();
  };
};

// Register new user
auth.post('/register', validateBody(CreateUserSchema), async (c: Context) => {
  const userData = (c as any).validatedBody;
  
  try {
    // Check if user already exists
    const existingUser = await db.select().from(users).where(eq(users.email, userData.email));
    if (existingUser.length > 0) {
      return c.json(createErrorResponse('User already exists with this email'), 409);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 12);

    // Create user
    const newUser: NewUser = {
      email: userData.email,
      name: userData.name,
      password: hashedPassword,
      role: userData.role || 'user',
    };

    const [createdUser] = await db.insert(users).values(newUser).returning();
    
    // Remove password from response
    const { password: _, ...userResponse } = createdUser;

    return c.json(createSuccessResponse(userResponse, 'User registered successfully'), 201);
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Registration error');
    return c.json(createErrorResponse('Registration failed'), 500);
  }
});

// Login user
auth.post('/login', validateBody(LoginSchema), async (c: Context) => {
  const loginData = (c as any).validatedBody;
  
  try {
    // Find user by email
    const [user] = await db.select().from(users).where(eq(users.email, loginData.email));
    if (!user) {
      return c.json(createErrorResponse('Invalid credentials'), 401);
    }

    // Check if user is active
    if (!user.isActive) {
      return c.json(createErrorResponse('Account is deactivated'), 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(loginData.password, user.password);
    if (!isValidPassword) {
      return c.json(createErrorResponse('Invalid credentials'), 401);
    }

    // Generate tokens
    const tokenPayload = { 
      userId: user.id, 
      email: user.email, 
      role: user.role 
    };

    const accessToken = jwt.sign(tokenPayload, jwtConfig.secret, { expiresIn: jwtConfig.accessTokenExpiry } as any);
    const refreshToken = jwt.sign(tokenPayload, jwtConfig.secret, { expiresIn: jwtConfig.refreshTokenExpiry } as any);

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    await db.insert(authTokens).values({
      userId: user.id,
      refreshToken,
      expiresAt: expiresAt.toISOString(),
    });

    // Remove password from user response
    const { password: _, ...userResponse } = user;

    return c.json(createSuccessResponse({
      user: userResponse,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 3600, // 1 hour in seconds
        tokenType: 'Bearer' as const,
      }
    }, 'Login successful'));

  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Login error');
    return c.json(createErrorResponse('Login failed'), 500);
  }
});

// Get current user profile  
auth.get('/me', jwtAuth(jwtConfig.secret), async (c: Context) => {
  try {
    const user = (c as any).user;
    
    // Get fresh user data
    const [currentUser] = await db.select().from(users).where(eq(users.id, user.userId));
    if (!currentUser) {
      return c.json(createErrorResponse('User not found'), 404);
    }

    // Remove password from response
    const { password: _, ...userResponse } = currentUser;
    return c.json(createSuccessResponse(userResponse));

  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Get profile error');
    return c.json(createErrorResponse('Failed to get user profile'), 500);
  }
});

// Update user profile
auth.put('/me', jwtAuth(jwtConfig.secret), validateBody(UpdateUserSchema), async (c: Context) => {
  try {
    const user = (c as any).user;
    const updateData = (c as any).validatedBody;

    // Update user
    const [updatedUser] = await db.update(users)
      .set({
        ...updateData,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.userId))
      .returning();

    if (!updatedUser) {
      return c.json(createErrorResponse('User not found'), 404);
    }

    // Remove password from response
    const { password: _, ...userResponse } = updatedUser;
    return c.json(createSuccessResponse(userResponse, 'Profile updated successfully'));

  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Update profile error');
    return c.json(createErrorResponse('Failed to update profile'), 500);
  }
});

// Admin routes - Get all users
auth.get('/users', jwtAuth(jwtConfig.secret), requireRole(['admin']), async (c: Context) => {
  try {
    const allUsers = await db.select().from(users);
    
    // Remove passwords from response
    const usersResponse = allUsers.map(({ password: _, ...user }) => user);
    
    return c.json(createSuccessResponse(usersResponse));
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Get users error');
    return c.json(createErrorResponse('Failed to get users'), 500);
  }
});

export default auth;