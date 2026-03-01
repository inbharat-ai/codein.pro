const jwt = require("jsonwebtoken");
const crypto = require("crypto");

/**
 * @class JWTManager
 * @description Manages JWT token generation, verification, and revocation
 * @example
 * const jwtMgr = new JWTManager({ secret: 'your-secret-key' });
 * const token = jwtMgr.generateToken({ userId: '123', role: 'admin' });
 * const verified = jwtMgr.verifyToken(token);
 */
class JWTManager {
  constructor(options = {}) {
    this.secret = options.secret || crypto.randomBytes(32).toString("hex");
    this.accessTokenExpiry = options.accessTokenExpiry || "15m";
    this.refreshTokenExpiry = options.refreshTokenExpiry || "7d";
    this.algorithm = options.algorithm || "HS256";
    this.issuer = options.issuer || "codin-agent";

    this.tokenBlacklist = new Map();
    this.tokenRotationInterval = options.tokenRotationInterval || 3600000;

    this.startBlacklistCleanup();
  }

  /**
   * Generate access token
   * @param {Object} payload - Token payload
   * @param {Object} options - Generation options
   * @returns {string} JWT token
   */
  generateToken(payload, options = {}) {
    const {
      expiresIn = this.accessTokenExpiry,
      subject = null,
      audience = null,
      jti = crypto.randomBytes(8).toString("hex"),
    } = options;

    const tokenPayload = {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      ...(subject && { sub: subject }),
      ...(audience && { aud: audience }),
    };

    const token = jwt.sign(tokenPayload, this.secret, {
      expiresIn,
      algorithm: this.algorithm,
      issuer: this.issuer,
      jwtid: jti,
    });

    return token;
  }

  /**
   * Generate refresh token
   * @param {Object} payload - Token payload
   * @param {Object} options - Generation options
   * @returns {Object} Tokens with refresh
   */
  generateRefreshToken(payload, options = {}) {
    const { expiresIn = this.refreshTokenExpiry } = options;

    const refreshPayload = {
      ...payload,
      tokenType: "refresh",
    };

    const refreshToken = jwt.sign(refreshPayload, this.secret, {
      expiresIn,
      algorithm: this.algorithm,
      issuer: this.issuer,
      jwtid: crypto.randomBytes(8).toString("hex"),
    });

    return {
      accessToken: this.generateToken(payload),
      refreshToken,
      expiresIn: this.accessTokenExpiry,
      tokenType: "Bearer",
    };
  }

  /**
   * Verify token
   * @param {string} token - Token to verify
   * @param {Object} options - Verification options
   * @returns {Object} Token payload if valid
   */
  verifyToken(token, options = {}) {
    const {
      ignoreExpiration = false,
      audience = null,
      subject = null,
    } = options;

    try {
      const decoded = jwt.verify(token, this.secret, {
        algorithms: [this.algorithm],
        ignoreExpiration,
        issuer: this.issuer,
        ...(audience && { audience }),
        ...(subject && { subject }),
      });

      const tokenId = decoded.jti;
      if (this.tokenBlacklist.has(tokenId)) {
        throw new Error("Token has been revoked");
      }

      return {
        valid: true,
        payload: decoded,
        error: null,
      };
    } catch (error) {
      return {
        valid: false,
        payload: null,
        error: error.message,
      };
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Object} New tokens
   */
  refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.secret, {
        algorithms: [this.algorithm],
        issuer: this.issuer,
      });

      if (this.tokenBlacklist.has(decoded.jti)) {
        throw new Error("Refresh token has been revoked");
      }

      const payload = { ...decoded };
      delete payload.iat;
      delete payload.exp;
      delete payload.jti;
      delete payload.iss;
      delete payload.nbf;
      delete payload.aud;
      delete payload.sub;

      return {
        success: true,
        accessToken: this.generateToken(payload),
        refreshToken,
        expiresIn: this.accessTokenExpiry,
        error: null,
      };
    } catch (error) {
      return {
        success: false,
        accessToken: null,
        refreshToken: null,
        error: error.message,
      };
    }
  }

  /**
   * Revoke/blacklist token
   * @param {string} token - Token to revoke
   * @returns {boolean} Success status
   */
  revokeToken(token) {
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.jti) {
        const expiryTime = decoded.exp * 1000 - Date.now();
        if (expiryTime > 0) {
          this.tokenBlacklist.set(decoded.jti, {
            revokedAt: Date.now(),
            expiresAt: decoded.exp * 1000,
          });
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("Token revocation error:", error.message);
      return false;
    }
  }

  /**
   * Check if token has specific permission
   * @param {string} token - Token to check
   * @param {string} permission - Permission to check
   * @returns {boolean} True if has permission
   */
  hasPermissions(token, permission) {
    const verification = this.verifyToken(token);
    if (!verification.valid) {
      return false;
    }

    const payload = verification.payload;
    const permissions = payload.permissions || [];

    if (Array.isArray(permissions)) {
      return permissions.includes(permission);
    }

    return false;
  }

  /**
   * Check if token has specific role
   * @param {string} token - Token to check
   * @param {string} role - Role to check
   * @returns {boolean} True if has role
   */
  hasRole(token, role) {
    const verification = this.verifyToken(token);
    if (!verification.valid) {
      return false;
    }

    const payload = verification.payload;
    return payload.role === role;
  }

  /**
   * Get token information
   * @param {string} token - Token to analyze
   * @returns {Object} Token information
   */
  getTokenInfo(token) {
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded) {
      return { valid: false, error: "Invalid token" };
    }

    const payload = decoded.payload;
    const now = Math.floor(Date.now() / 1000);

    return {
      valid: true,
      header: decoded.header,
      payload: {
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
        permissions: payload.permissions || [],
        issuedAt: new Date(payload.iat * 1000),
        expiresAt: new Date(payload.exp * 1000),
        isExpired: now > payload.exp,
        isRevoked: this.tokenBlacklist.has(payload.jti),
        timeToExpiry: payload.exp - now,
      },
    };
  }

  /**
   * Create role-based token
   * @param {Object} user - User object
   * @param {string} role - Role (owner, admin, editor, viewer)
   * @returns {string} Token
   */
  createRoleToken(user, role) {
    const rolePermissions = {
      owner: ["*"],
      admin: ["read", "write", "delete", "manage-users"],
      editor: ["read", "write"],
      viewer: ["read"],
    };

    const permissions = rolePermissions[role] || [];

    return this.generateToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      role,
      permissions,
    });
  }

  /**
   * Start blacklist cleanup timer
   * @private
   */
  startBlacklistCleanup() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [jti, data] of this.tokenBlacklist.entries()) {
        if (now > data.expiresAt) {
          this.tokenBlacklist.delete(jti);
        }
      }
    }, this.tokenRotationInterval);

    this.cleanupTimer.unref();
  }

  /**
   * Get JWT manager status
   * @returns {Object} Status info
   */
  getStatus() {
    return {
      algorithm: this.algorithm,
      issuer: this.issuer,
      accessTokenExpiry: this.accessTokenExpiry,
      refreshTokenExpiry: this.refreshTokenExpiry,
      blacklistedTokens: this.tokenBlacklist.size,
      secretLength: this.secret.length,
    };
  }

  /**
   * Destroy JWT manager
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.tokenBlacklist.clear();
  }
}

module.exports = { JWTManager };
