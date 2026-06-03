/** Application error carrying an HTTP status and an i18n message key. */
export class ApiError extends Error {
  statusCode: number;
  messageKey: string;
  details?: unknown;

  constructor(statusCode: number, messageKey: string, details?: unknown) {
    super(messageKey);
    this.statusCode = statusCode;
    this.messageKey = messageKey;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(key = 'common.validation_failed', details?: unknown) {
    return new ApiError(400, key, details);
  }
  static unauthorized(key = 'common.unauthorized') {
    return new ApiError(401, key);
  }
  static forbidden(key = 'common.forbidden') {
    return new ApiError(403, key);
  }
  static notFound(key = 'common.not_found') {
    return new ApiError(404, key);
  }
  static internal(key = 'common.server_error') {
    return new ApiError(500, key);
  }
}
