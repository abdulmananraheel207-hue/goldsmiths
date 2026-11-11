import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ message: 'That page or action does not exist.' });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ message: err.message, ...(err.errors ? { errors: err.errors } : {}) });
  }
  if (err instanceof ZodError) {
    const errors = {};
    for (const i of err.issues) errors[i.path.join('.') || '_'] = i.message;
    return res.status(400).json({ message: 'Please check the highlighted fields and try again.', errors });
  }
  if (err?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'This record already exists. Please use a different value.' });
  }
  if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED') {
    return res.status(409).json({ message: 'This record is used elsewhere and cannot be deleted.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'The request could not be read. Please try again.' });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'That file is too large. Please choose a file under 2 MB.' });
  }
  if (err?.code === 'ECONNREFUSED' || err?.code === 'ER_ACCESS_DENIED_ERROR' || err?.code === 'ER_BAD_DB_ERROR') {
    console.error('Database connection problem:', err.message);
    return res.status(503).json({ message: 'The database is not reachable right now. Please check that MySQL is running.' });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on our side. Please try again.' });
}
