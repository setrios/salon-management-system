/**
 * Authentication operations (S1.1).
 *
 * Two of the contract's 50: `login` and `getCurrentPrincipal`. Both shapes come
 * from `openapi.yaml`; nothing here restates a schema by hand.
 *
 * Validation runs through `validateBody('login')`, which reads the operation
 * from the generated contract. That is also why the login body violating
 * `LoginRequest` is answered 400 rather than 422: `login` declares no 422, and
 * the rule in `middleware/validate.ts` is derived from the operation's declared
 * responses (CL-09), not from its id.
 */

import { Router, type RequestHandler } from 'express';

import { config } from '../../config.js';
import { HttpProblem } from '../../middleware/error-handler.js';
import { authenticate } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { authenticateCredentials } from './service.js';
import { issueAccessToken } from './tokens.js';

/**
 * The one 401 both credential failures produce. The detail is a constant, so an
 * unknown username and a wrong password answer with an identical body; the
 * handler adds `instance` and `traceId` to each response separately.
 */
const INVALID_CREDENTIALS = 'The login credentials are not valid.';

const login: RequestHandler = async (req, res, next) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    const principal = await authenticateCredentials(username, password);
    if (principal === undefined) {
      // A fresh problem per response, so `instance` and `traceId` are filled by
      // the handler; only code and detail are shared between the two causes.
      next(new HttpProblem('UNAUTHENTICATED', INVALID_CREDENTIALS));
      return;
    }

    res.status(200).json({
      accessToken: await issueAccessToken(principal),
      tokenType: 'Bearer',
      expiresIn: config.jwtExpiresIn,
      role: principal.role,
    });
  } catch (error) {
    next(error);
  }
};

/** `GET /auth/me`: the principal the bearer token proves, not a fresh lookup. */
const getCurrentPrincipal: RequestHandler = (_req, res) => {
  const principal = res.locals.principal as
    | { id: string; role: 'master' | 'admin'; displayName: string }
    | undefined;

  if (principal === undefined) {
    // Unreachable when `authenticate` is mounted in front of this handler; the
    // guard turns a wiring mistake into a 401 instead of a 200 with no body.
    throw new HttpProblem('UNAUTHENTICATED', 'A bearer token is required for this operation.');
  }

  res.status(200).json(principal);
};

export const authRoutes = Router();

authRoutes.post('/auth/login', validateBody('login'), login);
authRoutes.get('/auth/me', authenticate, getCurrentPrincipal);
