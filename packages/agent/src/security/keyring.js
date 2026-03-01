const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * @class Keyring
 * @description Encrypts/decrypts sensitive configuration using system keyring and local encryption
 * @example
 * const keyring = new Keyring();
 * keyring.set('api_key', 'secret_value');
 * const value = keyring.get('api_key');
 */
class Keyring {
  constructor(options = {}) {
    this.keysDir = options.keysDir || path.join(os.homedir(), ".codin", "keys");
    this.masterKeyPath = path.join(this.keysDir, ".master");
    this.dataPath = path.join(this.keysDir, "secrets.enc");
    this.algorithm = "aes-256-gcm";
    this.keyFormat = "hex";

    this.initialize();
  }

  /**
   * Initialize keyring and master key
   * @private
   */
  initialize() {
    try {
      if (!fs.existsSync(this.keysDir)) {
        fs.mkdirSync(this.keysDir, { recursive: true, mode: 0o700 });
      }

      const stats = fs.statSync(this.keysDir);
      if ((stats.mode & 0o077) !== 0) {
        console.warn(
          "[Keyring] Keys directory has overly permissive permissions",
        );
        fs.chmodSync(this.keysDir, 0o700);
      }

      if (!fs.existsSync(this.masterKeyPath)) {
        this.createMasterKey();
      }

      this.masterKey = fs.readFileSync(this.masterKeyPath, "ascii");
    } catch (error) {
      throw new Error(`Keyring initialization failed: ${error.message}`);
    }
  }

  /**
   * Create master key for encryption
   * @private
   */
  createMasterKey() {
    try {
      const masterKey = crypto.randomBytes(32).toString(this.keyFormat);

      fs.writeFileSync(this.masterKeyPath, masterKey, {
        mode: 0o600,
        flag: "w",
      });

      const stats = fs.statSync(this.masterKeyPath);
      if ((stats.mode & 0o177) !== 0) {
        console.warn(
          "[Keyring] Master key file has overly permissive permissions",
        );
        fs.chmodSync(this.masterKeyPath, 0o600);
      }

      console.log("[Keyring] Master key created at:", this.masterKeyPath);
    } catch (error) {
      throw new Error(`Failed to create master key: ${error.message}`);
    }
  }

  /**
   * Encrypt sensitive value
   * @param {string} plaintext - Value to encrypt
   * @returns {Object} Encrypted data with iv and auth tag
   * @private
   */
  encrypt(plaintext) {
    try {
      if (typeof plaintext !== "string") {
        plaintext = JSON.stringify(plaintext);
      }

      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv(
        this.algorithm,
        Buffer.from(this.masterKey, this.keyFormat),
        iv,
      );

      let encrypted = cipher.update(plaintext, "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString("hex"),
        authTag: authTag.toString("hex"),
        algorithm: this.algorithm,
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt encrypted value
   * @param {Object} encryptedData - Encrypted data object with iv and authTag
   * @returns {string} Decrypted plaintext
   * @private
   */
  decrypt(encryptedData) {
    try {
      const { encrypted, iv, authTag, algorithm } = encryptedData;

      if (!encrypted || !iv || !authTag) {
        throw new Error("Invalid encrypted data format");
      }

      if (algorithm !== this.algorithm) {
        throw new Error(
          `Algorithm mismatch: expected ${this.algorithm}, got ${algorithm}`,
        );
      }

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        Buffer.from(this.masterKey, this.keyFormat),
        Buffer.from(iv, "hex"),
      );

      decipher.setAuthTag(Buffer.from(authTag, "hex"));

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Load all secrets from disk
   * @private
   */
  loadSecrets() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = fs.readFileSync(this.dataPath, "utf8");
        return JSON.parse(data);
      }
      return {};
    } catch (error) {
      console.warn(
        "[Keyring] Failed to load secrets from disk:",
        error.message,
      );
      return {};
    }
  }

  /**
   * Save all secrets to disk
   * @private
   */
  saveSecrets(secrets) {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(secrets, null, 2), {
        mode: 0o600,
      });
    } catch (error) {
      throw new Error(`Failed to save secrets: ${error.message}`);
    }
  }

  /**
   * Store a secret securely
   * @param {string} key - Secret key/name
   * @param {string|Object} value - Secret value
   * @example
   * keyring.set('database_password', 'mysecretpassword');
   * keyring.set('api_keys', { key1: 'value1', key2: 'value2' });
   */
  set(key, value) {
    try {
      if (!key || typeof key !== "string") {
        throw new Error("Key must be a non-empty string");
      }

      const secrets = this.loadSecrets();
      const encrypted = this.encrypt(value);

      secrets[key] = {
        ...encrypted,
        timestamp: Date.now(),
        metadata: {
          type: typeof value,
          length: JSON.stringify(value).length,
        },
      };

      this.saveSecrets(secrets);

      console.log(`[Keyring] Secret stored: ${key}`);
      return true;
    } catch (error) {
      console.error(`[Keyring] Failed to set secret: ${error.message}`);
      return false;
    }
  }

  /**
   * Retrieve a secret
   * @param {string} key - Secret key/name
   * @returns {string|Object|null} Decrypted secret value or null if not found
   * @example
   * const password = keyring.get('database_password');
   * const apiKeys = keyring.get('api_keys');
   */
  get(key) {
    try {
      const secrets = this.loadSecrets();

      if (!secrets[key]) {
        console.warn(`[Keyring] Secret not found: ${key}`);
        return null;
      }

      const encryptedData = secrets[key];
      const decrypted = this.decrypt({
        encrypted: encryptedData.encrypted,
        iv: encryptedData.iv,
        authTag: encryptedData.authTag,
        algorithm: encryptedData.algorithm,
      });

      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      console.error(`[Keyring] Failed to get secret: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete a secret
   * @param {string} key - Secret key/name
   * @returns {boolean} Success status
   */
  delete(key) {
    try {
      const secrets = this.loadSecrets();

      if (!secrets[key]) {
        console.warn(`[Keyring] Secret not found: ${key}`);
        return false;
      }

      delete secrets[key];
      this.saveSecrets(secrets);

      console.log(`[Keyring] Secret deleted: ${key}`);
      return true;
    } catch (error) {
      console.error(`[Keyring] Failed to delete secret: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a secret exists
   * @param {string} key - Secret key/name
   * @returns {boolean} True if secret exists
   */
  has(key) {
    const secrets = this.loadSecrets();
    return key in secrets;
  }

  /**
   * List all secret keys (without values)
   * @returns {string[]} Array of secret keys
   */
  list() {
    try {
      const secrets = this.loadSecrets();
      return Object.keys(secrets).map((key) => ({
        key,
        stored: secrets[key].timestamp,
        type: secrets[key].metadata?.type || "unknown",
      }));
    } catch (error) {
      console.error(`[Keyring] Failed to list secrets: ${error.message}`);
      return [];
    }
  }

  /**
   * Rotate master key and re-encrypt all secrets
   * WARNING: This operation is time-consuming and irreversible
   * @returns {boolean} Success status
   */
  rotateMasterKey() {
    try {
      console.log("[Keyring] Starting master key rotation...");

      const secrets = this.loadSecrets();
      const decryptedSecrets = {};

      for (const [key, data] of Object.entries(secrets)) {
        try {
          const decrypted = this.decrypt({
            encrypted: data.encrypted,
            iv: data.iv,
            authTag: data.authTag,
            algorithm: data.algorithm,
          });
          decryptedSecrets[key] = decrypted;
        } catch (error) {
          console.error(
            `Failed to decrypt ${key} during rotation: ${error.message}`,
          );
          return false;
        }
      }

      const backupPath = this.masterKeyPath + ".backup";
      fs.copyFileSync(this.masterKeyPath, backupPath);
      console.log("[Keyring] Master key backed up to:", backupPath);

      this.createMasterKey();

      const reencrypted = {};
      for (const [key, value] of Object.entries(decryptedSecrets)) {
        const encrypted = this.encrypt(value);
        reencrypted[key] = {
          ...encrypted,
          timestamp: Date.now(),
          metadata: secrets[key].metadata,
        };
      }

      this.saveSecrets(reencrypted);

      console.log("[Keyring] Master key rotation completed successfully");
      return true;
    } catch (error) {
      console.error(`[Keyring] Master key rotation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Export encrypted backup of all secrets
   * @param {string} backupPath - Path to save backup file
   * @returns {boolean} Success status
   */
  exportBackup(backupPath) {
    try {
      const secrets = this.loadSecrets();
      fs.writeFileSync(backupPath, JSON.stringify(secrets, null, 2), {
        mode: 0o600,
      });
      console.log("[Keyring] Backup exported to:", backupPath);
      return true;
    } catch (error) {
      console.error(`[Keyring] Failed to export backup: ${error.message}`);
      return false;
    }
  }

  /**
   * Import secrets from backup
   * @param {string} backupPath - Path to backup file
   * @returns {boolean} Success status
   */
  importBackup(backupPath) {
    try {
      const backupData = JSON.parse(fs.readFileSync(backupPath, "utf8"));
      const existing = this.loadSecrets();

      for (const [key, data] of Object.entries(backupData)) {
        if (!existing[key]) {
          existing[key] = data;
        }
      }

      this.saveSecrets(existing);
      console.log("[Keyring] Backup imported from:", backupPath);
      return true;
    } catch (error) {
      console.error(`[Keyring] Failed to import backup: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear all secrets from keyring
   * WARNING: This operation is irreversible
   * @returns {boolean} Success status
   */
  clear() {
    try {
      this.saveSecrets({});
      console.log("[Keyring] All secrets cleared");
      return true;
    } catch (error) {
      console.error(`[Keyring] Failed to clear secrets: ${error.message}`);
      return false;
    }
  }

  /**
   * Get keyring status
   * @returns {Object} Status information
   */
  getStatus() {
    try {
      const secrets = this.loadSecrets();
      const stats = fs.statSync(this.keysDir);

      return {
        initialized: true,
        keysDir: this.keysDir,
        secretCount: Object.keys(secrets).length,
        masterKeyExists: fs.existsSync(this.masterKeyPath),
        dirPermissions: "0" + (stats.mode & parseInt("777", 8)).toString(8),
        lastModified: stats.mtime,
      };
    } catch (error) {
      return {
        initialized: false,
        error: error.message,
      };
    }
  }
}

module.exports = { Keyring };
