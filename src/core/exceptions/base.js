// exceptions.js

// API error types mapped to their messages
export const APIErrorType = {
  INCORRECT_CAPTCHA: "Incorrect answer. Try again!",
  INVALID_CAPTCHA_TOKEN: "Invalid captcha",
  UNVERIFIED_EMAIL:
    "Email not verified , Please check spam folder incase you did not get email",
  EMAIL_EXISTS: "email already exists",
  BANNED: "Something went wrong #BRL4",
  DOMAIN_BANNED: "Something went wrong #BR4",
  DOMAIN_BANNED_2: "Something went wrong #BR10",
  CAPTCHA_EXPIRED: "refresh your captcha!!",
  SESSION_EXPIRED: "Your app session expired, Please login again.",
  UNREGISTERED_EMAIL: "user not found",
};

// Custom API error class
export class APIError extends Error {
  /**
   * @param {string} error - error message
   * @param {object} [responseData] - full response data
   */
  constructor(error, responseData = null) {
    super(error);
    this.name = "APIError";
    this.error = error;
    this.responseData = responseData;
    this.errorType = this._getErrorType();
  }

  /**
   * Determine error type by matching message against APIErrorType values
   * @returns {string|null}
   */
  _getErrorType() {
    const message = this.errorMessage;
    for (const [key, val] of Object.entries(APIErrorType)) {
      if (val === message) {
        return key;
      }
    }
    return null;
  }

  /**
   * Actual error message, preferring responseData.message if available
   */
  get errorMessage() {
    if (
      this.responseData &&
      typeof this.responseData === "object" &&
      "message" in this.responseData
    ) {
      return this.responseData.message;
    }
    return this.error;
  }

  toString() {
    return this.error;
  }
}

// Other custom exceptions
export class SessionRateLimited extends Error {
  constructor(message = "Session is rate limited or blocked") {
    super(message);
    this.name = "SessionRateLimited";
  }
}

export class CaptchaSolvingFailed extends Error {
  constructor(message = "Captcha solving failed") {
    super(message);
    this.name = "CaptchaSolvingFailed";
  }
}

export class ServerError extends Error {
  constructor(message = "Server error") {
    super(message);
    this.name = "ServerError";
  }
}

export class NoAvailableProxies extends Error {
  constructor(message = "No available proxies") {
    super(message);
    this.name = "NoAvailableProxies";
  }
}

export class ProxyForbidden extends Error {
  constructor(message = "Proxy forbidden") {
    super(message);
    this.name = "ProxyForbidden";
  }
}

export class EmailValidationFailed extends Error {
  constructor(message = "Email validation failed") {
    super(message);
    this.name = "EmailValidationFailed";
  }
}
