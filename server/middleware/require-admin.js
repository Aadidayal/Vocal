export function requireAdmin(req, res, next) {
  if (req.user?.role === "ADMIN") return next();
  const error = new Error("Administrator access is required.");
  error.statusCode = 403;
  error.code = "FORBIDDEN";
  return next(error);
}
