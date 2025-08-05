import { eq, and, lt, gt, sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { 
  db, 
  users, 
  authTokens, 
  passwordResetTokens, 
  emailVerificationTokens,
  userSessions,
  type User,
  type NewPasswordResetToken,
  type NewEmailVerificationToken,
  type NewUserSession,
  type UserSession,
} from '../models/database';

export interface DeviceInfo {
  userAgent?: string;
  ipAddress?: string;
  deviceType?: string;
  platform?: string;
}

export class AuthService {
  // Generate secure random token
  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Create password reset token
  async createPasswordResetToken(email: string): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      // Find user by email
      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user) {
        // Don't reveal if email exists for security
        return { success: true };
      }

      // Invalidate existing tokens
      await db.update(passwordResetTokens)
        .set({ used: true })
        .where(eq(passwordResetTokens.userId, user.id));

      // Create new token
      const token = this.generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

      const resetToken: NewPasswordResetToken = {
        userId: user.id,
        token,
        expiresAt: expiresAt.toISOString(),
      };

      await db.insert(passwordResetTokens).values(resetToken);

      return { success: true, token };
    } catch (error) {
      console.error('Password reset token creation error:', error);
      return { success: false, error: 'Failed to create password reset token' };
    }
  }

  // Reset password with token
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Find valid token
      const [resetToken] = await db.select()
        .from(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.token, token),
          eq(passwordResetTokens.used, false),
          gt(passwordResetTokens.expiresAt, new Date().toISOString())
        ));

      if (!resetToken) {
        return { success: false, error: 'Invalid or expired token' };
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update user password
      await db.update(users)
        .set({ 
          password: hashedPassword,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, resetToken.userId));

      // Mark token as used
      await db.update(passwordResetTokens)
        .set({ used: true })
        .where(eq(passwordResetTokens.id, resetToken.id));

      // Invalidate all auth tokens for this user
      await db.delete(authTokens).where(eq(authTokens.userId, resetToken.userId));
      await db.update(userSessions)
        .set({ isActive: false })
        .where(eq(userSessions.userId, resetToken.userId));

      return { success: true };
    } catch (error) {
      console.error('Password reset error:', error);
      return { success: false, error: 'Failed to reset password' };
    }
  }

  // Create email verification token
  async createEmailVerificationToken(userId: string): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      // Invalidate existing tokens
      await db.update(emailVerificationTokens)
        .set({ used: true })
        .where(eq(emailVerificationTokens.userId, userId));

      // Create new token
      const token = this.generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry

      const verificationToken: NewEmailVerificationToken = {
        userId,
        token,
        expiresAt: expiresAt.toISOString(),
      };

      await db.insert(emailVerificationTokens).values(verificationToken);

      return { success: true, token };
    } catch (error) {
      console.error('Email verification token creation error:', error);
      return { success: false, error: 'Failed to create email verification token' };
    }
  }

  // Verify email with token
  async verifyEmail(token: string): Promise<{ success: boolean; userId?: string; error?: string }> {
    try {
      // Find valid token
      const [verificationToken] = await db.select()
        .from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.token, token),
          eq(emailVerificationTokens.used, false),
          gt(emailVerificationTokens.expiresAt, new Date().toISOString())
        ));

      if (!verificationToken) {
        return { success: false, error: 'Invalid or expired token' };
      }

      // Mark user as verified
      await db.update(users)
        .set({ 
          emailVerified: true,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, verificationToken.userId));

      // Mark token as used
      await db.update(emailVerificationTokens)
        .set({ used: true })
        .where(eq(emailVerificationTokens.id, verificationToken.id));

      return { success: true, userId: verificationToken.userId };
    } catch (error) {
      console.error('Email verification error:', error);
      return { success: false, error: 'Failed to verify email' };
    }
  }

  // Create user session
  async createUserSession(
    userId: string, 
    sessionToken: string, 
    deviceInfo: DeviceInfo,
    expiryHours = 24
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    const session: NewUserSession = {
      userId,
      sessionToken,
      deviceInfo: JSON.stringify(deviceInfo),
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      expiresAt: expiresAt.toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    await db.insert(userSessions).values(session);
  }

  // Get active sessions for user
  async getUserSessions(userId: string): Promise<UserSession[]> {
    return await db.select()
      .from(userSessions)
      .where(and(
        eq(userSessions.userId, userId),
        eq(userSessions.isActive, true),
        gt(userSessions.expiresAt, new Date().toISOString())
      ));
  }

  // Revoke user session
  async revokeUserSession(sessionId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await db.update(userSessions)
        .set({ isActive: false })
        .where(and(
          eq(userSessions.id, sessionId),
          eq(userSessions.userId, userId)
        ));

      return { success: true };
    } catch (error) {
      console.error('Session revocation error:', error);
      return { success: false, error: 'Failed to revoke session' };
    }
  }

  // Revoke all sessions for user (logout from all devices)
  async revokeAllUserSessions(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await db.update(userSessions)
        .set({ isActive: false })
        .where(eq(userSessions.userId, userId));

      // Also revoke all refresh tokens
      await db.delete(authTokens).where(eq(authTokens.userId, userId));

      return { success: true };
    } catch (error) {
      console.error('All sessions revocation error:', error);
      return { success: false, error: 'Failed to revoke all sessions' };
    }
  }

  // Update session activity
  async updateSessionActivity(sessionToken: string): Promise<void> {
    await db.update(userSessions)
      .set({ lastActivityAt: new Date().toISOString() })
      .where(eq(userSessions.sessionToken, sessionToken));
  }

  // Clean up expired sessions and tokens
  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date().toISOString();
    
    // Remove expired sessions
    await db.delete(userSessions).where(lt(userSessions.expiresAt, now));
    
    // Remove expired auth tokens
    await db.delete(authTokens).where(lt(authTokens.expiresAt, now));
    
    // Remove expired password reset tokens
    await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now));
    
    // Remove expired email verification tokens
    await db.delete(emailVerificationTokens).where(lt(emailVerificationTokens.expiresAt, now));
  }

  // Update user login stats
  async updateUserLoginStats(userId: string): Promise<void> {
    await db.update(users)
      .set({ 
        lastLoginAt: new Date().toISOString(),
        loginCount: sql`${users.loginCount} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));
  }

  // Change password (with current password verification)
  async changePassword(
    userId: string, 
    currentPassword: string, 
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get user
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return { success: false, error: 'Current password is incorrect' };
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password
      await db.update(users)
        .set({ 
          password: hashedPassword,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, userId));

      // Optionally revoke all sessions (force re-login)
      await this.revokeAllUserSessions(userId);

      return { success: true };
    } catch (error) {
      console.error('Password change error:', error);
      return { success: false, error: 'Failed to change password' };
    }
  }
}