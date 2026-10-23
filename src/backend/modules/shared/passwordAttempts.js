/* Rate limit of password entries (AD passwords of the File server and the AD directory): 3 per 15 minutes. */
export const PASSWORD_ATTEMPTS = { windowMs: 15 * 60 * 1000, max: 3 };
