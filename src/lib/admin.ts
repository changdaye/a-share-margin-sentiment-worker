export function authorizeAdminRequest(request: Request, token: string): { ok: true } | { ok: false; status: number; error: string } {
  const header = request.headers.get('Authorization') ?? '';
  if (!token) return { ok: false, status: 401, error: 'admin token not configured' };
  if (header !== `Bearer ${token}`) return { ok: false, status: 401, error: 'unauthorized' };
  return { ok: true };
}
