export class AppError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export const badRequest = (message, errors) => new AppError(400, message, errors);
export const notFound = (message = 'We could not find that record.') => new AppError(404, message);
export const conflict = (message, errors) => new AppError(409, message, errors);
export const unauthorized = (message = 'Please log in to continue.') => new AppError(401, message);

/** Wrap async route handlers so thrown errors reach the error middleware. */
export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
